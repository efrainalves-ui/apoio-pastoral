import { afterEach, describe, expect, it, vi } from 'vitest'
import { decryptPayload, encryptPayload, generateMasterKey } from '../crypto/vault'
import { ApoioDatabase } from '../db/database'
import type { EncryptedMutation } from '../db/repository'
import type { VaultRecord } from '../db/types'
import { InitialSetupService } from './service'

const bancos: ApoioDatabase[] = []
afterEach(async () => { await Promise.all(bancos.splice(0).map((banco) => banco.delete())) })

function bancoNovo() {
  const banco = new ApoioDatabase(`setup-ficticio-${crypto.randomUUID()}`)
  bancos.push(banco)
  return banco
}

async function registro(chave: CryptoKey, tipo: string, recordType: VaultRecord['recordType']): Promise<VaultRecord> {
  const id = crypto.randomUUID()
  return {
    id, accountId: 'conta-ficticia', recordType, version: 1,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    ...await encryptPayload(chave, { schemaVersion: 1, type: tipo, data: { name: 'Ficção', createdAt: '', updatedAt: '' } }, id),
  }
}

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

  /**
   * O que chega de outro aparelho entra sem tipo — a sincronização não tem a
   * chave para descobri-lo. Listar por tipo traz esses registros junto, e
   * contar sem abrir fazia qualquer coisa vinda do celular passar por distrito:
   * o pastor que ainda não tinha distrito nenhum era recusado com uma frase que
   * não era verdade, e ficava sem caminho para organizar o seu.
   */
  it('registro vindo de outro aparelho não passa por distrito', async () => {
    const chave = await generateMasterKey()
    const doCelular = await registro(chave, 'personal_reading_book', 'encrypted')
    const applyEncryptedMutations = vi.fn().mockResolvedValue([])
    const service = new InitialSetupService(
      { list: vi.fn().mockResolvedValue([doCelular]), applyEncryptedMutations },
      bancoNovo(),
    )

    await expect(service.organize('conta-ficticia', chave, {
      districtName: 'Distrito Fictício', churches: [{ id: 'igreja-a', name: 'Igreja Fictícia' }], members: [],
    })).resolves.toMatchObject({ churches: 1 })
  })

  it('distrito de verdade continua impedindo organizar outro por cima', async () => {
    const chave = await generateMasterKey()
    const distrito = await registro(chave, 'district', 'encrypted')
    const service = new InitialSetupService(
      { list: vi.fn().mockResolvedValue([distrito]), applyEncryptedMutations: vi.fn().mockResolvedValue([]) },
      bancoNovo(),
    )

    await expect(service.organize('conta-ficticia', chave, {
      districtName: 'Distrito Fictício', churches: [{ id: 'igreja-a', name: 'Igreja Fictícia' }], members: [],
    })).rejects.toThrow('já possui um distrito organizado')
  })

  /*
    O que não abre pode ser o distrito. Deixar passar criaria um segundo por
    cima do primeiro — o estrago que esta verificação existe para evitar. A
    recusa diz o que é, e diz o que costuma resolver.
  */
  it('registro que não abre impede organizar, e diz por quê', async () => {
    const chave = await generateMasterKey()
    const ilegivel = await registro(await generateMasterKey(), 'district', 'encrypted')
    const gravar = vi.fn().mockResolvedValue([])
    const service = new InitialSetupService(
      { list: vi.fn().mockResolvedValue([ilegivel]), applyEncryptedMutations: gravar },
      bancoNovo(),
    )

    await expect(service.organize('conta-ficticia', chave, {
      districtName: 'Distrito Fictício', churches: [{ id: 'igreja-a', name: 'Igreja Fictícia' }], members: [],
    })).rejects.toThrow('não abriram neste aparelho')
    expect(gravar).not.toHaveBeenCalled()
  })
})
