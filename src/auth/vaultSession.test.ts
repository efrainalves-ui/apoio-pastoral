import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { createPasswordEnvelope, createRecoveryEnvelope, generateMasterKey } from '../crypto/vault'
import { ApoioDatabase } from '../db/database'
import { keyEnvelopeId } from '../db/types'
import type { AccountRecord } from '../db/types'
import { changeVaultPassword, recoverAccount, registerAccount } from './vaultSession'

const databases: ApoioDatabase[] = []
afterEach(async () => { localStorage.clear(); await Promise.all(databases.splice(0).map((database) => database.delete())) })

function account(id: string): AccountRecord { return { id, email: `${id}@example.invalid`, createdAt: '2026-08-01T00:00:00.000Z', authMode: 'local-development' } }

describe('isolamento da sessão local', () => {
  it('aceita mais de uma conta no aparelho, mas não o mesmo e-mail', async () => {
    const database = new ApoioDatabase(`session-multi-${crypto.randomUUID()}`); databases.push(database)
    await registerAccount('conta.a.ficticia@example.invalid', 'senha-ficticia-segura-2026', database)

    await registerAccount('conta.b.ficticia@example.invalid', 'senha-ficticia-segura-2027', database)
    await expect(registerAccount('conta.a.ficticia@example.invalid', 'senha-ficticia-segura-2028', database)).rejects.toThrow('já existe neste aparelho')

    expect(await database.accounts.count()).toBe(2)
  })

  it('recusa envelope de recuperação pertencente a outra conta', async () => {
    const database = new ApoioDatabase(`session-recovery-${crypto.randomUUID()}`); databases.push(database)
    const current = account('conta-ficticia-a'); await database.accounts.put(current)
    const recovery = await createRecoveryEnvelope(await generateMasterKey())
    await database.keyEnvelopes.put({ id: keyEnvelopeId('conta-ficticia-b', 'recovery'), kind: 'recovery' as const, accountId: 'conta-ficticia-b', envelope: recovery.envelope, updatedAt: current.createdAt })
    await expect(recoverAccount(current.email, recovery.recoveryCode, 'nova-senha-ficticia-2026', database)).rejects.toThrow('indisponível')
  })

  it('recusa troca de senha com envelope pertencente a outra conta', async () => {
    const database = new ApoioDatabase(`session-password-${crypto.randomUUID()}`); databases.push(database)
    const current = account('conta-ficticia-a'); await database.accounts.put(current)
    const envelope = await createPasswordEnvelope(await generateMasterKey(), 'senha-ficticia-atual-2026')
    await database.keyEnvelopes.put({ id: keyEnvelopeId('conta-ficticia-b', 'password'), kind: 'password' as const, accountId: 'conta-ficticia-b', envelope, updatedAt: current.createdAt })
    await expect(changeVaultPassword(current, 'senha-ficticia-atual-2026', 'senha-ficticia-nova-2026', database)).rejects.toThrow('indisponível')
  })
})
