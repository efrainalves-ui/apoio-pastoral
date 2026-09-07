import { useReloadOnSync } from '../sync/useReloadOnSync'
import { ArrowLeft, Clock3, Edit3, LockKeyhole, Trash2, UsersRound } from 'lucide-react'
import { useCallback, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuthVault } from '../auth/AuthVaultContext'
import { CareService } from '../care/service'
import { VISIT_REASON_LABELS, type VisitEntity } from '../care/types'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { FamilyService } from '../families/service'
import { PeopleService } from '../people/service'

const care = new CareService(); const families = new FamilyService(); const people = new PeopleService()
export function VisitDetailPage() {
  const { account, masterKey } = useAuthVault(); const { visitId = '' } = useParams(); const navigate = useNavigate(); const [visit, setVisit] = useState<VisitEntity | null>(null); const [targetName, setTargetName] = useState('');  const [error, setError] = useState('')
  const load = useCallback(async () => { if (!account || !masterKey) return; const current = await care.getVisit(account.id, masterKey, visitId); setVisit(current); if (!current) return; const target = current.targetType === 'family' ? await families.getFamily(account.id, masterKey, current.targetId) : await people.getPerson(account.id, masterKey, current.targetId); setTargetName(target?.name ?? 'Cadastro preservado'); }, [account, masterKey, visitId])
  useReloadOnSync(load)
  /**
   * Editar e apagar, sem cerimônia de versão.
   *
   * O desenho anterior só deixava "registrar correção", criando uma versão
   * nova a cada ajuste — e não deixava apagar nada. Uma visita começada por
   * engano ficava na lista para sempre. Quem escreve o registro é o pastor,
   * sobre o próprio distrito: ele corrige e apaga quando precisa.
   */
  async function apagar() {
    if (!account || !masterKey || !visit) return
    if (!window.confirm('Apagar esta visita? O registro sai da lista e dos relatórios.')) return
    try {
      await care.deleteVisit(account.id, masterKey, visit.id)
      await navigate('/app/visitas')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível apagar a visita.')
    }
  }

  if (!visit) return <div className="empty-state"><LockKeyhole /><strong>Visita não encontrada</strong></div>
  const latest = visit.versions.at(-1)!
  return <div className="page-stack"><Link className="text-link back-link" to="/app/visitas"><ArrowLeft />Voltar às visitas</Link><header className="page-hero"><div><p className="eyebrow">Visita registrada</p><h1>{targetName}</h1><p>{VISIT_REASON_LABELS[latest.reason]} · visita {visit.mode === 'quick' ? 'rápida' : 'com entrevista'}</p></div><div className="page-actions"><Link className="button button--secondary" to={`/app/visitas/${visit.id}/editar`}><Edit3 />Editar</Link><Button variant="danger" icon={<Trash2 />} onClick={() => void apagar()}>Excluir</Button></div></header>{error && <div className="alert alert--error">{error}</div>}<div className="home-grid"><Card title="Contexto" eyebrow="Visita concluída"><dl className="detail-list"><div><dt>Início</dt><dd><Clock3 />{new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(latest.startAt))}</dd></div><div><dt>Presentes</dt><dd><UsersRound />{latest.participants.filter(({ present }) => present).length}</dd></div></dl></Card><Card title="Observações" eyebrow="Privado do pastor"><p className="preserved-text">{latest.notes || 'Nenhuma observação.'}</p></Card></div><Card title="Respostas da entrevista" eyebrow="Snapshots das perguntas">{!latest.answers.length ? <div className="empty-state compact-empty"><UsersRound /><strong>Registro rápido sem questionário</strong></div> : <div className="answer-history">{latest.answers.map((answer) => <div key={answer.id}><span><small>{answer.question.code} · v{answer.question.version}</small><strong>{answer.question.text}</strong></span><p>{answer.skipped ? 'Pergunta pulada' : Array.isArray(answer.value) ? answer.value.join(', ') : answer.value}</p></div>)}</div>}</Card></div>
}
