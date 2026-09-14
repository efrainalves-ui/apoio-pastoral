import { ArrowRightLeft, Check, CircleCheck, Clock, Ellipsis, ExternalLink, Flag, Pencil, Repeat, Trash2, TriangleAlert, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { opcoesDeAdiamento } from '../../lembretes/adiamento'
import { AREAS_DA_CENTRAL, situacaoDoItem, type ItemDaCentral } from '../../lembretes/central'
import { dataLegivelCurta, dataNoFuso } from '../../lembretes/tempo'
import type { ListaDeLembretesEntity } from '../../lembretes/types'
import type { AcoesDaCentral } from '../../lembretes/useCentral'

export interface ContextoDaLinha {
  agora: Date
  fuso: string
  listas: readonly ListaDeLembretesEntity[]
  igrejas: ReadonlyMap<string, string>
  acoes: AcoesDaCentral
  /** Para onde o formulário volta. */
  voltar: string
  /** Mostra a lista do item (fora da própria lista). */
  mostrarLista?: boolean
}

export function LinhaDoLembrete({ item, contexto }: { item: ItemDaCentral; contexto: ContextoDaLinha }) {
  const [menuAberto, setMenuAberto] = useState(false)
  const botao = useRef<HTMLButtonElement>(null)
  const situacao = situacaoDoItem(item, contexto.agora, contexto.fuso)
  const hoje = dataNoFuso(contexto.agora, contexto.fuso)
  const atrasado = situacao === 'atrasado'
  const lista = item.listaId ? contexto.listas.find(({ id }) => id === item.listaId) : undefined
  const igreja = item.igrejaId ? contexto.igrejas.get(item.igrejaId) : undefined
  const fechar = () => { setMenuAberto(false); botao.current?.focus() }

  return (
    <li className={`lembrete-linha${atrasado ? ' lembrete-linha--atrasado' : ''}${item.concluido ? ' lembrete-linha--concluido' : ''}`}>
      <button
        type="button" role="checkbox" aria-checked={item.concluido} className="lembrete-linha__circulo"
        aria-label={item.concluido ? `Reabrir ${item.titulo}` : `Concluir ${item.titulo}`}
        onClick={() => { void contexto.acoes.concluir(item) }}
      >
        <span aria-hidden="true">{item.concluido && <Check />}</span>
      </button>
      <div className="lembrete-linha__corpo">
        <span className="lembrete-linha__titulo">
          {item.prioridade !== 'normal' && <span className={`lembrete-prioridade lembrete-prioridade--${item.prioridade}`} aria-label={item.prioridade === 'urgente' ? 'Urgente' : 'Importante'}>{item.prioridade === 'urgente' ? '!!' : '!'}</span>}
          {item.titulo}
        </span>
        <span className="lembrete-linha__meta">
          {item.data && (
            <span className="lembrete-linha__quando">
              {atrasado && <><TriangleAlert aria-hidden="true" /><span className="visually-hidden">Atrasado:</span></>}
              {dataLegivelCurta(item.data, hoje)}{item.hora ? `, ${item.hora}` : ''}
            </span>
          )}
          {item.repeticao && <span className="lembrete-linha__marca"><Repeat aria-hidden="true" /><span className="visually-hidden">Repete</span></span>}
          {item.area && <span>{AREAS_DA_CENTRAL[item.area].rotulo}{item.detalhe ? ` · ${item.detalhe}` : ''}</span>}
          {contexto.mostrarLista && lista && <span>{lista.nome}</span>}
          {igreja && <span>{igreja}</span>}
        </span>
      </div>
      {item.sinalizado && <span className="lembrete-linha__sinal"><Flag aria-hidden="true" /><span className="visually-hidden">Sinalizado</span></span>}
      <button ref={botao} type="button" className="lembrete-linha__opcoes" aria-haspopup="dialog" aria-expanded={menuAberto} aria-label={`Opções de ${item.titulo}`} onClick={() => setMenuAberto(true)}>
        <Ellipsis aria-hidden="true" />
      </button>
      {menuAberto && <MenuDoItem item={item} contexto={contexto} onFechar={fechar} />}
    </li>
  )
}

type Tela = 'principal' | 'adiar' | 'lista' | 'excluir'

function MenuDoItem({ item, contexto, onFechar }: { item: ItemDaCentral; contexto: ContextoDaLinha; onFechar: () => void }) {
  const [tela, setTela] = useState<Tela>('principal')
  const hoje = dataNoFuso(contexto.agora, contexto.fuso)
  const [data, setData] = useState(item.data ?? hoje)
  const [hora, setHora] = useState(item.hora ?? '09:00')
  const [listaId, setListaId] = useState(item.listaId ?? '')
  const corpo = useRef<HTMLDivElement>(null)
  const { acoes } = contexto

  useEffect(() => { corpo.current?.querySelector<HTMLElement>('.lembrete-menu__conteudo button, .lembrete-menu__conteudo a, .lembrete-menu__conteudo input, .lembrete-menu__conteudo select')?.focus() }, [tela])
  useEffect(() => {
    const aoTeclar = (evento: KeyboardEvent) => { if (evento.key === 'Escape') onFechar() }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [onFechar])

  const agir = (acao: () => Promise<void> | void) => { onFechar(); void acao() }
  const edicao = `/app/lembretes/${item.lembreteId ?? ''}/editar?${new URLSearchParams({ ...(item.ocorrencia ? { ocorrencia: item.ocorrencia } : {}), voltar: contexto.voltar }).toString()}`

  return (
    <div className="folha lembrete-menu" role="dialog" aria-modal="true" aria-label={`Opções de ${item.titulo}`}>
      <div className="folha__fundo" aria-hidden="true" onClick={onFechar} />
      <div className="folha__corpo" ref={corpo}>
        <div className="folha__topo">
          <span className="folha__espaco" />
          <strong>{tela === 'adiar' ? 'Adiar' : tela === 'lista' ? 'Mudar de lista' : tela === 'excluir' ? 'Excluir' : item.titulo}</strong>
          <button type="button" className="icon-button" aria-label="Fechar" onClick={onFechar}><X aria-hidden="true" /></button>
        </div>
        <div className="lembrete-menu__conteudo">
          {tela === 'principal' && (
            <div className="lembrete-menu__acoes">
              {item.tipo === 'manual' && <Link to={edicao} onClick={onFechar}><Pencil aria-hidden="true" />Editar</Link>}
              {!(item.tipo === 'integrado' && item.concluido) && <button type="button" onClick={() => agir(() => acoes.concluir(item))}><CircleCheck aria-hidden="true" />{item.concluido ? 'Reabrir' : 'Concluir'}</button>}
              <button type="button" onClick={() => agir(() => acoes.sinalizar(item))}><Flag aria-hidden="true" />{item.sinalizado ? 'Tirar sinal' : 'Sinalizar'}</button>
              {!item.concluido && <button type="button" onClick={() => setTela('adiar')}><Clock aria-hidden="true" />Adiar</button>}
              <button type="button" onClick={() => setTela('lista')}><ArrowRightLeft aria-hidden="true" />Mudar de lista</button>
              {item.tipo === 'integrado' && item.link && <button type="button" onClick={() => agir(() => acoes.abrirOrigem(item))}><ExternalLink aria-hidden="true" />Abrir em {item.area ? AREAS_DA_CENTRAL[item.area].rotulo : 'origem'}</button>}
              {item.tipo === 'manual' && <button type="button" className="lembrete-menu__perigo" onClick={() => setTela('excluir')}><Trash2 aria-hidden="true" />Excluir</button>}
            </div>
          )}
          {tela === 'adiar' && (
            <div className="lembrete-menu__acoes">
              {opcoesDeAdiamento(contexto.agora, contexto.fuso).map((opcao) => (
                <button key={opcao.id} type="button" onClick={() => agir(() => acoes.adiar(item, { data: opcao.data, hora: opcao.hora }))}><Clock aria-hidden="true" />{opcao.rotulo}</button>
              ))}
              <form className="lembrete-menu__escolha" onSubmit={(evento) => { evento.preventDefault(); if (data) agir(() => acoes.adiar(item, { data, hora })) }}>
                <label className="field"><span className="field__label">Data</span><input className="field__input" type="date" required value={data} onChange={(evento) => setData(evento.target.value)} /></label>
                <label className="field"><span className="field__label">Horário</span><input className="field__input" type="time" value={hora} onChange={(evento) => setHora(evento.target.value)} /></label>
                <button type="submit" className="button button--primary"><span>Adiar</span></button>
              </form>
            </div>
          )}
          {tela === 'lista' && (
            <form className="lembrete-menu__escolha" onSubmit={(evento) => { evento.preventDefault(); agir(() => acoes.mudarDeLista(item, listaId || null)) }}>
              <label className="field"><span className="field__label">Lista</span>
                <select className="field__input" value={listaId} onChange={(evento) => setListaId(evento.target.value)}>
                  <option value="">Sem lista</option>
                  {contexto.listas.filter(({ arquivada, id }) => !arquivada || id === item.listaId).map((lista) => <option key={lista.id} value={lista.id}>{lista.nome}</option>)}
                </select>
              </label>
              <button type="submit" className="button button--primary"><span>Salvar</span></button>
            </form>
          )}
          {tela === 'excluir' && (
            <div className="lembrete-menu__escolha">
              <p><strong>{item.repeticao ? 'Excluir a série inteira?' : 'Excluir este lembrete?'}</strong></p>
              <button type="button" className="button button--danger" onClick={() => agir(() => acoes.excluir(item))}><Trash2 aria-hidden="true" /><span>Excluir</span></button>
              <button type="button" className="button button--secondary" onClick={() => setTela('principal')}><span>Cancelar</span></button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
