import { useReloadOnSync } from '../sync/useReloadOnSync'
import { ArrowDown, ArrowLeft, ArrowUp, Plus, Trash2, TriangleAlert } from 'lucide-react'
import { type FormEvent, useCallback, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { responsaveisPadraoDaCeia } from '../agenda/ceia'
import {
  aplicarEscolhaDeIgreja, casamentoVazio, ceiaVazia, comissaoVazia, dedicacaoDoLegado, detalhesAoTrocarCategoria,
  encontroVazio, igrejasDoCompromisso, pedeTitulo, pessoalVazio, tituloGerado, tituloParaGravar, usaObservacoes, usaPessoaOuFamilia,
} from '../agenda/detalhes'
import { AgendaService, findAgendaConflicts, isMonday } from '../agenda/service'
import {
  AGENDA_CATEGORY_LABELS, CATEGORIAS_PESSOAIS, CEREMONY_CHECKLISTS, ITEM_DA_CEIA_LABELS, NEW_EVENT_CATEGORIES,
  categoryDefaults, emptyCeremonyDetails, endFollowingStart, isCeremonyCategory, isEncontroCategory, localDateTime,
  type AgendaCategory, type AgendaEventEntity, type AgendaEventInput, type AndamentoDaPauta, type CeremonyDetails,
  type ComoDoPessoal, type DetalhesDaCeia, type DetalhesDaComissao, type DetalhesDaDedicacao, type DetalhesDoCasamento,
  type DetalhesDoPessoal, type EscolhaDeIgreja, type ItemDaCeia, type PapelNaCeia, type TipoDeComissao, type TipoDeConcilio,
} from '../agenda/types'
import { VinculoAgendaComissao } from '../agenda/vinculoComissao'
import { useAuthVault } from '../auth/AuthVaultContext'
import { BuscaDeNomes, CamposDeEncontro, Escolha, SeletorDeIgreja, SimNao } from '../components/agenda/CamposDaAgenda'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Field } from '../components/ui/Field'
import { DistrictService } from '../district/service'
import type { ChurchEntity } from '../district/types'
import { EvangelismPlanningService } from '../evangelism/service'
import { FamilyService } from '../families/service'
import type { FamilyEntity } from '../families/types'
import { NominationService } from '../nominations/service'
import type { NominationProcessEntity } from '../nominations/types'
import { PeopleService } from '../people/service'
import type { PersonEntity } from '../people/types'
import { SermonService } from '../sermons/service'
import type { SermonEntity } from '../sermons/types'

const agenda = new AgendaService(); const districts = new DistrictService(); const sermonsService = new SermonService(); const peopleService = new PeopleService(); const evangelism = new EvangelismPlanningService()
const familiesService = new FamilyService(); const nominations = new NominationService(); const vinculo = new VinculoAgendaComissao()

function initialInput(startAt?: string): AgendaEventInput {
  const defaults = categoryDefaults('visit', startAt ? new Date(startAt) : new Date())
  const validStart = startAt && Number.isFinite(new Date(startAt).getTime()) ? startAt : defaults.startAt
  const endAt = localDateTime(new Date(new Date(validStart).getTime() + 60 * 60_000))
  return { title: '', category: 'visit', churchId: null, location: '', address: '', visitTarget: 'none', sermonId: null, sermonSnapshot: null, ceremonyDetails: null, ...defaults, startAt: validStart, endAt, notes: '', mondayException: false }
}

const ESCOLHAS_DE_IGREJA: ReadonlyArray<{ valor: EscolhaDeIgreja; rotulo: string }> = [
  { valor: 'uma', rotulo: 'Uma igreja do distrito' }, { valor: 'todas', rotulo: 'Todas as igrejas — evento distrital' },
  { valor: 'varias', rotulo: 'Duas ou mais igrejas' }, { valor: 'outra', rotulo: 'Outra igreja' },
]
const TIPOS_DE_COMISSAO: ReadonlyArray<{ valor: TipoDeComissao; rotulo: string }> = [
  { valor: 'diretiva', rotulo: 'Diretiva' }, { valor: 'administrativa', rotulo: 'Administrativa' }, { valor: 'nomeacoes', rotulo: 'Nomeações' }, { valor: 'outra', rotulo: 'Outra' },
]
const TIPOS_DE_CONCILIO: ReadonlyArray<{ valor: TipoDeConcilio; rotulo: string }> = [{ valor: 'concilio', rotulo: 'Concílio' }, { valor: 'pgp', rotulo: 'PGP' }]
const COMO_PESSOAL: ReadonlyArray<{ valor: ComoDoPessoal; rotulo: string }> = [
  { valor: 'presencial', rotulo: 'Presencial' }, { valor: 'online', rotulo: 'Online' }, { valor: 'telefone', rotulo: 'Telefone' }, { valor: 'outra', rotulo: 'Outra forma' },
]
const ANDAMENTOS: Record<AndamentoDaPauta, string> = { pendente: 'Pendente', em_andamento: 'Em andamento', concluida: 'Concluída' }
const PAPEIS_DA_CEIA: Record<PapelNaCeia, string> = { primeiro_diacono: 'Primeiro diácono', primeira_diaconisa: 'Primeira diaconisa', outro: 'Responsável' }
const ITENS_DA_CEIA = Object.keys(ITEM_DA_CEIA_LABELS) as ItemDaCeia[]
const semAcento = (valor: string) => valor.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('pt-BR').trim()

export function AgendaFormPage() {
  const { account, masterKey } = useAuthVault(); const { eventId } = useParams(); const [searchParams] = useSearchParams(); const navigate = useNavigate()
  const [input, setInput] = useState(() => initialInput(searchParams.get('inicio') ?? undefined))
  const [original, setOriginal] = useState<AgendaEventEntity | null>(null)
  const [events, setEvents] = useState<AgendaEventEntity[]>([]); const [churches, setChurches] = useState<ChurchEntity[]>([]); const [sermons, setSermons] = useState<SermonEntity[]>([])
  const [people, setPeople] = useState<PersonEntity[]>([]); const [families, setFamilies] = useState<FamilyEntity[]>([]); const [processos, setProcessos] = useState<NominationProcessEntity[]>([])
  const [error, setError] = useState(''); const [outraIgreja, setOutraIgreja] = useState(false); const [busy, setBusy] = useState(false)
  const [naoMembro, setNaoMembro] = useState<string | null>(null); const [novaPauta, setNovaPauta] = useState('')
  const dirty = useRef(false)

  const load = useCallback(async () => {
    if (!account || !masterKey) return
    const district = await districts.getDistrict(account.id, masterKey)
    const [nextEvents, nextChurches, current, nextSermons, nextPeople, nextFamilies, nextProcessos] = await Promise.all([
      agenda.listEvents(account.id, masterKey), district ? districts.listChurches(account.id, masterKey, district.id) : [],
      eventId ? agenda.getEvent(account.id, masterKey, eventId) : null, sermonsService.list(account.id, masterKey),
      peopleService.listPeople(account.id, masterKey), familiesService.listFamilies(account.id, masterKey), nominations.list(account.id, masterKey),
    ])
    setEvents(nextEvents); setChurches(nextChurches); setSermons(nextSermons); setPeople(nextPeople); setFamilies(nextFamilies); setProcessos(nextProcessos)
    if (current && !dirty.current) {
      const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...data } = current; void _id; void _createdAt; void _updatedAt
      setOriginal(current); setInput(data)
      setOutraIgreja(isCeremonyCategory(data.category) && !data.churchId && Boolean(data.location.trim()))
    }
  }, [account, eventId, masterKey])
  const hasUnsavedChanges = useCallback(() => dirty.current, [])
  useReloadOnSync(load, hasUnsavedChanges, () => { if (window.confirm('Chegaram alterações de outro aparelho. Seu preenchimento foi preservado. Deseja descartá-lo e carregar a versão sincronizada?')) { dirty.current = false; void load() } })
  const conflicts = useMemo(() => { try { return findAgendaConflicts(input, events, eventId) } catch { return [] } }, [eventId, events, input])

  function patch(changes: Partial<AgendaEventInput>) { dirty.current = true; setInput((current) => ({ ...current, ...changes })) }
  function mudar(transformar: (current: AgendaEventInput) => AgendaEventInput) { dirty.current = true; setInput(transformar) }
  const nomeDaPessoa = useCallback((personId: string) => people.find(({ id }) => id === personId)?.name ?? '', [people])

  /* Data, início e término: mudar a data ou o início leva o término junto, preservando a duração. */
  const data = input.startAt.slice(0, 10); const inicio = input.startAt.slice(11, 16); const fim = input.endAt.slice(11, 16); const dataFim = input.endAt.slice(0, 10)
  function mudarInicioPara(novoInicio: string) { mudar((current) => ({ ...current, startAt: novoInicio, endAt: endFollowingStart(current.startAt, current.endAt, novoInicio) })) }

  function changeCategory(category: AgendaCategory) {
    mudar((current) => {
      const padroes = categoryDefaults(category, new Date(current.startAt))
      const limpo = detalhesAoTrocarCategoria(current, category)
      return {
        ...limpo,
        ...(eventId ? {} : padroes),
        allDay: false,
        sermonId: category === 'preaching' ? current.sermonId : null,
        sermonSnapshot: category === 'preaching' ? current.sermonSnapshot : null,
        ceremonyDetails: isCeremonyCategory(category) ? current.category === category ? current.ceremonyDetails ?? null : emptyCeremonyDetails(category) : null,
        churchId: isEncontroCategory(category) || category === 'personal' ? null : current.churchId,
        location: category === 'personal' ? '' : current.location,
      }
    })
    setOutraIgreja(false); setNaoMembro(null)
  }

  function escolherIgreja(churchId: string | null) {
    const vinhaDeOutra = outraIgreja
    mudar((current) => {
      const proximo: AgendaEventInput = { ...current, churchId, ...(vinhaDeOutra ? { location: '' } : {}) }
      const ceia = current.ceia ?? ceiaVazia()
      if (current.category === 'communion' && ceia.responsaveis.every((item) => !item.personId && !item.nome.trim())) {
        proximo.ceia = { ...ceia, responsaveis: responsaveisPadraoDaCeia(churchId, processos, people) }
      }
      return proximo
    })
    setOutraIgreja(false)
  }
  function escolherOutraIgreja() { setOutraIgreja(true); patch({ churchId: null, location: '' }) }

  function chooseSermon(id: string) { const sermon = sermons.find((item) => item.id === id); patch({ sermonId: sermon?.id ?? null, sermonSnapshot: sermon ? { id: sermon.id, title: sermon.title, theme: sermon.theme, mainText: sermon.mainText } : null }) }
  function setCeremony(changes: Partial<CeremonyDetails>) { const category = input.category; if (!isCeremonyCategory(category)) return; mudar((current) => ({ ...current, ceremonyDetails: { ...(current.ceremonyDetails ?? emptyCeremonyDetails(category)), ...changes } })) }

  /* Pregação: o que a tela mostra para um compromisso antigo, que só tinha `churchId` ou o nome do lugar. */
  const escolhaDaPregacao: EscolhaDeIgreja | null = input.escolhaDeIgreja ?? (input.churchId ? 'uma' : input.location.trim() ? 'outra' : null)

  const comissao = input.comissao ?? comissaoVazia()
  function mudarComissao(changes: Partial<DetalhesDaComissao>) { mudar((current) => ({ ...current, comissao: { ...(current.comissao ?? comissaoVazia()), ...changes } })) }
  function adicionarPauta() {
    const titulo = novaPauta.trim(); if (!titulo) return
    mudarComissao({ pautas: [...(comissao.pautas ?? []), { id: crypto.randomUUID(), titulo, andamento: 'pendente' }] }); setNovaPauta('')
  }
  function moverPauta(indice: number, direcao: -1 | 1) {
    const pautas = [...(comissao.pautas ?? [])]; const destino = indice + direcao
    if (destino < 0 || destino >= pautas.length) return
    ;[pautas[indice], pautas[destino]] = [pautas[destino]!, pautas[indice]!]
    mudarComissao({ pautas })
  }

  /* Ceia do Senhor: sem nada escolhido, os responsáveis vêm dos registros da igreja. */
  const ceia = input.ceia ?? ceiaVazia()
  const responsaveisDaCeia = ceia.responsaveis.length ? ceia.responsaveis : responsaveisPadraoDaCeia(input.churchId, processos, people)
  function mudarCeia(transformar: (atual: DetalhesDaCeia) => DetalhesDaCeia) {
    mudar((current) => {
      const atual = current.ceia ?? ceiaVazia()
      return { ...current, ceia: transformar(atual.responsaveis.length ? atual : { ...atual, responsaveis: responsaveisPadraoDaCeia(current.churchId, processos, people) }) }
    })
  }
  const pessoasDaIgreja = people.filter((person) => !input.churchId || person.currentChurchId === input.churchId)
  function nomearResponsavel(indice: number, nome: string) {
    const pessoa = pessoasDaIgreja.find((item) => semAcento(item.name) === semAcento(nome))
    mudarCeia((atual) => ({ ...atual, responsaveis: atual.responsaveis.map((item, posicao) => posicao === indice ? { ...item, nome, personId: pessoa?.id ?? null } : item) }))
  }

  const casamento = input.casamento ?? casamentoVazio()
  function mudarCasamento(changes: Partial<DetalhesDoCasamento>) { mudar((current) => ({ ...current, casamento: { ...(current.casamento ?? casamentoVazio()), ...changes } })) }

  const dedicacao = input.dedicacao ?? dedicacaoDoLegado(input.ceremonyDetails, nomeDaPessoa)
  function mudarDedicacao(transformar: (atual: DetalhesDaDedicacao) => DetalhesDaDedicacao) {
    mudar((current) => ({ ...current, dedicacao: transformar(current.dedicacao ?? dedicacaoDoLegado(current.ceremonyDetails, nomeDaPessoa)) }))
  }
  function adicionarNaoMembro() {
    const nome = naoMembro?.trim(); if (!nome) return
    mudarDedicacao((atual) => ({ ...atual, responsaveis: [...atual.responsaveis, { personId: null, nome }] })); setNaoMembro(null)
  }
  const chaveDoResponsavel = (item: DetalhesDaDedicacao['responsaveis'][number], indice: number) => item.personId ? `p:${item.personId}` : `n:${indice}`

  const pessoal = input.pessoal ?? pessoalVazio()
  const categoriaPessoal = CATEGORIAS_PESSOAIS.find(({ id }) => id === pessoal.categoria)
  function mudarPessoal(changes: Partial<DetalhesDoPessoal>) { mudar((current) => ({ ...current, pessoal: { ...(current.pessoal ?? pessoalVazio()), ...changes } })) }

  const opcoesDeQuem = useMemo(() => [
    ...people.map((person) => ({ id: `p:${person.id}`, nome: person.name, detalhe: 'Pessoa' })),
    ...families.map((family) => ({ id: `f:${family.id}`, nome: family.name, detalhe: 'Família' })),
  ], [families, people])
  const quem = input.pessoaId ? `p:${input.pessoaId}` : input.familiaId ? `f:${input.familiaId}` : null
  const igrejasAtivas = churches.filter(({ status }) => status !== 'archived')
  const nomeDaIgreja = (id: string) => churches.find((church) => church.id === id)?.name ?? ''

  /**
   * Excluir também aqui, e não só na lista.
   *
   * Quem abre o compromisso para mexer nele procura o apagar ali dentro. A
   * confirmação é a mesma da lista: apagar compromisso é exclusão de dado.
   */
  async function excluir() {
    if (!account || !masterKey || !eventId) return
    if (!window.confirm('Remover este compromisso?')) return
    setBusy(true)
    setError('')
    try {
      await agenda.deleteEvent(account.id, masterKey, eventId)
      await navigate('/app/agenda')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível remover o compromisso.')
      setBusy(false)
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault(); if (!account || !masterKey) return
    setBusy(true); setError('')
    try {
      const category = input.category
      let paraGravar: AgendaEventInput = { ...input, allDay: category === 'travel' ? input.allDay : false }
      if (category === 'preaching') paraGravar = { ...paraGravar, escolhaDeIgreja: escolhaDaPregacao, churchIds: escolhaDaPregacao === 'outra' ? [] : igrejasDoCompromisso(paraGravar) }
      if (category === 'committee') paraGravar.comissao = comissao
      if (category === 'communion') paraGravar.ceia = { ...ceia, responsaveis: responsaveisDaCeia }
      if (category === 'wedding') paraGravar.casamento = { ...casamento, dataReligiosa: data }
      if (category === 'child_dedication') paraGravar.dedicacao = dedicacao
      if (category === 'personal') paraGravar.pessoal = pessoal
      if (isEncontroCategory(category)) paraGravar.encontro = input.encontro ?? encontroVazio(category)
      const contexto = { churches, pessoaNome: input.pessoaId ? nomeDaPessoa(input.pessoaId) : undefined, familiaNome: families.find(({ id }) => id === input.familiaId)?.name }
      // O título antigo só é mantido quando foi o pastor quem o escreveu.
      const tituloAnterior = original && original.title !== tituloGerado(original, contexto) ? original.title : ''
      paraGravar.title = tituloParaGravar(paraGravar, contexto, tituloAnterior)
      const saved = eventId ? await agenda.updateEvent(account.id, masterKey, eventId, paraGravar) : await agenda.createEvent(account.id, masterKey, paraGravar)
      if (saved.linkedSource) await evangelism.syncFromAgendaEvent(account.id, masterKey, saved)
      if (saved.category === 'committee') await vinculo.vincular(account.id, masterKey, saved)
      dirty.current = false
      await navigate('/app/agenda')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível salvar o compromisso.')
    } finally { setBusy(false) }
  }

  const category = input.category
  const ceremonyCategory = isCeremonyCategory(category) ? category : null
  const ceremony = ceremonyCategory ? input.ceremonyDetails ?? emptyCeremonyDetails(ceremonyCategory) : null
  // Um compromisso antigo de Viagem continua abrindo com a sua categoria; só não se cria mais.
  const categorias: readonly AgendaCategory[] = (NEW_EVENT_CATEGORIES as readonly AgendaCategory[]).includes(category) ? NEW_EVENT_CATEGORIES : [...NEW_EVENT_CATEGORIES, category]
  const semProcessoDeNomeacoes = category === 'committee' && comissao.tipo === 'nomeacoes' && Boolean(input.churchId) && !comissao.meetingId
    && !processos.some((processo) => processo.churchId === input.churchId && processo.status !== 'archived' && processo.status !== 'completed')
  return <div className="page-stack page-narrow">
    <Link className="text-link back-link" to="/app/agenda"><ArrowLeft />Voltar à agenda</Link>
    <header className="page-hero"><div><p className="eyebrow">Planeje sua rotina</p><h1>{eventId ? 'Editar compromisso' : 'Novo compromisso'}</h1></div></header>
    {error && <div className="alert alert--error" role="alert">{error}</div>}
    <form onSubmit={(formEvent) => void submit(formEvent)}>
      <Card title="Dados do compromisso"><div className="form-grid">
        <label className="field"><span className="field__label">Categoria</span><select className="field__input" value={category} onChange={(changeEvent) => changeCategory(changeEvent.target.value as AgendaCategory)}>{categorias.map((item) => <option key={item} value={item}>{AGENDA_CATEGORY_LABELS[item]}</option>)}</select></label>

        {usaPessoaOuFamilia(category) && <>
          <BuscaDeNomes rotulo="Pessoa ou família" opcoes={opcoesDeQuem} selecionados={quem ? [quem] : []}
            onEscolher={(id) => patch(id.startsWith('p:') ? { pessoaId: id.slice(2), familiaId: null, visitTarget: 'person' } : { familiaId: id.slice(2), pessoaId: null, visitTarget: 'family' })}
            onRemover={() => patch({ pessoaId: null, familiaId: null, visitTarget: 'none' })} />
          <SeletorDeIgreja churches={churches} valor={input.churchId} onChange={escolherIgreja} />
          <Field label="Local" name="agenda-location" value={input.location} onChange={(changeEvent) => patch({ location: changeEvent.target.value })} maxLength={160} />
        </>}

        {category === 'preaching' && <>
          <Escolha rotulo="Onde será a pregação" nome="pregacao-igreja" opcoes={ESCOLHAS_DE_IGREJA} valor={escolhaDaPregacao} obrigatorio
            onChange={(escolha) => mudar((current) => aplicarEscolhaDeIgreja({ ...current, location: escolha === 'outra' && escolhaDaPregacao === 'outra' ? current.location : '' }, escolha, churches))} />
          {escolhaDaPregacao === 'uma' && <SeletorDeIgreja churches={churches} valor={input.churchId} obrigatorio onChange={(churchId) => patch({ churchId, churchIds: churchId ? [churchId] : [] })} />}
          {escolhaDaPregacao === 'todas' && <p className="igrejas-da-pregacao"><strong>Igrejas</strong>{(input.churchIds ?? []).map(nomeDaIgreja).filter(Boolean).join(', ')}</p>}
          {escolhaDaPregacao === 'varias' && <BuscaDeNomes rotulo="Igrejas" multiplo opcoes={igrejasAtivas.map((church) => ({ id: church.id, nome: church.name }))} selecionados={input.churchIds ?? []}
            onEscolher={(id) => mudar((current) => { const ids = [...(current.churchIds ?? []), id]; return { ...current, churchIds: ids, churchId: ids[0] ?? null } })}
            onRemover={(id) => mudar((current) => { const ids = (current.churchIds ?? []).filter((item) => item !== id); return { ...current, churchIds: ids, churchId: ids[0] ?? null } })}
            rotuloDoEscolhido={nomeDaIgreja} />}
          {escolhaDaPregacao === 'outra' && <Field label="Nome da igreja" name="agenda-other-church" value={input.location} onChange={(changeEvent) => patch({ location: changeEvent.target.value })} maxLength={160} required />}
          <label className="field"><span className="field__label">Sermão</span><select className="field__input" value={input.sermonId ?? ''} onChange={(changeEvent) => chooseSermon(changeEvent.target.value)}><option value="">Pregar sem sermão escolhido</option>{sermons.filter(({ status }) => status !== 'archived').map((sermon) => <option value={sermon.id} key={sermon.id}>{sermon.title} · {sermon.mainText}</option>)}</select></label>
        </>}

        {category === 'committee' && <>
          <Escolha rotulo="Qual comissão?" nome="comissao-tipo" opcoes={TIPOS_DE_COMISSAO} valor={comissao.tipo} obrigatorio
            onChange={(tipo) => mudarComissao({ tipo, outraNome: tipo === 'outra' ? comissao.outraNome : '', pautas: tipo === 'outra' ? comissao.pautas ?? [] : [], meetingId: null, processId: null })} />
          {comissao.tipo === 'outra' && <Field label="Nome da comissão" name="comissao-nome" value={comissao.outraNome} onChange={(changeEvent) => mudarComissao({ outraNome: changeEvent.target.value })} maxLength={120} required />}
          <SeletorDeIgreja churches={churches} valor={input.churchId} obrigatorio={comissao.tipo !== 'outra'} onChange={escolherIgreja} />
          <Field label="Local" name="agenda-location" value={input.location} onChange={(changeEvent) => patch({ location: changeEvent.target.value })} maxLength={160} />
        </>}

        {category === 'council' && <Escolha rotulo="Tipo" nome="concilio-tipo" opcoes={TIPOS_DE_CONCILIO} valor={input.encontro?.tipoConcilio} obrigatorio
          onChange={(tipoConcilio) => mudar((current) => ({ ...current, encontro: { ...(current.encontro ?? encontroVazio('council')), tipoConcilio } }))} />}
        {(pedeTitulo(category) || category === 'travel') && <Field label="Título" name="agenda-title" value={input.title} onChange={(changeEvent) => patch({ title: changeEvent.target.value })} required maxLength={160} />}
        {isEncontroCategory(category) && <CamposDeEncontro input={input} churches={churches} onChange={patch} />}
        {(category === 'other' || category === 'travel') && <>
          {category === 'other' && <SeletorDeIgreja churches={churches} valor={input.churchId} onChange={escolherIgreja} />}
          <Field label="Local" name="agenda-location" value={input.location} onChange={(changeEvent) => patch({ location: changeEvent.target.value })} maxLength={160} />
          {category === 'travel' && <Field label="Endereço" name="agenda-address" value={input.address} onChange={(changeEvent) => patch({ address: changeEvent.target.value })} maxLength={300} />}
        </>}

        {ceremonyCategory && <>
          <SeletorDeIgreja churches={churches} valor={input.churchId} obrigatorio outra={outraIgreja} onOutra={escolherOutraIgreja} onChange={escolherIgreja} />
          {outraIgreja && <Field label="Nome da igreja" name="agenda-other-church" value={input.location} onChange={(changeEvent) => patch({ location: changeEvent.target.value })} maxLength={160} required />}
          {category === 'wedding' && <Field label="Local" name="agenda-address" value={input.address} onChange={(changeEvent) => patch({ address: changeEvent.target.value })} maxLength={300} />}
        </>}

        {category === 'personal' && <>
          <label className="field"><span className="field__label">Categoria pessoal</span><select className="field__input" required value={pessoal.categoria} onChange={(changeEvent) => mudarPessoal({ categoria: changeEvent.target.value, subcategoria: '', outro: '' })}><option value="">Selecione</option>{CATEGORIAS_PESSOAIS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
          {categoriaPessoal && categoriaPessoal.subcategorias.length > 0 && <label className="field"><span className="field__label">Subcategoria</span><select className="field__input" required value={pessoal.subcategoria} onChange={(changeEvent) => mudarPessoal({ subcategoria: changeEvent.target.value, outro: changeEvent.target.value === 'Outro' ? pessoal.outro : '' })}><option value="">Selecione</option>{categoriaPessoal.subcategorias.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>}
          {(pessoal.categoria === 'outro' || pessoal.subcategoria === 'Outro') && <Field label="Qual?" name="pessoal-outro" value={pessoal.outro} onChange={(changeEvent) => mudarPessoal({ outro: changeEvent.target.value })} maxLength={120} required />}
          <Field label="O que precisa ser feito" name="pessoal-o-que" value={pessoal.oQue} onChange={(changeEvent) => mudarPessoal({ oQue: changeEvent.target.value })} maxLength={160} required />
          <Field label="Onde" name="pessoal-onde" value={pessoal.onde} onChange={(changeEvent) => mudarPessoal({ onde: changeEvent.target.value })} maxLength={160} />
          <Escolha rotulo="Como" nome="pessoal-como" opcoes={COMO_PESSOAL} valor={pessoal.como} onChange={(como) => mudarPessoal({ como, comoOutro: como === 'outra' ? pessoal.comoOutro : '' })} />
          {pessoal.como === 'outra' && <Field label="Como será?" name="pessoal-como-outro" value={pessoal.comoOutro} onChange={(changeEvent) => mudarPessoal({ comoOutro: changeEvent.target.value })} maxLength={120} required />}
        </>}

        <Field label={category === 'wedding' ? 'Data religiosa' : 'Data'} name="agenda-date" type="date" value={data} required onChange={(changeEvent) => { if (changeEvent.target.value) mudarInicioPara(`${changeEvent.target.value}T${inicio}`) }} />
        <Field label="Início" name="agenda-start" type="time" value={inicio} required onChange={(changeEvent) => { if (changeEvent.target.value) mudarInicioPara(`${data}T${changeEvent.target.value}`) }} />
        <Field label="Término" name="agenda-end" type="time" value={fim} required onChange={(changeEvent) => { if (changeEvent.target.value) patch({ endAt: `${dataFim}T${changeEvent.target.value}` }) }} />
        {dataFim !== data && <Field label="Data de término" name="agenda-end-date" type="date" value={dataFim} required onChange={(changeEvent) => { if (changeEvent.target.value) patch({ endAt: `${changeEvent.target.value}T${fim}` }) }} />}
        <Field label="Lembrete em minutos" name="agenda-reminder" type="number" min={0} value={input.reminderMinutes ?? ''} onChange={(changeEvent) => patch({ reminderMinutes: changeEvent.target.value === '' ? null : Number(changeEvent.target.value) })} />
      </div>
      {usaObservacoes(category) && <label className="field"><span className="field__label">Observações</span><textarea className="field__input" rows={4} value={input.notes} onChange={(changeEvent) => patch({ notes: changeEvent.target.value })} maxLength={2000} /></label>}
      {!usaObservacoes(category) && input.notes.trim() && <div className="field anotacao-anterior"><span className="field__label">Anotação anterior</span><p>{input.notes}</p></div>}
      {isMonday(input.startAt) && <p className="field__hint">Segunda-feira é seu dia de folga.</p>}
      </Card>

      {category === 'committee' && (comissao.tipo === 'outra' || (eventId && comissao.meetingId) || semProcessoDeNomeacoes) && <Card title={comissao.tipo === 'outra' ? comissao.outraNome.trim() || 'Comissão' : 'Comissão'}>
        {semProcessoDeNomeacoes && <div className="alert" role="status">Sem processo de nomeações aberto nesta igreja. <Link className="text-link" to="/app/comissoes/nomeacoes">Abrir Nomeações</Link></div>}
        {eventId && comissao.meetingId && comissao.tipo !== 'outra' && <Link className="button button--secondary" to={comissao.tipo === 'nomeacoes' && comissao.processId ? `/app/comissoes/nomeacoes/${comissao.processId}` : `/app/comissoes/${comissao.meetingId}`}>Abrir comissão</Link>}
        {comissao.tipo === 'outra' && <fieldset className="pautas-comissao"><legend>Pautas</legend>
          {(comissao.pautas ?? []).length > 0 && <ol>{(comissao.pautas ?? []).map((pauta, indice, pautas) => <li key={pauta.id}>
            <Field label={`Pauta ${indice + 1}`} name={`pauta-${pauta.id}`} value={pauta.titulo} maxLength={200} onChange={(changeEvent) => mudarComissao({ pautas: pautas.map((item) => item.id === pauta.id ? { ...item, titulo: changeEvent.target.value } : item) })} />
            <label className="field"><span className="field__label">Andamento da pauta {indice + 1}</span><select className="field__input" value={pauta.andamento} onChange={(changeEvent) => mudarComissao({ pautas: pautas.map((item) => item.id === pauta.id ? { ...item, andamento: changeEvent.target.value as AndamentoDaPauta } : item) })}>{(Object.keys(ANDAMENTOS) as AndamentoDaPauta[]).map((andamento) => <option key={andamento} value={andamento}>{ANDAMENTOS[andamento]}</option>)}</select></label>
            <div className="pautas-comissao__acoes">
              <button type="button" className="icon-button" aria-label={`Subir pauta ${indice + 1}`} disabled={indice === 0} onClick={() => moverPauta(indice, -1)}><ArrowUp /></button>
              <button type="button" className="icon-button" aria-label={`Descer pauta ${indice + 1}`} disabled={indice === pautas.length - 1} onClick={() => moverPauta(indice, 1)}><ArrowDown /></button>
              <button type="button" className="icon-button danger-icon" aria-label={`Remover pauta ${indice + 1}`} onClick={() => mudarComissao({ pautas: pautas.filter((item) => item.id !== pauta.id) })}><Trash2 /></button>
            </div>
          </li>)}</ol>}
          <div className="pautas-comissao__nova"><Field label="Nova pauta" name="pauta-nova" value={novaPauta} maxLength={200} onChange={(changeEvent) => setNovaPauta(changeEvent.target.value)} onKeyDown={(keyEvent) => { if (keyEvent.key === 'Enter') { keyEvent.preventDefault(); adicionarPauta() } }} /><Button type="button" variant="secondary" icon={<Plus />} disabled={!novaPauta.trim()} onClick={adicionarPauta}>Adicionar pauta</Button></div>
        </fieldset>}
      </Card>}

      {ceremony && ceremonyCategory && <Card title={AGENDA_CATEGORY_LABELS[ceremonyCategory]}>
        {ceremonyCategory === 'communion' && <>
          <fieldset className="ceia-responsaveis"><legend>Responsáveis</legend>
            <datalist id="ceia-pessoas">{pessoasDaIgreja.map((person) => <option key={person.id} value={person.name} />)}</datalist>
            {responsaveisDaCeia.map((responsavel, indice) => <div className="ceia-responsavel" key={`${responsavel.papel}-${indice}`}>
              <Field label={responsavel.papel === 'outro' ? `Responsável ${indice + 1}` : PAPEIS_DA_CEIA[responsavel.papel]} name={`ceia-responsavel-${indice}`} list="ceia-pessoas" value={responsavel.nome} maxLength={120} onChange={(changeEvent) => nomearResponsavel(indice, changeEvent.target.value)} />
              <span className={`status-pill ${responsavel.nome.trim() ? 'status-pill--success' : 'status-pill--warning'}`}>{responsavel.personId ? 'Cadastro' : responsavel.nome.trim() ? 'Nome digitado' : 'Pendente'}</span>
              {responsavel.papel === 'outro' && <button type="button" className="icon-button danger-icon" aria-label={`Remover responsável ${indice + 1}`} onClick={() => mudarCeia((atual) => ({ ...atual, responsaveis: atual.responsaveis.filter((_, posicao) => posicao !== indice) }))}><Trash2 /></button>}
            </div>)}
            <Button type="button" variant="secondary" icon={<Plus />} onClick={() => mudarCeia((atual) => ({ ...atual, responsaveis: [...atual.responsaveis, { papel: 'outro', personId: null, nome: '' }] }))}>Adicionar responsável</Button>
          </fieldset>
          <SimNao rotulo="Materiais completos?" nome="ceia-completos" valor={ceia.materiaisCompletos} onChange={(completos) => mudarCeia((atual) => ({ ...atual, materiaisCompletos: completos, ...(completos ? { precisaProvidenciar: null, materiais: [] } : {}) }))} />
          {ceia.materiaisCompletos === false && <SimNao rotulo="Precisa providenciar?" nome="ceia-providenciar" valor={ceia.precisaProvidenciar} onChange={(precisa) => mudarCeia((atual) => ({ ...atual, precisaProvidenciar: precisa, ...(precisa ? {} : { materiais: [] }) }))} />}
          {ceia.materiaisCompletos === false && ceia.precisaProvidenciar && <fieldset className="ceia-materiais"><legend>O que providenciar</legend>
            {ITENS_DA_CEIA.map((item) => { const material = ceia.materiais.find((atual) => atual.item === item); const rotulo = ITEM_DA_CEIA_LABELS[item]; return <div className="ceia-material" key={item}>
              <label className="confirmation-check"><input type="checkbox" checked={Boolean(material)} onChange={(changeEvent) => mudarCeia((atual) => ({ ...atual, materiais: changeEvent.target.checked ? [...atual.materiais, { item, quantidade: null, outro: '' }] : atual.materiais.filter((existente) => existente.item !== item) }))} /><span>{rotulo}</span></label>
              {material && item === 'outro' && <Field label="Qual material?" name="ceia-outro" value={material.outro} maxLength={120} required onChange={(changeEvent) => mudarCeia((atual) => ({ ...atual, materiais: atual.materiais.map((existente) => existente.item === item ? { ...existente, outro: changeEvent.target.value } : existente) }))} />}
              {material && <Field label={item === 'outro' ? 'Quantidade do outro material' : `Quantidade de ${rotulo.toLocaleLowerCase('pt-BR')}`} name={`ceia-quantidade-${item}`} type="number" min={0} value={material.quantidade ?? ''} onChange={(changeEvent) => mudarCeia((atual) => ({ ...atual, materiais: atual.materiais.map((existente) => existente.item === item ? { ...existente, quantidade: changeEvent.target.value === '' ? null : Number(changeEvent.target.value) } : existente) }))} />}
            </div> })}
          </fieldset>}
        </>}

        {ceremonyCategory === 'wedding' && <div className="form-grid">
          <Field label="Noivo" name="casamento-noivo" value={casamento.noivo} maxLength={120} required onChange={(changeEvent) => mudarCasamento({ noivo: changeEvent.target.value })} />
          <Field label="Noiva" name="casamento-noiva" value={casamento.noiva} maxLength={120} required onChange={(changeEvent) => mudarCasamento({ noiva: changeEvent.target.value })} />
          <SimNao rotulo="Fez o curso de noivos?" nome="casamento-curso" valor={casamento.cursoDeNoivos} onChange={(cursoDeNoivos) => mudarCasamento({ cursoDeNoivos })} />
          <SimNao rotulo="Passou pela comissão?" nome="casamento-comissao" valor={casamento.passouPelaComissao} onChange={(passouPelaComissao) => mudarCasamento({ passouPelaComissao })} />
          <Field label="Data civil" name="casamento-data-civil" type="date" value={casamento.dataCivil} onChange={(changeEvent) => mudarCasamento({ dataCivil: changeEvent.target.value })} />
        </div>}

        {ceremonyCategory === 'child_dedication' && <>
          <Field label="Nome da criança" name="dedicacao-crianca" value={dedicacao.crianca} maxLength={120} required onChange={(changeEvent) => mudarDedicacao((atual) => ({ ...atual, crianca: changeEvent.target.value }))} />
          <BuscaDeNomes rotulo="Pais ou responsáveis" multiplo
            opcoes={people.map((person) => ({ id: `p:${person.id}`, nome: person.name, ...(person.currentChurchId ? { detalhe: nomeDaIgreja(person.currentChurchId) } : {}) }))}
            selecionados={dedicacao.responsaveis.map(chaveDoResponsavel)}
            rotuloDoEscolhido={(chave) => dedicacao.responsaveis.find((item, indice) => chaveDoResponsavel(item, indice) === chave)?.nome || nomeDaPessoa(chave.slice(2))}
            marca={(chave) => <span className="marca-vinculo">{chave.startsWith('p:') ? 'Membro' : 'Não é membro'}</span>}
            onEscolher={(chave) => mudarDedicacao((atual) => ({ ...atual, responsaveis: [...atual.responsaveis, { personId: chave.slice(2), nome: nomeDaPessoa(chave.slice(2)) }] }))}
            onRemover={(chave) => mudarDedicacao((atual) => ({ ...atual, responsaveis: atual.responsaveis.filter((item, indice) => chaveDoResponsavel(item, indice) !== chave) }))} />
          {naoMembro === null
            ? <Button type="button" variant="secondary" icon={<Plus />} onClick={() => setNaoMembro('')}>Não é membro</Button>
            : <div className="pautas-comissao__nova"><Field label="Nome de quem não é membro" name="dedicacao-nao-membro" value={naoMembro} maxLength={120} autoFocus onChange={(changeEvent) => setNaoMembro(changeEvent.target.value)} onKeyDown={(keyEvent) => { if (keyEvent.key === 'Enter') { keyEvent.preventDefault(); adicionarNaoMembro() } }} /><Button type="button" variant="secondary" disabled={!naoMembro.trim()} onClick={adicionarNaoMembro}>Adicionar</Button></div>}
        </>}

        <fieldset className="ceremony-checklist"><legend>Checklist da cerimônia</legend>{CEREMONY_CHECKLISTS[ceremonyCategory].map((item) => <label key={item.id}><input type="checkbox" checked={ceremony.checklist[item.id] ?? false} onChange={(changeEvent) => setCeremony({ checklist: { ...ceremony.checklist, [item.id]: changeEvent.target.checked } })} /><span>{item.label}</span></label>)}</fieldset>
      </Card>}

      {conflicts.length > 0 && <Card title="Conflitos encontrados"><div className="issue-list">{conflicts.map((conflict, index) => <div key={`${conflict.kind}-${index}`}><TriangleAlert />{conflict.message}</div>)}</div></Card>}
      <div className="form-actions"><Link className="button button--secondary" to="/app/agenda">Cancelar</Link>{eventId && <Button type="button" variant="danger" disabled={busy} onClick={() => void excluir()} icon={<Trash2 />}>Excluir compromisso</Button>}<Button type="submit" disabled={busy || conflicts.some(({ kind }) => kind !== 'monday_rest') || (isMonday(input.startAt) && !input.mondayException)}>{busy ? 'Salvando…' : 'Salvar compromisso'}</Button></div>
    </form>
  </div>
}
