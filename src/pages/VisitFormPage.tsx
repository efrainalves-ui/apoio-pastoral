import { useReloadOnSync } from '../sync/useReloadOnSync'
import { ArrowLeft, CheckCircle2, LockKeyhole, Plus, X } from 'lucide-react'
import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { AgendaService } from '../agenda/service'
import type { AgendaEventEntity } from '../agenda/types'
import { answerTargetsFor } from '../care/visitAnswerTargets'
import { useAuthVault } from '../auth/AuthVaultContext'
import { CareService } from '../care/service'
import { perguntaVisivel } from '../care/perguntasCondicionais'
import { OFFICIAL_QUESTIONS } from '../care/questionnaire'
import { VISIT_REASONS, VISIT_REASON_LABELS, type VisitAnswer, type VisitCompletionInput, type VisitEntity, type VisitParticipant, type VisitRoundEntity } from '../care/types'
import { QuestionCard } from '../components/QuestionCard'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Field } from '../components/ui/Field'
import { DistrictService } from '../district/service'
import type { ChurchEntity } from '../district/types'
import { MissionaryService } from '../missionary/service'
import type { MissionaryPairEntity } from '../missionary/types'
import { PeopleService } from '../people/service'
import type { IncomeStatus, PersonEntity } from '../people/types'

const care = new CareService(); const peopleService = new PeopleService()
const missionary = new MissionaryService(); const districts = new DistrictService(); const agenda = new AgendaService()
/**
 * A visita pastoral não tem hora de término para o pastor preencher: ele anota
 * quando foi, e o registro guarda a duração padrão. O término continua existindo
 * nos bastidores, então nada precisou ser migrado.
 */
export const VISIT_DURATION_MINUTES = 30

/** Prazo sugerido do lembrete, para o pastor não precisar calcular a data. */
export const FOLLOW_UP_DEFAULT_DAYS = 7

export function followUpDefaultDate(from: Date = new Date()): string {
  const prazo = new Date(from)
  prazo.setDate(prazo.getDate() + FOLLOW_UP_DEFAULT_DAYS)
  prazo.setMinutes(prazo.getMinutes() - prazo.getTimezoneOffset())
  return prazo.toISOString().slice(0, 10)
}

export function visitEndFrom(startAt: string, minutes = VISIT_DURATION_MINUTES): string {
  const inicio = new Date(startAt)
  if (Number.isNaN(inicio.getTime())) return startAt
  const fim = new Date(inicio.getTime() + minutes * 60_000)
  fim.setMinutes(fim.getMinutes() - fim.getTimezoneOffset())
  return fim.toISOString().slice(0, 16)
}

function localDateTime(offsetMinutes = 0): string { const value = new Date(Date.now() + offsetMinutes * 60_000); value.setMinutes(value.getMinutes() - value.getTimezoneOffset()); return value.toISOString().slice(0, 16) }
function reviewDate(): string { const date = new Date(); date.setDate(date.getDate() + 180); return date.toISOString().slice(0, 10) }

export function VisitFormPage() {
  const { account, masterKey } = useAuthVault(); const navigate = useNavigate(); const { visitId } = useParams(); const [searchParams] = useSearchParams(); const agendaVisitId = searchParams.get('agenda'); const [people, setPeople] = useState<PersonEntity[]>([]); const [churches, setChurches] = useState<ChurchEntity[]>([]); const [events, setEvents] = useState<AgendaEventEntity[]>([]); const [rounds, setRounds] = useState<VisitRoundEntity[]>([]); const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]); const [churchId, setChurchId] = useState(''); const [selectionNotice, setSelectionNotice] = useState(''); const [buscaMembro, setBuscaMembro] = useState(''); const [participants, setParticipants] = useState<VisitParticipant[]>([]); const [guestName, setGuestName] = useState(''); const [reason, setReason] = useState<VisitCompletionInput['reason']>('routine'); const [startAt, setStartAt] = useState(localDateTime()); const endAt = visitEndFrom(startAt); const [scheduledEventId, setScheduledEventId] = useState(''); const [roundId, setRoundId] = useState(''); const [mode, setMode] = useState<'full' | 'quick'>('full'); const [notes, setNotes] = useState(''); const [selectedQuestions, setSelectedQuestions] = useState<Set<string>>(new Set()); const [answerValues, setAnswerValues] = useState<Record<string, string>>({}); const [incomeAnswers, setIncomeAnswers] = useState<Record<string, IncomeStatus>>({}); const [prayerText, setPrayerText] = useState(''); const [prayerReviewAt, setPrayerReviewAt] = useState(reviewDate()); const [busy, setBusy] = useState(false); const [error, setError] = useState('')
  // Corrigir é a mesma tela de registrar, com o que já foi respondido no lugar.
  // A tela separada mostrava as respostas como campos de texto soltos, sem as
  // opções e sem as perguntas que ficaram em branco — quem quisesse responder
  // uma que passou não tinha onde.
  const [visitaEmEdicao, setVisitaEmEdicao] = useState<VisitEntity | null>(null)
  // "Participa de uma dupla missionária?" sempre teve uma segunda metade: com
  // quem. Ela ficava por responder, e depois alguém teria de abrir outra tela e
  // cadastrar de memória o que a pessoa acabou de dizer.
  const [pares, setPares] = useState<MissionaryPairEntity[]>([])
  const [duplaDe, setDuplaDe] = useState<Record<string, string>>({})
  const editando = Boolean(visitId)
  const load = useCallback(async () => { if (!account || !masterKey) return; const district = await districts.getDistrict(account.id, masterKey); const [nextPeople, nextChurches, nextEvents, nextRounds] = await Promise.all([peopleService.listPeople(account.id, masterKey), district ? districts.listChurches(account.id, masterKey, district.id) : [], agenda.listEvents(account.id, masterKey), care.listRounds(account.id, masterKey)]); setPares(await missionary.listPairs(account.id, masterKey)); const visits = nextEvents.filter(({ category }) => category === 'visit'); setPeople(nextPeople); setChurches(nextChurches); setEvents(visits); setRounds(nextRounds.filter(({ status }) => status === 'active')); const planned = visits.find(({ id }) => id === agendaVisitId); if (planned) { setScheduledEventId(planned.id); setStartAt(planned.startAt.slice(0, 16)); setChurchId(planned.churchId ?? '') }
    if (!visitId) return
    const visita = (await care.listVisits(account.id, masterKey)).find(({ id }) => id === visitId)
    if (!visita) { setError('Visita não encontrada.'); return }
    const ultima = visita.versions[visita.versions.length - 1]!
    setVisitaEmEdicao(visita)
    setChurchId(visita.churchId); setScheduledEventId(visita.scheduledEventId ?? ''); setMode(visita.mode)
    setReason(ultima.reason); setStartAt(ultima.startAt.slice(0, 16)); setNotes(ultima.notes)
    setSelectedMemberIds(ultima.participants.filter(({ kind, personId }) => kind === 'person' && personId).map(({ personId }) => personId!))
    setParticipants(ultima.participants.map((item) => ({ ...item })))
    const valores: Record<string, string> = {}; const respondidas = new Set<string>()
    for (const resposta of ultima.answers) {
      valores[`${resposta.question.code}:${resposta.subjectId}`] = Array.isArray(resposta.value) ? resposta.value.join(', ') : resposta.value
      respondidas.add(resposta.question.code)
    }
    setAnswerValues(valores); setSelectedQuestions(respondidas)
  }, [account, agendaVisitId, masterKey, visitId])
  useReloadOnSync(load)
  const primaryTargetId = selectedMemberIds[0] ?? ''
  const churchPeople = useMemo(() => people.filter((person) => person.currentChurchId === churchId).sort((left, right) => left.name.localeCompare(right.name, 'pt-BR')), [people, churchId])
  /**
   * Quem a busca encontra, fora quem já foi escolhido.
   *
   * A lista mostrava **todos** os membros da igreja de uma vez. Com trinta
   * pessoas, escolher duas exigia varrer a tela inteira antes de chegar ao
   * formulário — e o nome que se procura já se sabe qual é. Digitar três letras
   * é mais rápido do que ler trinta nomes.
   */
  const membrosEncontrados = useMemo(() => {
    const semAcento = (texto: string) => texto.normalize('NFD').replace(/[\u0300-\u036f]/gu, '').toLowerCase()
    const termo = semAcento(buscaMembro.trim())
    if (!termo) return []
    return churchPeople.filter((person) => !selectedMemberIds.includes(person.id) && semAcento(person.name).includes(termo)).slice(0, 8)
  }, [buscaMembro, churchPeople, selectedMemberIds])
  const membrosEscolhidos = useMemo(() => selectedMemberIds.map((id) => churchPeople.find((person) => person.id === id)).filter((person): person is PersonEntity => Boolean(person)), [churchPeople, selectedMemberIds])
  const availablePeople = useMemo(() => people.filter(({ id }) => selectedMemberIds.includes(id)), [people, selectedMemberIds])
  // Os membros escolhidos são os presentes; convidados entram à parte.
  useEffect(() => { setParticipants((current) => [...availablePeople.map((person) => ({ id: current.find(({ personId }) => personId === person.id)?.id ?? `membro:${person.id}`, kind: 'person' as const, personId: person.id, present: true })), ...current.filter(({ kind }) => kind === 'guest')]) }, [availablePeople])
  const guests = participants.filter(({ kind }) => kind === 'guest')
  function changeChurch(nextChurchId: string) { if (selectedMemberIds.length && nextChurchId !== churchId) setSelectionNotice('Os membros escolhidos foram limpos porque a igreja mudou.'); else setSelectionNotice(''); setChurchId(nextChurchId); setSelectedMemberIds([]); setRoundId('') }
  const presentPeople = participants.filter(({ present, personId }) => present && personId).map(({ personId }) => people.find(({ id }) => id === personId)).filter((person): person is PersonEntity => Boolean(person))
  const incomeCandidates = presentPeople.filter((person) => person.incomeStatus === 'unknown' && (person.fidelity?.category === 'non_tither' || person.fidelity?.category === 'non_systematic_tither'))
    // As perguntas ficam sempre abertas. Escolher membros serve para vincular a
  // resposta na hora de salvar, não para liberar o formulário.
  const nomePorPessoa = useCallback((personId: string) => people.find(({ id }) => id === personId)?.name, [people])
  const questionTargets = useCallback(() => answerTargetsFor(participants, nomePorPessoa), [participants, nomePorPessoa])
  function toggleQuestion(code: string) { setSelectedQuestions((current) => { const next = new Set(current); if (next.has(code)) next.delete(code); else next.add(code); return next }) }
  function addGuest() { if (!guestName.trim()) return; setParticipants((current) => [...current, { id: crypto.randomUUID(), kind: 'guest', guestName: guestName.trim(), present: true }]); setGuestName('') }
  function buildAnswers(): VisitAnswer[] { return OFFICIAL_QUESTIONS.filter((question) => selectedQuestions.has(question.code) && question.code !== 'ORA-01').flatMap((question) => questionTargets().filter((target) => perguntaVisivel(question, (code) => answerValues[`${code}:${target.id}`] ?? '')).map((target) => { const value = answerValues[`${question.code}:${target.id}`] ?? ''; return { id: crypto.randomUUID(), question: { ...question, options: [...question.options] }, subjectId: target.id, value: question.responseType === 'multiple' ? value.split(',').map((item) => item.trim()).filter(Boolean) : value, skipped: !value.trim() } })) }
  /** A dupla dita na visita vira cadastro; a que já existe não vira outra igual. */
  async function guardarDuplas() {
    if (!account || !masterKey || !churchId) return
    for (const [personId, parceiroId] of Object.entries(duplaDe)) {
      if (!parceiroId || personId === parceiroId) continue
      if (pares.some(({ memberIds }) => memberIds.includes(personId) && memberIds.includes(parceiroId))) continue
      await missionary.savePair(account.id, masterKey, churchId, [personId, parceiroId])
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault(); if (!account || !masterKey) return
    if (visitaEmEdicao) {
      setBusy(true); setError('')
      try {
        await care.correctVisit(account.id, masterKey, visitaEmEdicao.id, { participants, answers: mode === 'quick' ? [] : buildAnswers(), reason, startAt, endAt, notes })
        await guardarDuplas()
        await navigate(`/app/visitas/${visitaEmEdicao.id}`)
      } catch (motivo) { setError(motivo instanceof Error ? motivo.message : 'Não foi possível salvar a correção.') } finally { setBusy(false) }
      return
    }
    return submitNovo()
  }

  async function submitNovo() { if (!account || !masterKey) return; setBusy(true); setError(''); try { const input: VisitCompletionInput = { targetType: 'person', targetId: primaryTargetId, churchId, scheduledEventId: scheduledEventId || null, mode, participants, reason, startAt, endAt, notes, answers: mode === 'quick' ? [] : buildAnswers(), prayerText, prayerReviewAt, followUp: null, task: null, incomeAnswers: Object.entries(incomeAnswers).map(([personId, status]) => ({ personId, status })), roundId: roundId || null }; const visit = await care.completeVisit(account.id, masterKey, input); await guardarDuplas(); await navigate(`/app/visitas/${visit.id}`) } catch (reasonValue) { setError(reasonValue instanceof Error ? reasonValue.message : 'Não foi possível finalizar a visita.') } finally { setBusy(false) } }
  return <div className="page-stack"><Link className="text-link back-link" to="/app/visitas"><ArrowLeft />Voltar às visitas</Link><header className="page-hero"><div><h1>{editando ? 'Corrigir visita' : 'Registrar visita pastoral'}</h1></div><LockKeyhole /></header>{error && <div className="alert alert--error" role="alert">{error}</div>}<form onSubmit={(event) => void submit(event)} className="visit-form">
    <Card eyebrow="1 · Contexto" title="Igreja e quem você visitou"><div className="form-grid"><label className="field"><span className="field__label">Igreja</span><select className="field__input" value={churchId} disabled={editando} onChange={(event) => changeChurch(event.target.value)}><option value="">Selecionar…</option>{churches.map((church) => <option key={church.id} value={church.id}>{church.name}</option>)}</select></label><label className="field"><span className="field__label">Motivo</span><select className="field__input" value={reason} onChange={(event) => setReason(event.target.value as VisitCompletionInput['reason'])}>{VISIT_REASONS.map((item) => <option key={item} value={item}>{VISIT_REASON_LABELS[item]}</option>)}</select></label><Field label="Horário da visita" name="visit-start" type="datetime-local" hint={`Duração de ${VISIT_DURATION_MINUTES} minutos, contada a partir daqui.`} value={startAt} onChange={(event) => setStartAt(event.target.value)} /></div>
      <div className="visit-members"><span className="field__label">Membros visitados</span>{!churchId ? <p className="field__hint">Escolha a igreja para ver os membros.</p> : churchPeople.length === 0 ? <p className="field__hint">Esta igreja ainda não tem pessoas cadastradas.</p> : <>
        {membrosEscolhidos.length > 0 && <ul className="visit-members__chosen">{membrosEscolhidos.map((person) => <li key={person.id}><button type="button" className="visit-members__chip" aria-label={`Remover ${person.name}`} onClick={() => setSelectedMemberIds((atual) => atual.filter((id) => id !== person.id))}>{person.name}<X /></button></li>)}</ul>}
        <Field label="Buscar membro" name="visit-member-search" value={buscaMembro} onChange={(event) => setBuscaMembro(event.target.value)} hint={`${churchPeople.length} pessoa(s) nesta igreja. Digite parte do nome para encontrar.`} />
        {buscaMembro.trim() && (membrosEncontrados.length === 0
          ? <p className="field__hint">Ninguém encontrado com esse nome nesta igreja.</p>
          : <ul className="visit-members__results">{membrosEncontrados.map((person) => <li key={person.id}><button type="button" onClick={() => { setSelectedMemberIds((atual) => [...atual, person.id]); setBuscaMembro('') }}>{person.name}<Plus /></button></li>)}</ul>)}
      </>}</div>{selectionNotice && <div className="alert alert--success">{selectionNotice}</div>}
      <div className="segmented"><button type="button" className={mode === 'full' ? 'active' : ''} onClick={() => setMode('full')}>Entrevista escolhida</button><button type="button" className={mode === 'quick' ? 'active' : ''} onClick={() => setMode('quick')}>Registro rápido</button></div></Card>
    <Card eyebrow="2 · Opcional" title="Vínculos e convidado"><div className="form-grid"><label className="field"><span className="field__label">Agendamento vinculado</span><select className="field__input" value={scheduledEventId} onChange={(event) => setScheduledEventId(event.target.value)}><option value="">Visita espontânea</option>{events.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label><label className="field"><span className="field__label">Rodada</span><select className="field__input" value={roundId} onChange={(event) => setRoundId(event.target.value)}><option value="">Fora de rodada</option>{rounds.filter(({ status }) => status === 'active').map((round) => <option key={round.id} value={round.id}>{round.name}</option>)}</select></label></div><div className="inline-form"><Field label="Nome" name="guest-name" value={guestName} onChange={(event) => setGuestName(event.target.value)} /><Button type="button" variant="secondary" onClick={addGuest}>Adicionar</Button></div>{guests.length > 0 && <div className="participant-grid">{guests.map((guest) => <label key={guest.id}><input type="checkbox" checked readOnly /><span>{guest.guestName}<small>Convidado não cadastrado</small></span></label>)}</div>}</Card>
    {mode === 'full' && <Card eyebrow="3 · Perguntas opcionais" title="Perguntas">{questionTargets().length === 0
      ? <p className="field__hint">Escolha antes o cadastro visitado e marque quem estava presente. As perguntas aparecem em seguida.</p>
      : <>
      <div className="question-bank">{OFFICIAL_QUESTIONS.filter(({ code }) => code !== 'ORA-01').map((question) => {
        // Cada presente responde por si: se um disse "Sim" e outro "Não", a
        // pergunta de baixo aparece só para quem disse "Sim".
        const alvos = questionTargets().filter((target) => perguntaVisivel(question, (code) => answerValues[`${code}:${target.id}`] ?? ''))
        if (alvos.length === 0) return null
        return <div key={question.code}><QuestionCard
        question={question}
        targets={alvos}
        registered={selectedQuestions.has(question.code)}
        valueFor={(targetId) => answerValues[`${question.code}:${targetId}`] ?? ''}
        onToggleRegistered={() => toggleQuestion(question.code)}
        onAnswer={(targetId, valor) => {
          setAnswerValues((current) => ({ ...current, [`${question.code}:${targetId}`]: valor }))
          setSelectedQuestions((atual) => {
            const proximo = new Set(atual)
            if (valor.trim()) proximo.add(question.code)
            return proximo
          })
        }}
      />
        {question.code === 'MIS-03' && alvos.filter((target) => (answerValues[`MIS-03:${target.id}`] ?? '') === 'Sim' && churchPeople.some(({ id }) => id === target.id)).map((target) => (
          <label className="field" key={`dupla-${target.id}`}>
            <span className="field__label">Com quem {target.label} faz dupla?</span>
            <select className="field__input" value={duplaDe[target.id] ?? ''} onChange={(event) => setDuplaDe((atual) => ({ ...atual, [target.id]: event.target.value }))}>
              <option value="">Ainda não informado</option>
              {churchPeople.filter(({ id }) => id !== target.id).map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
            </select>
          </label>
        ))}
      </div> })}</div></>}</Card>}
    {incomeCandidates.length > 0 && <Card eyebrow="Pergunta condicional privada" title="Situação de renda">{incomeCandidates.map((person) => <label className="field" key={person.id}><span className="field__label">{person.name}: Você possui alguma fonte de renda atualmente?</span><select className="field__input" value={incomeAnswers[person.id] ?? 'unknown'} onChange={(event) => setIncomeAnswers((current) => ({ ...current, [person.id]: event.target.value as IncomeStatus }))}><option value="unknown">Não informado</option><option value="has_income">Sim</option><option value="no_income">Não</option></select></label>)}</Card>}
    <Card eyebrow="4 · Anotações" title="Resumo opcional"><label className="field" htmlFor="visit-notes"><span className="field__label">Observações pastorais</span><textarea id="visit-notes" className="field__input" rows={4} maxLength={2000} value={notes} onChange={(event) => setNotes(event.target.value)} /></label></Card>
    <Card eyebrow="5 · Última etapa" title="Pedido de oração"><label className="field" htmlFor="visit-prayer"><span className="field__label">Pedido opcional</span><textarea id="visit-prayer" className="field__input" rows={3} maxLength={1000} value={prayerText} onChange={(event) => setPrayerText(event.target.value)} /></label><Field label="Revisar em" name="prayer-review" type="date" value={prayerReviewAt} onChange={(event) => setPrayerReviewAt(event.target.value)} /></Card>
    
    <div className="form-actions form-actions--sticky"><Link className="button button--secondary" to={editando ? `/app/visitas/${visitId}` : '/app/visitas'}>Cancelar</Link><Button type="submit" disabled={busy} icon={<CheckCircle2 />}>{busy ? 'Cifrando visita…' : editando ? 'Salvar correção' : 'Finalizar visita'}</Button></div></form></div>
}
