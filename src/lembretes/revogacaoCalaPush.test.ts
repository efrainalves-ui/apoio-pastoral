import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApoioDatabase } from '../db/database'
import { bloquearNotificacoesDoAparelho, CHAVE_REVOGADO, liberarNotificacoesDoAparelho } from './bloqueioPush'

/*
  O aparelho revogado para de receber notificação, e para sem depender da rede.

  A revogação derrubava a sessão e o recebimento das operações cifradas, mas
  não tocava na inscrição de push: o aparelho que o pastor tirou da conta
  continuava recebendo "Você tem um lembrete" — e, com o cofre ainda aberto na
  memória do service worker, até o título.
*/

const CONTA = 'conta-ficticia-revogacao'
const MARCA = `apoio-pastoral:push-ativo:${CONTA}`
const bancos: ApoioDatabase[] = []

function lerMarcaDeRevogacao(): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const pedido = indexedDB.open('apoio-pastoral-lembretes-push', 1)
    pedido.onupgradeneeded = () => { pedido.result.createObjectStore('mapa'); pedido.result.createObjectStore('preferencias') }
    pedido.onerror = () => reject(pedido.error ?? new Error('não abriu'))
    pedido.onsuccess = () => {
      const banco = pedido.result
      const leitura = banco.transaction('preferencias', 'readonly').objectStore('preferencias').get(CHAVE_REVOGADO)
      leitura.onsuccess = () => { resolve(leitura.result); banco.close() }
      leitura.onerror = () => { reject(leitura.error ?? new Error('não leu')); banco.close() }
    }
  })
}

let cancelada = false

beforeEach(() => {
  cancelada = false
  localStorage.setItem(MARCA, '1')
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {
      getRegistration: () => Promise.resolve({
        pushManager: { getSubscription: () => Promise.resolve({ unsubscribe: () => { cancelada = true; return Promise.resolve(true) } }) },
      }),
    },
  })
})

afterEach(async () => {
  vi.restoreAllMocks()
  localStorage.clear()
  await liberarNotificacoesDoAparelho()
  await Promise.all(bancos.splice(0).map((banco) => banco.delete()))
})

describe('revogar cala as notificações do aparelho', () => {
  it('marca a revogação onde o service worker enxerga, cancela a inscrição e esquece a preferência', async () => {
    await bloquearNotificacoesDoAparelho(CONTA)

    expect(await lerMarcaDeRevogacao()).toBe(true)
    expect(cancelada).toBe(true)
    expect(localStorage.getItem(MARCA)).toBeNull()
  })

  it('a marca some quando o aparelho é autorizado outra vez', async () => {
    await bloquearNotificacoesDoAparelho(CONTA)
    await liberarNotificacoesDoAparelho()

    expect(await lerMarcaDeRevogacao()).toBeUndefined()
  })

  it('sem service worker, ainda assim se cala: a marca não depende da rede', async () => {
    Reflect.deleteProperty(navigator, 'serviceWorker')

    await bloquearNotificacoesDoAparelho(CONTA)

    expect(await lerMarcaDeRevogacao()).toBe(true)
    expect(localStorage.getItem(MARCA)).toBeNull()
  })
})

describe('o aparelho descobre a revogação e se cala sozinho', () => {
  it('ao confirmar o estado no serviço, revogado desliga as notificações', async () => {
    const banco = new ApoioDatabase(`revogacao-${crypto.randomUUID()}`)
    bancos.push(banco)
    const { refreshCurrentDeviceStatus, currentDeviceId } = await import('../auth/device')
    const id = currentDeviceId(CONTA)
    const agora = new Date().toISOString()
    await banco.devices.put({ id, accountId: CONTA, label: 'Aparelho Fictício', status: 'active', createdAt: agora, lastSeenAt: agora })

    await refreshCurrentDeviceStatus(CONTA, banco, () => Promise.resolve('revoked'))

    expect((await banco.devices.get(id))?.status).toBe('revoked')
    expect(await lerMarcaDeRevogacao()).toBe(true)
    expect(localStorage.getItem(MARCA)).toBeNull()
  })

  it('a barreira do recebimento também cala o aparelho antes de recusar', async () => {
    const banco = new ApoioDatabase(`revogacao-${crypto.randomUUID()}`)
    bancos.push(banco)
    const { assertRemoteDeviceStillActive } = await import('../auth/device')
    const agora = new Date().toISOString()
    await banco.devices.put({ id: 'aparelho-fora', accountId: CONTA, label: 'Aparelho Fictício', status: 'active', createdAt: agora, lastSeenAt: agora })

    await expect(assertRemoteDeviceStillActive(CONTA, 'aparelho-fora', banco, () => Promise.resolve('revoked')))
      .rejects.toThrow('não sincroniza mais')

    expect(await lerMarcaDeRevogacao()).toBe(true)
  })
})
