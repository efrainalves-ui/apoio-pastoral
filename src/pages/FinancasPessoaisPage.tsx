import { Plus } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { useAuthVault } from '../auth/AuthVaultContext'
import { Card } from '../components/ui/Card'
import { FormularioDeLancamento, lancamentoVazio } from '../components/orcamento/FormularioDeLancamento'
import { ListaDeLancamentos } from '../components/orcamento/ListaDeLancamentos'
import { VisaoGeral } from '../components/orcamento/VisaoGeral'
import { lerOAntigo } from '../family-budget/adaptador'
import { doMes } from '../family-budget/calculos'
import type { NaturezaDoLancamento } from '../family-budget/catalogo'
import { emCentavos, type Centavos } from '../family-budget/dinheiro'
import type { Cartao, Conta, Integrante, Lancamento, LancamentoData } from '../family-budget/lancamento'
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
  area: 'resumo' | 'entradas' | 'saidas'
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
  const [contas, setContas] = useState<Conta[]>([])
  const [cartoes, setCartoes] = useState<Cartao[]>([])
  const [integrantes, setIntegrantes] = useState<Integrante[]>([])
  const [planejado, setPlanejado] = useState<Record<string, Centavos>>({})
  const [rascunho, setRascunho] = useState<LancamentoData | null>(null)
  const [editando, setEditando] = useState<Lancamento | null>(null)
  const [busca, setBusca] = useState('')
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')

  const hoje = localDateKey()

  const carregar = useCallback(async () => {
    if (!account || !masterKey) return
    try {
      const [lancamentos, listaContas, listaCartoes, listaIntegrantes, incomes, expenses, bills, plans] = await Promise.all([
        pessoais.lancamentos(account.id, masterKey),
        pessoais.contas(account.id, masterKey),
        pessoais.cartoes(account.id, masterKey),
        pessoais.integrantes(account.id, masterKey),
        antigo.incomes(account.id, masterKey),
        antigo.expenses(account.id, masterKey),
        antigo.bills(account.id, masterKey),
        antigo.plans(account.id, masterKey),
      ])
      setNovos(lancamentos)
      setHerdados(lerOAntigo({ incomes, expenses, bills }))
      setContas(listaContas)
      setCartoes(listaCartoes)
      setIntegrantes(listaIntegrantes)
      const doMesEscolhido = plans.find((plano) => plano.month === mes)
      setPlanejado(Object.fromEntries(Object.entries(doMesEscolhido?.limits ?? {}).map(([chave, valor]) => [chave, emCentavos(valor ?? 0)])))
      setErro('')
    } catch (motivo) {
      setErro(motivo instanceof Error ? motivo.message : 'Não foi possível abrir o orçamento.')
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
    const quantos = await pessoais.apagarSerie(account.id, novos, lancamento, escopo)
    setAviso(quantos === 1 ? 'Lançamento excluído.' : `${quantos} lançamentos excluídos.`)
    await carregar()
  }

  if (area === 'resumo') {
    return <>
      {erro && <div className="alert alert--error" role="alert">{erro}</div>}
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
