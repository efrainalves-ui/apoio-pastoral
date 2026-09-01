import { db, type ApoioDatabase } from '../db/database'
import type { DeviceRecord } from '../db/types'
import { ensureRemoteDevice, fetchRemoteDeviceStatus, revokeRemoteDevice, type RemoteDeviceStatus } from './supabase'

const DEVICE_ID_KEY = 'apoio-pastoral:device-id'

export function currentDeviceId(): string {
  const existing = localStorage.getItem(DEVICE_ID_KEY)
  if (existing) return existing
  const created = crypto.randomUUID()
  localStorage.setItem(DEVICE_ID_KEY, created)
  return created
}

function deviceLabel(): string {
  const mobile = /Android|iPhone|iPad/u.test(navigator.userAgent)
  return mobile ? 'Dispositivo móvel' : 'Computador'
}

export async function authorizeCurrentDevice(accountId: string, database: ApoioDatabase = db): Promise<DeviceRecord> {
  const id = currentDeviceId()
  const existing = await database.devices.get(id)
  if (existing?.accountId !== undefined && existing.accountId !== accountId) {
    throw new Error('Este dispositivo já está vinculado a outra conta.')
  }
  if (existing?.status === 'revoked') {
    throw new Error('Este dispositivo foi removido e precisa ser autorizado novamente por outro dispositivo.')
  }
  const now = new Date().toISOString()
  const device: DeviceRecord = {
    id,
    accountId,
    label: existing?.label ?? deviceLabel(),
    status: 'active',
    createdAt: existing?.createdAt ?? now,
    lastSeenAt: now,
  }
  await database.devices.put(device)
  await ensureRemoteDevice(device.id, device.label)
  return device
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
