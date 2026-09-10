import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { generateMasterKey } from '../crypto/vault'
import { ApoioDatabase } from '../db/database'
import { emCentavos } from '../family-budget/dinheiro'
import { configuracaoVazia } from './configuracao'
import { lancamentoVazio } from './lancamento'
import { WorkBudgetService } from './service'

vi.mock('../auth/supabase', async (importarOriginal) => ({
  ...await importarOriginal<Record<string, unknown>>(),
  hasSupabaseConfiguration: false,
  ensureRemoteDevice: vi.fn(() => Promise.resolve()),
}))

const CONTA = 'conta-ficticia-trabalho'
const bancos: ApoioDatabase[] = []

function novoBanco() {
  const banco = new ApoioDatabase(`trabalho-teste-${crypto.randomUUID()}`)
  bancos.push(banco)
  return banco
}

beforeEach(() => localStorage.clear())
afterEach(async () => {
  localStorage.clear()
  await Promise.all(bancos.splice(0).map((banco) => banco.delete()))
})

describe('persistência do Trabalho', () => {
  it('guarda e devolve a configuração do obreiro', async () => {
    const servico = new WorkBudgetService(novoBanco())
    const chave = await generateMasterKey()

    expect(await servico.configuracao(CONTA, chave)).toBeNull()

    await servico.salvarConfiguracao(CONTA, chave, {
      ...configuracaoVazia(),
      campo: 'Campo fictício',
      fpe: [{ valor: emCentavos(7000), inicio: '2026-01-01', fim: '', referencia: 'Comunicado fictício', observacao: '' }],
      percentualDeAudit: [{ valor: 80, inicio: '2026-01-01', fim: '', referencia: '', observacao: '' }],
    })

    const lida = await servico.configuracao(CONTA, chave)
    expect(lida?.campo).toBe('Campo fictício')
    expect(lida?.fpe[0]?.valor).toBe(emCentavos(7000))
  })

  /*
    Dois aparelhos salvando a configuração ao mesmo tempo precisam escrever no
    mesmo registro. Com id novo a cada vez, o pastor acabaria com duas
    configurações e nenhuma pista de qual delas vale.
  */
  it('a configuração é uma só, mesmo salvando duas vezes', async () => {
    const servico = new WorkBudgetService(novoBanco())
    const chave = await generateMasterKey()

    await servico.salvarConfiguracao(CONTA, chave, { ...configuracaoVazia(), campo: 'Primeiro' })
    await servico.salvarConfiguracao(CONTA, chave, { ...configuracaoVazia(), campo: 'Segundo' })

    const registros = await servico.dependentes(CONTA, chave)
    expect(registros).toEqual([])
    expect((await servico.configuracao(CONTA, chave))?.campo).toBe('Segundo')
  })

  it('guarda lançamentos com a memória do cálculo', async () => {
    const servico = new WorkBudgetService(novoBanco())
    const chave = await generateMasterKey()

    await servico.salvarLancamento(CONTA, chave, {
      ...lancamentoVazio('2026-09', '2026-09-03'),
      subcategoriaId: 'energia', descricao: 'Conta de energia',
      valorPago: emCentavos(400), previsto: emCentavos(120), situacao: 'solicitado',
      memoria: {
        valor: emCentavos(120), parcelaPessoal: emCentavos(280),
        fpeUtilizado: emCentavos(7000), percentualDeAuditUtilizado: 80,
        base: 'VALOR_DA_DESPESA', valorDaBase: emCentavos(400), percentualAplicado: 30,
        tetoAplicado: null, limitadoPeloTeto: false, referencia: 'Regra local', pendencia: null,
      },
    })

    const [lancamento] = await servico.lancamentos(CONTA, chave)
    expect(lancamento?.memoria?.fpeUtilizado).toBe(emCentavos(7000))
    expect(lancamento?.memoria?.percentualAplicado).toBe(30)
  })

  it('recusa lançamento sem categoria, sem data ou sem valor', async () => {
    const servico = new WorkBudgetService(novoBanco())
    const chave = await generateMasterKey()
    const base = { ...lancamentoVazio('2026-09', '2026-09-03'), subcategoriaId: 'energia', valorPago: emCentavos(10) }

    await expect(servico.salvarLancamento(CONTA, chave, { ...base, subcategoriaId: '' })).rejects.toThrow('categoria')
    await expect(servico.salvarLancamento(CONTA, chave, { ...base, data: '' })).rejects.toThrow('data')
    await expect(servico.salvarLancamento(CONTA, chave, { ...base, valorPago: 0 })).rejects.toThrow('maior que zero')
  })

  it('a reserva de livros não pode passar do total do ano', async () => {
    const servico = new WorkBudgetService(novoBanco())
    const chave = await generateMasterKey()
    const orcamento = { ano: '2026', total: emCentavos(6000), reservaDeLivros: emCentavos(8000), referencia: '', createdAt: '', updatedAt: '' }

    await expect(servico.salvarOrcamentoLetra(CONTA, chave, orcamento)).rejects.toThrow('reserva')
    await expect(servico.salvarOrcamentoLetra(CONTA, chave, { ...orcamento, ano: '26' })).rejects.toThrow('ano')
  })

  /*
    Auxílios, despesas e quilometragem já estão gravados nos aparelhos do
    pastor. O modelo novo entra somando: se ele passasse a ler os registros
    antigos por outro caminho, um aplicativo atualizado abriria vazio.
  */
  it('o modelo antigo continua sendo lido depois do novo', async () => {
    const servico = new WorkBudgetService(novoBanco())
    const chave = await generateMasterKey()

    await servico.saveExpense(CONTA, chave, {
      category: 'fuel', description: 'Combustível', amount: 150, date: '2026-09-02',
      allowanceCategory: 'fuel', churchId: null, visitId: null, agendaEventId: null,
      notes: '', createdAt: '', updatedAt: '',
    })
    await servico.salvarLancamento(CONTA, chave, {
      ...lancamentoVazio('2026-09', '2026-09-03'), subcategoriaId: 'energia', valorPago: emCentavos(400),
    })

    expect(await servico.expenses(CONTA, chave)).toHaveLength(1)
    expect(await servico.lancamentos(CONTA, chave)).toHaveLength(1)
    expect((await servico.snapshot(CONTA, chave, '2026-09')).expenses).toHaveLength(1)
  })
})
