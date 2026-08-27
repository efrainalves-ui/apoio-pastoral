import { describe, expect, it, vi } from 'vitest'
import { decryptPayload, generateMasterKey } from '../crypto/vault'
import type { EncryptedMutation } from '../db/repository'
import { InitialSetupService } from './service'

describe('InitialSetupService', () => {
  it('prepara distrito, igrejas e pessoas em uma única gravação e preserva ausência de aniversário', async () => {
    const calls: EncryptedMutation[][] = []
    const applyEncryptedMutations = vi.fn((_accountId: string, _deviceId: string, mutations: EncryptedMutation[]) => { calls.push(mutations); return Promise.resolve([]) })
    const service = new InitialSetupService({ list: vi.fn().mockResolvedValue([]), applyEncryptedMutations })
    const key = await generateMasterKey()
    await expect(service.organize('conta-ficticia', key, {
      districtName: 'Distrito Fictício',
      churches: [{ id: 'igreja-a', name: 'Igreja Fictícia' }],
      members: [{ name: 'Pessoa Anônima Fictícia', birthDate: null, churchId: 'igreja-a' }],
    })).resolves.toEqual({ churches: 1, people: 1, birthdays: 0 })
    expect(applyEncryptedMutations).toHaveBeenCalledTimes(1)
    const mutations = calls[0]!
    expect(mutations.map((mutation) => mutation.recordType)).toEqual(['district', 'church', 'person'])
    const person = mutations.find((mutation) => mutation.recordType === 'person')!
    await expect(decryptPayload(key, person.envelope)).resolves.toMatchObject({ type: 'person', data: { birthDate: null } })
  })

  it('não realiza gravações parciais quando a única persistência falha', async () => {
    const applyEncryptedMutations = vi.fn().mockRejectedValue(new Error('falha fictícia'))
    const service = new InitialSetupService({ list: vi.fn().mockResolvedValue([]), applyEncryptedMutations })
    await expect(service.organize('conta-ficticia', await generateMasterKey(), {
      districtName: 'Distrito Fictício', churches: [{ id: 'igreja-a', name: 'Igreja Fictícia' }], members: [],
    })).rejects.toThrow('falha fictícia')
    expect(applyEncryptedMutations).toHaveBeenCalledTimes(1)
  })
})
