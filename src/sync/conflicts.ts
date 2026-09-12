import { currentDeviceId } from '../auth/device'
import type { CipherEnvelope } from '../crypto/types'
import { decryptPayload, encryptPayload } from '../crypto/vault'
import { db, type ApoioDatabase } from '../db/database'
import { VaultRepository } from '../db/repository'
import type { SyncConflictRecord, VaultRecord } from '../db/types'

/** O que o pastor escolheu fazer com as duas versões. */
export type ConflictChoice = 'keep_local' | 'keep_remote' | 'keep_both'

export const RECORD_LABELS: Record<string, string> = {
  district: 'Distrito', church: 'Igreja', person: 'Pessoa', family: 'Família',
  agenda_event: 'Compromisso', sermon: 'Sermão', goal: 'Meta', goal_entry: 'Registro de meta', goal_history: 'Resultado do ano anterior',
  visit: 'Visita', prayer_request: 'Pedido de oração', follow_up: 'Acompanhamento',
  task: 'Tarefa', visit_round: 'Rodada de visitas', interest: 'Interessado',
  bible_study: 'Estudo bíblico', missionary_pair: 'Dupla missionária',
  sabbath_class: 'Classe da Escola Sabatina', small_group: 'Pequeno Grupo', uapg: 'UAPG',
  commission_config: 'Configuração de comissão', commission_meeting: 'Reunião de comissão',
  commission_task: 'Pendência de comissão', nomination_process: 'Processo de nomeações',
  annual_goal: 'Meta anual', evangelism_campaign: 'Campanha',
}

export interface ConflictSide {
  version: number
  summary: string
  available: boolean
}

/** Um campo que mudou entre as duas versões, pronto para leitura. */
export interface ConflictDifference {
  field: string
  local: string | null
  remote: string | null
}

export interface ConflictPreview {
  id: string
  recordId: string
  kind: string
  createdAt: string
  remoteIsDeletion: boolean
  /** O registro foi apagado neste aparelho e o outro mandou uma alteração. */
  localIsDeletion: boolean
  local: ConflictSide
  remote: ConflictSide
  differences: ConflictDifference[]
  /** Diferenças em campos que o pastor não edita diretamente. */
  hiddenDifferences: number
  choice?: ConflictChoice
  resolvedAt?: string
}

const FIELD_LABELS: Record<string, string> = {
  name: 'Nome', title: 'Título', text: 'Texto', subject: 'Assunto', description: 'Descrição',
  notes: 'Observações', administrativeNotes: 'Observações', address: 'Endereço', location: 'Local',
  whatsapp: 'WhatsApp', email: 'E-mail', phone: 'Telefone', birthDate: 'Data de nascimento',
  status: 'Situação', type: 'Tipo', category: 'Categoria', pastoralStatus: 'Situação pastoral',
  fidelity: 'Leitura de fidelidade',
  incomeStatus: 'Fidelidade', externalCode: 'Código externo', startAt: 'Início', endAt: 'Término',
  allDay: 'Dia inteiro', date: 'Data', deadline: 'Prazo', responsible: 'Responsável',
  amount: 'Valor', value: 'Valor', reason: 'Motivo', quorum: 'Quórum', author: 'Autor',
  pages: 'Páginas', theme: 'Tema', passage: 'Passagem', role: 'Cargo', label: 'Identificação',
  participants: 'Participantes', answers: 'Respostas da visita', mainText: 'Texto principal',
  objective: 'Objetivo', introduction: 'Introdução', content: 'Conteúdo', conclusion: 'Conclusão', appeal: 'Apelo',
}

const CODE_LABELS: Record<string, string> = {
  /*
    Fidelidade e renda. Sem estes, a diferença aparecia como "Diferente nas duas
    versões" — o pastor via que algo mudou e não via o quê, e escolher virava
    adivinhação.
  */
  tither: 'Dizimista', non_systematic_tither: 'Dizimista não sistemático', non_tither: 'Não dizimista',
  has_income: 'Tem renda', no_income: 'Sem renda', unknown: 'Não informado',
  active: 'Ativo', archived: 'Arquivado', pending: 'Pendente', completed: 'Concluído', cancelled: 'Cancelado',
  draft: 'Rascunho', ready: 'Pronto', rescue: 'A resgatar', visitor: 'Visitante', interested: 'Interessado',
  full: 'Completa', quick: 'Rápida', routine: 'Rotina', leadership: 'Liderança', crisis: 'Crise', illness: 'Enfermidade',
  mourning: 'Luto', newly_baptized: 'Recém-batizado', family: 'Família', other: 'Outro', person: 'Pessoa',
  call: 'Ligar', revisit: 'Visitar novamente', send_material: 'Enviar material', bring_lesson: 'Levar lição',
  talk_family: 'Conversar com familiar', talk_leader: 'Falar com líder', schedule_study: 'Agendar estudo',
  follow_decision: 'Acompanhar decisão', follow_prayer: 'Acompanhar pedido de oração', refer_help: 'Encaminhar para ajuda',
  visit: 'Visita', preaching: 'Pregação', committee: 'Comissão', meeting: 'Reunião', bible_study: 'Estudo bíblico',
  baptism: 'Batismo', communion: 'Santa Ceia', wedding: 'Casamento', training: 'Treinamento', event: 'Evento',
  travel: 'Viagem', council: 'Concílio', personal: 'Pessoal', low: 'Baixa', normal: 'Normal', high: 'Alta',
  organized_church: 'Igreja organizada', preaching_point: 'Ponto de pregação',
}
const CODED_FIELDS = new Set(['status', 'type', 'category', 'pastoralStatus', 'incomeStatus', 'role', 'visitTarget', 'mode', 'kind', 'operation', 'importStatus', 'reason'])

const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?$/u

/** Deixa um valor pronto para leitura, ou devolve null quando não deve aparecer. */
function readableValue(field: string, value: unknown): string | null {
  if (value === null || value === undefined || value === '') return 'não informado'
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não'
  if (typeof value === 'number') return String(value)
  if (Array.isArray(value)) {
    if (field === 'answers') {
      const answers = value as Array<{ question?: { text?: string }; value?: unknown; skipped?: boolean }>
      const visible = answers.filter(({ skipped }) => !skipped).slice(0, 4).map(({ question, value: answer }) => {
        const text = Array.isArray(answer) ? answer.join(', ') : typeof answer === 'string' || typeof answer === 'number' || typeof answer === 'boolean' ? String(answer) : 'não informado'
        return `${question?.text ?? 'Resposta'}: ${text}`
      })
      return visible.length ? visible.join(' · ') : 'Nenhuma resposta'
    }
    return `${value.length} item(ns)`
  }
  /*
    A leitura de fidelidade é um objeto, e objeto caía no genérico "Diferente
    nas duas versões" — que não diz nada e deixa a escolha impossível. Aqui ela
    vira a frase que decide: a categoria, quantos meses e de que ano é a
    leitura.
  */
  if (field === 'fidelity' && value && typeof value === 'object') {
    const leitura = value as { category?: string; months?: number | null; referenceYear?: number; rangeMin?: number; rangeMax?: number }
    const categoria = leitura.category ? CODE_LABELS[leitura.category] ?? leitura.category : 'sem categoria'
    const meses = typeof leitura.months === 'number'
      ? `${leitura.months} ${leitura.months === 1 ? 'mês' : 'meses'}`
      : typeof leitura.rangeMin === 'number' && typeof leitura.rangeMax === 'number'
        ? `de ${leitura.rangeMin} a ${leitura.rangeMax} meses`
        : null
    const ano = leitura.referenceYear ? `${leitura.referenceYear}` : null
    return [categoria, meses, ano].filter(Boolean).join(' · ')
  }

  if (typeof value !== 'string') return null
  if (CODED_FIELDS.has(field)) return CODE_LABELS[value] ?? null
  if (CODE_LABELS[value]) return CODE_LABELS[value]
  if (ISO_DATE.test(value)) {
    const data = new Date(value)
    if (!Number.isNaN(data.getTime())) {
      return new Intl.DateTimeFormat('pt-BR', value.includes('T') ? { dateStyle: 'short', timeStyle: 'short' } : { dateStyle: 'short' }).format(data)
    }
  }
  return value.length > 80 ? `${value.slice(0, 80)}…` : value
}

function comparableData(data: unknown): unknown {
  if (!data || typeof data !== 'object') return data
  const source = data as Record<string, unknown>
  if (!Array.isArray(source.versions)) return data
  const versions = source.versions as Array<Record<string, unknown>>
  const currentVersion = typeof source.currentVersion === 'number' ? source.currentVersion : versions.length
  const current = versions.find(({ version }) => version === currentVersion) ?? versions.at(-1)
  if (!current) return data
  const base = { ...source }
  delete base.versions
  delete base.currentVersion
  return { ...base, ...current }
}

function sameValue(left: unknown, right: unknown): boolean {
  if (left === right) return true
  if (left === null || left === undefined) return right === null || right === undefined || right === ''
  if (right === null || right === undefined) return left === ''
  if (typeof left === 'object' || typeof right === 'object') return JSON.stringify(left) === JSON.stringify(right)
  return false
}

/**
 * Aponta o que mudou entre as duas versões. Sem isto, as duas colunas podem
 * parecer idênticas quando a diferença está num campo que o resumo não mostra,
 * e a escolha vira adivinhação.
 */
function differences(local: unknown, remote: unknown): { visible: ConflictDifference[]; hidden: number } {
  if (!local || !remote || typeof local !== 'object' || typeof remote !== 'object') return { visible: [], hidden: 0 }
  const esquerda = local as Record<string, unknown>
  const direita = remote as Record<string, unknown>
  const visible: ConflictDifference[] = []
  let hidden = 0

  for (const chave of [...new Set([...Object.keys(esquerda), ...Object.keys(direita)])].sort()) {
    if (sameValue(esquerda[chave], direita[chave])) continue
    const rotulo = FIELD_LABELS[chave]
    if (!rotulo) { hidden += 1; continue }
    visible.push({ field: rotulo, local: readableValue(chave, esquerda[chave]), remote: readableValue(chave, direita[chave]) })
  }

  return { visible, hidden }
}

function label(type: string): string {
  return RECORD_LABELS[type] ?? 'Registro'
}

/** Resumo curto e legível de um conteúdo, sem expor estrutura técnica. */
function summarize(data: unknown): string {
  if (!data || typeof data !== 'object') return 'Sem descrição'
  const campos = data as Record<string, unknown>
  for (const chave of ['name', 'title', 'text', 'subject', 'description']) {
    const valor = campos[chave]
    if (typeof valor === 'string' && valor.trim()) return valor.trim().slice(0, 120)
  }
  return 'Sem descrição'
}

export class ConflictService {
  private readonly repository: VaultRepository

  constructor(private readonly database: ApoioDatabase = db) {
    this.repository = new VaultRepository(database)
  }

  async listPending(accountId: string): Promise<SyncConflictRecord[]> {
    return this.database.syncConflicts
      .where('accountId').equals(accountId)
      .filter(({ status }) => status === 'pending')
      .toArray()
  }

  async listResolved(accountId: string): Promise<SyncConflictRecord[]> {
    return this.database.syncConflicts
      .where('accountId').equals(accountId)
      .filter(({ status }) => status === 'resolved')
      .toArray()
  }

  /** Prepara as duas versões para leitura, sem alterar nada. */
  async preview(conflict: SyncConflictRecord, masterKey: CryptoKey): Promise<ConflictPreview> {
    const localRecord = await this.database.vaultRecords.get(conflict.recordId)
    const localSource = conflict.status === 'resolved' && conflict.localPayload ? conflict.localPayload : localRecord
    let kind = 'Registro'
    let localSummary = 'Este registro não existe mais neste aparelho'
    let localAvailable = false
    let remoteSummary: string
    let remoteAvailable = false
    let localData: unknown = null
    let remoteData: unknown = null

    let localIsDeletion = Boolean(localRecord?.deletedAt)
    if (localRecord?.deletedAt) localSummary = 'Você apagou este registro neste aparelho'
    if (localSource && !localIsDeletion) {
      try {
        const payload = await decryptPayload(masterKey, localSource)
        if (payload.type === 'tombstone') {
          localIsDeletion = true
          localSummary = 'Esta versão apagou o registro'
        } else {
          kind = label(payload.type)
          localSummary = summarize(payload.data)
          localData = comparableData(payload.data)
          localAvailable = true
        }
      } catch { localSummary = 'Conteúdo não pôde ser aberto' }
    }

    if (conflict.remoteOperation === 'delete') {
      remoteSummary = 'O outro aparelho apagou este registro'
    } else {
      try {
        const payload = await decryptPayload(masterKey, conflict.remotePayload)
        if (kind === 'Registro') kind = label(payload.type)
        remoteSummary = summarize(payload.data)
        remoteData = comparableData(payload.data)
        remoteAvailable = true
      } catch { remoteSummary = 'Conteúdo não pôde ser aberto' }
    }

    const mudancas = localAvailable && remoteAvailable ? differences(localData, remoteData) : { visible: [], hidden: 0 }

    return {
      id: conflict.id,
      recordId: conflict.recordId,
      kind,
      createdAt: conflict.createdAt,
      remoteIsDeletion: conflict.remoteOperation === 'delete',
      localIsDeletion,
      local: { version: conflict.localVersion, summary: localSummary, available: localAvailable },
      remote: { version: conflict.remoteVersion, summary: remoteSummary, available: remoteAvailable },
      differences: mudancas.visible,
      hiddenDifferences: mudancas.hidden,
      ...(conflict.choice ? { choice: conflict.choice } : {}),
      ...(conflict.resolvedAt ? { resolvedAt: conflict.resolvedAt } : {}),
    }
  }

  /**
   * Aplica a escolha do pastor. Nada é descartado: a versão que não ficar
   * ativa continua guardada, cifrada, dentro do próprio conflito resolvido.
   *
   * Toda escolha é publicada em cima da versão do outro aparelho. Antes,
   * "ficar com a deste aparelho" só marcava a revisão como resolvida: o outro
   * aparelho nunca ficava sabendo, seguia com a versão dele, e os dois
   * discordavam para sempre sem nenhum aviso. E uma exclusão feita no outro
   * aparelho não tinha como ser aceita: o único caminho era manter a versão
   * daqui, então apagar um registro em um aparelho nunca chegava ao outro.
   */
  /**
   * Uma revisão em que não há o que revisar.
   *
   * Quando as duas versões não diferem em nenhum campo que o pastor edita — só
   * em campos que o aplicativo controla, como carimbos e contagem de versão —
   * a pergunta "qual das duas deve ficar valendo?" não tem resposta, porque as
   * duas são a mesma coisa. A tela já dizia isso; faltava agir.
   *
   * Exclusão nunca entra aqui: apagar contra alterar é uma escolha de verdade,
   * e ela continua sendo do pastor.
   */
  semDiferencaReal(preview: ConflictPreview): boolean {
    return preview.differences.length === 0
      && preview.hiddenDifferences > 0
      && !preview.remoteIsDeletion
      && !preview.localIsDeletion
  }

  /** Quantas das revisões pendentes não têm diferença nenhuma a decidir. */
  async contarSemDiferenca(accountId: string, masterKey: CryptoKey): Promise<number> {
    const pendentes = await this.listPending(accountId)
    const previas = await Promise.all(pendentes.map((conflito) => this.preview(conflito, masterKey)))
    return previas.filter((previa) => this.semDiferencaReal(previa)).length
  }

  /**
   * Resolve de uma vez as revisões sem diferença real.
   *
   * Fica com a versão deste aparelho — e "ficar com" aqui não descarta
   * conteúdo nenhum, porque o conteúdo é idêntico dos dois lados. A outra
   * versão continua guardada, como em qualquer resolução.
   *
   * Pedir 943 cliques por uma escolha que não existe não é proteção, é só
   * transferir para o pastor um trabalho que o aplicativo sabe fazer.
   */
  async resolverSemDiferenca(accountId: string, masterKey: CryptoKey): Promise<number> {
    const pendentes = await this.listPending(accountId)
    let resolvidas = 0
    for (const conflito of pendentes) {
      const previa = await this.preview(conflito, masterKey)
      if (!this.semDiferencaReal(previa)) continue
      await this.resolve(accountId, masterKey, conflito.id, 'keep_local')
      resolvidas += 1
    }
    return resolvidas
  }

  async resolve(accountId: string, masterKey: CryptoKey, conflictId: string, choice: ConflictChoice): Promise<void> {
    const conflict = await this.database.syncConflicts.get(conflictId)
    if (!conflict || conflict.accountId !== accountId) throw new Error('Esta revisão não foi encontrada.')
    if (conflict.status !== 'pending') throw new Error('Esta revisão já foi resolvida.')

    const localRecord = await this.database.vaultRecords.get(conflict.recordId)
    const localPayload: CipherEnvelope | undefined = localRecord
      ? { algorithm: localRecord.algorithm, ciphertext: localRecord.ciphertext, iv: localRecord.iv, aad: localRecord.aad, keyVersion: localRecord.keyVersion }
      : undefined
    const recordType: VaultRecord['recordType'] = localRecord?.recordType ?? 'encrypted'
    const deviceId = currentDeviceId(accountId)
    const remoteIsDeletion = conflict.remoteOperation === 'delete'

    if (choice === 'keep_both' && remoteIsDeletion) {
      throw new Error('O outro aparelho apagou este registro: não há duas versões para manter. Escolha manter a daqui ou aceitar a exclusão.')
    }

    let keptRecordId: string | undefined

    if (choice === 'keep_remote' && remoteIsDeletion) {
      // Aceitar a exclusão do outro aparelho. O registro sai daqui e a saída é
      // publicada por cima da versão remota, para não voltar como conflito.
      if (localRecord && !localRecord.deletedAt) {
        await this.repository.applyEncryptedMutations(accountId, deviceId, [{
          recordId: conflict.recordId,
          recordType,
          operation: 'delete',
          supersedes: conflict.remoteVersion,
          envelope: await encryptPayload(masterKey, { schemaVersion: 1, type: 'tombstone', data: { deletedAt: new Date().toISOString() } }, conflict.recordId),
        }])
      }
    } else if (choice === 'keep_remote' || choice === 'keep_both') {
      const payload = await decryptPayload(masterKey, conflict.remotePayload)

      if (choice === 'keep_remote') {
        const envelope = await encryptPayload(masterKey, payload, conflict.recordId)
        await this.repository.applyEncryptedMutations(accountId, deviceId, [{ recordId: conflict.recordId, recordType, envelope, supersedes: conflict.remoteVersion }])
        keptRecordId = conflict.recordId
      } else {
        // Guarda a versão do outro aparelho como um registro novo e separado,
        // para que as duas continuem existindo lado a lado.
        const novoId = crypto.randomUUID()
        const envelope = await encryptPayload(masterKey, payload, novoId)
        await this.repository.saveEncrypted(accountId, deviceId, novoId, envelope, recordType)
        keptRecordId = novoId
        await this.publicarVersaoLocal(accountId, masterKey, deviceId, conflict.recordId, recordType, localPayload, localRecord?.deletedAt, conflict.remoteVersion)
      }
    } else {
      await this.publicarVersaoLocal(accountId, masterKey, deviceId, conflict.recordId, recordType, localPayload, localRecord?.deletedAt, conflict.remoteVersion)
    }

    await this.database.syncConflicts.put({
      ...conflict,
      status: 'resolved',
      choice,
      resolvedAt: new Date().toISOString(),
      ...(localPayload ? { localPayload } : {}),
      ...(keptRecordId ? { keptRecordId } : {}),
    })
  }

  /**
   * Reenvia a decisão deste aparelho por cima da versão do outro, nas duas
   * direções.
   *
   * Quando o registro existe aqui, sobe o conteúdo daqui. Quando ele foi
   * apagado aqui e o outro aparelho mandou uma alteração, sobe uma lápide nova
   * baseada na versão remota — sem ela, a exclusão local já enfileirada nasceu
   * de uma versão antiga, o outro aparelho a recusaria por linhagem, e o
   * registro ficaria vivo lá e morto aqui para sempre.
   */
  private async publicarVersaoLocal(
    accountId: string,
    masterKey: CryptoKey,
    deviceId: string,
    recordId: string,
    recordType: VaultRecord['recordType'],
    localPayload: CipherEnvelope | undefined,
    deletedAt: string | undefined,
    remoteVersion: number,
  ): Promise<void> {
    if (!localPayload) return
    if (deletedAt) {
      await this.repository.applyEncryptedMutations(accountId, deviceId, [{
        recordId,
        recordType,
        operation: 'delete',
        supersedes: remoteVersion,
        envelope: await encryptPayload(masterKey, { schemaVersion: 1, type: 'tombstone', data: { deletedAt: new Date().toISOString() } }, recordId),
      }])
      return
    }
    await this.repository.applyEncryptedMutations(accountId, deviceId, [{ recordId, recordType, envelope: localPayload, supersedes: remoteVersion }])
  }
}
