import { useReloadOnSync } from '../sync/useReloadOnSync'
/* eslint-disable @typescript-eslint/no-misused-promises */
import { ArrowLeft, Church, MessageCircle, Pencil, Plus, Trash2, UserRound } from 'lucide-react'
import { type FormEvent, useCallback, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuthVault } from '../auth/AuthVaultContext'
import { localDateKey } from '../shared/dates'
import { CareService } from '../care/service'
import { anonymousPrayers, normalizePrayerSearch, peopleForPrayerChurch, prayerChurchGroups, prayerCounters, prayerPeopleGroups, unregisteredPrayerGroups } from '../care/prayer'
import type { PrayerRequestEntity, PrayerRequestInput, PrayerSubjectKind } from '../care/types'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Field } from '../components/ui/Field'
import { DistrictService } from '../district/service'
import type { ChurchEntity } from '../district/types'
import { PeopleService } from '../people/service'
import type { PersonEntity } from '../people/types'

const care = new CareService(); const districts = new DistrictService(); const peopleService = new PeopleService()
const today = localDateKey
const emptyInput = (): PrayerRequestInput => ({ churchId: '', kind: 'member', personId: null, personName: '', subject: '', description: '', requestedAt: today(), privateNotes: '' })
const STATUS_LABELS: Record<PrayerRequestEntity['status'], string> = { active: 'Em oração', answered: 'Respondido', closed: 'Encerrado', needs_follow_up: 'Em oração', archived: 'Encerrado' }
const dataCurta = (valor: string) => new Intl.DateTimeFormat('pt-BR').format(new Date(`${valor.slice(0, 10)}T12:00:00`))

/** Onde o pastor está dentro do acompanhamento. */
type View =
  | { level: 'inicio' }
  | { level: 'igreja'; churchId: string }
  | { level: 'pessoa'; churchId: string; personId: string }
  | { level: 'naoCadastrados' }
  | { level: 'naoCadastrado'; key: string }
  | { level: 'semIdentificacao' }

export function PrayerRequestsPage({ embedded = false }: { embedded?: boolean } = {}) {
  const { account, masterKey } = useAuthVault()
  const [prayers, setPrayers] = useState<PrayerRequestEntity[]>([])
  const [churches, setChurches] = useState<ChurchEntity[]>([])
  const [people, setPeople] = useState<PersonEntity[]>([])
  const [draft, setDraft] = useState<PrayerRequestInput | null>(null)
  const [editingId, setEditingId] = useState('')
  const [view, setView] = useState<View>({ level: 'inicio' })
  const [openId, setOpenId] = useState('')
  const [update, setUpdate] = useState('')
  const [notice, setNotice] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!account || !masterKey) return
    const district = await districts.getDistrict(account.id, masterKey)
    const [nextPrayers, nextPeople, nextChurches] = await Promise.all([
      care.listPrayerRequests(account.id, masterKey),
      peopleService.listPeople(account.id, masterKey),
      district ? districts.listChurches(account.id, masterKey, district.id) : [],
    ])
    setPrayers(nextPrayers); setPeople(nextPeople); setChurches(nextChurches)
  }, [account, masterKey])
  useReloadOnSync(load)

  const selectablePeople = useMemo(() => peopleForPrayerChurch(people, draft?.churchId ?? ''), [draft?.churchId, people])
  const churchName = (churchId: string) => churches.find(({ id }) => id === churchId)?.name ?? 'Igreja não encontrada'
  const personName = (prayer: PrayerRequestEntity) => prayer.subjectType === 'anonymous'
    ? 'Pedido sem identificação'
    : prayer.subjectType === 'unregistered'
      ? prayer.subjectName || 'Pessoa não cadastrada'
      : people.find(({ id }) => id === prayer.subjectId)?.name ?? 'Pessoa não encontrada'

  function novoPedido() { setEditingId(''); setOpenId(''); setDraft(emptyInput()) }
  function editar(prayer: PrayerRequestEntity) {
    setEditingId(prayer.id)
    setDraft({
      churchId: prayer.churchId,
      kind: prayer.subjectType === 'anonymous' ? 'anonymous' : prayer.subjectType === 'unregistered' ? 'unregistered' : 'member',
      personId: prayer.subjectType === 'person' ? prayer.subjectId : null,
      personName: prayer.subjectName ?? '',
      subject: prayer.text, description: prayer.description, requestedAt: prayer.requestedAt.slice(0, 10), privateNotes: prayer.privateNotes,
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    if (!account || !masterKey || !draft) return
    setBusy(true); setError('')
    try {
      await care.savePrayerRequest(account.id, masterKey, draft, editingId || undefined)
      setDraft(null); setEditingId(''); setNotice(editingId ? 'Pedido atualizado.' : 'Pedido registrado.')
      await load()
    } catch (motivo) { setError(motivo instanceof Error ? motivo.message : 'Não foi possível salvar o pedido.') } finally { setBusy(false) }
  }

  async function mudarSituacao(prayer: PrayerRequestEntity, status: 'active' | 'answered' | 'closed') {
    if (!account || !masterKey) return
    if (status === 'closed' && !window.confirm('Deseja encerrar este pedido de oração?')) return
    try {
      await care.updatePrayer(account.id, masterKey, prayer, status, prayer.testimony)
      setNotice(`Pedido marcado como ${STATUS_LABELS[status].toLocaleLowerCase('pt-BR')}.`)
      await load()
    } catch (motivo) { setError(motivo instanceof Error ? motivo.message : 'Não foi possível atualizar o pedido.') }
  }

  async function registrarAtualizacao(prayer: PrayerRequestEntity) {
    if (!account || !masterKey) return
    try {
      await care.addPrayerUpdate(account.id, masterKey, prayer, update)
      setUpdate(''); setNotice('Atualização registrada.')
      await load()
    } catch (motivo) { setError(motivo instanceof Error ? motivo.message : 'Não foi possível registrar a atualização.') }
  }

  async function excluir(prayer: PrayerRequestEntity) {
    if (!account || !masterKey || !window.confirm('Deseja excluir este pedido de oração?')) return
    try {
      await care.deletePrayerRequest(account.id, masterKey, prayer.id)
      setOpenId(''); setNotice('Pedido excluído.')
      await load()
    } catch (motivo) { setError(motivo instanceof Error ? motivo.message : 'Não foi possível excluir o pedido.') }
  }

  const contadores = prayerCounters(prayers)
  const igrejas = prayerChurchGroups(prayers, churches)
  const naoCadastrados = unregisteredPrayerGroups(prayers)
  const semIdentificacao = anonymousPrayers(prayers)
  const aberto = prayers.find(({ id }) => id === openId) ?? null

  function pedidosDaVisao(): PrayerRequestEntity[] {
    if (view.level === 'pessoa') return prayers.filter((prayer) => prayer.subjectType === 'person' && prayer.churchId === view.churchId && prayer.subjectId === view.personId)
    if (view.level === 'naoCadastrado') return prayers.filter((prayer) => prayer.subjectType === 'unregistered' && normalizePrayerSearch(prayer.subjectName ?? '') === view.key)
    if (view.level === 'semIdentificacao') return semIdentificacao
    return []
  }

  const formulario = draft && <Card title={editingId ? 'Editar pedido' : 'Novo pedido'}><form onSubmit={save}>
    <div className="form-grid">
      <label className="field" htmlFor="prayer-church"><span className="field__label">Igreja</span>
        <select id="prayer-church" className="field__input" value={draft.churchId} onChange={(event) => setDraft({ ...draft, churchId: event.target.value, personId: null })} required>
          <option value="">Selecione a igreja</option>
          {churches.map((church) => <option value={church.id} key={church.id}>{church.name}</option>)}
        </select>
      </label>
      <Field label="Data do pedido" name="prayer-date" type="date" value={draft.requestedAt} onChange={(event) => setDraft({ ...draft, requestedAt: event.target.value })} required />
    </div>
    <label className="field" htmlFor="prayer-kind"><span className="field__label">Quem pediu</span>
      <select id="prayer-kind" className="field__input" value={draft.kind} onChange={(event) => setDraft({ ...draft, kind: event.target.value as PrayerSubjectKind, personId: null, personName: '' })}>
        <option value="member">Membro da igreja</option>
        <option value="unregistered">Pessoa não cadastrada</option>
        <option value="anonymous">Sem identificação</option>
      </select>
    </label>
    {draft.kind === 'member' && <label className="field" htmlFor="prayer-member"><span className="field__label">Membro</span>
      <select id="prayer-member" className="field__input" value={draft.personId ?? ''} onChange={(event) => setDraft({ ...draft, personId: event.target.value || null })} disabled={!draft.churchId} required>
        <option value="">Selecione uma pessoa</option>
        {selectablePeople.map((person) => <option value={person.id} key={person.id}>{person.name}</option>)}
      </select>
    </label>}
    {draft.kind === 'unregistered' && <Field label="Nome da pessoa" name="prayer-person-name" value={draft.personName} onChange={(event) => setDraft({ ...draft, personName: event.target.value })} maxLength={120} required />}
    <Field label="Assunto ou motivo" name="prayer-subject" value={draft.subject} onChange={(event) => setDraft({ ...draft, subject: event.target.value })} required maxLength={180} />
    <label className="field" htmlFor="prayer-description"><span className="field__label">Descrição curta (opcional)</span><textarea id="prayer-description" className="field__input" rows={3} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} maxLength={1000} /></label>
    <label className="field" htmlFor="prayer-private"><span className="field__label">Observação privada (opcional)</span><textarea id="prayer-private" className="field__input" rows={3} value={draft.privateNotes} onChange={(event) => setDraft({ ...draft, privateNotes: event.target.value })} maxLength={1000} /></label>
    <div className="form-actions"><Button type="submit" disabled={busy}>{busy ? 'Salvando…' : 'Salvar pedido'}</Button><Button type="button" variant="secondary" onClick={() => { setDraft(null); setEditingId('') }}>Cancelar</Button></div>
  </form></Card>

  // Dentro de Visitação o título já é da aba; aqui fica só o botão de criar.
  const cabecalho = embedded
    ? <div className="page-actions"><Button icon={<Plus />} onClick={novoPedido}>Novo pedido</Button></div>
    : <header className="page-hero"><div><p className="eyebrow">Cuidado e intercessão</p><h1>Pedidos de Oração</h1></div><Button icon={<Plus />} onClick={novoPedido}>Novo pedido</Button></header>

  // Enquanto não existe nenhum pedido, a tela mostra só o caminho para o primeiro.
  if (!prayers.length && !draft) return <div className="page-stack prayer-page">
    {cabecalho}
    {notice && <div className="alert alert--success" role="status">{notice}</div>}
    {error && <div className="alert alert--error" role="alert">{error}</div>}
    <p className="muted">Cadastre seu primeiro pedido de oração.</p>
  </div>

  return <div className="page-stack prayer-page">
    {cabecalho}
    {notice && <div className="alert alert--success" role="status">{notice}</div>}
    {error && <div className="alert alert--error" role="alert">{error}</div>}
    {formulario}

    {prayers.length > 0 && <>
      <section className="dashboard-metrics" aria-label="Resumo dos pedidos">
        <div><small>Em oração</small><strong>{contadores.active}</strong></div>
        <div><small>Respondidos</small><strong>{contadores.answered}</strong></div>
        <div><small>Encerrados</small><strong>{contadores.closed}</strong></div>
      </section>

      {aberto ? <Card title="Pedido">
        <button type="button" className="text-link back-link" onClick={() => setOpenId('')}><ArrowLeft />Voltar</button>
        <div className="prayer-detail">
          <h3>{aberto.text}</h3>
          <small>{personName(aberto)} · {churchName(aberto.churchId)} · {dataCurta(aberto.requestedAt)} · {STATUS_LABELS[aberto.status]}</small>
          {aberto.description && <p>{aberto.description}</p>}
          {aberto.privateNotes && <p className="prayer-private"><strong>Observação privada:</strong> {aberto.privateNotes}</p>}
          {aberto.subjectType === 'person' && aberto.subjectId && <Link className="text-link" to={`/app/pessoas/${aberto.subjectId}`}>Abrir pessoa</Link>}
        </div>
        <div className="form-grid prayer-update-form">
          <Field label="Nova atualização" name="prayer-update" value={update} onChange={(event) => setUpdate(event.target.value)} maxLength={500} />
          <Button variant="secondary" icon={<MessageCircle />} onClick={() => registrarAtualizacao(aberto)} disabled={!update.trim()}>Registrar atualização</Button>
        </div>
        {aberto.updates.length > 0 && <ol className="prayer-history">{[...aberto.updates].reverse().map((item) => <li key={item.id}><time>{new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(item.at))}</time><span>{item.text}</span></li>)}</ol>}
        <div className="form-actions">
          <label className="field compact-select" htmlFor="prayer-status"><span className="field__label">Situação</span>
            <select id="prayer-status" className="field__input" value={aberto.status === 'needs_follow_up' ? 'active' : aberto.status === 'archived' ? 'closed' : aberto.status} onChange={(event) => mudarSituacao(aberto, event.target.value as 'active' | 'answered')}>
              <option value="active">Em oração</option>
              <option value="answered">Respondido</option>
            </select>
          </label>
          <Button variant="quiet" icon={<Pencil />} onClick={() => editar(aberto)}>Editar</Button>
          <Button variant="secondary" onClick={() => mudarSituacao(aberto, 'closed')}>Encerrar</Button>
          <Button variant="danger" icon={<Trash2 />} onClick={() => excluir(aberto)} aria-label={`Excluir pedido ${aberto.text}`} />
        </div>
      </Card> : view.level === 'inicio' ? <Card title="Acompanhamento">
        <div className="entity-list">
          {igrejas.map((igreja) => <button type="button" className="entity-row entity-row--link" key={igreja.id} onClick={() => setView({ level: 'igreja', churchId: igreja.id })}>
            <Church /><span><strong>{igreja.name}</strong></span><span>{igreja.total} pedido(s)</span>
          </button>)}
          {naoCadastrados.length > 0 && <button type="button" className="entity-row entity-row--link" onClick={() => setView({ level: 'naoCadastrados' })}>
            <UserRound /><span><strong>Pessoas não cadastradas</strong></span><span>{naoCadastrados.reduce((soma, item) => soma + item.total, 0)} pedido(s)</span>
          </button>}
          {semIdentificacao.length > 0 && <button type="button" className="entity-row entity-row--link" onClick={() => setView({ level: 'semIdentificacao' })}>
            <UserRound /><span><strong>Pedidos sem identificação</strong></span><span>{semIdentificacao.length} pedido(s)</span>
          </button>}
        </div>
      </Card> : <Card title={view.level === 'igreja' ? churchName(view.churchId) : view.level === 'naoCadastrados' ? 'Pessoas não cadastradas' : view.level === 'semIdentificacao' ? 'Pedidos sem identificação' : 'Pedidos'}>
        <button type="button" className="text-link back-link" onClick={() => setView(view.level === 'pessoa' ? { level: 'igreja', churchId: view.churchId } : view.level === 'naoCadastrado' ? { level: 'naoCadastrados' } : { level: 'inicio' })}><ArrowLeft />Voltar</button>
        <div className="entity-list">
          {view.level === 'igreja' && prayerPeopleGroups(prayers, view.churchId, people).map((pessoa) => <button type="button" className="entity-row entity-row--link" key={pessoa.id} onClick={() => setView({ level: 'pessoa', churchId: view.churchId, personId: pessoa.id })}>
            <UserRound /><span><strong>{pessoa.name}</strong></span><span>{pessoa.total} pedido(s)</span>
          </button>)}
          {view.level === 'naoCadastrados' && naoCadastrados.map((pessoa) => <button type="button" className="entity-row entity-row--link" key={pessoa.id} onClick={() => setView({ level: 'naoCadastrado', key: pessoa.id })}>
            <UserRound /><span><strong>{pessoa.name}</strong></span><span>{pessoa.total} pedido(s)</span>
          </button>)}
          {pedidosDaVisao().map((prayer) => <button type="button" className="entity-row entity-row--link" key={prayer.id} onClick={() => { setUpdate(''); setOpenId(prayer.id) }}>
            <MessageCircle /><span><strong>{prayer.text}</strong><small>{dataCurta(prayer.requestedAt)} · {STATUS_LABELS[prayer.status]}</small></span><span>Abrir</span>
          </button>)}
        </div>
      </Card>}
    </>}
  </div>
}
