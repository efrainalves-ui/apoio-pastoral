import { CalendarClock, Check, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { AgendaService } from '../agenda/service'
import type { AgendaEventEntity } from '../agenda/types'
import { useAuthVault } from '../auth/AuthVaultContext'
import { DistrictService } from '../district/service'
import type { ChurchEntity } from '../district/types'
import { OUTRA_IGREJA, findExistingPreaching, formatPreachingDate, listPreachings } from '../sermons/preachings'
import type { SermonEntity } from '../sermons/types'
import { localDateKey } from '../shared/dates'
import { Button } from './ui/Button'
import { Field } from './ui/Field'

const agenda = new AgendaService()
const district = new DistrictService()

const DURACAO_MINUTOS = 90

/**
 * Painel pequeno para registrar onde um sermão foi pregado e ver onde já foi.
 * Fica sobre a tela em vez de abrir uma página: é uma anotação rápida, não um
 * cadastro.
 */
export function PreachingPanel({ sermon, onClose }: { sermon: SermonEntity; onClose: () => void }) {
  const { account, masterKey } = useAuthVault()
  const [events, setEvents] = useState<AgendaEventEntity[]>([])
  const [churches, setChurches] = useState<ChurchEntity[]>([])
  const [churchId, setChurchId] = useState('')
  const [outroLugar, setOutroLugar] = useState('')
  const [date, setDate] = useState(() => localDateKey())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    if (!account || !masterKey) return
    const root = await district.getDistrict(account.id, masterKey)
    const [nextEvents, nextChurches] = await Promise.all([
      agenda.listEvents(account.id, masterKey),
      root ? district.listChurches(account.id, masterKey, root.id) : [],
    ])
    setEvents(nextEvents)
    setChurches(nextChurches)
  }, [account, masterKey])
  useEffect(() => { void load() }, [load])

  useEffect(() => {
    const fechar = (evento: KeyboardEvent) => { if (evento.key === 'Escape') onClose() }
    window.addEventListener('keydown', fechar)
    return () => window.removeEventListener('keydown', fechar)
  }, [onClose])

  const preachings = listPreachings(events, churches, sermon.id)
  const foraDoDistrito = churchId === OUTRA_IGREJA
  const lugar = foraDoDistrito ? outroLugar.trim() : churches.find(({ id }) => id === churchId)?.name ?? ''

  async function registrar() {
    if (!account || !masterKey || !date || (!churchId || (foraDoDistrito && !lugar))) return
    setBusy(true); setError(''); setNotice('')
    try {
      const alvoIgreja = foraDoDistrito ? null : churchId
      const inicio = new Date(`${date}T09:00:00`)
      const fim = new Date(inicio.getTime() + DURACAO_MINUTOS * 60_000)
      const dados = {
        title: `Pregação · ${lugar}`,
        category: 'preaching' as const,
        churchId: alvoIgreja,
        // "Outra" guarda só o nome informado; nenhuma igreja nova entra no distrito.
        location: foraDoDistrito ? lugar : '',
        address: '', visitTarget: 'none' as const,
        sermonId: sermon.id,
        sermonSnapshot: { id: sermon.id, title: sermon.title, theme: sermon.theme, mainText: sermon.mainText },
        startAt: inicio.toISOString(), endAt: fim.toISOString(), allDay: false,
        reminderMinutes: 60, notes: '', includeInItinerary: true, mondayException: false,
      }

      const existente = findExistingPreaching(events, sermon.id, alvoIgreja, lugar, date)
      if (existente) {
        await agenda.updateEvent(account.id, masterKey, existente.id, dados)
        setNotice('Esta pregação já estava registrada; a informação foi atualizada.')
      } else {
        await agenda.createEvent(account.id, masterKey, dados)
        setNotice('Pregação registrada.')
      }
      setOutroLugar('')
      await load()
    } catch (motivo) {
      setError(motivo instanceof Error ? motivo.message : 'Não foi possível registrar a pregação.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="panel-backdrop" onClick={onClose}>
      <div className="panel" role="dialog" aria-modal="true" aria-label={`Onde preguei ${sermon.title}`} onClick={(evento) => evento.stopPropagation()}>
        <header className="panel__head">
          <div><p className="eyebrow">Onde pregou</p><h2>{sermon.title}</h2></div>
          <button type="button" className="icon-button" aria-label="Fechar" onClick={onClose}><X /></button>
        </header>

        <div className="panel__body">
          <div className="form-grid">
            <label className="field"><span className="field__label">Igreja</span>
              <select className="field__input" value={churchId} onChange={(evento) => setChurchId(evento.target.value)}>
                <option value="">Selecione</option>
                {churches.map((church) => <option key={church.id} value={church.id}>{church.name}</option>)}
                <option value={OUTRA_IGREJA}>Outra</option>
              </select>
            </label>
            {foraDoDistrito && <Field label="Nome do lugar" name="preaching-place" value={outroLugar} onChange={(evento) => setOutroLugar(evento.target.value)} hint="Fica só nesta pregação; não entra na lista de igrejas." />}
            <Field label="Data" name="preaching-date" type="date" value={date} onChange={(evento) => setDate(evento.target.value)} />
          </div>
          {error && <div className="alert alert--error" role="alert">{error}</div>}
          {notice && <div className="alert alert--success" role="status">{notice}</div>}
          <Button onClick={() => void registrar()} disabled={busy || !churchId || (foraDoDistrito && !lugar) || !date}>{busy ? 'Registrando…' : 'Registrar pregação'}</Button>

          <h3 className="panel__section">Onde já foi pregado</h3>
          {preachings.length === 0
            ? <p className="field__hint">Ainda não há pregação registrada para este sermão.</p>
            : <ul className="preaching-list">{preachings.map((item) => (
              <li key={item.eventId}>
                <span className="preaching-list__icon">{item.scheduled ? <CalendarClock /> : <Check />}</span>
                <span><strong>{item.place || 'Lugar não informado'}</strong><small>{formatPreachingDate(item.date)}</small></span>
                <span className={`entity-badge${item.scheduled ? ' entity-badge--soft' : ''}`}>{item.scheduled ? 'Programada' : 'Registrada'}</span>
              </li>
            ))}</ul>}
        </div>
      </div>
    </div>
  )
}
