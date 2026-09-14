import { useReloadOnSync } from '../sync/useReloadOnSync'
import { ArrowLeft, BookOpenCheck, Copy, Edit3, Trash2 } from 'lucide-react'
import { useCallback, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AgendaService } from '../agenda/service'
import type { AgendaEventEntity } from '../agenda/types'
import { useAuthVault } from '../auth/AuthVaultContext'
import { JaPregadoPanel } from '../components/JaPregadoPanel'
import { PreachingPanel } from '../components/PreachingPanel'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Field } from '../components/ui/Field'
import { DistrictService } from '../district/service'
import type { ChurchEntity } from '../district/types'
import type { PregacaoAnteriorEntity } from '../sermons/jaPregado'
import { JaPregadoService } from '../sermons/jaPregadoService'
import { formatPreachingDate, listPreachings, type Preaching } from '../sermons/preachings'
import { SermonService } from '../sermons/service'
import type { SermonEntity } from '../sermons/types'
const service = new SermonService(); const agenda = new AgendaService(); const district = new DistrictService(); const jaPregado = new JaPregadoService()
export function SermonDetailPage() { const { account, masterKey } = useAuthVault(); const { sermonId = '' } = useParams(); const navigate = useNavigate(); const [erroAoApagar, setErroAoApagar] = useState(''); const [sermon, setSermon] = useState<SermonEntity | null>(null); const [events, setEvents] = useState<AgendaEventEntity[]>([]); const [anteriores, setAnteriores] = useState<PregacaoAnteriorEntity[]>([]); const [churches, setChurches] = useState<ChurchEntity[]>([]); const [referenceTime] = useState(() => Date.now()); const [panelOpen, setPanelOpen] = useState(false); const [jaPregadoOpen, setJaPregadoOpen] = useState(false)
  const [edicao, setEdicao] = useState<{ id: string; data: string; semData: boolean; lugar: string; churchId: string | null } | null>(null); const [erroDoHistorico, setErroDoHistorico] = useState('')
  const load = useCallback(async () => { if (!account || !masterKey) return; const root = await district.getDistrict(account.id, masterKey); const [nextSermon, nextEvents, nextChurches, nextAnteriores] = await Promise.all([service.get(account.id, masterKey, sermonId), agenda.listEvents(account.id, masterKey), root ? district.listChurches(account.id, masterKey, root.id) : [], jaPregado.listar(account.id, masterKey, sermonId)]); setSermon(nextSermon); setEvents(nextEvents.filter((event) => event.sermonId === sermonId || event.sermonSnapshot?.id === sermonId)); setChurches(nextChurches); setAnteriores(nextAnteriores) }, [account, masterKey, sermonId]); useReloadOnSync(load);
  async function apagar() {
    if (!account || !masterKey || !window.confirm('Remover este sermão? O histórico de pregações continuará preservado na agenda.')) return
    try {
      await service.remove(account.id, masterKey, sermonId)
      void navigate('/app/sermoes')
    } catch {
      setErroAoApagar('Não foi possível remover o sermão.')
    }
  }
  function editar(pregacao: Preaching) {
    setErroDoHistorico('')
    setEdicao({ id: pregacao.eventId, data: pregacao.date, semData: !pregacao.date, lugar: pregacao.churchId ? '' : pregacao.place, churchId: pregacao.churchId })
  }
  async function salvarEdicao() {
    if (!account || !masterKey || !edicao) return
    try {
      await jaPregado.atualizar(account.id, masterKey, edicao.id, { data: edicao.semData ? '' : edicao.data, lugar: edicao.lugar })
      setEdicao(null); await load()
    } catch (motivo) {
      setErroDoHistorico(motivo instanceof Error ? motivo.message : 'Não foi possível salvar.')
    }
  }
  async function removerRegistro(pregacao: Preaching) {
    if (!account || !masterKey || !window.confirm(`Remover o registro de ${pregacao.place || 'pregação'}?`)) return
    try {
      await jaPregado.remover(account.id, masterKey, pregacao.eventId)
      if (edicao?.id === pregacao.eventId) setEdicao(null)
      await load()
    } catch {
      setErroDoHistorico('Não foi possível remover o registro.')
    }
  }
  if (!sermon) return <div className="page-stack"><p>Carregando sermão…</p></div>; const pregacoes = listPreachings(events, churches, sermonId, new Date(referenceTime), anteriores);
  const recent = events.filter((event) => event.churchId && new Date(event.startAt).getTime() > referenceTime - 90 * 86_400_000); return <div className="page-stack"><Link className="text-link back-link" to="/app/sermoes"><ArrowLeft />Voltar</Link><header className="page-hero"><div><p className="eyebrow">{sermon.mainText}</p><h1>{sermon.title}</h1><p>{sermon.theme}</p></div><div className="page-actions"><Link className="button button--secondary" to={`/app/sermoes/${sermon.id}/pregar`}><BookOpenCheck />Pregar</Link><Link className="button button--secondary" to={`/app/sermoes/novo?duplicar=${sermon.id}`}><Copy />Duplicar</Link><Link className="button" to={`/app/sermoes/${sermon.id}/editar`}><Edit3 />Editar</Link><Button variant="quiet" className="acao-destrutiva" icon={<Trash2 size={16} />} onClick={() => void apagar()}>Excluir</Button></div></header>{erroAoApagar && <div className="alert alert--error" role="alert">{erroAoApagar}</div>}{recent.length > 0 && <div className="alert alert--success">Este sermão aparece em pregação recente em {recent.length} compromisso(s). Verifique o histórico abaixo.</div>}<Card title="Esboço"><dl className="detail-list"><div><dt>Textos complementares</dt><dd>{sermon.complementaryTexts || '—'}</dd></div><div><dt>Objetivo</dt><dd>{sermon.objective || '—'}</dd></div></dl>{[['Introdução', sermon.introduction], ['Conteúdo', sermon.content], ['Conclusão', sermon.conclusion], ['Apelo', sermon.appeal], ['Observações', sermon.notes]].map(([label, value]) => <section key={label}><h3>{label}</h3><p className="preserved-text">{value || '—'}</p></section>)}</Card><Card title="Onde foi pregado" eyebrow={pregacoes.length > 1 ? `${pregacoes.length} pregações` : 'Resumo'}>
    {/*
      Um sermão bom é pregado no distrito inteiro. Mostrar só a última resposta
      esconde justamente o que o pastor quer saber ao reabrir o esboço: onde ele
      já esteve com esta mensagem, e qual igreja ainda não a ouviu.
    */}
    {erroDoHistorico && <div className="alert alert--error" role="alert">{erroDoHistorico}</div>}
    {pregacoes.length === 0
      ? <p className="card-copy">Ainda não há pregação registrada.</p>
      : <ul className="sermon-preaching-list">{pregacoes.map((pregacao) => <li key={pregacao.eventId}>
          <strong>{pregacao.place || 'Lugar não informado'}</strong>
          <span>{formatPreachingDate(pregacao.date)}</span>
          {pregacao.origem === 'anterior' && edicao?.id !== pregacao.eventId && <span className="sermon-preaching-list__acoes">
            <Button variant="quiet" aria-label={`Editar registro de ${pregacao.place}`} onClick={() => editar(pregacao)}>Editar</Button>
            <Button variant="quiet" className="acao-destrutiva" aria-label={`Remover registro de ${pregacao.place}`} onClick={() => void removerRegistro(pregacao)}>Remover</Button>
          </span>}
          {edicao?.id === pregacao.eventId && <div className="sermon-preaching-edicao">
            {!edicao.churchId && <Field label="Nome da igreja" name="ja-pregado-editar-lugar" value={edicao.lugar} maxLength={160} onChange={(evento) => setEdicao({ ...edicao, lugar: evento.target.value })} />}
            <div className="ja-pregado-data">
              <Field label="Data" name="ja-pregado-editar-data" type="date" value={edicao.semData ? '' : edicao.data} disabled={edicao.semData} onChange={(evento) => setEdicao({ ...edicao, data: evento.target.value })} />
              <label className="ja-pregado-check"><input type="checkbox" checked={edicao.semData} onChange={(evento) => setEdicao({ ...edicao, semData: evento.target.checked, data: evento.target.checked ? '' : edicao.data })} /><span>Não lembro a data</span></label>
            </div>
            <div className="page-actions">
              <Button onClick={() => void salvarEdicao()} disabled={!edicao.semData && !edicao.data}>Salvar</Button>
              <Button variant="quiet" onClick={() => setEdicao(null)}>Cancelar</Button>
            </div>
          </div>}
        </li>)}</ul>}
    <div className="sermon-preaching"><button type="button" className="preaching-link" onClick={() => setPanelOpen(true)}>Onde pregou</button><button type="button" className="preaching-link" onClick={() => setJaPregadoOpen(true)}>Marcar como já pregado</button></div>
  </Card>{panelOpen && <PreachingPanel sermon={sermon} onClose={() => { setPanelOpen(false); void load() }} />}{jaPregadoOpen && <JaPregadoPanel sermon={sermon} churches={churches} events={events} anteriores={anteriores} onClose={() => setJaPregadoOpen(false)} onRegistrado={load} />}</div> }
