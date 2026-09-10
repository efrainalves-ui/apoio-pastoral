import { BookOpen, ChevronRight, MapPin, Search } from 'lucide-react'
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { AgendaEventEntity } from '../agenda/types'
import type { ChurchEntity } from '../district/types'
import { normalizePersonName } from '../people/validation'
import {
  contarPorFiltro, FILTRO_LABELS, FILTROS_DA_BIBLIOTECA, historicosPorSermao, ordenar,
  ORDENACAO_LABELS, ORDENACOES, passaNoFiltro, type FiltroDaBiblioteca, type Ordenacao,
} from '../sermons/biblioteca'
import { abreviacaoDoLivro } from '../sermons/livros'
import { formatPreachingDate } from '../sermons/preachings'
import { SERMON_STATUS_LABELS, type SermonEntity } from '../sermons/types'

/** Quantos sermões entram na tela por vez. */
const PAGINA = 30

interface BibliotecaDeSermoesProps {
  sermons: SermonEntity[]
  events: AgendaEventEntity[]
  churches: ChurchEntity[]
}

/**
 * A biblioteca de sermões: busca, filtro com contagem, ordenação e lista.
 *
 * O acervo cresce a vida inteira do ministério, então a lista não pode supor
 * um punhado de registros. Em vez de virtualizar — que traria uma dependência
 * nova só por esta tela — ela desenha trinta por vez e cresce ao chegar no fim.
 * Quinhentos sermões nunca viram quinhentas linhas no documento.
 */
export function BibliotecaDeSermoes({ sermons, events, churches }: BibliotecaDeSermoesProps) {
  const [filtro, setFiltro] = useState<FiltroDaBiblioteca>('todos')
  const [ordenacao, setOrdenacao] = useState<Ordenacao>('recentes')
  const [busca, setBusca] = useState('')
  const buscaAdiada = useDeferredValue(busca)
  const [limite, setLimite] = useState(PAGINA)
  const sentinela = useRef<HTMLButtonElement>(null)

  const historicos = useMemo(() => historicosPorSermao(sermons, events, churches), [sermons, events, churches])
  const contagens = useMemo(() => contarPorFiltro(sermons, historicos), [sermons, historicos])

  const visiveis = useMemo(() => {
    const termo = normalizePersonName(buscaAdiada)
    const filtrados = sermons.filter((sermon) => {
      if (!passaNoFiltro(sermon, filtro, historicos)) return false
      if (!termo) return true
      return normalizePersonName(`${sermon.title} ${sermon.theme} ${sermon.mainText} ${sermon.tags.join(' ')}`).includes(termo)
    })
    return ordenar(filtrados, ordenacao, historicos)
  }, [sermons, filtro, buscaAdiada, ordenacao, historicos])

  /* Mudou o recorte, a lista recomeça do topo. */
  useEffect(() => { setLimite(PAGINA) }, [filtro, buscaAdiada, ordenacao])

  const mostrados = visiveis.slice(0, limite)
  const restantes = visiveis.length - mostrados.length

  /*
    O botão de carregar mais é de verdade e funciona sozinho. O observador
    apenas o aciona quando ele entra na tela, para que rolar já baste. Onde não
    houver IntersectionObserver, o botão continua ali.
  */
  useEffect(() => {
    const alvo = sentinela.current
    if (!alvo || typeof IntersectionObserver === 'undefined') return
    const observador = new IntersectionObserver((entradas) => {
      if (entradas.some(({ isIntersecting }) => isIntersecting)) setLimite((atual) => atual + PAGINA)
    }, { rootMargin: '400px' })
    observador.observe(alvo)
    return () => { observador.disconnect() }
  }, [restantes])

  return <>
    <div className="visitacao-busca">
      <Search aria-hidden="true" />
      <input
        type="search"
        className="field__input"
        value={busca}
        onChange={(event) => setBusca(event.target.value)}
        placeholder="Buscar título, tema ou texto bíblico"
        aria-label="Buscar título, tema ou texto bíblico"
      />
    </div>

    <div className="tira-filtros" role="group" aria-label="Filtrar a biblioteca">
      {FILTROS_DA_BIBLIOTECA.filter((valor) => valor !== 'archived' || contagens.archived > 0).map((valor) => (
        <button
          key={valor}
          type="button"
          className={`chip-filtro ${filtro === valor ? 'chip-filtro--ativo' : ''}`}
          aria-pressed={filtro === valor}
          onClick={() => setFiltro(valor)}
        >{FILTRO_LABELS[valor]}<span className="chip-filtro__conta">{contagens[valor]}</span></button>
      ))}
    </div>

    <div className="ordenar-biblioteca">
      <label className="field" htmlFor="ordenar-sermoes">
        <span className="sr-only">Ordenar por</span>
        <select
          id="ordenar-sermoes"
          className="ordenar-biblioteca__campo"
          value={ordenacao}
          onChange={(event) => setOrdenacao(event.target.value as Ordenacao)}
        >{ORDENACOES.map((valor) => <option key={valor} value={valor}>{ORDENACAO_LABELS[valor]}</option>)}</select>
      </label>
      <span className="ordenar-biblioteca__conta">{visiveis.length} {visiveis.length === 1 ? 'sermão' : 'sermões'}</span>
    </div>

    {!visiveis.length && <div className="empty-state">
      <BookOpen />
      <strong>{sermons.length ? 'Nenhum sermão encontrado' : 'Sua biblioteca ainda está vazia'}</strong>
      {sermons.length
        ? <span>Tente outra busca ou mude o filtro.</span>
        : <Link className="button" to="/app/sermoes/novo">Criar primeiro sermão</Link>}
    </div>}

    <div className="lista-sermoes">
      {mostrados.map((sermon) => {
        const sigla = abreviacaoDoLivro(sermon.mainText)
        const historico = historicos.get(sermon.id)
        const vezes = historico?.vezes ?? 0
        return <Link className="cartao-sermao" to={`/app/sermoes/${sermon.id}`} key={sermon.id}>
          <span className="cartao-sermao__livro" aria-hidden="true">{sigla ?? <BookOpen />}</span>
          <span className="cartao-sermao__corpo">
            <strong>{sermon.title}</strong>
            <small>{[sermon.theme || 'Sem tema', sermon.mainText].filter(Boolean).join(' · ')}</small>
            <small className="cartao-sermao__historico">
              {vezes === 0
                ? 'Nunca pregado'
                : <><MapPin aria-hidden="true" />{vezes === 1 ? 'Pregado 1x' : `Pregado ${vezes}x`}{historico?.ultimoLugar ? ` · ${historico.ultimoLugar}` : ''}{historico?.ultimaData ? ` · ${formatPreachingDate(historico.ultimaData)}` : ''}</>}
            </small>
          </span>
          <span className={`selo-sermao selo-sermao--${sermon.status}`}>{SERMON_STATUS_LABELS[sermon.status]}</span>
          <ChevronRight className="cartao-sermao__seta" aria-hidden="true" />
        </Link>
      })}
    </div>

    {restantes > 0 && <button
      ref={sentinela}
      type="button"
      className="linhas-visita__mais"
      onClick={() => setLimite((atual) => atual + PAGINA)}
    >Mostrar mais {Math.min(restantes, PAGINA)} de {restantes}</button>}
  </>
}
