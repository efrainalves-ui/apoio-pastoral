import { CheckCircle2, FileUp, Trash2, TriangleAlert } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuthVault } from '../auth/AuthVaultContext'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { extractPdfText, validatePdfFile } from '../imports/pdf'
import { parseDistrictListText } from '../imports/parsers'
import type { ParsedMemberRow } from '../imports/types'
import { InitialSetupService, type SetupChurch, type SetupMember } from '../setup/service'

type Step = 'district' | 'list' | 'review' | 'done'
type PreviewMember = ParsedMemberRow & { churchId: string }
const setupService = new InitialSetupService()
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/gu, '').replace(/[^a-z0-9]+/giu, ' ').trim().toLocaleLowerCase('pt-BR')

export function InitialSetupPage() {
  const { account, masterKey } = useAuthVault()
  const [step, setStep] = useState<Step>('district')
  const [districtName, setDistrictName] = useState('')
  const [churches, setChurches] = useState<SetupChurch[]>([])
  const [members, setMembers] = useState<PreviewMember[]>([])
  const [unparsedCount, setUnparsedCount] = useState(0)
  // A tela guarda o texto das linhas perdidas, e não só quantas foram. Um
  // número sozinho não deixa ninguém decidir nada: trinta cabeçalhos de página
  // e trinta pessoas do distrito são o mesmo "30" na tela, e só um dos dois
  // casos é aceitável seguir em frente.
  const [unparsedLines, setUnparsedLines] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [imported, setImported] = useState(false)
  const [summary, setSummary] = useState({ churches: 0, people: 0, birthdays: 0 })
  const churchSummary = useMemo(() => churches.map((church) => ({ ...church, members: members.filter((member) => member.churchId === church.id) })), [churches, members])
  const birthdayCount = useMemo(() => members.filter(({ birthDate }) => Boolean(birthDate)).length, [members])

  async function readFile(file?: File) {
    if (!file) return
    setBusy(true); setError('')
    try {
      validatePdfFile(file)
      const parsed = parseDistrictListText(await extractPdfText(await file.arrayBuffer()))
      if (!districtName.trim() && parsed.districtName) setDistrictName(parsed.districtName)
      const ids = new Map<string, string>(); const parsedChurches: SetupChurch[] = []
      const parsedMembers: PreviewMember[] = parsed.rows.map((row) => {
        const name = row.churchName.trim(); const key = normalize(name); let churchId = ids.get(key)
        if (!churchId) { churchId = crypto.randomUUID(); ids.set(key, churchId); parsedChurches.push({ id: churchId, name }) }
        return { ...row, churchId }
      })
      setChurches(parsedChurches); setMembers(parsedMembers); setUnparsedCount(parsed.unparsedCount); setUnparsedLines(parsed.unparsedLines); setStep('review')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível ler o PDF.') } finally { setBusy(false) }
  }

  function renameChurch(id: string, name: string) { setChurches((current) => current.map((church) => church.id === id ? { ...church, name } : church)) }
  function removeChurch(id: string) { setChurches((current) => current.filter((church) => church.id !== id)); setMembers((current) => current.filter((member) => member.churchId !== id)) }
  function mergeChurch(sourceId: string, targetId: string) {
    if (!targetId || sourceId === targetId) return
    setMembers((current) => current.map((member) => member.churchId === sourceId ? { ...member, churchId: targetId } : member))
    setChurches((current) => current.filter((church) => church.id !== sourceId))
  }

  async function organize(withList: boolean) {
    if (!account || !masterKey || !districtName.trim()) return
    setBusy(true); setError('')
    try {
      const result = await setupService.organize(account.id, masterKey, {
        districtName,
        churches: withList ? churches : [],
        members: withList ? members.map<SetupMember>(({ name, birthDate, churchId }) => ({ name, birthDate, churchId })) : [],
      })
      setSummary(result); setImported(withList); setStep('done')
    } catch (reason) { setError(reason instanceof Error && reason.message ? reason.message : 'Não foi possível salvar o distrito. Tente novamente.') } finally { setBusy(false) }
  }

  if (step === 'district') return <div className="setup-page"><Card className="setup-card"><p className="eyebrow">Primeira configuração</p><h1>Vamos organizar seu distrito</h1><p>Qual é o nome do seu distrito?</p>{error && <div className="alert alert--error" role="alert">{error}</div>}<label className="field"><span className="field__label">Nome do distrito</span><input className="field__input" value={districtName} onChange={(event) => setDistrictName(event.target.value)} autoFocus /></label><Button disabled={!districtName.trim()} onClick={() => setStep('list')}>Continuar</Button></Card></div>
  if (step === 'list') return <div className="setup-page"><Card className="setup-card"><p className="eyebrow">Primeira configuração</p><h1>Importe a lista do distrito</h1><p>Envie a lista de membros do distrito em PDF. O Apoio Pastoral vai organizar as igrejas, os membros e os aniversariantes para você.</p><p className="muted">Depois, você poderá revisar e editar todas as informações.</p>{error && <div className="alert alert--error" role="alert">{error}</div>}<label className="file-picker"><FileUp /><span><strong>{busy ? 'Lendo o PDF…' : 'Selecionar PDF'}</strong><small>O arquivo é usado apenas para preparar a conferência.</small></span><input type="file" accept="application/pdf,.pdf" disabled={busy} onChange={(event) => { void readFile(event.target.files?.[0]); event.currentTarget.value = '' }} /></label><Button variant="secondary" disabled={busy} onClick={() => void organize(false)}>{busy ? 'Organizando distrito…' : 'Cadastrar manualmente'}</Button></Card></div>
  if (step === 'review') return <div className="setup-page"><Card className="setup-card setup-card--wide"><p className="eyebrow">Conferência</p><h1>Confira a lista</h1><label className="field"><span className="field__label">Distrito</span><input className="field__input" value={districtName} onChange={(event) => setDistrictName(event.target.value)} /></label><div className="import-metrics"><div><small>Igrejas encontradas</small><strong>{churches.length}</strong></div><div><small>Membros encontrados</small><strong>{members.length}</strong></div><div><small>Aniversários encontrados</small><strong>{birthdayCount}</strong></div><div><small>Linhas não reconhecidas</small><strong>{unparsedCount}</strong></div></div>{error && <div className="alert alert--error" role="alert">{error}</div>}<div className="issue-list"><h3>Igrejas encontradas</h3>{churchSummary.map((church) => <div className="setup-church-row" key={church.id}><label className="field"><span className="sr-only">Nome da igreja</span><input className="field__input" aria-label={`Nome da igreja ${church.name}`} value={church.name} onChange={(event) => renameChurch(church.id, event.target.value)} /></label><span>{church.members.length} membro(s) · {church.members.filter(({ birthDate }) => Boolean(birthDate)).length} aniversário(s)</span><label className="sr-only" htmlFor={`merge-${church.id}`}>Unir {church.name} com outra igreja</label><select id={`merge-${church.id}`} className="field__input" defaultValue="" onChange={(event) => mergeChurch(church.id, event.target.value)} disabled={busy || churches.length < 2}><option value="">Unir com…</option>{churches.filter(({ id }) => id !== church.id).map((target) => <option key={target.id} value={target.id}>{target.name}</option>)}</select><button className="icon-button danger-icon" type="button" aria-label={`Remover igreja ${church.name}`} disabled={busy} onClick={() => removeChurch(church.id)}><Trash2 /></button></div>)}</div>{unparsedCount > 0 && <div className="issue-list"><h3><TriangleAlert />Informações não reconhecidas</h3><p>{unparsedCount} linha(s) não puderam ser entendidas e <strong>não serão importadas</strong>. Confira abaixo: se forem cabeçalhos, rodapés ou números de página, pode seguir. Se houver nome de pessoa nesta lista, essa pessoa vai ficar de fora.</p><ul className="unparsed-list">{unparsedLines.map((linha, indice) => <li key={`${indice}-${linha}`}>{linha}</li>)}</ul>{unparsedCount > unparsedLines.length && <p className="field__hint">Mostrando as {unparsedLines.length} primeiras de {unparsedCount}.</p>}</div>}<Button disabled={busy || !districtName.trim() || churches.length === 0 || members.length === 0} onClick={() => void organize(true)} icon={<CheckCircle2 />}>{busy ? 'Organizando distrito…' : 'Confirmar e organizar distrito'}</Button></Card></div>
  return <div className="setup-page"><Card className="setup-card"><CheckCircle2 className="accent-icon" /><h1>Distrito organizado</h1><p>{imported ? 'As igrejas, os membros e os aniversariantes encontrados foram cadastrados. Revise as informações das igrejas e complete o que estiver faltando.' : 'Seu distrito está pronto. Agora você pode cadastrar igrejas, pessoas e famílias.'}</p><div className="import-metrics"><div><small>Igrejas</small><strong>{summary.churches}</strong></div><div><small>Pessoas</small><strong>{summary.people}</strong></div><div><small>Aniversários</small><strong>{summary.birthdays}</strong></div></div><div className="form-actions"><Link className="button button--secondary" to="/app/distrito">Revisar igrejas</Link><Link className="button button--secondary" to="/app/pessoas">Ir para pessoas</Link><Link className="button" to="/app">Ir para o início</Link></div></Card></div>
}
