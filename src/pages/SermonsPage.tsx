import { useReloadOnSync } from '../sync/useReloadOnSync'
import { BookOpen, FileText, Plus } from 'lucide-react'
import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuthVault } from '../auth/AuthVaultContext'
import { BibliotecaDeSermoes } from '../components/BibliotecaDeSermoes'
import { Card } from '../components/ui/Card'
import { AgendaService } from '../agenda/service'
import type { AgendaEventEntity } from '../agenda/types'
import { Button } from '../components/ui/Button'
import { DistrictService } from '../district/service'
import type { ChurchEntity } from '../district/types'
import { sermonReportLines } from '../reports/areaReports'
import { previewLocalPdf } from '../reports/localPdf'
import { SermonService } from '../sermons/service'
import type { SermonEntity } from '../sermons/types'

const sermonsService = new SermonService()
const agendaService = new AgendaService()
const districtService = new DistrictService()

export function SermonsPage() {
  const { account, masterKey } = useAuthVault()
  const [sermons, setSermons] = useState<SermonEntity[]>([])
  const [error, setError] = useState('')
  const [preachings, setPreachings] = useState<AgendaEventEntity[]>([])
  const [churches, setChurches] = useState<ChurchEntity[]>([])
  const [aba, setAba] = useState<'biblioteca' | 'historico'>('biblioteca')
  const [comNomes, setComNomes] = useState(false)
  const load = useCallback(async () => {
    if (!account || !masterKey) return
    try {
      const district = await districtService.getDistrict(account.id, masterKey)
      const [lista, eventos, igrejas] = await Promise.all([
        sermonsService.list(account.id, masterKey),
        agendaService.listEvents(account.id, masterKey),
        district ? districtService.listChurches(account.id, masterKey, district.id) : [],
      ])
      setSermons(lista)
      setPreachings(eventos.filter((event) => event.category === 'preaching').sort((a, b) => b.startAt.localeCompare(a.startAt)))
      setChurches(igrejas)
      setError('')
    } catch (motivo) {
      setError(motivo instanceof Error ? motivo.message : 'Não foi possível abrir a biblioteca.')
    }
  }, [account, masterKey])
  useReloadOnSync(load)
  return <div className="page-stack sermons-page">
    <header className="page-hero">
      <div>
        <p className="eyebrow">Biblioteca</p>
        <h1>Sermões</h1>
        <p className="acervo">{sermons.length} {sermons.length === 1 ? 'no acervo' : 'no acervo'}</p>
      </div>
      <div className="page-actions"><Link className="button" to="/app/sermoes/novo"><Plus />Novo sermão</Link></div>
    </header>
    {error && <div className="alert alert--error" role="alert">{error}</div>}

    <div className="segmented" role="tablist" aria-label="Visões dos sermões">
      {([['biblioteca', 'Biblioteca'], ['historico', 'Histórico']] as const).map(([valor, rotulo]) => (
        <button key={valor} type="button" role="tab" aria-selected={aba === valor} className={aba === valor ? 'active' : ''} onClick={() => setAba(valor)}>{rotulo}</button>
      ))}
    </div>

    {aba === 'biblioteca'
      ? <Card className="sermons-catalogue"><BibliotecaDeSermoes sermons={sermons} events={preachings} churches={churches} /></Card>
      : <Card eyebrow="Relatório local" title="Histórico de pregações">
          <label className="confirmation-check">
            <input type="checkbox" checked={comNomes} onChange={(event) => setComNomes(event.target.checked)} />
            <span><strong>Incluir nomes neste relatório</strong><small>Sem marcar, saem data e igreja. Com nomes, o título da pregação entra e pode conter dados pessoais: compartilhe com cuidado.</small></span>
          </label>
          <Button icon={<FileText />} onClick={() => previewLocalPdf('Sermões e Pregações', sermonReportLines(preachings, sermons.length, (id) => churches.find((church) => church.id === id)?.name ?? 'Distrito', comNomes))}>Gerar histórico</Button>
          {!preachings.length && <div className="empty-state"><BookOpen /><strong>Nenhuma pregação registrada</strong></div>}
        </Card>}
  </div>
}
