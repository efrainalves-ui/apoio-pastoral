import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { generateMasterKey } from '../crypto/vault'
import { FamilyBudgetDatabase } from './database'
import { emCentavos } from './dinheiro'
import type { LancamentoData } from './lancamento'
import { FinancasPessoaisService, OCORRENCIAS_ADIANTADAS } from './pessoal'

const bancos: FamilyBudgetDatabase[] = []
afterEach(async () => { await Promise.all(bancos.splice(0).map((banco) => banco.delete())) })

async function montar() {
  const banco = new FamilyBudgetDatabase(`pessoal-ficticio-${crypto.randomUUID()}`)
  bancos.push(banco)
  return { servico: new FinancasPessoaisService(banco), masterKey: await generateMasterKey(), conta: 'conta-ficticia' }
}

const carimbos = { createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' }

function saida(overrides: Partial<LancamentoData> = {}): LancamentoData {
  return {
    natureza: 'saida', descricao: 'Energia fictícia', valor: emCentavos(230),
    subcategoria: 'moradia.energia-eletrica', data: '2026-09-10', competencia: '2026-09',
    vencimento: '2026-09-15', situacao: 'pendente', tipo: 'fixa', formaDePagamento: 'boleto',
    contaId: null, cartaoId: null, integranteId: null, referenteA: null,
    recorrencia: 'nenhuma', serieId: null, parcelamento: null, descontadoNaFonte: false, observacao: '', ...carimbos, ...overrides,
  }
}

describe('finanças pessoais', () => {
  it('grava e lê um lançamento', async () => {
    const { servico, masterKey, conta } = await montar()
    const [gravado] = await servico.salvarLancamento(conta, masterKey, saida())

    const lidos = await servico.lancamentos(conta, masterKey)
    expect(lidos).toHaveLength(1)
    expect(lidos[0]).toMatchObject({ id: gravado!.id, descricao: 'Energia fictícia', valor: emCentavos(230) })
  })

  it('não devolve o que é de outra conta', async () => {
    const { servico, masterKey, conta } = await montar()
    await servico.salvarLancamento(conta, masterKey, saida())
    expect(await servico.lancamentos('outra-conta-ficticia', masterKey)).toHaveLength(0)
  })

  it('guarda contas, cartões e integrantes em gavetas separadas', async () => {
    const { servico, masterKey, conta } = await montar()
    await servico.salvarConta(conta, masterKey, { nome: 'Corrente fictícia', instituicao: '', tipo: 'corrente', saldoInicial: emCentavos(500), ativa: true, observacao: '', ...carimbos })
    await servico.salvarCartao(conta, masterKey, { nome: 'Cartão fictício', bandeira: '', contaId: null, limite: emCentavos(3000), diaDeFechamento: 20, diaDeVencimento: 28, ativo: true, ...carimbos })
    await servico.salvarIntegrante(conta, masterKey, { nome: 'Pessoa 1', relacao: '', ativo: true, ...carimbos })

    expect(await servico.contas(conta, masterKey)).toHaveLength(1)
    expect(await servico.cartoes(conta, masterKey)).toHaveLength(1)
    expect(await servico.integrantes(conta, masterKey)).toHaveLength(1)
    expect(await servico.lancamentos(conta, masterKey)).toHaveLength(0)
  })

  describe('séries recorrentes', () => {
    it('abre a série com as ocorrências adiantadas, todas em aberto', async () => {
      const { servico, masterKey, conta } = await montar()
      await servico.salvarLancamento(conta, masterKey, saida({ recorrencia: 'mensal' }))

      const todos = await servico.lancamentos(conta, masterKey)
      expect(todos).toHaveLength(OCORRENCIAS_ADIANTADAS + 1)
      expect(todos.every(({ situacao }) => situacao === 'pendente')).toBe(true)
      expect(new Set(todos.map(({ serieId }) => serieId)).size).toBe(1)
    })

    /*
      O caso que motivou tudo: a luz normalmente vem 230 e este mês veio 275.
      Mudar só este mês não pode tocar no que já passou nem no que vem depois.
    */
    it('editar somente esta ocorrência não move as outras', async () => {
      const { servico, masterKey, conta } = await montar()
      await servico.salvarLancamento(conta, masterKey, saida({ recorrencia: 'mensal' }))
      const todos = await servico.lancamentos(conta, masterKey)
      const outubro = todos.find(({ data }) => data === '2026-10-10')!

      await servico.editarSerie(conta, masterKey, todos, outubro, { valor: emCentavos(275) }, 'somente_esta')

      const depois = await servico.lancamentos(conta, masterKey)
      expect(depois.find(({ id }) => id === outubro.id)!.valor).toBe(emCentavos(275))
      expect(depois.filter(({ valor }) => valor === emCentavos(230))).toHaveLength(OCORRENCIAS_ADIANTADAS)
    })

    it('editar esta e as próximas deixa o passado como estava', async () => {
      const { servico, masterKey, conta } = await montar()
      await servico.salvarLancamento(conta, masterKey, saida({ recorrencia: 'mensal' }))
      const todos = await servico.lancamentos(conta, masterKey)
      const novembro = todos.find(({ data }) => data === '2026-11-10')!

      await servico.editarSerie(conta, masterKey, todos, novembro, { valor: emCentavos(300) }, 'esta_e_proximas')

      const depois = await servico.lancamentos(conta, masterKey)
      expect(depois.filter(({ data }) => data < '2026-11-10').every(({ valor }) => valor === emCentavos(230))).toBe(true)
      expect(depois.filter(({ data }) => data >= '2026-11-10').every(({ valor }) => valor === emCentavos(300))).toBe(true)
    })

    /*
      Mudar o valor de novembro não pode fazer dezembro vencer em novembro: a
      data é de cada ocorrência, e nunca é copiada para as vizinhas.
    */
    it('a edição em série não arrasta datas', async () => {
      const { servico, masterKey, conta } = await montar()
      await servico.salvarLancamento(conta, masterKey, saida({ recorrencia: 'mensal' }))
      const todos = await servico.lancamentos(conta, masterKey)
      const novembro = todos.find(({ data }) => data === '2026-11-10')!

      await servico.editarSerie(conta, masterKey, todos, novembro, { valor: emCentavos(300), data: '2026-11-25', vencimento: '2026-11-28' }, 'esta_e_proximas')

      const depois = await servico.lancamentos(conta, masterKey)
      expect(depois.find(({ id }) => id === novembro.id)).toMatchObject({ data: '2026-11-25', vencimento: '2026-11-28' })
      expect(depois.some(({ data }) => data === '2026-12-10')).toBe(true)
      expect(depois.filter(({ data }) => data === '2026-11-25')).toHaveLength(1)
    })

    it('apagar a série inteira leva todas as ocorrências', async () => {
      const { servico, masterKey, conta } = await montar()
      await servico.salvarLancamento(conta, masterKey, saida({ recorrencia: 'mensal' }))
      const todos = await servico.lancamentos(conta, masterKey)

      const apagados = await servico.apagarSerie(conta, todos, todos[0]!, 'serie_inteira')
      expect(apagados).toBe(OCORRENCIAS_ADIANTADAS + 1)
      expect(await servico.lancamentos(conta, masterKey)).toHaveLength(0)
    })
  })

  describe('parcelamento', () => {
    it('grava só as parcelas que faltam, com a numeração verdadeira', async () => {
      const { servico, masterKey, conta } = await montar()
      await servico.salvarLancamento(conta, masterKey, saida({ descricao: 'Geladeira fictícia' }), {
        parcelamento: { total: emCentavos(9600), parcelas: 24, jaPagas: 13 },
      })

      const todos = await servico.lancamentos(conta, masterKey)
      expect(todos).toHaveLength(11)
      const numeros = todos.map(({ parcelamento }) => parcelamento!.numero).sort((a, b) => a - b)
      expect(numeros[0]).toBe(14)
      expect(numeros.at(-1)).toBe(24)
      expect(todos.every(({ parcelamento }) => parcelamento!.total === 24)).toBe(true)
    })

    it('parcelamento vence recorrência quando os dois são pedidos', async () => {
      const { servico, masterKey, conta } = await montar()
      await servico.salvarLancamento(conta, masterKey, saida({ recorrencia: 'mensal' }), {
        parcelamento: { total: emCentavos(1200), parcelas: 3, jaPagas: 0 },
      })

      const todos = await servico.lancamentos(conta, masterKey)
      expect(todos).toHaveLength(3)
      expect(todos.every(({ recorrencia, serieId }) => recorrencia === 'nenhuma' && serieId === null)).toBe(true)
    })
  })

  it('transferência entre contas fica fora dos lançamentos', async () => {
    const { servico, masterKey, conta } = await montar()
    await servico.salvarTransferencia(conta, masterKey, {
      origemContaId: 'a', destinoContaId: 'b', valor: emCentavos(1000), data: '2026-09-10',
      metaId: null, observacao: '', ...carimbos,
    })

    expect(await servico.transferencias(conta, masterKey)).toHaveLength(1)
    expect(await servico.lancamentos(conta, masterKey)).toHaveLength(0)
  })
})
