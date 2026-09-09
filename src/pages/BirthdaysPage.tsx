import { useReloadOnSync } from '../sync/useReloadOnSync'
import { ArrowLeft, Cake, Check, Copy } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuthVault } from '../auth/AuthVaultContext'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { DistrictService } from '../district/service'
import type { ChurchEntity } from '../district/types'
import { birthdayMessage, upcomingBirthdays, type BirthdayPerson } from '../people/dates'
import { linkDeWhatsapp, mensagensDeAniversario } from '../people/mensagensDeAniversario'
import { movimentoReduzido } from '../components/ui/animacao'
import { PeopleService } from '../people/service'

const service = new PeopleService(); const districtService = new DistrictService()
export function BirthdaysPage() {
  const { account, masterKey } = useAuthVault(); const [birthdays, setBirthdays] = useState<BirthdayPerson[]>([]); const [churches, setChurches] = useState<ChurchEntity[]>([]); const [churchId, setChurchId] = useState(''); const [selected, setSelected] = useState<BirthdayPerson | null>(null); const [message, setMessage] = useState(''); const [copied, setCopied] = useState(false); const [loading, setLoading] = useState(true)
  const mensagemRef = useRef<HTMLDivElement>(null)
  const load = useCallback(async () => { if (!account || !masterKey) return; const district = await districtService.getDistrict(account.id, masterKey); const people = await service.listPeople(account.id, masterKey); setBirthdays(upcomingBirthdays(people, new Date(), 60)); setChurches(district ? await districtService.listChurches(account.id, masterKey, district.id) : []); setLoading(false) }, [account, masterKey]); useReloadOnSync(load)
  const visible = useMemo(() => birthdays.filter(({ person }) => !churchId || person.currentChurchId === churchId), [birthdays, churchId]); const today = visible.filter(({ daysUntil }) => daysUntil === 0); const next = visible.filter(({ daysUntil }) => daysUntil > 0)
  function choose(item: BirthdayPerson) { setSelected(item); setMessage(birthdayMessage(item.person.name, item.turningAge)); setCopied(false) }
  /*
    O cartão da mensagem nasce depois da lista de sessenta dias. Quem clicava em
    "Criar mensagem" via a tela parada e concluía que o botão não fazia nada —
    ele fazia, quatro telas abaixo.
  */
  useEffect(() => {
    if (!selected) return
    mensagemRef.current?.scrollIntoView({ block: 'start', behavior: movimentoReduzido() ? 'auto' : 'smooth' })
  }, [selected])
  /**
   * Abrir o WhatsApp já na conversa, com a mensagem escrita.
   *
   * O botão levava a uma caixa de texto e um "copiar": o pastor copiava, saía
   * do aplicativo, procurava a pessoa e colava. Agora o caminho é um toque.
   */
  function abrirWhatsapp(texto: string) {
    if (!selected) return
    const link = linkDeWhatsapp(selected.person.whatsapp, texto)
    if (!link) { setMessage(texto); setCopied(false); return }
    window.open(link, '_blank', 'noopener,noreferrer')
  }
  async function copy() { if (!message.trim()) return; await navigator.clipboard.writeText(message.trim()); setCopied(true) }
  if (loading) return <div className="app-loading">Calculando aniversários…</div>
  const list = (items: BirthdayPerson[]) => items.length ? <div className="birthday-list">{items.map((item) => <article key={item.person.id}><span className="birthday-date"><strong>{item.daysUntil === 0 ? 'Hoje' : item.daysUntil}</strong><small>{item.daysUntil === 0 ? '' : item.daysUntil === 1 ? 'dia' : 'dias'}</small></span><span><Link to={`/app/pessoas/${item.person.id}`}>{item.person.name}</Link><small>Completa {item.turningAge} anos</small></span><Button variant="secondary" onClick={() => choose(item)}>Criar mensagem</Button></article>)}</div> : <div className="empty-state compact-empty"><Cake /><strong>Nenhum aniversário neste período</strong></div>
  return <div className="page-stack page-narrow"><Link className="text-link back-link" to="/app/pessoas"><ArrowLeft />Voltar às pessoas</Link><header className="page-hero"><div><p className="eyebrow">Aniversários</p><h1>Aniversariantes</h1></div></header><label className="field"><span className="field__label">Filtrar por igreja</span><select className="field__input" value={churchId} onChange={(event) => setChurchId(event.target.value)}><option value="">Todas as igrejas</option>{churches.map((church) => <option key={church.id} value={church.id}>{church.name}</option>)}</select></label><Card eyebrow="Hoje" title="Aniversariantes do dia">{list(today)}</Card><Card eyebrow="Próximos 60 dias" title="Próximos aniversariantes">{list(next)}</Card>{selected && <Card eyebrow="Edite antes de copiar" title={`Mensagem para ${selected.person.name}`}><label className="field"><span className="field__label">Mensagem</span><textarea className="field__input field__textarea field__textarea--large" value={message} onChange={(event) => { setMessage(event.target.value); setCopied(false) }} /></label><p className="field__hint">Somente o nome presente no texto e a mensagem serão copiados. Nenhum telefone é incluído.</p><Button icon={copied ? <Check /> : <Copy />} onClick={() => void copy()}>{copied ? 'Mensagem copiada' : 'Copiar mensagem'}</Button></Card>}
    {selected && <div ref={mensagemRef}><Card eyebrow="Escolha uma e envie" title="Sugestões para esta idade">
      <div className="sugestoes-mensagem">{mensagensDeAniversario(selected.person.name, selected.turningAge).map((texto) => (
        <button type="button" className="sugestao" key={texto} onClick={() => abrirWhatsapp(texto)}>
          <span>{texto}</span>
          <small>{linkDeWhatsapp(selected.person.whatsapp, texto) ? 'Abrir no WhatsApp' : 'Sem WhatsApp cadastrado · usar como texto'}</small>
        </button>
      ))}</div>
    </Card></div>}</div>
}
