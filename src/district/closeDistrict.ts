import { remoteAccountGuard, type AccountSessionGuard } from '../auth/accountGuard'
import { adoptDeviceId, authorizeCurrentDevice, currentDeviceId, revokeDevice } from '../auth/device'
import { fetchRemoteDevices, revokeAllRemoteDevices, type RemoteDevice } from '../auth/supabase'
import { encryptPayload } from '../crypto/vault'
import { readPayloads } from '../db/corrupted'
import { db, type ApoioDatabase } from '../db/database'
import { pendingRemotePurge } from '../db/purge'
import { VaultRepository, type EncryptedMutation } from '../db/repository'
import type { VaultPayload } from '../crypto/types'
import { pendingActionId, type PendingActionRecord, type PendingActionStage, type VaultRecord } from '../db/types'

/**
 * O que fica é o que não pertence ao distrito: leitura e orçamento familiar
 * vivem em bancos próprios e nem são tocados aqui; da agenda, permanecem os
 * compromissos marcados como pessoais e sem igreja. Todo o resto é distrital.
 */
export function isPersonalRecord(payload: VaultPayload): boolean {
  if (payload.type !== 'agenda_event') return false
  const dados = payload.data as { category?: string; churchId?: string | null }
  return dados.category === 'personal' && !dados.churchId
}

const TYPE_LABELS: Record<string, string> = {
  district: 'Distrito', church: 'Igrejas', person: 'Pessoas', family: 'Famílias', import_batch: 'Importações',
  agenda_event: 'Agenda do distrito', sermon: 'Sermões', goal: 'Metas', goal_entry: 'Lançamentos de metas',
  goal_history: 'Resultados de anos anteriores', visit: 'Visitas', prayer_request: 'Pedidos de oração',
  follow_up: 'Acompanhamentos', task: 'Tarefas', visit_round: 'Rodadas de visitação', interest: 'Interessados',
  bible_study: 'Estudos bíblicos', missionary_pair: 'Duplas missionárias', sabbath_class: 'Escola Sabatina',
  small_group: 'Pequenos Grupos', uapg: 'UAPG', commission_config: 'Configuração de comissões',
  commission_meeting: 'Reuniões de comissão', commission_task: 'Pendências de comissão',
  nomination_process: 'Processos de nomeações', annual_goal: 'Metas do planejamento',
  evangelism_campaign: 'Campanhas de evangelismo',
}

export interface CloseDistrictPreview {
  districtRecords: number
  personalRecords: number
  /** Nomes simples do que será apagado, para o pastor conferir antes. */
  removedLabels: string[]
  devices: number
  /** Registros que não abrem neste aparelho e por isso não podem ser classificados. */
  unreadableRecords: number
}

export interface CloseDistrictResult {
  removedRecords: number
  preservedRecords: number
  revokedDevices: number
  newDeviceId: string
  /** Falso quando o encerramento parou em uma etapa e precisa ser retomado. */
  completed: boolean
  /** Etapa em que o encerramento está parado, quando não terminou. */
  stage?: PendingActionStage
  /** O que falta, em uma frase, para a tela dizer sem inventar. */
  pending?: string
}

/**
 * O servidor é quem conhece os aparelhos da conta: cada instalação guarda só a
 * si mesma. Estas dependências entram pelo construtor para o encerramento
 * poder ser provado com aparelhos que este aplicativo nunca viu.
 */
export interface CloseDistrictRemote {
  listDevices: () => Promise<RemoteDevice[] | null>
  revokeAll: () => Promise<number | null>
  /**
   * Uma rodada completa de sincronização desta conta, ou `null` quando não há
   * serviço remoto. Devolve verdadeiro só quando a rodada foi confirmada:
   * offline, incompleta, com paginação ou expurgo pendente contam como falso.
   */
  synchronize: () => Promise<boolean | null>
}

/**
 * Sem sincronização montada por quem chama.
 *
 * É uma função, e não uma constante: uma constante de módulo amarra as funções
 * do serviço no momento do `import`, e aí nem um teste consegue substituí-las
 * nem uma instalação sem serviço remoto consegue carregar o módulo.
 */
function remotoSemSincronizacao(): CloseDistrictRemote {
  return {
    listDevices: () => fetchRemoteDevices(),
    revokeAll: () => revokeAllRemoteDevices(),
    synchronize: () => Promise.resolve(null),
  }
}

/**
 * Ordem das etapas, e a razão de cada uma estar onde está.
 *
 * `intent` é gravada **antes** da primeira exclusão local. Sem ela, fechar o
 * navegador logo depois da primeira lápide deixava metade do distrito apagada
 * aqui, inteira no serviço, e nada na tela dizendo que havia trabalho começado.
 *
 * `tombstones` é a publicação das lápides. `syncing` é a confirmação de que
 * elas subiram — encerrar sem isso apaga o distrito neste aparelho e deixa os
 * outros sincronizando o que o pastor mandou encerrar. `purging` apaga o
 * histórico distrital no serviço, o que só pode acontecer depois de as lápides
 * subirem. `revoking` tira as autorizações, e `reauthorizing` devolve a este
 * aparelho uma autorização nova, que é a última coisa a acontecer.
 */
const ETAPAS: PendingActionStage[] = ['intent', 'tombstones', 'syncing', 'purging', 'revoking', 'reauthorizing']

function passou(marca: PendingActionRecord, etapa: PendingActionStage): boolean {
  const atual = ETAPAS.indexOf(marca.stage ?? 'intent')
  return atual > ETAPAS.indexOf(etapa)
}

export class CloseDistrictService {
  private readonly repository: VaultRepository

  constructor(
    private readonly database: ApoioDatabase = db,
    private readonly remote: CloseDistrictRemote = remotoSemSincronizacao(),
    private readonly guard: AccountSessionGuard = remoteAccountGuard,
  ) { this.repository = new VaultRepository(database) }

  /**
   * Quantos aparelhos a conta tem, segundo quem sabe. Sem serviço remoto vale
   * o que este aparelho conhece, que no desenvolvimento local é tudo que há.
   */
  private async contarAparelhos(accountId: string): Promise<number> {
    const locais = await this.database.devices.where('accountId').equals(accountId).count()
    try {
      const remotos = await this.remote.listDevices()
      if (!remotos) return locais
      return remotos.filter(({ status }) => status !== 'revoked').length
    } catch {
      return locais
    }
  }

  /**
   * Um registro que não abre não pode derrubar o encerramento. Ele é contado
   * à parte, fica na quarentena e continua guardado: apagar às cegas o que não
   * se conseguiu ler seria apagar sem saber o quê.
   */
  private async classify(accountId: string, key: CryptoKey) {
    const records = await this.database.vaultRecords.where('accountId').equals(accountId).filter((record) => !record.deletedAt).toArray()
    const { opened, skipped } = await readPayloads(key, records, this.database)
    const district: Array<{ record: VaultRecord; type: string }> = []
    let personal = 0
    for (const { record, payload } of opened) {
      if (isPersonalRecord(payload)) personal += 1
      else district.push({ record, type: payload.type })
    }
    return { district, personal, unreadable: skipped }
  }

  async preview(accountId: string, key: CryptoKey): Promise<CloseDistrictPreview> {
    const { district, personal, unreadable } = await this.classify(accountId, key)
    const tipos = [...new Set(district.map(({ type }) => type))]
    return {
      districtRecords: district.length,
      personalRecords: personal,
      removedLabels: tipos.map((type) => TYPE_LABELS[type] ?? 'Outros registros do distrito').sort((a, b) => a.localeCompare(b, 'pt-BR')),
      devices: await this.contarAparelhos(accountId),
      unreadableRecords: unreadable.length,
    }
  }

  /**
   * Encerra o distrito. Grava a intenção antes de apagar o primeiro registro e
   * segue pelas mesmas etapas que a retomada percorre — não existe um caminho
   * "normal" e outro "de conserto": existe um só, chamado do começo.
   */
  async close(accountId: string, key: CryptoKey): Promise<CloseDistrictResult> {
    await this.guard(accountId)
    const existente = await this.database.pendingActions.get(pendingActionId(accountId, 'close_district'))
    if (existente) return this.avancar(accountId, existente, key)

    const { district, personal } = await this.classify(accountId, key)
    const agora = new Date().toISOString()

    // A intenção primeiro, e só depois qualquer exclusão. O identificador que
    // este aparelho vai adotar também é escolhido agora: sortear um novo a cada
    // retomada deixaria na conta um aparelho ativo por interrupção.
    const marca: PendingActionRecord = {
      id: pendingActionId(accountId, 'close_district'),
      accountId,
      kind: 'close_district',
      createdAt: agora,
      stage: 'intent',
      newDeviceId: crypto.randomUUID(),
      districtRecordIds: district.map(({ record }) => record.id),
      preservedRecordCount: personal,
    }
    await this.database.pendingActions.put(marca)
    return this.avancar(accountId, marca, key)
  }

  /**
   * Percorre as etapas que ainda faltam, uma por vez, gravando o avanço.
   *
   * Cada etapa é idempotente: refazê-la com o trabalho já feito não muda nada.
   * A publicação das lápides pula os registros já apagados; a sincronização
   * repetida é a mesma rodada; o expurgo repetido devolve a mesma lista; a
   * revogação repetida devolve zero; a autorização nova adota sempre o mesmo
   * identificador.
   */
  private async avancar(accountId: string, marca: PendingActionRecord, key: CryptoKey): Promise<CloseDistrictResult> {
    const id = marca.id
    const newDeviceId = marca.newDeviceId ?? crypto.randomUUID()
    if (!marca.newDeviceId) await this.database.pendingActions.update(id, { newDeviceId })
    const parar = async (stage: PendingActionStage, pending: string): Promise<CloseDistrictResult> => {
      await this.database.pendingActions.update(id, { stage })
      return {
        removedRecords: marca.districtRecordIds?.length ?? 0,
        preservedRecords: marca.preservedRecordCount ?? 0,
        revokedDevices: 0,
        newDeviceId,
        completed: false,
        stage,
        pending,
      }
    }

    // 1. Lápides. Só entram os registros escolhidos quando a intenção foi
    //    gravada, e só os que ainda não foram apagados.
    if (!passou(marca, 'intent')) {
      const alvos = marca.districtRecordIds ?? []
      const agora = new Date().toISOString()
      const mutations: EncryptedMutation[] = []
      for (const recordId of alvos) {
        const record = await this.database.vaultRecords.get(recordId)
        if (!record || record.accountId !== accountId || record.deletedAt) continue
        const payload = (await readPayloads(key, [record], this.database)).opened[0]?.payload
        if (!payload) continue
        mutations.push({
          recordId: record.id,
          recordType: record.recordType,
          operation: 'delete',
          envelope: await encryptPayload(key, { schemaVersion: 1, type: `${payload.type}_tombstone`, data: { deletedAt: agora } }, record.id),
        })
      }
      // As lápides e o pedido de expurgo do histórico distrital entram na mesma
      // transação: uma interrupção entre as duas deixaria o distrito apagado
      // aqui e o passado inteiro no serviço, sem nada pendente que voltasse.
      if (mutations.length) await this.repository.applyMutationsAndQueuePurge(accountId, currentDeviceId(accountId), mutations)
      await this.database.pendingActions.update(id, { stage: 'tombstones' })
      marca = { ...marca, stage: 'tombstones' }
    }

    // 2. As lápides precisam ter subido. Sem serviço remoto não há o que subir
    //    — e, nesse caso, também não há histórico remoto para expurgar: as duas
    //    etapas são puladas juntas, senão a fila de expurgo ficaria pendente
    //    para sempre e o encerramento nunca terminaria em modo local.
    if (!passou(marca, 'tombstones')) {
      const confirmada = await this.remote.synchronize()
      if (confirmada === false) {
        return parar('tombstones', 'As exclusões ainda não chegaram ao serviço. Conecte-se e conclua o encerramento.')
      }
      const proxima: PendingActionStage = confirmada === null ? 'purging' : 'syncing'
      await this.database.pendingActions.update(id, { stage: proxima })
      marca = { ...marca, stage: proxima }
    }

    // 3. Expurgo do histórico distrital no serviço, que a sincronização faz
    //    logo depois do envio. Se ainda restar fila, o encerramento espera.
    if (!passou(marca, 'syncing')) {
      const restante = await pendingRemotePurge(accountId, this.database)
      if (restante.length > 0) {
        const confirmada = await this.remote.synchronize()
        const aindaFalta = await pendingRemotePurge(accountId, this.database)
        if (confirmada === false || aindaFalta.length > 0) {
          return parar('syncing', 'O histórico do distrito no serviço ainda não foi apagado por inteiro. Conecte-se e conclua o encerramento.')
        }
      }
      await this.database.pendingActions.update(id, { stage: 'purging' })
      marca = { ...marca, stage: 'purging' }
    }

    // 4. Revogação. Quem revoga é o servidor, de uma vez só: percorrer a lista
    //    local revogava apenas este aparelho, e os outros seguiam sincronizando
    //    um distrito encerrado.
    let revogados = 0
    if (!passou(marca, 'purging')) {
      const locais = await this.database.devices.where('accountId').equals(accountId).toArray()
      const deviceId = currentDeviceId(accountId)
      const noServico = await this.remote.revokeAll()
      if (noServico === null) {
        // Os outros primeiro, este por último: revogar a si mesmo antes tiraria
        // a autorização necessária para revogar os que sobraram.
        for (const device of locais.filter(({ id: outro }) => outro !== deviceId)) await revokeDevice(device.id, this.database)
        if (locais.some(({ id: proprio }) => proprio === deviceId)) await revokeDevice(deviceId, this.database)
        revogados = locais.length
      } else {
        const agora = new Date().toISOString()
        await this.database.devices.bulkPut(locais.map((device) => ({ ...device, status: 'revoked' as const, revokedAt: device.revokedAt ?? agora })))
        revogados = noServico
      }
      await this.database.pendingActions.update(id, { stage: 'revoking' })
      marca = { ...marca, stage: 'revoking' }
    }

    // 5. Autorização nova para esta instalação, sem herdar nada da anterior.
    adoptDeviceId(accountId, newDeviceId)
    await authorizeCurrentDevice(accountId, this.database)
    await this.database.pendingActions.delete(id)

    return {
      removedRecords: marca.districtRecordIds?.length ?? 0,
      preservedRecords: marca.preservedRecordCount ?? 0,
      revokedDevices: revogados,
      newDeviceId,
      completed: true,
    }
  }

  /**
   * Termina um encerramento interrompido, de onde quer que ele tenha parado.
   * É o mesmo caminho do encerramento normal: não há dois.
   */
  async resume(accountId: string, key: CryptoKey): Promise<CloseDistrictResult> {
    await this.guard(accountId)
    const marca = await this.database.pendingActions.get(pendingActionId(accountId, 'close_district'))
    if (!marca) throw new Error('Não há encerramento pendente nesta conta.')
    return this.avancar(accountId, marca, key)
  }
}

/** Encerramento que começou e não terminou nesta instalação. */
export async function pendingDistrictClosure(accountId: string, database: ApoioDatabase = db): Promise<boolean> {
  return Boolean(await database.pendingActions.get(pendingActionId(accountId, 'close_district')))
}

/** Etapa em que o encerramento parou, para a tela dizer o que falta. */
export async function districtClosureStage(accountId: string, database: ApoioDatabase = db): Promise<PendingActionStage | null> {
  const marca = await database.pendingActions.get(pendingActionId(accountId, 'close_district'))
  return marca ? marca.stage ?? 'intent' : null
}

export const CLOSURE_STAGE_LABELS: Record<PendingActionStage, string> = {
  intent: 'Apagar os registros do distrito neste aparelho',
  tombstones: 'Enviar as exclusões para o serviço',
  syncing: 'Apagar o histórico do distrito no serviço',
  purging: 'Remover as autorizações dos aparelhos',
  revoking: 'Autorizar este aparelho de novo',
  reauthorizing: 'Autorizar este aparelho de novo',
  restoring_pastoral: 'Restaurar os registros pastorais',
  restoring_personal: 'Restaurar leitura e orçamento familiar',
}
