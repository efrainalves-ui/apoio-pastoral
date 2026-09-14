import { Archive, ArchiveRestore, ChevronLeft, CircleCheck, Pencil, Plus, Trash2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuthVault } from '../auth/AuthVaultContext'
import { FormularioDaLista } from '../components/lembretes/FormularioDaLista'
import { ICONE_DA_AREA, ICONE_DA_LISTA, ICONE_DO_BLOCO } from '../components/lembretes/Icones'
import { LinhaDoLembrete } from '../components/lembretes/LinhaDoLembrete'
import {
  AREAS_DA_CENTRAL, BLOCOS, BLOCO_LABELS, agruparItens, itensDoBloco, SITUACAO_LABELS,
  type AreaDaCentral, type BlocoDaCentral, type GrupoDeItens, type ItemDaCentral,
} from '../lembretes/central'
import { CORES_DE_LISTA } from '../lembretes/types'
import { avisarAlteracaoDeLembretes, servicoDeLembretes, useAcoesDaCentral, useCentral } from '../lembretes/useCentral'
import { dataNoFuso } from '../lembretes/tempo'

export function LembretesListaPage() {
  const { tipo = '', id = '' } = useParams()
  const navigate = useNavigate()
  const { account, masterKey } = useAuthVault()
  const { dados, erro, agora, fuso } = useCentral()
  const acoes = useAcoesDaCentral()
  const [editando, setEditando] = useState(false)
  const [excluindo, setExcluindo] = useState(false)
  const [falha, setFalha] = useState('')

  const itens = dados?.itens ?? []
  const listas = dados?.listas ?? []
  const lista = tipo === 'lista' ? listas.find((atual) => atual.id === id) : undefined
  const bloco = tipo === 'bloco' && (BLOCOS as readonly string[]).includes(id) ? id as BlocoDaCentral : null
  const area = tipo === 'area' && Object.hasOwn(AREAS_DA_CENTRAL, id) ? id as AreaDaCentral : null

  useEffect(() => {
    if (dados && tipo === 'lista' && !lista) void navigate('/app/lembretes', { replace: true })
  }, [dados, tipo, lista, navigate])

  let doFiltro: ItemDaCentral[] = []
  if (bloco) doFiltro = itensDoBloco(itens, bloco, agora, fuso)
  else if (lista) doFiltro = itens.filter((item) => item.listaId === lista.id)
  else if (area) doFiltro = itens.filter((item) => item.area === area)

  const grupos: GrupoDeItens[] = bloco === 'concluidos'
    ? (doFiltro.length ? [{ situacao: 'concluido', rotulo: SITUACAO_LABELS.concluido, itens: doFiltro }] : [])
    : agruparItens(doFiltro, agora, fuso)
  const abertos = grupos.filter(({ situacao }) => situacao !== 'concluido')
  const concluidos = bloco === 'concluidos' ? undefined : grupos.find(({ situacao }) => situacao === 'concluido')
  const totalAberto = doFiltro.filter(({ concluido }) => !concluido).length

  const titulo = bloco ? BLOCO_LABELS[bloco] : lista ? lista.nome : area ? AREAS_DA_CENTRAL[area].rotulo : 'Lembretes'
  const Icone = bloco ? ICONE_DO_BLOCO[bloco] : lista ? ICONE_DA_LISTA[lista.icone] : area ? ICONE_DA_AREA[area] : CircleCheck
  const voltar = `/app/lembretes/${tipo}/${id}`
  const contexto = { agora, fuso, listas, igrejas: dados?.igrejas ?? new Map<string, string>(), acoes, voltar, mostrarLista: !lista }

  const novo = new URLSearchParams({ voltar })
  if (lista) novo.set('lista', lista.id)
  if (bloco === 'hoje') novo.set('data', dataNoFuso(agora, fuso))
  if (bloco === 'sinalizados') novo.set('sinalizado', '1')
  if (bloco === 'urgentes') novo.set('prioridade', 'urgente')

  const arquivar = async () => {
    if (!account || !masterKey || !lista) return
    await servicoDeLembretes.arquivarLista(account.id, masterKey, lista.id, !lista.arquivada)
    avisarAlteracaoDeLembretes()
  }

  const renderGrupo = (grupo: GrupoDeItens) => (
    <section key={grupo.situacao} className="lembretes-grupo" aria-labelledby={`grupo-${grupo.situacao}`}>
      <h2 id={`grupo-${grupo.situacao}`} className={grupo.situacao === 'atrasado' ? 'lembretes-grupo__titulo--atrasado' : ''}>{grupo.rotulo} <span>{grupo.itens.length}</span></h2>
      <ul className="lembretes-linhas">{grupo.itens.map((item) => <LinhaDoLembrete key={item.chave} item={item} contexto={contexto} />)}</ul>
    </section>
  )

  if (!bloco && tipo !== 'lista' && !area) return <div className="page-stack"><div className="empty-state"><strong>Lista não encontrada</strong><Link className="button" to="/app/lembretes">Lembretes</Link></div></div>

  return (
    <div className="page-stack lembretes-page">
      <Link to="/app/lembretes" className="lembretes-voltar"><ChevronLeft aria-hidden="true" />Lembretes</Link>
      <header className={`lembretes-cabecalho${bloco ? ` lembretes-cabecalho--${bloco}` : ''}`}>
        <span className={`lembretes-circulo lembretes-circulo--grande${area ? ' lembretes-circulo--area' : ''}${bloco ? ` lembretes-bloco--${bloco}` : ''}`} style={lista ? { background: CORES_DE_LISTA[lista.cor] } : undefined} aria-hidden="true"><Icone /></span>
        <div>
          <h1>{titulo}</h1>
          <p aria-live="polite">{bloco === 'concluidos' ? `${doFiltro.length} concluídos` : `${totalAberto} em aberto`}</p>
        </div>
        {lista && (
          <span className="lembretes-cabecalho__acoes">
            <button type="button" className="icon-button" aria-label="Editar lista" onClick={() => setEditando(true)}><Pencil aria-hidden="true" /></button>
            <button type="button" className="icon-button" aria-label={lista.arquivada ? 'Desarquivar lista' : 'Arquivar lista'} onClick={() => { void arquivar() }}>{lista.arquivada ? <ArchiveRestore aria-hidden="true" /> : <Archive aria-hidden="true" />}</button>
            <button type="button" className="icon-button" aria-label="Excluir lista" onClick={() => setExcluindo(true)}><Trash2 aria-hidden="true" /></button>
          </span>
        )}
      </header>
      {erro && <div className="alert alert--error" role="alert">{erro}</div>}
      {acoes.aviso && <div className="visually-hidden" role="status">{acoes.aviso}</div>}

      {dados && !abertos.length && !concluidos && bloco !== 'concluidos' && <div className="empty-state"><CircleCheck aria-hidden="true" /><strong>Nada pendente</strong></div>}
      {dados && bloco === 'concluidos' && !grupos.length && <div className="empty-state"><CircleCheck aria-hidden="true" /><strong>Nada concluído</strong></div>}
      {(bloco === 'concluidos' ? grupos : abertos).map(renderGrupo)}
      {concluidos && (
        <details className="lembretes-concluidos">
          <summary>Concluídos ({concluidos.itens.length})</summary>
          <ul className="lembretes-linhas">{concluidos.itens.map((item) => <LinhaDoLembrete key={item.chave} item={item} contexto={contexto} />)}</ul>
        </details>
      )}

      {!area && <Link className="lembretes-fab" to={`/app/lembretes/novo?${novo.toString()}`} aria-label="Novo lembrete"><Plus aria-hidden="true" /></Link>}
      {editando && lista && <FormularioDaLista lista={lista} onFechar={() => setEditando(false)} />}
      {excluindo && lista && (
        <ExcluirLista
          nome={lista.nome}
          tarefas={itens.filter((item) => item.listaId === lista.id && !(item.tipo === 'manual' && item.concluido && item.repeticao)).length}
          outras={listas.filter((atual) => atual.id !== lista.id && !atual.arquivada)}
          falha={falha}
          onFechar={() => { setExcluindo(false); setFalha('') }}
          onConfirmar={async (destino) => {
            if (!account || !masterKey) return
            try {
              await servicoDeLembretes.excluirLista(account.id, masterKey, lista.id, destino)
              avisarAlteracaoDeLembretes()
              void navigate('/app/lembretes', { replace: true })
            } catch (motivo) {
              setFalha(motivo instanceof Error ? motivo.message : 'Não foi possível excluir a lista.')
            }
          }}
        />
      )}
    </div>
  )
}

function ExcluirLista({ nome, tarefas, outras, falha, onFechar, onConfirmar }: {
  nome: string; tarefas: number; outras: ReadonlyArray<{ id: string; nome: string }>; falha: string
  onFechar: () => void; onConfirmar: (destino?: { moverPara: string } | 'excluir_tarefas') => Promise<void>
}) {
  const [escolha, setEscolha] = useState<'mover' | 'excluir'>(outras.length ? 'mover' : 'excluir')
  const [destino, setDestino] = useState(outras[0]?.id ?? '')
  useEffect(() => {
    const aoTeclar = (evento: KeyboardEvent) => { if (evento.key === 'Escape') onFechar() }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [onFechar])

  return (
    <div className="folha" role="dialog" aria-modal="true" aria-label={`Excluir ${nome}`}>
      <div className="folha__fundo" aria-hidden="true" onClick={onFechar} />
      <form className="folha__corpo lembrete-menu__escolha" onSubmit={(evento) => { evento.preventDefault(); void onConfirmar(!tarefas ? undefined : escolha === 'mover' ? { moverPara: destino } : 'excluir_tarefas') }}>
        <div className="folha__topo">
          <span className="folha__espaco" />
          <strong>Excluir {nome}</strong>
          <button type="button" className="icon-button" aria-label="Fechar" onClick={onFechar}><X aria-hidden="true" /></button>
        </div>
        {falha && <div className="alert alert--error" role="alert">{falha}</div>}
        {tarefas > 0 ? (
          <fieldset className="lembretes-escolha">
            <legend>{tarefas === 1 ? '1 tarefa nesta lista' : `${tarefas} tarefas nesta lista`}</legend>
            {outras.length > 0 && (
              <label className="confirmation-check"><input type="radio" name="destino" checked={escolha === 'mover'} onChange={() => setEscolha('mover')} /><span><strong>Mover para outra lista</strong></span></label>
            )}
            {escolha === 'mover' && outras.length > 0 && (
              <label className="field"><span className="field__label">Lista</span>
                <select className="field__input" value={destino} onChange={(evento) => setDestino(evento.target.value)}>
                  {outras.map((outra) => <option key={outra.id} value={outra.id}>{outra.nome}</option>)}
                </select>
              </label>
            )}
            <label className="confirmation-check"><input type="radio" name="destino" checked={escolha === 'excluir'} onChange={() => setEscolha('excluir')} /><span><strong>Excluir os lembretes</strong><small>Tarefas de outras áreas continuam nelas.</small></span></label>
          </fieldset>
        ) : <p>A lista está vazia.</p>}
        <button type="submit" className="button button--danger"><Trash2 aria-hidden="true" /><span>Excluir lista</span></button>
        <button type="button" className="button button--secondary" onClick={onFechar}><span>Cancelar</span></button>
      </form>
    </div>
  )
}
