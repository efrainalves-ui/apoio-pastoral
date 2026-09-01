import { ArrowLeft, BookOpenCheck, Copy, Edit3, MapPin, Plus } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AgendaService } from '../agenda/service'
import type { AgendaEventEntity } from '../agenda/types'
import { useAuthVault } from '../auth/AuthVaultContext'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Field } from '../components/ui/Field'
import { DistrictService } from '../district/service'
import type { ChurchEntity } from '../district/types'
import { SermonService } from '../sermons/service'
import type { SermonEntity } from '../sermons/types'
const service = new SermonService(); const agenda = new AgendaService(); const district = new DistrictService()
export function SermonDetailPage() { const { account, masterKey } = useAuthVault(); const { sermonId = '' } = useParams(); const [sermon, setSermon] = useState<SermonEntity | null>(null); const [events, setEvents] = useState<AgendaEventEntity[]>([]); const [churches, setChurches] = useState<ChurchEntity[]>([]); const [referenceTime] = useState(() => Date.now()); const [preachChurchId, setPreachChurchId] = useState(''); const [preachDate, setPreachDate] = useState(() => new Date().toISOString().slice(0, 10)); const [preachError, setPreachError] = useState(''); const load = useCallback(async () => { if (!account || !masterKey) return; const root = await district.getDistrict(account.id, masterKey); const [nextSermon, nextEvents, nextChurches] = await Promise.all([service.get(account.id, masterKey, sermonId), agenda.listEvents(account.id, masterKey), root ? district.listChurches(account.id, masterKey, root.id) : []]); setSermon(nextSermon); setEvents(nextEvents.filter((event) => event.sermonId === sermonId || event.sermonSnapshot?.id === sermonId)); setChurches(nextChurches) }, [account, masterKey, sermonId]); useEffect(() => { void load() }, [load]);
  async function registrarPregacao() {
    if (!account || !masterKey || !sermon) return
    setPreachError('')
    try {
      const inicio = new Date(`${preachDate}T09:00:00`)
      const fim = new Date(inicio.getTime() + 90 * 60_000)
      await agenda.createEvent(account.id, masterKey, {
        title: `Pregação · ${sermon.title}`,
        category: 'preaching',
        churchId: preachChurchId || null,
        location: '', address: '', visitTarget: 'none',
        sermonId: sermon.id,
        sermonSnapshot: { id: sermon.id, title: sermon.title, theme: sermon.theme, mainText: sermon.mainText },
        startAt: inicio.toISOString(), endAt: fim.toISOString(), allDay: false,
        reminderMinutes: 60, notes: '', includeInItinerary: true, mondayException: false,
      })
      await load()
    } catch (reason) {
      setPreachError(reason instanceof Error ? reason.message : 'Não foi possível registrar a pregação.')
    }
  } if (!sermon) return <div className="page-stack"><p>Carregando sermão…</p></div>; const churchName = (id: string | null) => churches.find((church) => church.id === id)?.name ?? 'Sem igreja'; const recent = events.filter((event) => event.churchId && new Date(event.startAt).getTime() > referenceTime - 90 * 86_400_000); return <div className="page-stack"><Link className="text-link back-link" to="/app/sermoes"><ArrowLeft />Voltar</Link><header className="page-hero"><div><p className="eyebrow">{sermon.mainText}</p><h1>{sermon.title}</h1><p>{sermon.theme}</p></div><div className="page-actions"><Link className="button button--secondary" to={`/app/sermoes/${sermon.id}/pregar`}><BookOpenCheck />Pregar</Link><Link className="button button--secondary" to={`/app/sermoes/novo?duplicar=${sermon.id}`}><Copy />Duplicar</Link><Link className="button" to={`/app/sermoes/${sermon.id}/editar`}><Edit3 />Editar</Link></div></header>{recent.length > 0 && <div className="alert alert--success">Este sermão aparece em pregação recente em {recent.length} compromisso(s). Verifique o histórico abaixo.</div>}<Card title="Esboço"><dl className="detail-list"><div><dt>Textos complementares</dt><dd>{sermon.complementaryTexts || '—'}</dd></div><div><dt>Objetivo</dt><dd>{sermon.objective || '—'}</dd></div></dl>{[['Introdução', sermon.introduction], ['Conteúdo', sermon.content], ['Conclusão', sermon.conclusion], ['Apelo', sermon.appeal], ['Observações', sermon.notes]].map(([label, value]) => <section key={label}><h3>{label}</h3><p className="preserved-text">{value || '—'}</p></section>)}</Card><Card title="Registrar pregação" eyebrow="Onde você pregou"><p className="card-copy">Registre a igreja e a data; a pregação entra na Agenda e passa a aparecer no histórico daqui e no da igreja.</p><div className="form-grid"><label className="field"><span className="field__label">Igreja</span><select className="field__input" value={preachChurchId} onChange={(event) => setPreachChurchId(event.target.value)}><option value="">Selecione</option>{churches.map((church) => <option key={church.id} value={church.id}>{church.name}</option>)}</select></label><Field label="Data" name="preach-date" type="date" value={preachDate} onChange={(event) => setPreachDate(event.target.value)} /></div>{preachError && <div className="alert alert--error" role="alert">{preachError}</div>}<Button onClick={() => void registrarPregacao()} disabled={!preachChurchId || !preachDate} icon={<Plus />}>Registrar pregação</Button></Card><Card title="Histórico de pregações" eyebrow="Retratos preservados">{!events.length ? <div className="empty-state compact-empty"><MapPin /><strong>Ainda não há pregações vinculadas</strong></div> : <div className="entity-list">{events.map((event) => <Link className="entity-row" key={event.id} to={`/app/agenda/${event.id}/editar`}><span><strong>{churchName(event.churchId)}</strong><small>{new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(event.startAt))} · {event.title}</small></span></Link>)}</div>}</Card></div> }
