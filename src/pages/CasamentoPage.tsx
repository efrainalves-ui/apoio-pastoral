import { ArrowLeft, CalendarPlus, Printer } from 'lucide-react'
import { useCallback, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { localDateTime, type AgendaEventEntity } from '../agenda/types'
import { useAuthVault } from '../auth/AuthVaultContext'
import type { VisitEntity } from '../care/types'
import {
  ORIENTACOES_AOS_NOIVOS, cursoComResposta, etapaSugerida, itensDaPreparacao, nomeDoCasal, pedidoComPoucaAntecedencia,
  pendencias, respostaDoCurso, situacaoGeral, textoDaRecomendacao,
} from '../casamentos/core'
import { CasamentoService, eCerimonia } from '../casamentos/service'
import {
  ETAPAS, ETAPA_LABELS, PERGUNTAS_DA_ENTREVISTA, SITUACAO_DA_CARTA_LABELS, SITUACAO_DA_COMISSAO_LABELS, SITUACAO_DO_CURSO_LABELS,
  SITUACAO_DO_ITEM_LABELS, type CasamentoEntity, type EntrevistaPastoral, type EtapaDoCasamento, type ItemManual, type PerguntaGuardada,
  type SimNao, type SituacaoDaCarta, type SituacaoDaComissao, type SituacaoDoCurso, type SituacaoDoItem,
} from '../casamentos/types'
import { SimNao as CampoSimNao } from '../components/agenda/CamposDaAgenda'
import { CampoDoNoivo } from '../components/casamentos/CamposDoCasamento'
import { dataLegivel } from '../components/casamentos/CasamentosLista'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Field } from '../components/ui/Field'
import { CommissionService } from '../commissions/service'
import type { CommissionEntity, CommissionMeetingData } from '../commissions/types'
import { DistrictService } from '../district/service'
import type { ChurchEntity } from '../district/types'
import { PeopleService } from '../people/service'
import type { PersonEntity } from '../people/types'
import { previewLocalPdf } from '../reports/localPdf'
import { localDateKey } from '../shared/dates'
import { useReloadOnSync } from '../sync/useReloadOnSync'

const servico = new CasamentoService(); const districts = new DistrictService(); const peopleService = new PeopleService(); const commissions = new CommissionService()

const AREAS = [
  ['resumo', 'Resumo'], ['noivos', 'Dados dos noivos'], ['visitas', 'Visitas e entrevistas'], ['curso', 'Curso de noivos'],
  ['documentos', 'Documentos e casamento civil'], ['comissao', 'Comissão da igreja'], ['orientacoes', 'Orientações ao casal'],
  ['cerimonia', 'Preparação da cerimônia'], ['historico', 'Histórico e pendências'],
] as const

const PERGUNTAS_GUARDADAS = PERGUNTAS_DA_ENTREVISTA.filter((pergunta): pergunta is Extract<(typeof PERGUNTAS_DA_ENTREVISTA)[number], { id: PerguntaGuardada }> => pergunta.id !== 'curso')
const textoDaResposta = (resposta: SimNao) => resposta === 'sim' ? 'Sim' : resposta === 'nao' ? 'Não' : 'Pendente'
const entrevistaVazia = (realizadaPor: string) => ({ data: localDateKey(), realizadaPor, respostas: { vestuario: null, principios: null, recepcao: null, ornamentacao: null } as Record<PerguntaGuardada, SimNao> })
const quandoVazio = () => ({ data: '', inicio: '', local: '' })

export function CasamentoPage() {
  const { casamentoId = '' } = useParams(); const navigate = useNavigate()
  const { account, masterKey } = useAuthVault()
  const [casamento, setCasamento] = useState<CasamentoEntity | null>(null); const [naoEncontrado, setNaoEncontrado] = useState(false)
  const [eventos, setEventos] = useState<AgendaEventEntity[]>([]); const [visitas, setVisitas] = useState<VisitEntity[]>([])
  const [churches, setChurches] = useState<ChurchEntity[]>([]); const [people, setPeople] = useState<PersonEntity[]>([])
  const [reunioes, setReunioes] = useState<CommissionEntity<CommissionMeetingData>[]>([])
  const [reuniaoEscolhida, setReuniaoEscolhida] = useState('')
  const [novaEntrevista, setNovaEntrevista] = useState(() => entrevistaVazia(''))
  const [agendaDaEntrevista, setAgendaDaEntrevista] = useState(quandoVazio)
  const [erro, setErro] = useState(''); const [mensagem, setMensagem] = useState(''); const [busy, setBusy] = useState(false)
  const dirty = useRef(false)

  const load = useCallback(async () => {
    if (!account || !masterKey) return
    const district = await districts.getDistrict(account.id, masterKey)
    const [lido, compromissos, visitasDoCasamento, igrejas, pessoas, reunioesDaComissao] = await Promise.all([
      servico.obter(account.id, masterKey, casamentoId), servico.compromissos(account.id, masterKey, casamentoId),
      servico.visitas(account.id, masterKey, casamentoId), district ? districts.listChurches(account.id, masterKey, district.id) : [],
      peopleService.listPeople(account.id, masterKey), commissions.meetings(account.id, masterKey),
    ])
    setNaoEncontrado(!lido); setEventos(compromissos); setVisitas(visitasDoCasamento); setChurches(igrejas); setPeople(pessoas); setReunioes(reunioesDaComissao)
    if (lido && !dirty.current) {
      setCasamento(lido); setReuniaoEscolhida(lido.comissao.meetingId ?? '')
      setNovaEntrevista((atual) => atual.realizadaPor ? atual : { ...atual, realizadaPor: lido.pastorResponsavel })
    }
  }, [account, casamentoId, masterKey])
  useReloadOnSync(load, () => dirty.current, () => { if (window.confirm('Chegaram alterações de outro aparelho. Seu preenchimento foi preservado. Deseja descartá-lo e carregar a versão sincronizada?')) { dirty.current = false; void load() } })

  function mudar(transformar: (atual: CasamentoEntity) => CasamentoEntity) { dirty.current = true; setMensagem(''); setCasamento((atual) => atual ? transformar(atual) : atual) }

  async function salvar(acao?: string, alvo: CasamentoEntity | null = casamento): Promise<CasamentoEntity | null> {
    if (!account || !masterKey || !alvo) return null
    setBusy(true); setErro('')
    try {
      const salvo = await servico.salvar(account.id, masterKey, alvo, acao)
      await servico.sincronizarParaAgenda(account.id, masterKey, salvo)
      dirty.current = false
      setCasamento(salvo); setMensagem('Acompanhamento salvo.')
      await load()
      return salvo
    } catch (motivo) { setErro(motivo instanceof Error ? motivo.message : 'Não foi possível salvar o acompanhamento.'); return null } finally { setBusy(false) }
  }

  const cerimoniaNaAgenda = eventos.find(eCerimonia)
  const agora = localDateTime(new Date())
  const proximo = eventos.filter(({ endAt }) => endAt >= agora)[0]
  const itens = useMemo(() => casamento ? itensDaPreparacao(casamento) : [], [casamento])

  if (naoEncontrado) return <div className="empty-state"><strong>Casamento não encontrado</strong><Link className="text-link" to="/app/visitacao?aba=casamentos">Voltar aos casamentos</Link></div>
  if (!casamento) return <div className="app-loading" role="status">Abrindo o acompanhamento…</div>

  const nome = nomeDoCasal(casamento)
  const sugestao = etapaSugerida(casamento, Boolean(cerimoniaNaAgenda))
  const situacao = situacaoGeral(casamento, Boolean(cerimoniaNaAgenda))
  const pendentes = pendencias(casamento)
  const nomeDaIgreja = (id: string | null) => churches.find((church) => church.id === id)?.name
  const reunioesDaIgreja = reunioes.filter(({ churchId }) => !casamento.comissao.igrejaId || churchId === casamento.comissao.igrejaId)
  const recomendacao = textoDaRecomendacao(casamento, nomeDaIgreja(casamento.comissao.igrejaId))
  const ensaioNaAgenda = eventos.find(({ papelNoCasamento }) => papelNoCasamento === 'ensaio')

  async function agendarCasamento() {
    if (dirty.current && !await salvar()) return
    await navigate(`/app/agenda/novo?casamento=${casamentoId}`)
  }

  async function registrarEntrevista() {
    if (!casamento) return
    const entrevista: EntrevistaPastoral = { id: crypto.randomUUID(), ...novaEntrevista, cursoNaData: casamento.curso.situacao, visitaId: null, registradaEm: new Date().toISOString() }
    const salvo = await salvar(`Entrevista pastoral registrada (${dataLegivel(entrevista.data)})`, { ...casamento, entrevistas: [...casamento.entrevistas, entrevista] })
    if (salvo) setNovaEntrevista(entrevistaVazia(salvo.pastorResponsavel))
  }

  async function agendar(papel: 'entrevista' | 'ensaio') {
    if (!account || !masterKey || !casamento) return
    setErro('')
    try {
      const base = dirty.current ? await salvar() : casamento
      if (!base) return
      const quando = papel === 'ensaio' ? { ...base.ensaio, fim: '' } : { ...agendaDaEntrevista, fim: '' }
      await servico.agendarCompromisso(account.id, masterKey, base, papel, quando)
      if (papel === 'entrevista') setAgendaDaEntrevista(quandoVazio())
      setMensagem(papel === 'ensaio' ? 'Ensaio na Agenda.' : 'Entrevista na Agenda.')
      await load()
    } catch (motivo) { setErro(motivo instanceof Error ? motivo.message : 'Não foi possível agendar.') }
  }

  async function vincularReuniao() {
    if (!account || !masterKey || !casamento) return
    setErro('')
    try {
      const salvo = await servico.vincularComissao(account.id, masterKey, casamento, reuniaoEscolhida || null)
      dirty.current = false; setCasamento(salvo); setMensagem('Reunião de comissão vinculada.')
      await load()
    } catch (motivo) { setErro(motivo instanceof Error ? motivo.message : 'Não foi possível vincular a reunião.') }
  }

  function mudarItem(item: ItemManual, mudancas: Partial<{ situacao: SituacaoDoItem; data: string }>) {
    mudar((atual) => ({ ...atual, checklist: { ...atual.checklist, [item]: { ...atual.checklist[item], ...mudancas } } }))
  }

  /* A linha do tempo junta o que aponta para este casamento, sem copiar nada. */
  const linhaDoTempo = [
    ...casamento.historico.map(({ id, em, texto }) => ({ id, quando: em.slice(0, 10), texto })),
    ...casamento.entrevistas.map(({ id, data, realizadaPor }) => ({ id: `entrevista-${id}`, quando: data, texto: `Entrevista pastoral${realizadaPor ? ` com ${realizadaPor}` : ''}` })),
    ...visitas.map((visita) => ({ id: `visita-${visita.id}`, quando: visita.versions.at(-1)!.startAt.slice(0, 10), texto: 'Visita' })),
    ...eventos.map((evento) => ({ id: `evento-${evento.id}`, quando: evento.startAt.slice(0, 10), texto: evento.title })),
    ...(casamento.curso.situacao === 'concluido' && casamento.curso.dataConclusao ? [{ id: 'curso', quando: casamento.curso.dataConclusao, texto: 'Curso de noivos concluído' }] : []),
    ...(casamento.comissao.data ? [{ id: 'comissao', quando: casamento.comissao.data, texto: `Comissão da igreja · ${SITUACAO_DA_COMISSAO_LABELS[casamento.comissao.situacao]}` }] : []),
    ...(casamento.civil.data ? [{ id: 'civil', quando: casamento.civil.data, texto: 'Casamento civil' }] : []),
  ].sort((a, b) => b.quando.localeCompare(a.quando))

  return <div className="page-stack page-casamento">
    <Link className="text-link back-link" to="/app/visitacao?aba=casamentos"><ArrowLeft />Voltar aos casamentos</Link>
    <header className="page-hero"><div><p className="eyebrow">Casamento</p><h1>{nome}</h1></div></header>
    {erro && <div className="alert alert--error" role="alert">{erro}</div>}
    {mensagem && <div className="alert alert--success" role="status">{mensagem}</div>}

    <nav className="tira-abas" aria-label="Áreas do casamento">
      {AREAS.map(([id, rotulo]) => <a key={id} className="chip-aba" href={`#${id}`}>{rotulo}</a>)}
    </nav>

    <section id="resumo"><Card title="Resumo">
      <div className="resumo-casamento">
        <label className="field"><span className="field__label">Etapa atual</span><select className="field__input" value={casamento.etapa} onChange={(event) => mudar((atual) => ({ ...atual, etapa: event.target.value as EtapaDoCasamento }))}>{ETAPAS.map((etapa) => <option key={etapa} value={etapa}>{ETAPA_LABELS[etapa]}</option>)}</select></label>
        {sugestao !== casamento.etapa && <Button type="button" variant="secondary" onClick={() => mudar((atual) => ({ ...atual, etapa: sugestao }))}>{`Sugestão: ${ETAPA_LABELS[sugestao]}`}</Button>}
        <dl className="cartao-casamento__dados">
          <div><dt>Situação</dt><dd><span className={`status-pill ${situacao === 'Com pendências' ? 'status-pill--warning' : situacao === 'Cancelado' ? '' : 'status-pill--success'}`}>{situacao}</span></dd></div>
          <div><dt>Concluídos</dt><dd>{itens.filter(({ situacao: estado }) => estado !== 'pendente').length} de {itens.length}</dd></div>
          <div><dt>Pendentes</dt><dd>{pendentes.length}</dd></div>
          <div><dt>Data pretendida</dt><dd>{dataLegivel(casamento.dataPretendida) || '—'}</dd></div>
          <div><dt>Data confirmada</dt><dd>{casamento.cerimonia.data ? `${dataLegivel(casamento.cerimonia.data)}${casamento.cerimonia.inicio ? ` · ${casamento.cerimonia.inicio}` : ''}` : '—'}</dd></div>
          <div><dt>Próximo compromisso</dt><dd>{proximo ? `${proximo.title} · ${dataLegivel(proximo.startAt)} ${proximo.startAt.slice(11, 16)}` : '—'}</dd></div>
        </dl>
      </div>
      {pedidoComPoucaAntecedencia(casamento) && <div className="alert aviso-atencao" role="status">Pedido com menos de três meses de antecedência.</div>}
      <div className="form-actions">
        {cerimoniaNaAgenda
          ? <Link className="button button--secondary" to={`/app/agenda/${cerimoniaNaAgenda.id}/editar`}>Abrir compromisso na Agenda</Link>
          : <Button type="button" icon={<CalendarPlus />} disabled={busy || casamento.etapa === 'cancelado'} onClick={() => void agendarCasamento()}>Agendar casamento</Button>}
        {casamento.etapa !== 'cancelado' && <Button type="button" variant="danger" disabled={busy} onClick={() => { if (window.confirm('Cancelar este casamento? O histórico, as visitas e os compromissos continuam guardados.')) void salvar('Casamento cancelado', { ...casamento, etapa: 'cancelado' }) }}>Cancelar casamento</Button>}
      </div>
    </Card></section>

    <section id="noivos"><Card title="Dados dos noivos">
      <div className="noivos-do-casamento">
        <CampoDoNoivo papel="noiva" valor={casamento.noiva} onChange={(noiva) => mudar((atual) => ({ ...atual, noiva }))} people={people} churches={churches} />
        <CampoDoNoivo papel="noivo" valor={casamento.noivo} onChange={(noivo) => mudar((atual) => ({ ...atual, noivo }))} people={people} churches={churches} />
      </div>
      <div className="form-grid">
        <Field label="Contato" name="casamento-contato" value={casamento.contato} maxLength={160} onChange={(event) => mudar((atual) => ({ ...atual, contato: event.target.value }))} />
        <Field label="Data do primeiro contato" name="casamento-primeiro-contato" type="date" value={casamento.primeiroContato} onChange={(event) => mudar((atual) => ({ ...atual, primeiroContato: event.target.value }))} />
        <Field label="Data em que solicitaram o casamento" name="casamento-solicitacao" type="date" value={casamento.dataSolicitacao} onChange={(event) => mudar((atual) => ({ ...atual, dataSolicitacao: event.target.value }))} />
        <Field label="Data pretendida" name="casamento-data-pretendida" type="date" value={casamento.dataPretendida} onChange={(event) => mudar((atual) => ({ ...atual, dataPretendida: event.target.value }))} />
        <label className="field"><span className="field__label">Igreja pretendida</span><select className="field__input" value={casamento.igrejaPretendidaId ?? ''} onChange={(event) => mudar((atual) => ({ ...atual, igrejaPretendidaId: event.target.value || null }))}><option value="">Ainda não definida</option>{churches.map((church) => <option key={church.id} value={church.id}>{church.name}</option>)}</select></label>
        <Field label="Local pretendido" name="casamento-local-pretendido" value={casamento.localPretendido} maxLength={160} onChange={(event) => mudar((atual) => ({ ...atual, localPretendido: event.target.value }))} />
        <Field label="Data confirmada" name="casamento-data-confirmada" type="date" value={casamento.cerimonia.data} onChange={(event) => mudar((atual) => ({ ...atual, cerimonia: { ...atual.cerimonia, data: event.target.value } }))} />
        <Field label="Horário de início" name="casamento-inicio" type="time" value={casamento.cerimonia.inicio} onChange={(event) => mudar((atual) => ({ ...atual, cerimonia: { ...atual.cerimonia, inicio: event.target.value } }))} />
        <Field label="Horário de término" name="casamento-fim" type="time" value={casamento.cerimonia.fim} onChange={(event) => mudar((atual) => ({ ...atual, cerimonia: { ...atual.cerimonia, fim: event.target.value } }))} />
        <label className="field"><span className="field__label">Igreja da cerimônia</span><select className="field__input" value={casamento.cerimonia.igrejaId ?? ''} onChange={(event) => mudar((atual) => ({ ...atual, cerimonia: { ...atual.cerimonia, igrejaId: event.target.value || null } }))}><option value="">Não é igreja do distrito</option>{churches.map((church) => <option key={church.id} value={church.id}>{church.name}</option>)}</select></label>
        <Field label="Local da cerimônia" name="casamento-local" value={casamento.cerimonia.local} maxLength={160} onChange={(event) => mudar((atual) => ({ ...atual, cerimonia: { ...atual.cerimonia, local: event.target.value } }))} />
        <Field label="Pastor responsável" name="casamento-pastor-responsavel" value={casamento.pastorResponsavel} maxLength={120} onChange={(event) => mudar((atual) => ({ ...atual, pastorResponsavel: event.target.value }))} />
        <Field label="Pastor oficiante" name="casamento-pastor-oficiante" value={casamento.pastorOficiante} maxLength={120} onChange={(event) => mudar((atual) => ({ ...atual, pastorOficiante: event.target.value }))} />
      </div>
    </Card></section>

    <section id="visitas"><Card title="Visitas e entrevistas">
      <div className="form-actions"><Link className="button button--secondary" to={`/app/visitas/nova?casamento=${casamentoId}`}>Registrar visita</Link></div>
      {visitas.length > 0 && <ul className="entity-list">{visitas.map((visita) => <li key={visita.id}><Link className="entity-row entity-row--link" to={`/app/visitas/${visita.id}`}><span><strong>Visita</strong><small>{dataLegivel(visita.versions.at(-1)!.startAt)}</small></span><span>Abrir</span></Link></li>)}</ul>}
      {eventos.filter(({ papelNoCasamento }) => papelNoCasamento === 'entrevista').map((evento) => <p key={evento.id}><Link className="text-link" to={`/app/agenda/${evento.id}/editar`}>{evento.title} · {dataLegivel(evento.startAt)} {evento.startAt.slice(11, 16)}</Link></p>)}

      {casamento.entrevistas.length > 0 && <div className="entrevistas-registradas">{[...casamento.entrevistas].sort((a, b) => b.data.localeCompare(a.data)).map((entrevista) => <article key={entrevista.id} className="entrevista-registrada">
        <h3>Entrevista de {dataLegivel(entrevista.data)}{entrevista.realizadaPor ? ` · ${entrevista.realizadaPor}` : ''}</h3>
        <dl>{PERGUNTAS_GUARDADAS.map((pergunta) => <div key={pergunta.id}><dt>{pergunta.titulo}</dt><dd>{textoDaResposta(entrevista.respostas[pergunta.id])}</dd></div>)}<div><dt>Curso de noivos</dt><dd>{entrevista.cursoNaData ? SITUACAO_DO_CURSO_LABELS[entrevista.cursoNaData] : 'Pendente'}</dd></div></dl>
      </article>)}</div>}

      <fieldset className="nova-entrevista"><legend>Nova entrevista pastoral</legend>
        <div className="form-grid">
          <Field label="Data da entrevista" name="entrevista-data" type="date" value={novaEntrevista.data} onChange={(event) => setNovaEntrevista((atual) => ({ ...atual, data: event.target.value }))} />
          <Field label="Realizada por" name="entrevista-realizada-por" value={novaEntrevista.realizadaPor} maxLength={120} onChange={(event) => setNovaEntrevista((atual) => ({ ...atual, realizadaPor: event.target.value }))} />
        </div>
        {PERGUNTAS_DA_ENTREVISTA.map((pergunta, indice) => {
          const resposta = pergunta.id === 'curso' ? respostaDoCurso(casamento.curso) : novaEntrevista.respostas[pergunta.id]
          return <div key={pergunta.id} className="pergunta-do-casamento">
            <p><strong>{indice + 1}. {pergunta.titulo}</strong> {resposta === null && <span className="status-pill status-pill--warning">Pendente</span>}</p>
            <p>{pergunta.texto}</p>
            <CampoSimNao rotulo={pergunta.titulo} nome={`entrevista-${pergunta.id}`} valor={resposta === null ? null : resposta === 'sim'}
              onChange={(sim) => pergunta.id === 'curso'
                ? mudar((atual) => ({ ...atual, curso: cursoComResposta(atual.curso, sim ? 'sim' : 'nao', novaEntrevista.data) }))
                : setNovaEntrevista((atual) => ({ ...atual, respostas: { ...atual.respostas, [pergunta.id]: sim ? 'sim' : 'nao' } }))} />
          </div>
        })}
        <Button type="button" disabled={busy || !novaEntrevista.data} onClick={() => void registrarEntrevista()}>Registrar entrevista</Button>
      </fieldset>

      <fieldset className="nova-entrevista"><legend>Agendar entrevista</legend>
        <div className="form-grid">
          <Field label="Data" name="agendar-entrevista-data" type="date" value={agendaDaEntrevista.data} onChange={(event) => setAgendaDaEntrevista((atual) => ({ ...atual, data: event.target.value }))} />
          <Field label="Início" name="agendar-entrevista-inicio" type="time" value={agendaDaEntrevista.inicio} onChange={(event) => setAgendaDaEntrevista((atual) => ({ ...atual, inicio: event.target.value }))} />
          <Field label="Local" name="agendar-entrevista-local" value={agendaDaEntrevista.local} maxLength={160} onChange={(event) => setAgendaDaEntrevista((atual) => ({ ...atual, local: event.target.value }))} />
        </div>
        <Button type="button" variant="secondary" icon={<CalendarPlus />} disabled={!agendaDaEntrevista.data || !agendaDaEntrevista.inicio} onClick={() => void agendar('entrevista')}>Agendar entrevista</Button>
      </fieldset>
    </Card></section>

    <section id="curso"><Card title="Curso de noivos">
      <div className="form-grid">
        <label className="field"><span className="field__label">Situação do curso</span><select className="field__input" value={casamento.curso.situacao ?? ''} onChange={(event) => mudar((atual) => ({ ...atual, curso: { ...atual.curso, situacao: (event.target.value || null) as SituacaoDoCurso | null, dataConclusao: event.target.value === 'concluido' ? atual.curso.dataConclusao : '' } }))}><option value="">Pendente</option>{(Object.keys(SITUACAO_DO_CURSO_LABELS) as SituacaoDoCurso[]).map((item) => <option key={item} value={item}>{SITUACAO_DO_CURSO_LABELS[item]}</option>)}</select></label>
        {casamento.curso.situacao === 'concluido' && <Field label="Data da conclusão" name="curso-conclusao" type="date" value={casamento.curso.dataConclusao} onChange={(event) => mudar((atual) => ({ ...atual, curso: { ...atual.curso, dataConclusao: event.target.value } }))} />}
        <Field label="Local do curso" name="curso-local" value={casamento.curso.local} maxLength={160} onChange={(event) => mudar((atual) => ({ ...atual, curso: { ...atual.curso, local: event.target.value } }))} />
        <Field label="Responsável pelo curso" name="curso-responsavel" value={casamento.curso.responsavel} maxLength={120} onChange={(event) => mudar((atual) => ({ ...atual, curso: { ...atual.curso, responsavel: event.target.value } }))} />
      </div>
    </Card></section>

    <section id="documentos"><Card title="Documentos e casamento civil">
      <div className="form-grid">
        <Field label="Data do casamento civil" name="civil-data" type="date" value={casamento.civil.data} onChange={(event) => mudar((atual) => ({ ...atual, civil: { ...atual.civil, data: event.target.value } }))} />
        <Field label="Cartório" name="civil-cartorio" value={casamento.civil.cartorio} maxLength={160} onChange={(event) => mudar((atual) => ({ ...atual, civil: { ...atual.civil, cartorio: event.target.value } }))} />
      </div>
      <CampoSimNao rotulo="Haverá efeito civil na cerimônia?" nome="civil-efeito" valor={casamento.civil.efeitoCivil} onChange={(efeitoCivil) => mudar((atual) => ({ ...atual, civil: { ...atual.civil, efeitoCivil } }))} />
    </Card></section>

    <section id="comissao"><Card title="Comissão da igreja">
      <div className="form-grid">
        <label className="field"><span className="field__label">Igreja da comissão</span><select className="field__input" value={casamento.comissao.igrejaId ?? ''} onChange={(event) => { setReuniaoEscolhida(''); mudar((atual) => ({ ...atual, comissao: { ...atual.comissao, igrejaId: event.target.value || null } })) }}><option value="">Selecione</option>{churches.map((church) => <option key={church.id} value={church.id}>{church.name}</option>)}</select></label>
        <label className="field"><span className="field__label">Reunião de comissão</span><select className="field__input" value={reuniaoEscolhida} onChange={(event) => setReuniaoEscolhida(event.target.value)}><option value="">Nenhuma</option>{reunioesDaIgreja.map((reuniao) => <option key={reuniao.id} value={reuniao.id}>{reuniao.kind === 'board' ? 'Comissão Diretiva' : 'Comissão Administrativa'} · {dataLegivel(reuniao.date) || 'sem data'}</option>)}</select></label>
      </div>
      <div className="form-actions">
        <Button type="button" variant="secondary" disabled={reuniaoEscolhida === (casamento.comissao.meetingId ?? '')} onClick={() => void vincularReuniao()}>Vincular reunião</Button>
        {casamento.comissao.meetingId && <Link className="text-link" to={`/app/comissoes/${casamento.comissao.meetingId}`}>Abrir reunião de comissão</Link>}
      </div>
      <div className="form-grid">
        <label className="field"><span className="field__label">Situação da comissão</span><select className="field__input" value={casamento.comissao.situacao} onChange={(event) => mudar((atual) => ({ ...atual, comissao: { ...atual.comissao, situacao: event.target.value as SituacaoDaComissao } }))}>{(Object.keys(SITUACAO_DA_COMISSAO_LABELS) as SituacaoDaComissao[]).map((item) => <option key={item} value={item}>{SITUACAO_DA_COMISSAO_LABELS[item]}</option>)}</select></label>
        <Field label="Data da comissão" name="comissao-data" type="date" value={casamento.comissao.data} onChange={(event) => mudar((atual) => ({ ...atual, comissao: { ...atual.comissao, data: event.target.value } }))} />
        <Field label="Número ou identificação do voto" name="comissao-voto" value={casamento.comissao.voto} maxLength={80} onChange={(event) => mudar((atual) => ({ ...atual, comissao: { ...atual.comissao, voto: event.target.value } }))} />
      </div>
      <CampoSimNao rotulo="É necessária carta de recomendação?" nome="comissao-carta" valor={casamento.comissao.precisaCarta} onChange={(precisaCarta) => mudar((atual) => ({ ...atual, comissao: { ...atual.comissao, precisaCarta, carta: precisaCarta ? atual.comissao.carta ?? 'pendente' : null } }))} />
      {casamento.comissao.precisaCarta && <label className="field"><span className="field__label">Carta de recomendação</span><select className="field__input" value={casamento.comissao.carta ?? 'pendente'} onChange={(event) => mudar((atual) => ({ ...atual, comissao: { ...atual.comissao, carta: event.target.value as SituacaoDaCarta } }))}>{(Object.keys(SITUACAO_DA_CARTA_LABELS) as SituacaoDaCarta[]).map((item) => <option key={item} value={item}>{SITUACAO_DA_CARTA_LABELS[item]}</option>)}</select></label>}
      {recomendacao && <p className="recomendacao-da-comissao">{recomendacao}</p>}
    </Card></section>

    <section id="orientacoes"><Card title="Orientações ao casal" action={<Button type="button" variant="secondary" icon={<Printer />} onClick={() => previewLocalPdf(`Orientações aos noivos — ${nome}`, [...ORIENTACOES_AOS_NOIVOS])}>Imprimir orientações</Button>}>
      <ul className="orientacoes-casal">{ORIENTACOES_AOS_NOIVOS.map((orientacao) => <li key={orientacao}>{orientacao}</li>)}</ul>
      <CampoSimNao rotulo="Orientações apresentadas" nome="orientacoes-apresentadas" valor={casamento.orientacoes.apresentadas} onChange={(apresentadas) => mudar((atual) => ({ ...atual, orientacoes: { ...atual.orientacoes, apresentadas } }))} />
      <div className="form-grid">
        <Field label="Data das orientações" name="orientacoes-data" type="date" value={casamento.orientacoes.data} onChange={(event) => mudar((atual) => ({ ...atual, orientacoes: { ...atual.orientacoes, data: event.target.value } }))} />
        <Field label="Quem apresentou" name="orientacoes-quem" value={casamento.orientacoes.apresentadasPor} maxLength={120} onChange={(event) => mudar((atual) => ({ ...atual, orientacoes: { ...atual.orientacoes, apresentadasPor: event.target.value } }))} />
      </div>
    </Card></section>

    <section id="cerimonia"><Card title="Preparação da cerimônia">
      <fieldset className="nova-entrevista"><legend>Ensaio</legend>
        <div className="form-grid">
          <Field label="Data do ensaio" name="ensaio-data" type="date" value={casamento.ensaio.data} onChange={(event) => mudar((atual) => ({ ...atual, ensaio: { ...atual.ensaio, data: event.target.value } }))} />
          <Field label="Horário do ensaio" name="ensaio-inicio" type="time" value={casamento.ensaio.inicio} onChange={(event) => mudar((atual) => ({ ...atual, ensaio: { ...atual.ensaio, inicio: event.target.value } }))} />
          <Field label="Local do ensaio" name="ensaio-local" value={casamento.ensaio.local} maxLength={160} onChange={(event) => mudar((atual) => ({ ...atual, ensaio: { ...atual.ensaio, local: event.target.value } }))} />
        </div>
        <div className="form-actions">
          <Button type="button" variant="secondary" icon={<CalendarPlus />} disabled={!casamento.ensaio.data || !casamento.ensaio.inicio} onClick={() => void agendar('ensaio')}>{ensaioNaAgenda ? 'Alterar ensaio na Agenda' : 'Agendar ensaio'}</Button>
          {ensaioNaAgenda && <Link className="text-link" to={`/app/agenda/${ensaioNaAgenda.id}/editar`}>Abrir ensaio na Agenda</Link>}
        </div>
      </fieldset>
      <div className="table-scroll"><table className="checklist-casamento">
        <thead><tr><th scope="col">Item</th><th scope="col">Situação</th><th scope="col">Data</th></tr></thead>
        <tbody>{itens.map((item) => <tr key={item.id}>
          <th scope="row">{item.rotulo}</th>
          <td>{item.derivado
            ? <span className={`status-pill ${item.situacao === 'pendente' ? 'status-pill--warning' : 'status-pill--success'}`}>{SITUACAO_DO_ITEM_LABELS[item.situacao]}</span>
            : <select className="field__input" aria-label={`Situação: ${item.rotulo}`} value={item.situacao} onChange={(event) => mudarItem(item.id as ItemManual, { situacao: event.target.value as SituacaoDoItem })}>{(Object.keys(SITUACAO_DO_ITEM_LABELS) as SituacaoDoItem[]).map((situacaoDoItem) => <option key={situacaoDoItem} value={situacaoDoItem}>{SITUACAO_DO_ITEM_LABELS[situacaoDoItem]}</option>)}</select>}</td>
          <td>{item.derivado ? dataLegivel(item.data) || '—' : <input className="field__input" type="date" aria-label={`Data: ${item.rotulo}`} value={item.data} onChange={(event) => mudarItem(item.id as ItemManual, { data: event.target.value })} />}</td>
        </tr>)}</tbody>
      </table></div>
    </Card></section>

    <section id="historico"><Card title="Histórico e pendências">
      <h3>Pendências</h3>
      {pendentes.length ? <ul className="pendencias-casamento">{pendentes.map((pendencia) => <li key={pendencia}>{pendencia}</li>)}</ul> : <p>Nenhuma pendência.</p>}
      <h3>Histórico</h3>
      <ol className="historico-casamento">{linhaDoTempo.map((item) => <li key={item.id}><time>{dataLegivel(item.quando)}</time><span>{item.texto}</span></li>)}</ol>
    </Card></section>

    <div className="form-actions form-actions--sticky">
      <Button type="button" disabled={busy} onClick={() => void salvar()}>{busy ? 'Salvando…' : 'Salvar acompanhamento'}</Button>
    </div>
  </div>
}
