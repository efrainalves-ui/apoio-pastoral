import { X } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { AgendaEventEntity } from '../agenda/types'
import { useAuthVault } from '../auth/AuthVaultContext'
import type { ChurchEntity } from '../district/types'
import {
  alvosDaEscolha, ESCOLHAS_DO_JA_PREGADO, igrejasAtivas, jaConsta, nomeDoAlvo, planejarJaPregado,
  type EscolhaDoJaPregado, type PregacaoAnteriorEntity,
} from '../sermons/jaPregado'
import { JaPregadoService } from '../sermons/jaPregadoService'
import type { SermonEntity } from '../sermons/types'
import { Escolha } from './agenda/CamposDaAgenda'
import { Button } from './ui/Button'
import { Field } from './ui/Field'

const servico = new JaPregadoService()

interface JaPregadoPanelProps {
  sermon: SermonEntity
  churches: ChurchEntity[]
  events: AgendaEventEntity[]
  anteriores: PregacaoAnteriorEntity[]
  onClose: () => void
  onRegistrado: () => Promise<void>
}

/** Registro de uma pregação já feita, sem compromisso na Agenda e com data opcional. */
export function JaPregadoPanel({ sermon, churches, events, anteriores, onClose, onRegistrado }: JaPregadoPanelProps) {
  const { account, masterKey } = useAuthVault()
  const [escolha, setEscolha] = useState<EscolhaDoJaPregado | null>(null)
  const [igrejaId, setIgrejaId] = useState('')
  const [selecionadas, setSelecionadas] = useState<string[]>([])
  const [outroNome, setOutroNome] = useState('')
  const [data, setData] = useState('')
  const [semData, setSemData] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState<{ registradas: string[]; jaConstavam: string[] } | null>(null)

  useEffect(() => {
    const fechar = (evento: KeyboardEvent) => { if (evento.key === 'Escape') onClose() }
    window.addEventListener('keydown', fechar)
    return () => window.removeEventListener('keydown', fechar)
  }, [onClose])

  const ativas = igrejasAtivas(churches)
  const alvos = escolha ? alvosDaEscolha(escolha, churches, escolha === 'uma' ? (igrejaId ? [igrejaId] : []) : selecionadas, outroNome) : []
  const plano = planejarJaPregado(sermon.id, alvos, events, anteriores)
  const consta = (churchId: string) => jaConsta({ churchId, lugar: '' }, sermon.id, events, anteriores)
  const podeGravar = !busy && alvos.length > 0 && (semData || Boolean(data))

  function escolher(valor: EscolhaDoJaPregado) {
    setEscolha(valor); setIgrejaId(''); setSelecionadas([]); setOutroNome(''); setAviso(null); setError('')
  }

  function alternar(churchId: string) {
    setAviso(null)
    setSelecionadas((atual) => atual.includes(churchId) ? atual.filter((id) => id !== churchId) : [...atual, churchId])
  }

  async function registrar() {
    if (!account || !masterKey || !podeGravar) return
    setBusy(true); setError(''); setAviso(null)
    try {
      const resultado = await servico.registrar(account.id, masterKey, sermon.id, alvos, semData ? '' : data, events)
      setAviso({
        registradas: resultado.registrar.map((alvo) => nomeDoAlvo(alvo, churches)),
        jaConstavam: resultado.jaConstam.map((alvo) => nomeDoAlvo(alvo, churches)),
      })
      setIgrejaId(''); setSelecionadas([]); setOutroNome('')
      await onRegistrado()
    } catch (motivo) {
      setError(motivo instanceof Error ? motivo.message : 'Não foi possível registrar.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="panel-backdrop" onClick={onClose}>
      <div className="panel" role="dialog" aria-modal="true" aria-label={`Marcar ${sermon.title} como já pregado`} onClick={(evento) => evento.stopPropagation()}>
        <header className="panel__head">
          <div><p className="eyebrow">Marcar como já pregado</p><h2>{sermon.title}</h2></div>
          <button type="button" className="icon-button" aria-label="Fechar" onClick={onClose}><X /></button>
        </header>

        <div className="panel__body">
          <Escolha rotulo="Onde foi pregado" nome="ja-pregado-onde" opcoes={ESCOLHAS_DO_JA_PREGADO} valor={escolha} onChange={escolher} />

          {escolha === 'uma' && <label className="field"><span className="field__label">Igreja</span>
            <select className="field__input" value={igrejaId} onChange={(evento) => { setIgrejaId(evento.target.value); setAviso(null) }}>
              <option value="">Selecione</option>
              {ativas.map((church) => <option key={church.id} value={church.id}>{church.name}{consta(church.id) ? ' · já consta' : ''}</option>)}
            </select>
          </label>}

          {escolha === 'varias' && <fieldset className="ja-pregado-igrejas">
            <legend>Igrejas</legend>
            {ativas.map((church) => <label key={church.id}>
              <input type="checkbox" checked={selecionadas.includes(church.id)} onChange={() => alternar(church.id)} />
              <span>{church.name}</span>
              {consta(church.id) && <small>Já consta</small>}
            </label>)}
          </fieldset>}

          {escolha === 'todas' && <dl className="ja-pregado-resumo">
            <div><dt>A registrar</dt><dd>{plano.registrar.map((alvo) => nomeDoAlvo(alvo, churches)).join(', ') || '—'}</dd></div>
            {plano.jaConstam.length > 0 && <div><dt>Já constam no histórico</dt><dd>{plano.jaConstam.map((alvo) => nomeDoAlvo(alvo, churches)).join(', ')}</dd></div>}
          </dl>}

          {escolha === 'outra' && <Field label="Nome da igreja" name="ja-pregado-outra" value={outroNome} maxLength={160} onChange={(evento) => { setOutroNome(evento.target.value); setAviso(null) }} />}

          <div className="ja-pregado-data">
            <Field label="Data" name="ja-pregado-data" type="date" value={semData ? '' : data} disabled={semData} onChange={(evento) => setData(evento.target.value)} />
            <label className="ja-pregado-check">
              <input type="checkbox" checked={semData} onChange={(evento) => { setSemData(evento.target.checked); if (evento.target.checked) setData('') }} />
              <span>Não lembro a data</span>
            </label>
          </div>

          {error && <div className="alert alert--error" role="alert">{error}</div>}
          {aviso && <div className="alert alert--success ja-pregado-aviso" role="status">
            {aviso.registradas.length > 0 && <p>Registrado em: {aviso.registradas.join(', ')}.</p>}
            {aviso.jaConstavam.length > 0 && <p>Já constavam no histórico: {aviso.jaConstavam.join(', ')}.</p>}
          </div>}

          <Button onClick={() => void registrar()} disabled={!podeGravar}>{busy ? 'Registrando…' : 'Marcar como já pregado'}</Button>
        </div>
      </div>
    </div>
  )
}
