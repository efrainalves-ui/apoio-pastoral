import { Plus } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuthVault } from '../auth/AuthVaultContext'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { FormularioDeLancamento, lancamentoVazio } from '../components/orcamento/FormularioDeLancamento'
import { ListaDeLancamentos } from '../components/orcamento/ListaDeLancamentos'
import { VisaoGeral } from '../components/orcamento/VisaoGeral'
import { MetasEPlanejamento } from '../components/orcamento/MetasEPlanejamento'
import { ListaDeCompras } from '../components/orcamento/ListaDeCompras'
import { Relatorios } from '../components/orcamento/Relatorios'
import type { Compra, CompraData } from '../family-budget/compras'
import { totaisDaCompra } from '../family-budget/compras'
import type { Aporte, Meta, MetaData, Planejamento, PlanejamentoData } from '../family-budget/metas'
import { lerOAntigo, type RegistrosAntigos } from '../family-budget/adaptador'
import { aindaLegados, planoDeMigracao } from '../family-budget/migracao'
import { doMes } from '../family-budget/calculos'
import type { NaturezaDoLancamento } from '../family-budget/catalogo'
import { emCentavos, formatar as formatarValor, type Centavos } from '../family-budget/dinheiro'
import type { Cartao, Conta, Integrante, Lancamento, LancamentoData, Transferencia } from '../family-budget/lancamento'
import { FinancasPessoaisService } from '../family-budget/pessoal'
import { FamilyBudgetService } from '../family-budget/service'
import type { PlanoDeParcelamento } from '../family-budget/series'
import { ESCOPO_LABELS, ESCOPOS_DE_EDICAO, type EscopoDeEdicao } from '../family-budget/series'
import { localDateKey } from '../shared/dates'
import { useReloadOnSync } from '../sync/useReloadOnSync'

const pessoais = new FinancasPessoaisService()
const antigo = new FamilyBudgetService()

const mesAnterior = (mes: string) => {
  const [ano, numero] = mes.split('-').map(Number)
  const data = new Date(ano ?? 2026, (numero ?? 1) - 2, 1)
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}`
}

interface FinancasPessoaisPageProps {
  area: 'resumo' | 'entradas' | 'saidas' | 'metas' | 'compras' | 'relatorios'
  mes: string
}

/**
 * As áreas do orçamento pessoal no modelo novo.
 *
 * O que já estava gravado aparece aqui pelo adaptador de leitura: não foi
 * convertido nem movido, mas entra nas somas — abrir a tela nova e ver a casa
 * sem renda nenhuma seria pior do que qualquer inconsistência de formato.
 */
export function FinancasPessoaisPage({ area, mes }: FinancasPessoaisPageProps) {
  const { account, masterKey } = useAuthVault()
  const [novos, setNovos] = useState<Lancamento[]>([])
  const [herdados, setHerdados] = useState<Lancamento[]>([])
  const [registrosAntigos, setRegistrosAntigos] = useState<RegistrosAntigos | null>(null)
  const [porMigrar, setPorMigrar] = useState(0)
  const [migrando, setMigrando] = useState(false)
  const [contas, setContas] = useState<Conta[]>([])
  const [cartoes, setCartoes] = useState<Cartao[]>([])
  const [integrantes, setIntegrantes] = useState<Integrante[]>([])
  const [planejado, setPlanejado] = useState<Record<string, Centavos>>({})
  const [metas, setMetas] = useState<Meta[]>([])
  const [aportes, setAportes] = useState<Aporte[]>([])
  const [planejamentos, setPlanejamentos] = useState<Planejamento[]>([])
  const [compras, setCompras] = useState<Compra[]>([])
  const [transferencias, setTransferencias] = useState<Transferencia[]>([])
  const [carregando, setCarregando] = useState(true)
  const [rascunho, setRascunho] = useState<LancamentoData | null>(null)
  const [editando, setEditando] = useState<Lancamento | null>(null)
  const [busca, setBusca] = useState('')
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')

  const hoje = localDateKey()

  /* O aviso pertence à ação que o gerou; trocar de área o descarta. */
  useEffect(() => { setAviso('') }, [area, mes])

  const carregar = useCallback(async () => {
    if (!account || !masterKey) return
    try {
      const [lancamentos, listaContas, listaCartoes, listaIntegrantes, listaMetas, listaAportes, listaPlanejamentos, listaCompras, listaTransferencias, incomes, expenses, bills, plans] = await Promise.all([
        pessoais.lancamentos(account.id, masterKey),
        pessoais.contas(account.id, masterKey),
        pessoais.cartoes(account.id, masterKey),
        pessoais.integrantes(account.id, masterKey),
        pessoais.metas(account.id, masterKey),
        pessoais.aportes(account.id, masterKey),
        pessoais.planejamentos(account.id, masterKey),
        pessoais.compras(account.id, masterKey),
        pessoais.transferencias(account.id, masterKey),
        antigo.incomes(account.id, masterKey),
        antigo.expenses(account.id, masterKey),
        antigo.bills(account.id, masterKey),
        antigo.plans(account.id, masterKey),
      ])
      setNovos(lancamentos)
      /*
        O que já migrou sai da leitura antiga: ele tem equivalente no formato
        novo com o mesmo identificador, e ler os dois somaria o mesmo
        lançamento duas vezes.
      */
      const antigos: RegistrosAntigos = { incomes, expenses, bills }
      const migrados = await pessoais.idsMigrados(account.id, masterKey)
      setRegistrosAntigos(antigos)
      setHerdados(aindaLegados(lerOAntigo(antigos), migrados))
      setPorMigrar(planoDeMigracao(antigos, migrados).paraGravar.length)
      setContas(listaContas)
      setCartoes(listaCartoes)
      setIntegrantes(listaIntegrantes)
      setMetas(listaMetas)
      setAportes(listaAportes)
      setPlanejamentos(listaPlanejamentos)
      setCompras(listaCompras)
      setTransferencias(listaTransferencias)
      const doMesEscolhido = plans.find((plano) => plano.month === mes)
      setPlanejado(Object.fromEntries(Object.entries(doMesEscolhido?.limits ?? {}).map(([chave, valor]) => [chave, emCentavos(valor ?? 0)])))
      setErro('')
    } catch (motivo) {
      setErro(motivo instanceof Error ? motivo.message : 'Não foi possível abrir o orçamento.')
    } finally {
      setCarregando(false)
    }
  }, [account, masterKey, mes])

  useReloadOnSync(carregar)

  const todos = useMemo(() => [...novos, ...herdados], [novos, herdados])
  const doMesEscolhido = useMemo(() => doMes(todos, mes), [todos, mes])
  const doAnterior = useMemo(() => doMes(todos, mesAnterior(mes)), [todos, mes])
  const natureza: NaturezaDoLancamento = area === 'entradas' ? 'entrada' : 'saida'
  const daNatureza = useMemo(() => doMesEscolhido.filter((item) => item.natureza === natureza), [doMesEscolhido, natureza])

  async function salvar(dados: LancamentoData, parcelamento?: PlanoDeParcelamento) {
    if (!account || !masterKey) return
    try {
      if (editando) {
        const escopo = escolherEscopo(editando)
        if (!escopo) return
        await pessoais.editarSerie(account.id, masterKey, novos, editando, dados, escopo)
        setAviso('Alterações salvas.')
      } else {
        const gravados = await pessoais.salvarLancamento(account.id, masterKey, dados, { parcelamento })
        setAviso(gravados.length > 1 ? `${gravados.length} lançamentos criados.` : 'Lançamento salvo.')
      }
      setRascunho(null)
      setEditando(null)
      await carregar()
    } catch (motivo) {
      setErro(motivo instanceof Error ? motivo.message : 'Não foi possível salvar.')
    }
  }

  async function alternarSituacao(lancamento: Lancamento) {
    if (!account || !masterKey) return
    const { id, ...dados } = lancamento
    const proxima = lancamento.natureza === 'entrada'
      ? (lancamento.situacao === 'recebida' ? 'prevista' : 'recebida')
      : (lancamento.situacao === 'paga' ? 'pendente' : 'paga')
    await pessoais.salvarLancamento(account.id, masterKey, { ...dados, situacao: proxima }, { id })
    await carregar()
  }

  async function apagar(lancamento: Lancamento) {
    if (!account || !masterKey) return
    const escopo = lancamento.serieId ? escolherEscopo(lancamento, 'apagar') : 'somente_esta'
    if (!escopo) return
    if (!window.confirm(escopo === 'somente_esta'
      ? `Excluir "${lancamento.descricao}"?`
      : `Excluir ${escopo === 'serie_inteira' ? 'toda a série' : 'esta e as próximas ocorrências'} de "${lancamento.descricao}"?`)) return
    const quantos = await pessoais.apagarSerie(account.id, masterKey, novos, lancamento, escopo)
    setAviso(quantos === 1 ? 'Lançamento excluído.' : `${quantos} lançamentos excluídos.`)
    await carregar()
  }

  async function salvarMeta(dados: MetaData, id?: string) {
    if (!account || !masterKey) return
    await pessoais.salvarMeta(account.id, masterKey, dados, id)
    setAviso(id ? 'Meta atualizada.' : 'Meta criada.')
    await carregar()
  }

  async function aportar(metaId: string, valor: Centavos, data: string) {
    if (!account || !masterKey) return
    await pessoais.salvarAporte(account.id, masterKey, {
      metaId, valor, data, contaId: null, integranteId: null, observacao: '', createdAt: '', updatedAt: '',
    })
    setAviso('Aporte guardado.')
    await carregar()
  }

  async function salvarPlanejamento(dados: PlanejamentoData) {
    if (!account || !masterKey) return
    const existente = planejamentos.find((item) => item.mes === dados.mes)
    await pessoais.salvarPlanejamento(account.id, masterKey, dados, existente?.id)
    setAviso('Planejamento salvo.')
    await carregar()
  }

  async function salvarCompra(dados: CompraData, id?: string) {
    if (!account || !masterKey) return
    await pessoais.salvarCompra(account.id, masterKey, dados, id)
    await carregar()
  }

  /**
   * A compra vira uma saída só, em Alimentação · Supermercado.
   *
   * Registrar cada item encheria o extrato de quarenta linhas de dois reais, e
   * "Alimentação" pareceria quarenta gastos diferentes. O identificador do
   * lançamento fica guardado na compra: finalizar de novo não cria um segundo.
   */
  async function finalizarCompra(compra: Compra) {
    if (!account || !masterKey || compra.lancamentoId) return
    const totais = totaisDaCompra(compra)
    if (totais.noCarrinho <= 0) return
    if (!window.confirm(`Registrar ${formatarValor(totais.noCarrinho)} como saída em Alimentação · Supermercado?`)) return

    const [lancamento] = await pessoais.salvarLancamento(account.id, masterKey, {
      natureza: 'saida', descricao: compra.nome || 'Compra do mês', valor: totais.noCarrinho,
      subcategoria: 'alimentacao.supermercado', data: hoje, competencia: hoje.slice(0, 7),
      vencimento: hoje, situacao: 'paga', tipo: 'variavel', formaDePagamento: null,
      contaId: null, cartaoId: null, integranteId: null, referenteA: null,
      recorrencia: 'nenhuma', serieId: null, parcelamento: null, descontadoNaFonte: false,
      observacao: `${totais.marcados} itens`, createdAt: '', updatedAt: '',
    })

    const { id, ...dados } = compra
    await pessoais.salvarCompra(account.id, masterKey, {
      ...dados, lancamentoId: lancamento?.id ?? null, finalizadaEm: hoje,
    }, id)
    setAviso('Compra registrada em Alimentação · Supermercado.')
    await carregar()
  }

  if (carregando) return <div className="esqueleto" aria-busy="true" aria-label="Carregando o orçamento">
    {[0, 1, 2].map((linha) => <span key={linha} />)}
  </div>

  if (area === 'metas') {
    return <>
      {erro && <div className="alert alert--error" role="alert">{erro}</div>}
      {aviso && <div className="alert alert--success" role="status">{aviso}</div>}
      <MetasEPlanejamento
        mes={mes}
        hoje={hoje}
        metas={metas}
        aportes={aportes}
        planejamento={planejamentos.find((item) => item.mes === mes) ?? null}
        planejamentoAnterior={planejamentos.find((item) => item.mes === mesAnterior(mes)) ?? null}
        integrantes={integrantes}
        onSalvarPlanejamento={(dados) => void salvarPlanejamento(dados)}
        onSalvarMeta={(dados, id) => void salvarMeta(dados, id)}
        onAportar={(metaId, valor, data) => void aportar(metaId, valor, data)}
        onApagarMeta={(meta) => {
          if (!account || !masterKey || !window.confirm(`Excluir "${meta.nome}"? Os aportes registrados nela também saem.`)) return
          void (async () => {
            await Promise.all(aportes.filter(({ metaId }) => metaId === meta.id).map(({ id }) => pessoais.apagar(account.id, masterKey, id)))
            await pessoais.apagar(account.id, masterKey, meta.id)
            setAviso('Meta excluída.')
            await carregar()
          })()
        }}
      />
    </>
  }

  if (area === 'compras') {
    return <>
      {erro && <div className="alert alert--error" role="alert">{erro}</div>}
      {aviso && <div className="alert alert--success" role="status">{aviso}</div>}
      <ListaDeCompras
        mes={mes}
        compra={compras.find((item) => item.mes === mes) ?? null}
        anterior={compras.find((item) => item.mes === mesAnterior(mes)) ?? null}
        onSalvar={(dados, id) => void salvarCompra(dados, id)}
        onFinalizar={(compra) => void finalizarCompra(compra)}
      />
    </>
  }

  if (area === 'relatorios') {
    return <>
      {erro && <div className="alert alert--error" role="alert">{erro}</div>}
      <Relatorios
        mes={mes}
        hoje={hoje}
        lancamentos={todos}
        transferencias={transferencias}
        contas={contas}
        cartoes={cartoes}
        integrantes={integrantes}
        metas={metas}
        aportes={aportes}
        planejado={planejado}
      />
    </>
  }

  /**
   * Migra o que ficou no formato antigo.
   *
   * Pedida pelo pastor, nunca automática: reescrever registro financeiro é o
   * passo mais arriscado desta reconstrução, e ele não se dá de passagem.
   */
  async function migrar() {
    if (!account || !masterKey || !registrosAntigos) return
    setMigrando(true)
    try {
      const migrados = await pessoais.idsMigrados(account.id, masterKey)
      const plano = planoDeMigracao(registrosAntigos, migrados)
      const quantos = await pessoais.migrarAntigos(account.id, masterKey, plano.paraGravar)
      await carregar()
      setErro('')
      setAviso(`${quantos} ${quantos === 1 ? 'lançamento migrado' : 'lançamentos migrados'}.`)
    } catch (motivo) {
      setErro(motivo instanceof Error ? motivo.message : 'Não foi possível migrar.')
    } finally { setMigrando(false) }
  }

  if (area === 'resumo') {
    return <>
      {erro && <div className="alert alert--error" role="alert">{erro}</div>}
      {porMigrar > 0 && <Card className="danger-card" title="Lançamentos no formato antigo">
        <p>{porMigrar} {porMigrar === 1 ? 'lançamento continua' : 'lançamentos continuam'} no formato antigo. Eles aparecem nas somas, mas não podem ser editados.</p>
        <p>Migrar não apaga nada: o registro antigo continua guardado, e rodar de novo não duplica.</p>
        <Button disabled={migrando} onClick={() => void migrar()}>{migrando ? 'Migrando…' : 'Migrar agora'}</Button>
      </Card>}
      <VisaoGeral
        mes={mes}
        doMes={doMesEscolhido}
        doMesAnterior={doAnterior}
        todos={todos}
        integrantes={integrantes}
        planejado={planejado}
        hoje={hoje}
      />
    </>
  }

  const entrada = area === 'entradas'
  return <>
    {erro && <div className="alert alert--error" role="alert">{erro}</div>}
    {aviso && <div className="alert alert--success" role="status">{aviso}</div>}

    {rascunho
      ? <Card title={editando ? 'Editar lançamento' : entrada ? 'Nova entrada' : 'Nova saída'}>
        <FormularioDeLancamento
          natureza={natureza}
          valorInicial={rascunho}
          contas={contas}
          cartoes={cartoes}
          integrantes={integrantes}
          editando={Boolean(editando)}
          onSalvar={(dados, parcelamento) => void salvar(dados, parcelamento)}
          onCancelar={() => { setRascunho(null); setEditando(null) }}
        />
      </Card>
      : <div className="linha-de-busca">
        <p className="conta-de-tarefas">{daNatureza.length} {daNatureza.length === 1 ? (entrada ? 'entrada' : 'saída') : (entrada ? 'entradas' : 'saídas')} no mês</p>
        <button type="button" className="botao-novo" onClick={() => { setEditando(null); setRascunho(lancamentoVazio(natureza)) }}>
          <Plus aria-hidden="true" />{entrada ? 'Nova entrada' : 'Nova saída'}
        </button>
      </div>}

    <ListaDeLancamentos
      lancamentos={daNatureza}
      integrantes={integrantes}
      natureza={natureza}
      hoje={hoje}
      busca={busca}
      onBusca={setBusca}
      onAlternarSituacao={(item) => void alternarSituacao(item)}
      onEditar={(item) => { const { id: _id, ...dados } = item; void _id; setEditando(item); setRascunho(dados) }}
      onApagar={(item) => void apagar(item)}
    />
  </>
}

/**
 * Pergunta o alcance da mudança quando o lançamento pertence a uma série.
 *
 * Sem essa pergunta, mudar o valor da luz de outubro reescreveria também
 * agosto — que veio no valor que veio.
 */
function escolherEscopo(lancamento: Lancamento, acao = 'alterar'): EscopoDeEdicao | null {
  if (!lancamento.serieId) return 'somente_esta'
  const opcoes = ESCOPOS_DE_EDICAO.map((escopo, indice) => `${indice + 1}. ${ESCOPO_LABELS[escopo]}`).join('\n')
  const resposta = window.prompt(`Este lançamento se repete. O que deseja ${acao}?\n\n${opcoes}\n\nDigite 1, 2 ou 3:`, '1')
  if (!resposta) return null
  const escolhido = ESCOPOS_DE_EDICAO[Number(resposta.trim()) - 1]
  return escolhido ?? null
}
