import { db, type ApoioDatabase } from '../db/database'
import type { DeviceRecord } from '../db/types'
import { approveRemoteDevice, ensureRemoteDevice, fetchRemoteDeviceStatus, revokeRemoteDevice, type RemoteDeviceStatus } from './supabase'

const DEVICE_ID_KEY = 'apoio-pastoral:device-id'

/**
 * Cada conta tem o próprio identificador de aparelho, mesmo no mesmo navegador.
 * Compartilhar um só permitiria ligar duas contas ao mesmo aparelho no serviço,
 * o que este aplicativo existe para evitar.
 */
export function currentDeviceId(accountId: string): string {
  const chave = `${DEVICE_ID_KEY}:${accountId}`
  const existente = localStorage.getItem(chave)
  if (existente) return existente

  // Conta que já usava este navegador antes de existirem várias: fica com o
  // mesmo aparelho, para não perder a autorização que já tinha.
  const legado = localStorage.getItem(DEVICE_ID_KEY)
  const id = legado ?? crypto.randomUUID()
  localStorage.setItem(chave, id)
  if (legado) localStorage.removeItem(DEVICE_ID_KEY)
  return id
}

/**
 * Troca este aparelho por uma autorização nova. Usado ao encerrar o distrito:
 * as autorizações antigas são revogadas para sempre e a instalação atual passa
 * a valer com outro identificador, sem herdar nada da anterior.
 */
export function rotateDeviceId(accountId: string): string {
  const novo = crypto.randomUUID()
  localStorage.setItem(`${DEVICE_ID_KEY}:${accountId}`, novo)
  return novo
}

function deviceLabel(): string {
  const mobile = /Android|iPhone|iPad/u.test(navigator.userAgent)
  return mobile ? 'Dispositivo móvel' : 'Computador'
}

/**
 * Código curto que o pastor confere entre os dois aparelhos. Vem do próprio
 * identificador do aparelho, então os dois lados chegam ao mesmo valor sem
 * precisar guardar nada a mais.
 */
export function deviceConfirmationCode(deviceId: string): string {
  const limpo = deviceId.replace(/[^0-9a-f]/giu, '').toUpperCase()
  const seis = limpo.slice(-6).padStart(6, '0')
  return `${seis.slice(0, 3)}-${seis.slice(3)}`
}

/**
 * Registra este aparelho e amarra a sessão do serviço a ele.
 *
 * Quem decide a situação é o servidor: entrar com e-mail e senha em um aparelho
 * novo vale como autorização, e um aparelho revogado não volta sozinho. O
 * estado local é só o espelho dessa resposta — antes ele era a decisão, e um
 * cliente alterado podia se declarar ativo.
 */
export async function authorizeCurrentDevice(
  accountId: string,
  database: ApoioDatabase = db,
): Promise<DeviceRecord> {
  const id = currentDeviceId(accountId)
  const existing = await database.devices.get(id)
  if (existing?.accountId !== undefined && existing.accountId !== accountId) {
    throw new Error('Este dispositivo já está vinculado a outra conta.')
  }
  if (existing?.status === 'revoked') {
    throw new Error('Este aparelho foi removido da conta. Autorize-o novamente entrando com a senha.')
  }
  const label = existing?.label ?? deviceLabel()
  const remoto = await ensureRemoteDevice(id, label)
  const now = new Date().toISOString()
  const device: DeviceRecord = {
    id,
    accountId,
    label,
    status: remoto ?? existing?.status ?? 'active',
    createdAt: existing?.createdAt ?? now,
    lastSeenAt: now,
  }
  await database.devices.put(device)
  return device
}

/**
 * Um aparelho revogado só volta provando a senha outra vez, e com identidade
 * nova: a sessão anterior ficou na lista de revogadas do serviço e não
 * reivindica mais nada. Por isso a troca do identificador é explícita, feita
 * pelo pastor, e nunca automática dentro de uma tentativa de sincronizar.
 */
export async function reauthorizeRevokedDevice(
  accountId: string,
  database: ApoioDatabase = db,
): Promise<DeviceRecord> {
  const antigo = currentDeviceId(accountId)
  const local = await database.devices.get(antigo)
  if (local) await database.devices.put({ ...local, status: 'revoked' })
  rotateDeviceId(accountId)
  return authorizeCurrentDevice(accountId, database)
}

/** Confirma, a partir de um aparelho já ativo, uma instalação que aguardava. */
export async function approveDevice(deviceId: string, database: ApoioDatabase = db): Promise<void> {
  await approveRemoteDevice(deviceId)
  const local = await database.devices.get(deviceId)
  if (local) await database.devices.put({ ...local, status: 'active' })
}

/**
 * Traz do serviço o estado deste aparelho e grava localmente. É como uma
 * instalação que aguarda confirmação descobre que foi liberada.
 */
export async function refreshCurrentDeviceStatus(
  accountId: string,
  database: ApoioDatabase = db,
  readRemoteStatus: RemoteDeviceStatusReader = fetchRemoteDeviceStatus,
): Promise<RemoteDeviceStatus | null> {
  const id = currentDeviceId(accountId)
  const remoto = await readRemoteStatus(id)
  if (!remoto) return null
  const local = await database.devices.get(id)
  if (local && local.accountId === accountId && local.status !== remoto) {
    await database.devices.put({ ...local, status: remoto, ...(remoto === 'revoked' ? { revokedAt: new Date().toISOString() } : {}) })
  }
  return remoto
}

export async function assertDeviceCanSync(accountId: string, deviceId: string, database: ApoioDatabase = db): Promise<void> {
  const device = await database.devices.get(deviceId)
  if (!device || device.accountId !== accountId || device.status !== 'active') {
    throw new Error('Este dispositivo não está autorizado a sincronizar.')
  }
}

export type RemoteDeviceStatusReader = (deviceId: string) => Promise<RemoteDeviceStatus | null>

/**
 * Segunda barreira da revogação, e a única que também vale para o recebimento.
 * A RLS separa contas, não aparelhos: um dispositivo revogado continua com a
 * sessão da própria conta e, sem esta conferência, seguiria baixando as
 * operações cifradas dos outros aparelhos. Ao confirmar a revogação, grava o
 * estado localmente para que o bloqueio continue valendo mesmo sem rede.
 *
 * O que já está gravado no aparelho revogado permanece nele: esta trava impede
 * novas trocas, não apaga o passado à distância.
 */
export async function assertRemoteDeviceStillActive(
  accountId: string,
  deviceId: string,
  database: ApoioDatabase = db,
  readRemoteStatus: RemoteDeviceStatusReader = fetchRemoteDeviceStatus,
): Promise<void> {
  const remoteStatus = await readRemoteStatus(deviceId)
  if (remoteStatus === null || remoteStatus === 'active') return
  const device = await database.devices.get(deviceId)
  if (device && device.accountId === accountId) {
    await database.devices.put({ ...device, status: 'revoked', revokedAt: new Date().toISOString() })
  }
  throw new Error('Este dispositivo foi removido e não sincroniza mais. Autorize-o novamente por outro dispositivo.')
}

export async function revokeDevice(deviceId: string, database: ApoioDatabase = db): Promise<void> {
  // O aparelho que revoga quase nunca tem registro local do aparelho revogado:
  // cada um só guarda a si mesmo. Por isso a ausência do registro local não
  // impede a revogação — o serviço é a autoridade.
  const device = await database.devices.get(deviceId)
  if (device) {
    await database.devices.put({ ...device, status: 'revoked', revokedAt: new Date().toISOString() })
  }
  await revokeRemoteDevice(deviceId)
}
