import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { createPasswordEnvelope, createRecoveryEnvelope, generateMasterKey } from '../crypto/vault'
import { ApoioDatabase } from '../db/database'
import type { AccountRecord } from '../db/types'
import { changeVaultPassword, recoverAccount, registerAccount } from './vaultSession'

const databases: ApoioDatabase[] = []
afterEach(async () => { localStorage.clear(); await Promise.all(databases.splice(0).map((database) => database.delete())) })

function account(id: string): AccountRecord { return { id, email: `${id}@example.invalid`, createdAt: '2026-08-01T00:00:00.000Z', authMode: 'local-development' } }

describe('isolamento da sessão local', () => {
  it('mantém somente uma conta local por navegador', async () => {
    const database = new ApoioDatabase(`session-single-${crypto.randomUUID()}`); databases.push(database)
    await database.accounts.put(account('conta-ficticia-a'))
    await expect(registerAccount('outra-conta@example.invalid', 'senha-ficticia-segura-2026', database)).rejects.toThrow('Já existe uma conta')
    expect(await database.accounts.count()).toBe(1)
  })

  it('recusa envelope de recuperação pertencente a outra conta', async () => {
    const database = new ApoioDatabase(`session-recovery-${crypto.randomUUID()}`); databases.push(database)
    const current = account('conta-ficticia-a'); await database.accounts.put(current)
    const recovery = await createRecoveryEnvelope(await generateMasterKey())
    await database.keyEnvelopes.put({ id: 'recovery', accountId: 'conta-ficticia-b', envelope: recovery.envelope, updatedAt: current.createdAt })
    await expect(recoverAccount(current.email, recovery.recoveryCode, 'nova-senha-ficticia-2026', database)).rejects.toThrow('indisponível')
  })

  it('recusa troca de senha com envelope pertencente a outra conta', async () => {
    const database = new ApoioDatabase(`session-password-${crypto.randomUUID()}`); databases.push(database)
    const current = account('conta-ficticia-a'); await database.accounts.put(current)
    const envelope = await createPasswordEnvelope(await generateMasterKey(), 'senha-ficticia-atual-2026')
    await database.keyEnvelopes.put({ id: 'password', accountId: 'conta-ficticia-b', envelope, updatedAt: current.createdAt })
    await expect(changeVaultPassword(current, 'senha-ficticia-atual-2026', 'senha-ficticia-nova-2026', database)).rejects.toThrow('indisponível')
  })
})
