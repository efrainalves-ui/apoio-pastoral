import { describe, expect, it } from 'vitest'
import {
  createPasswordEnvelope,
  createRecoveryEnvelope,
  decryptPayload,
  encryptPayload,
  generateMasterKey,
  generateMasterSecret,
  importVaultKeys,
  openPasswordEnvelope,
  openPasswordVault,
  openRecoveryEnvelope,
} from './vault'

describe('cofre criptográfico', () => {
  it('cifra e autentica um payload sem manter o texto no envelope', async () => {
    const key = await generateMasterKey()
    const secret = 'conteúdo fictício alfa-42'
    const envelope = await encryptPayload(key, { schemaVersion: 1, type: 'foundation_fixture', data: { secret } }, 'fixture-1')

    expect(JSON.stringify(envelope)).not.toContain(secret)
    await expect(decryptPayload(key, envelope)).resolves.toEqual({
      schemaVersion: 1,
      type: 'foundation_fixture',
      data: { secret },
    })
  })

  it('recusa senha incorreta', async () => {
    const envelope = await createPasswordEnvelope(generateMasterSecret(), 'senha-ficticia-correta')

    await expect(openPasswordEnvelope(envelope, 'senha-ficticia-incorreta')).rejects.toThrow('Senha incorreta')
  })

  it('abre a mesma chave mestra com o código de recuperação', async () => {
    const secret = generateMasterSecret()
    const keys = await importVaultKeys(secret)
    const recovery = await createRecoveryEnvelope(secret)
    const recovered = await openRecoveryEnvelope(recovery.envelope, recovery.recoveryCode)
    const envelope = await encryptPayload(keys.master, { schemaVersion: 1, type: 'foundation_fixture', data: 'fixture' }, 'fixture-2')

    await expect(decryptPayload(recovered.master, envelope)).resolves.toMatchObject({ data: 'fixture' })
  })

  it('permite trocar a senha sem recriptografar os dados', async () => {
    const secret = generateMasterSecret()
    const keys = await importVaultKeys(secret)
    const dataEnvelope = await encryptPayload(keys.master, { schemaVersion: 1, type: 'foundation_fixture', data: 'imutável' }, 'fixture-3')
    const oldEnvelope = await createPasswordEnvelope(secret, 'senha-ficticia-antiga')
    const aberto = await openPasswordVault(oldEnvelope, 'senha-ficticia-antiga')
    const newEnvelope = await createPasswordEnvelope(aberto.secret, 'senha-ficticia-nova')
    const reopened = await openPasswordEnvelope(newEnvelope, 'senha-ficticia-nova')

    await expect(decryptPayload(reopened.master, dataEnvelope)).resolves.toMatchObject({ data: 'imutável' })
    await expect(openPasswordEnvelope(newEnvelope, 'senha-ficticia-antiga')).rejects.toThrow()
  })

  it('mantém as chaves do cofre fora do alcance de quem só tem a página', async () => {
    const keys = await importVaultKeys(generateMasterSecret())

    expect(keys.master.extractable).toBe(false)
    expect(keys.sync.extractable).toBe(false)
    await expect(crypto.subtle.exportKey('raw', keys.master)).rejects.toThrow()
  })
})

describe('vínculo entre o registro e o conteúdo cifrado', () => {
  it('recusa abrir o conteúdo de um registro dentro de outro', async () => {
    const key = await generateMasterKey()
    const alfa = await encryptPayload(key, { schemaVersion: 1, type: 'foundation_fixture', data: { nota: 'conteúdo fictício de alfa' } }, 'registro-alfa')
    const beta = await encryptPayload(key, { schemaVersion: 1, type: 'foundation_fixture', data: { nota: 'conteúdo fictício de beta' } }, 'registro-beta')

    // O serviço remoto entrega o conteúdo de alfa na linha de beta.
    await expect(decryptPayload(key, { ...alfa, id: 'registro-beta' })).rejects.toThrow('não confere')
    await expect(decryptPayload(key, { ...beta, id: 'registro-beta' })).resolves.toMatchObject({ data: { nota: 'conteúdo fictício de beta' } })
  })

  it('continua abrindo envelopes que não vêm de um registro guardado', async () => {
    const key = await generateMasterKey()
    const envelope = await encryptPayload(key, { schemaVersion: 1, type: 'foundation_fixture', data: { nota: 'conteúdo fictício' } }, 'registro-solto')

    await expect(decryptPayload(key, envelope)).resolves.toMatchObject({ data: { nota: 'conteúdo fictício' } })
  })
})
