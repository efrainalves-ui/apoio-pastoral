import { afterEach, describe, expect, it, vi } from 'vitest'
import { formatStorage, requestPersistentStorage, storageStatus } from './persistence'

const originalStorage = navigator.storage
afterEach(() => { Object.defineProperty(navigator, 'storage', { configurable: true, value: originalStorage }) })

describe('armazenamento persistente', () => {
  it('informa uso, limite e solicita proteção quando suportada', async () => {
    const persist = vi.fn().mockResolvedValue(true)
    Object.defineProperty(navigator, 'storage', { configurable: true, value: {
      persisted: vi.fn().mockResolvedValue(true),
      estimate: vi.fn().mockResolvedValue({ usage: 1_048_576, quota: 10_485_760 }),
      persist,
    } })

    expect(await storageStatus()).toEqual({ supported: true, persisted: true, usage: 1_048_576, quota: 10_485_760 })
    await requestPersistentStorage()
    expect(persist).toHaveBeenCalledOnce()
    expect(formatStorage(1_048_576)).toContain('1')
  })
})
