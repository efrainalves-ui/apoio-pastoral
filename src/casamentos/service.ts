import { AgendaService } from '../agenda/service'
import type { AgendaEventData, AgendaEventEntity, AgendaEventInput } from '../agenda/types'
import { currentDeviceId } from '../auth/device'
import { CareService } from '../care/service'
import type { VisitEntity } from '../care/types'
import { CommissionService } from '../commissions/service'
import { decryptRecord, encryptPayload } from '../crypto/vault'
import { db, type ApoioDatabase } from '../db/database'
import { VaultRepository } from '../db/repository'
import type { VaultRecord } from '../db/types'
import { casamentoVazio, idDoCasamentoDoCompromisso, nomeDoCasal, normalizarCasamento, tituloDaCerimonia, validarCasamento } from './core'
import type { CasamentoData, CasamentoEntity, OrigemDoCasamento, PapelNoCasamento } from './types'

const ORIGEM_LABELS: Record<OrigemDoCasamento, string> = { casamentos: 'aba Casamentos', visitacao: 'Visitação', agenda: 'Agenda', migracao: 'migração de um compromisso antigo' }

/** A cerimônia de um compromisso: o antigo, sem papel, conta como cerimônia quando é do tipo Casamento. */
export function eCerimonia(event: Pick<AgendaEventData, 'category' | 'papelNoCasamento'>): boolean {
  return event.papelNoCasamento === 'cerimonia' || (!event.papelNoCasamento && event.category === 'wedding')
}

function cerimoniaDoCompromisso(event: AgendaEventData): CasamentoData['cerimonia'] {
  return { data: event.startAt.slice(0, 10), inicio: event.startAt.slice(11, 16), fim: event.endAt.slice(11, 16), igrejaId: event.churchId, local: event.location }
}

const mesmaCerimonia = (a: CasamentoData['cerimonia'], b: CasamentoData['cerimonia']) =>
  a.data === b.data && a.inicio === b.inicio && a.fim === b.fim && (a.igrejaId ?? null) === (b.igrejaId ?? null) && a.local === b.local

export interface ResultadoDaMigracaoDeCasamentos { criados: number; vinculados: number; ilegiveis: number; ambiguidades: string[] }

export class CasamentoService {
  private readonly repository: VaultRepository
  private readonly agenda: AgendaService
  private readonly care: CareService
  private readonly commissions: CommissionService

  constructor(private readonly database: ApoioDatabase = db) {
    this.repository = new VaultRepository(database)
    this.agenda = new AgendaService(database)
    this.care = new CareService(database)
    this.commissions = new CommissionService(database)
  }

  private async decode(record: VaultRecord, masterKey: CryptoKey): Promise<CasamentoEntity | null> {
    const payload = await decryptRecord(masterKey, record)
    if (payload?.type !== 'wedding') return null
    return { id: record.id, ...normalizarCasamento(payload.data as Partial<CasamentoData>) }
  }

  private async gravar(accountId: string, masterKey: CryptoKey, id: string, data: CasamentoData): Promise<CasamentoEntity> {
    const envelope = await encryptPayload(masterKey, { schemaVersion: 1, type: 'wedding', data }, id)
    await this.repository.saveEncrypted(accountId, currentDeviceId(accountId), id, envelope, 'wedding')
    return { id, ...data }
  }

  async listar(accountId: string, masterKey: CryptoKey): Promise<CasamentoEntity[]> {
    const lidos = await Promise.all((await this.repository.list(accountId, 'wedding')).map((record) => this.decode(record, masterKey)))
    return lidos.filter((item): item is CasamentoEntity => Boolean(item)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  async obter(accountId: string, masterKey: CryptoKey, id: string): Promise<CasamentoEntity | null> {
    const record = await this.database.vaultRecords.get(id)
    if (!record || record.accountId !== accountId || record.deletedAt) return null
    return this.decode(record, masterKey)
  }

  /** Cria o acompanhamento. `id` permite ao compromisso da Agenda nascer já apontando para ele. */
  async criar(accountId: string, masterKey: CryptoKey, origem: OrigemDoCasamento, dados: Partial<CasamentoData>, id: string = crypto.randomUUID()): Promise<CasamentoEntity> {
    const agora = new Date().toISOString()
    const data = normalizarCasamento({ ...casamentoVazio(origem), ...dados, origem, createdAt: agora, updatedAt: agora })
    validarCasamento(data)
    data.historico = [...data.historico, { id: crypto.randomUUID(), em: agora, texto: `Acompanhamento criado pela ${ORIGEM_LABELS[origem]}` }]
    return this.gravar(accountId, masterKey, id, data)
  }

  /** Grava o acompanhamento inteiro; `acao` entra no histórico sem apagar o que já estava. */
  async salvar(accountId: string, masterKey: CryptoKey, casamento: CasamentoEntity, acao?: string): Promise<CasamentoEntity> {
    const { id, ...dados } = casamento
    validarCasamento(dados)
    const agora = new Date().toISOString()
    const historico = acao ? [...dados.historico, { id: crypto.randomUUID(), em: agora, texto: acao }] : dados.historico
    return this.gravar(accountId, masterKey, id, { ...dados, historico, updatedAt: agora })
  }

  async compromissos(accountId: string, masterKey: CryptoKey, casamentoId: string): Promise<AgendaEventEntity[]> {
    return (await this.agenda.listEvents(accountId, masterKey)).filter((event) => event.casamentoId === casamentoId).sort((a, b) => a.startAt.localeCompare(b.startAt))
  }

  async visitas(accountId: string, masterKey: CryptoKey, casamentoId: string): Promise<VisitEntity[]> {
    return (await this.care.listVisits(accountId, masterKey)).filter((visit) => visit.casamentoId === casamentoId)
  }

  /** O compromisso mudou na Agenda: a cerimônia confirmada do acompanhamento acompanha. */
  async sincronizarDaAgenda(accountId: string, masterKey: CryptoKey, event: AgendaEventEntity): Promise<CasamentoEntity | null> {
    if (!event.casamentoId || !eCerimonia(event)) return null
    const casamento = await this.obter(accountId, masterKey, event.casamentoId)
    if (!casamento) return null
    const cerimonia = cerimoniaDoCompromisso(event)
    if (mesmaCerimonia(casamento.cerimonia, cerimonia)) return casamento
    return this.salvar(accountId, masterKey, { ...casamento, cerimonia }, 'Data, horário ou local da cerimônia alterados na Agenda')
  }

  /**
   * O acompanhamento mudou: o compromisso da cerimônia acompanha.
   *
   * Só se escreve o que difere, e a Agenda não chama de volta: não há ciclo.
   * Sem data confirmada, o compromisso existente não é apagado nem esvaziado.
   */
  async sincronizarParaAgenda(accountId: string, masterKey: CryptoKey, casamento: CasamentoEntity): Promise<AgendaEventEntity | null> {
    const cerimonia = (await this.compromissos(accountId, masterKey, casamento.id)).find(eCerimonia)
    if (!cerimonia || !casamento.cerimonia.data || !casamento.cerimonia.inicio) return cerimonia ?? null
    const { id, createdAt: _criado, updatedAt: _atualizado, ...dados } = cerimonia
    void _criado; void _atualizado
    const fim = casamento.cerimonia.fim && casamento.cerimonia.fim > casamento.cerimonia.inicio ? casamento.cerimonia.fim : cerimonia.endAt.slice(11, 16)
    const desejado: AgendaEventInput = {
      ...dados, title: tituloDaCerimonia(casamento), startAt: `${casamento.cerimonia.data}T${casamento.cerimonia.inicio}`,
      endAt: `${casamento.cerimonia.data}T${fim}`, churchId: casamento.cerimonia.igrejaId, location: casamento.cerimonia.local,
    }
    if (desejado.title === dados.title && desejado.startAt === dados.startAt && desejado.endAt === dados.endAt && desejado.churchId === dados.churchId && desejado.location === dados.location) return cerimonia
    return this.agenda.updateEvent(accountId, masterKey, id, desejado)
  }

  /**
   * Compromisso de entrevista ou de ensaio, ligado ao acompanhamento.
   *
   * O ensaio é um só: agendar de novo atualiza o mesmo compromisso. Entrevistas
   * podem ser várias.
   */
  async agendarCompromisso(
    accountId: string, masterKey: CryptoKey, casamento: CasamentoEntity, papel: Exclude<PapelNoCasamento, 'cerimonia'>,
    quando: { data: string; inicio: string; fim: string; local: string },
  ): Promise<AgendaEventEntity> {
    if (!quando.data || !quando.inicio) throw new Error('Informe a data e o horário.')
    const titulo = `${papel === 'ensaio' ? 'Ensaio' : 'Entrevista pastoral'} — casamento de ${nomeDoCasal(casamento)}`
    const inicioMs = new Date(`${quando.data}T${quando.inicio}`).getTime()
    const fim = quando.fim && quando.fim > quando.inicio ? quando.fim : new Date(inicioMs + 60 * 60_000).toTimeString().slice(0, 5)
    const input: AgendaEventInput = {
      title: titulo, category: 'other', churchId: casamento.cerimonia.igrejaId ?? casamento.noiva.igrejaId ?? casamento.noivo.igrejaId,
      location: quando.local, address: '', visitTarget: 'none', sermonId: null, sermonSnapshot: null, ceremonyDetails: null,
      startAt: `${quando.data}T${quando.inicio}`, endAt: `${quando.data}T${fim}`, allDay: false, reminderMinutes: 60, notes: '',
      includeInItinerary: true, mondayException: false, casamentoId: casamento.id, papelNoCasamento: papel,
    }
    const existente = papel === 'ensaio' ? (await this.compromissos(accountId, masterKey, casamento.id)).find((event) => event.papelNoCasamento === 'ensaio') : undefined
    return existente ? this.agenda.updateEvent(accountId, masterKey, existente.id, input) : this.agenda.createEvent(accountId, masterKey, input)
  }

  /**
   * Liga o acompanhamento a uma reunião do módulo de Comissões.
   *
   * A reunião ganha uma pauta identificável — uma só, mesmo salvando de novo. A
   * decisão da comissão não é criada aqui: quem registra é o pastor.
   */
  async vincularComissao(accountId: string, masterKey: CryptoKey, casamento: CasamentoEntity, meetingId: string | null): Promise<CasamentoEntity> {
    let igrejaId = casamento.comissao.igrejaId
    if (meetingId) {
      const reuniao = await this.commissions.meeting(accountId, masterKey, meetingId)
      if (!reuniao) throw new Error('Reunião de comissão não encontrada.')
      igrejaId = reuniao.churchId
      if (!reuniao.finalizedAt && !reuniao.agenda.some((item) => item.casamentoId === casamento.id)) {
        const { id, ...dados } = reuniao
        await this.commissions.saveMeeting(accountId, masterKey, {
          ...dados, updatedAt: new Date().toISOString(),
          agenda: [...dados.agenda, {
            id: crypto.randomUUID(), order: dados.agenda.length + 1, title: `Recomendação do casamento de ${nomeDoCasal(casamento)}`,
            department: 'Família', description: '', proposal: '', decisionType: 'recommend', customDecisionType: '', destination: 'record',
            responsibleId: '', dueDate: '', privateNotes: '', casamentoId: casamento.id,
          }],
        }, id)
      }
    }
    return this.salvar(accountId, masterKey, { ...casamento, comissao: { ...casamento.comissao, meetingId, igrejaId } }, meetingId ? 'Reunião de comissão vinculada' : 'Reunião de comissão desvinculada')
  }

  /**
   * Casamentos marcados na Agenda antes do acompanhamento existir.
   *
   * Cada um ganha o seu acompanhamento, com identificador derivado do
   * compromisso: rodar de novo não cria outro. Nome, igreja, data, horário,
   * local e data civil vêm do compromisso. Nada é inventado: entrevista, curso,
   * documentos e comissão ficam pendentes, e o que o compromisso antigo dizia
   * sem equivalente exato fica anotado no histórico. O compromisso é regravado
   * só com o vínculo, sem passar pelas regras de conflito de horário.
   */
  async migrarCompromissosAntigos(accountId: string, masterKey: CryptoKey): Promise<ResultadoDaMigracaoDeCasamentos> {
    const resultado: ResultadoDaMigracaoDeCasamentos = { criados: 0, vinculados: 0, ilegiveis: 0, ambiguidades: [] }
    for (const record of await this.repository.list(accountId, 'agenda_event')) {
      const payload = await decryptRecord(masterKey, record)
      if (!payload) { resultado.ilegiveis += 1; continue }
      if (payload.type !== 'agenda_event') continue
      const event = payload.data as AgendaEventData
      if (event.category !== 'wedding' || event.casamentoId) continue

      const id = await idDoCasamentoDoCompromisso(record.id)
      if (!await this.obter(accountId, masterKey, id)) {
        const antigo = event.casamento
        const notas: string[] = []
        if (!antigo?.noivo.trim() && !antigo?.noiva.trim()) notas.push('o compromisso antigo não tinha os nomes dos noivos')
        if (event.ceremonyDetails?.involvedPersonIds.length) notas.push(`${event.ceremonyDetails.involvedPersonIds.length} pessoa(s) envolvida(s) seguem guardadas no compromisso`)
        if (antigo?.passouPelaComissao != null) notas.push(`no compromisso antigo constava "passou pela comissão: ${antigo.passouPelaComissao ? 'Sim' : 'Não'}"`)
        if (antigo?.cursoDeNoivos === false) notas.push('no compromisso antigo constava "curso de noivos: Não"')
        const dados: Partial<CasamentoData> = {
          noiva: { personId: null, nome: antigo?.noiva.trim() || '', igrejaId: null, igrejaNome: '' },
          noivo: { personId: null, nome: antigo?.noivo.trim() || (antigo?.noiva.trim() ? '' : event.title.trim() || 'Casamento sem nome'), igrejaId: null, igrejaNome: '' },
          cerimonia: cerimoniaDoCompromisso(event),
          civil: { data: antigo?.dataCivil ?? '', cartorio: '', efeitoCivil: null },
          curso: { situacao: antigo?.cursoDeNoivos ? 'concluido' : null, dataConclusao: '', local: '', responsavel: '' },
          etapa: 'agendado',
          historico: notas.map((texto) => ({ id: crypto.randomUUID(), em: new Date().toISOString(), texto: `Migração: ${texto}` })),
        }
        await this.criar(accountId, masterKey, 'migracao', dados, id)
        resultado.criados += 1
        if (notas.length) resultado.ambiguidades.push(`${event.title}: ${notas.join('; ')}`)
      }
      const vinculado = { ...event, casamentoId: id, papelNoCasamento: 'cerimonia' as const }
      const envelope = await encryptPayload(masterKey, { schemaVersion: 1, type: 'agenda_event', data: vinculado }, record.id)
      await this.repository.saveEncrypted(accountId, currentDeviceId(accountId), record.id, envelope, 'agenda_event')
      resultado.vinculados += 1
    }
    return resultado
  }
}
