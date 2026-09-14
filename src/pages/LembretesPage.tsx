import { ArrowDown, ArrowUp, ChevronRight, Plus, Search, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { FormularioDaLista } from '../components/lembretes/FormularioDaLista'
import { ICONE_DA_AREA, ICONE_DA_LISTA, ICONE_DO_BLOCO } from '../components/lembretes/Icones'
import { LinhaDoLembrete } from '../components/lembretes/LinhaDoLembrete'
import { PainelDeNotificacoes } from '../components/lembretes/PainelDeNotificacoes'
import { AREAS_DA_CENTRAL, BLOCOS, BLOCO_LABELS, agruparItens, contagensDosBlocos, itensDoBloco, pesquisarItens, type AreaDaCentral } from '../lembretes/central'
import { CORES_DE_LISTA, type ListaDeLembretesEntity } from '../lembretes/types'
import { servicoDeLembretes, useAcoesDaCentral, useCentral, avisarAlteracaoDeLembretes } from '../lembretes/useCentral'
import { useAuthVault } from '../auth/AuthVaultContext'

export function LembretesPage() {
  const { account, masterKey } = useAuthVault()
  const { dados, erro, agora, fuso } = useCentral()
  const acoes = useAcoesDaCentral()
  const [pesquisando, setPesquisando] = useState(false)
  const [termo, setTermo] = useState('')
  const [listaEmEdicao, setListaEmEdicao] = useState<ListaDeLembretesEntity | 'nova' | null>(null)
  const [ordenando, setOrdenando] = useState(false)

  const itens = useMemo(() => dados?.itens ?? [], [dados])
  const listas = dados?.listas ?? []
  const ativas = listas.filter(({ arquivada }) => !arquivada)
  const arquivadas = listas.filter(({ arquivada }) => arquivada)
  const contagens = contagensDosBlocos(itens, agora, fuso)
  const abertos = itensDoBloco(itens, 'todos', agora, fuso)
  const abertosDaLista = (id: string) => abertos.filter(({ listaId }) => listaId === id).length
  const abertosDaArea = (area: AreaDaCentral) => abertos.filter((item) => item.area === area).length
  const resultados = termo.trim() && dados ? pesquisarItens(itens, termo, { nomeDaLista: (id) => listas.find((lista) => lista.id === id)?.nome, nomeDaIgreja: (id) => dados.igrejas.get(id) }) : []
  const contexto = { agora, fuso, listas, igrejas: dados?.igrejas ?? new Map<string, string>(), acoes, voltar: '/app/lembretes', mostrarLista: true }

  const mover = async (indice: number, passo: -1 | 1) => {
    if (!account || !masterKey) return
    const ids = ativas.map(({ id }) => id)
    const destino = indice + passo
    if (destino < 0 || destino >= ids.length) return
    ;[ids[indice], ids[destino]] = [ids[destino]!, ids[indice]!]
    await servicoDeLembretes.reordenarListas(account.id, masterKey, [...ids, ...arquivadas.map(({ id }) => id)])
    avisarAlteracaoDeLembretes()
  }

  const linhaDaLista = (lista: ListaDeLembretesEntity, indice: number) => {
    const Icone = ICONE_DA_LISTA[lista.icone]
    return (
      <li key={lista.id} className="lembretes-lista-linha">
        <Link to={`/app/lembretes/lista/${lista.id}`} className="lembretes-lista-linha__link">
          <span className="lembretes-circulo" style={{ background: CORES_DE_LISTA[lista.cor] }} aria-hidden="true"><Icone /></span>
          <span className="lembretes-lista-linha__texto"><strong>{lista.nome}</strong>{lista.descricao && <small>{lista.descricao}</small>}</span>
          <span className="lembretes-lista-linha__contagem" aria-label={`${abertosDaLista(lista.id)} em aberto`}>{abertosDaLista(lista.id)}</span>
          {!ordenando && <ChevronRight className="lembretes-lista-linha__seta" aria-hidden="true" />}
        </Link>
        {ordenando && !lista.arquivada && (
          <span className="lembretes-lista-linha__ordem">
            <button type="button" className="icon-button" aria-label={`Subir ${lista.nome}`} disabled={indice === 0} onClick={() => { void mover(indice, -1) }}><ArrowUp aria-hidden="true" /></button>
            <button type="button" className="icon-button" aria-label={`Descer ${lista.nome}`} disabled={indice === ativas.length - 1} onClick={() => { void mover(indice, 1) }}><ArrowDown aria-hidden="true" /></button>
          </span>
        )}
      </li>
    )
  }

  return (
    <div className="page-stack lembretes-page">
      <header className="lembretes-topo">
        <div>
          <h1>Lembretes</h1>
          <p>Tudo o que você precisa fazer, sem deixar nada passar</p>
        </div>
        <button type="button" className="lembretes-botao-redondo" aria-label={pesquisando ? 'Fechar pesquisa' : 'Pesquisar lembretes'} aria-expanded={pesquisando} onClick={() => { setPesquisando((atual) => !atual); setTermo('') }}>
          {pesquisando ? <X aria-hidden="true" /> : <Search aria-hidden="true" />}
        </button>
      </header>
      {pesquisando && (
        <input className="search-input lembretes-pesquisa" type="search" aria-label="Pesquisar por título, lista, área ou igreja" placeholder="Pesquisar" value={termo} autoFocus onChange={(evento) => setTermo(evento.target.value)} />
      )}
      {erro && <div className="alert alert--error" role="alert">{erro}</div>}
      {acoes.aviso && <div className="visually-hidden" role="status">{acoes.aviso}</div>}

      {termo.trim() ? (
        <section className="lembretes-secao" aria-label="Resultados">
          {resultados.length ? agruparItens(resultados, agora, fuso).map((grupo) => (
            <div key={grupo.situacao} className="lembretes-grupo">
              <h2>{grupo.rotulo}</h2>
              <ul className="lembretes-linhas">{grupo.itens.map((item) => <LinhaDoLembrete key={item.chave} item={item} contexto={contexto} />)}</ul>
            </div>
          )) : <div className="empty-state"><Search aria-hidden="true" /><strong>Nada encontrado</strong></div>}
        </section>
      ) : (
        <>
          <nav className="lembretes-blocos" aria-label="Blocos">
            {BLOCOS.map((bloco) => {
              const Icone = ICONE_DO_BLOCO[bloco]
              return (
                <Link key={bloco} to={`/app/lembretes/bloco/${bloco}`} className={`lembretes-bloco lembretes-bloco--${bloco}`} aria-label={`${BLOCO_LABELS[bloco]}: ${dados ? contagens[bloco] : 'carregando'}`}>
                  <span className="lembretes-bloco__icone" aria-hidden="true"><Icone /></span>
                  <strong className="lembretes-bloco__numero" aria-hidden="true">{dados ? contagens[bloco] : '–'}</strong>
                  <span className="lembretes-bloco__nome" aria-hidden="true">{BLOCO_LABELS[bloco]}</span>
                </Link>
              )
            })}
          </nav>

          <section className="lembretes-secao" aria-labelledby="minhas-listas">
            <header className="lembretes-secao__topo">
              <h2 id="minhas-listas">Minhas listas</h2>
              <span className="lembretes-secao__acoes">
                {ativas.length > 1 && <button type="button" className="text-button" aria-pressed={ordenando} onClick={() => setOrdenando((atual) => !atual)}>{ordenando ? 'Pronto' : 'Ordenar'}</button>}
                <button type="button" className="text-button" onClick={() => setListaEmEdicao('nova')}>Adicionar lista</button>
              </span>
            </header>
            {ativas.length > 0 && <ul className="lembretes-listas">{ativas.map(linhaDaLista)}</ul>}
            {arquivadas.length > 0 && (
              <details className="lembretes-arquivadas">
                <summary>Arquivadas ({arquivadas.length})</summary>
                <ul className="lembretes-listas">{arquivadas.map(linhaDaLista)}</ul>
              </details>
            )}
          </section>

          <section className="lembretes-secao" aria-labelledby="areas-do-aplicativo">
            <header className="lembretes-secao__topo"><h2 id="areas-do-aplicativo">Áreas do aplicativo</h2></header>
            <ul className="lembretes-listas">
              {(Object.keys(AREAS_DA_CENTRAL) as AreaDaCentral[]).map((area) => {
                const Icone = ICONE_DA_AREA[area]
                return (
                  <li key={area} className="lembretes-lista-linha">
                    <Link to={`/app/lembretes/area/${area}`} className="lembretes-lista-linha__link">
                      <span className="lembretes-circulo lembretes-circulo--area" aria-hidden="true"><Icone /></span>
                      <span className="lembretes-lista-linha__texto"><strong>{AREAS_DA_CENTRAL[area].rotulo}</strong><small>{AREAS_DA_CENTRAL[area].descricao}</small></span>
                      <span className="lembretes-lista-linha__contagem" aria-label={`${abertosDaArea(area)} em aberto`}>{abertosDaArea(area)}</span>
                      <ChevronRight className="lembretes-lista-linha__seta" aria-hidden="true" />
                    </Link>
                  </li>
                )
              })}
            </ul>
          </section>

          <PainelDeNotificacoes />
        </>
      )}

      <Link className="lembretes-fab" to="/app/lembretes/novo" aria-label="Novo lembrete"><Plus aria-hidden="true" /></Link>
      {listaEmEdicao && <FormularioDaLista lista={listaEmEdicao === 'nova' ? null : listaEmEdicao} onFechar={() => setListaEmEdicao(null)} />}
    </div>
  )
}
