import { ChevronDown, ChevronRight, HeartHandshake, Search } from 'lucide-react'
import { useDeferredValue, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ATENCAO_LABELS, atencaoDaVisita, inicioDaSemana, type Atencao } from '../care/atencaoDaVisita'
import { agruparVisitasPorIgreja } from '../care/visitasPorIgreja'
import { VISIT_REASON_LABELS, type FollowUpEntity, type TaskEntity, type VisitEntity } from '../care/types'
import type { ChurchEntity } from '../district/types'
import { normalizePersonName } from '../people/validation'

/** Quantas linhas cada igreja mostra antes de pedir para ver o resto. */
const LINHAS_POR_IGREJA = 5

const FILTROS = [
  ['todos', 'Todos'],
  ['pendente', 'Pendentes'],
  ['retorno', 'Retorno'],
  ['urgente', 'Urgentes'],
  ['semana', 'Esta semana'],
] as const
type Filtro = (typeof FILTROS)[number][0]

const dataCurta = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short' })
const horaCurta = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' })

/** "14 de ago." vira "14 ago"; o ano só entra quando não é o corrente. */
function quando(iso: string, anoCorrente: number): string {
  const data = new Date(iso)
  const dia = dataCurta.format(data).replace(/\sde\s/gu, ' ').replace(/\.$/u, '')
  const ano = data.getFullYear() === anoCorrente ? '' : ` ${data.getFullYear()}`
  return `${dia}${ano} · ${horaCurta.format(data)}`
}

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/u).filter((parte) => parte.length > 2)
  const escolhidas = partes.length > 1 ? [partes[0]!, partes.at(-1)!] : nome.trim().split(/\s+/u).slice(0, 2)
  return escolhidas.map((parte) => parte[0]?.toLocaleUpperCase('pt-BR') ?? '').join('').slice(0, 2)
}

interface VisitasPorIgrejaProps {
  visits: VisitEntity[]
  followUps: FollowUpEntity[]
  tasks: TaskEntity[]
  churches: ChurchEntity[]
  nomeDoAlvo: (visit: VisitEntity) => string | null | undefined
}

/**
 * A lista de visitas agrupada por igreja, com busca, filtro e recolhimento.
 *
 * Com novecentas pessoas a lista corrida deixa de responder qualquer pergunta.
 * Agrupar por igreja mostra a igreja esquecida; recolher e mostrar cinco por
 * vez mantém a tela navegável sem precisar de virtualização — treze igrejas
 * abertas dão sessenta e cinco linhas, não milhares.
 */
export function VisitasPorIgreja({ visits, followUps, tasks, churches, nomeDoAlvo }: VisitasPorIgrejaProps) {
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [busca, setBusca] = useState('')
  const buscaAdiada = useDeferredValue(busca)
  const [recolhidas, setRecolhidas] = useState<Set<string>>(new Set())
  const [abertas, setAbertas] = useState<Set<string>>(new Set())

  const anoCorrente = useMemo(() => new Date().getFullYear(), [])
  const domingo = useMemo(() => inicioDaSemana(), [])

  const atencoes = useMemo(() => {
    const mapa = new Map<string, Atencao | null>()
    for (const visita of visits) mapa.set(visita.id, atencaoDaVisita(visita, followUps, tasks))
    return mapa
  }, [visits, followUps, tasks])

  const nomes = useMemo(() => {
    const mapa = new Map<string, string>()
    for (const visita of visits) mapa.set(visita.id, nomeDoAlvo(visita) ?? 'Cadastro preservado')
    return mapa
  }, [visits, nomeDoAlvo])

  const filtradas = useMemo(() => {
    const termo = normalizePersonName(buscaAdiada)
    const nomeDaIgreja = new Map(churches.map((church) => [church.id, normalizePersonName(church.name)]))
    return visits.filter((visita) => {
      if (filtro === 'semana') {
        if ((visita.versions.at(-1)?.startAt ?? '').slice(0, 10) < domingo) return false
      } else if (filtro !== 'todos' && atencoes.get(visita.id) !== filtro) return false
      if (!termo) return true
      return normalizePersonName(nomes.get(visita.id) ?? '').includes(termo)
        || (nomeDaIgreja.get(visita.churchId) ?? '').includes(termo)
    })
  }, [visits, filtro, buscaAdiada, atencoes, nomes, churches, domingo])

  const agrupado = useMemo(() => agruparVisitasPorIgreja(filtradas, churches), [filtradas, churches])

  function alternar(conjunto: Set<string>, chave: string): Set<string> {
    const proximo = new Set(conjunto)
    if (proximo.has(chave)) proximo.delete(chave); else proximo.add(chave)
    return proximo
  }

  return <>
    <div className="visitacao-busca">
      <Search aria-hidden="true" />
      <input
        type="search"
        className="field__input"
        value={busca}
        onChange={(event) => setBusca(event.target.value)}
        placeholder="Buscar pessoa ou igreja"
        aria-label="Buscar pessoa ou igreja"
      />
    </div>

    <div className="tira-filtros" role="group" aria-label="Filtrar visitas">
      {FILTROS.map(([valor, rotulo]) => (
        <button
          key={valor}
          type="button"
          className={`chip-filtro ${filtro === valor ? 'chip-filtro--ativo' : ''}`}
          aria-pressed={filtro === valor}
          onClick={() => setFiltro(valor)}
        >{rotulo}</button>
      ))}
    </div>

    {!agrupado.igrejas.length && <div className="empty-state">
      <HeartHandshake />
      <strong>{visits.length ? 'Nenhuma visita encontrada' : 'Nenhuma visita registrada'}</strong>
      {Boolean(visits.length) && <span>Ajuste os filtros ou a busca.</span>}
    </div>}

    {agrupado.igrejas.map((igreja) => {
      const recolhida = recolhidas.has(igreja.churchId)
      const tudo = abertas.has(igreja.churchId)
      const mostradas = tudo ? igreja.visitas : igreja.visitas.slice(0, LINHAS_POR_IGREJA)
      const restantes = igreja.visitas.length - mostradas.length
      return <section className="igreja-visitada" key={igreja.churchId}>
        <button
          type="button"
          className="igreja-visitada__topo"
          aria-expanded={!recolhida}
          onClick={() => setRecolhidas((atual) => alternar(atual, igreja.churchId))}
        >
          <span className="igreja-visitada__nome">{igreja.nome}</span>
          <span className="igreja-visitada__conta">{igreja.visitas.length} {igreja.visitas.length === 1 ? 'visita' : 'visitas'}</span>
          {recolhida ? <ChevronDown /> : <ChevronRight className="igreja-visitada__seta" />}
        </button>

        {!recolhida && <div className="linhas-visita">
          {mostradas.map((visita) => {
            const versao = visita.versions.at(-1)!
            const nome = nomes.get(visita.id) ?? 'Cadastro preservado'
            const atencao = atencoes.get(visita.id) ?? null
            return <Link className="linha-visita" to={`/app/visitas/${visita.id}`} key={visita.id}>
              <span className="linha-visita__inicial" aria-hidden="true">{iniciais(nome)}</span>
              <span className="linha-visita__corpo">
                <strong>{nome}</strong>
                <small>{VISIT_REASON_LABELS[versao.reason]} · {quando(versao.startAt, anoCorrente)}</small>
              </span>
              {atencao && <span className={`selo-atencao selo-atencao--${atencao}`}>{ATENCAO_LABELS[atencao]}</span>}
              <ChevronRight className="linha-visita__seta" aria-hidden="true" />
            </Link>
          })}
          {restantes > 0 && <button
            type="button"
            className="linhas-visita__mais"
            onClick={() => setAbertas((atual) => alternar(atual, igreja.churchId))}
          >Ver todas as {igreja.visitas.length} visitas<ChevronRight /></button>}
          {tudo && igreja.visitas.length > LINHAS_POR_IGREJA && <button
            type="button"
            className="linhas-visita__mais"
            onClick={() => setAbertas((atual) => alternar(atual, igreja.churchId))}
          >Mostrar menos</button>}
        </div>}
      </section>
    })}
  </>
}
