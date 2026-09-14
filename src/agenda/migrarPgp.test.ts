import { afterEach, describe, expect, it } from 'vitest'
import { encryptPayload, generateMasterKey } from '../crypto/vault'
import { ApoioDatabase } from '../db/database'
import { VaultRepository } from '../db/repository'
import { MigracaoPgpParaConcilio } from './migrarPgp'
import { AgendaService } from './service'

const bancos: ApoioDatabase[] = []
afterEach(async () => { await Promise.all(bancos.splice(0).map((banco) => banco.delete())) })

async function cenario() {
  const database = new ApoioDatabase(`agenda-pgp-${crypto.randomUUID()}`)
  bancos.push(database)
  return { database, key: await generateMasterKey(), accountId: 'conta-ficticia', repo: new VaultRepository(database) }
}

/* Grava como uma versão antiga do aplicativo gravava: category 'pgp', dia todo. */
async function gravarAntigo(c: Awaited<ReturnType<typeof cenario>>, category: string, extra: Record<string, unknown> = {}) {
  const id = crypto.randomUUID()
  const data = {
    title: `${category} antigo fictício`, category, churchId: 'igreja-a', location: 'Sede fictícia', address: '',
    visitTarget: 'none', sermonId: null, sermonSnapshot: null, startAt: '2025-03-10T09:00', endAt: '2025-03-10T12:00',
    allDay: true, reminderMinutes: null, notes: 'Anotação histórica fictícia', includeInItinerary: true,
    mondayException: false, createdAt: '2025-01-01T00:00:00.000Z', updatedAt: '2025-01-01T00:00:00.000Z', ...extra,
  }
  await c.repo.saveEncrypted(c.accountId, 'aparelho', id, await encryptPayload(c.key, { schemaVersion: 1, type: 'agenda_event', data }, id), 'agenda_event')
  return id
}

describe('PGP vira Concílio do tipo PGP', () => {
  it('migra, preservando título, local, observação, datas e criação', async () => {
    const c = await cenario()
    const id = await gravarAntigo(c, 'pgp')
    const resultado = await new MigracaoPgpParaConcilio(c.database).migrar(c.accountId, c.key)
    expect(resultado).toEqual({ migrados: 1, ilegiveis: 0 })

    const evento = await new AgendaService(c.database).getEvent(c.accountId, c.key, id)
    expect(evento).toMatchObject({
      category: 'council', title: 'pgp antigo fictício', location: 'Sede fictícia', notes: 'Anotação histórica fictícia',
      startAt: '2025-03-10T09:00', endAt: '2025-03-10T12:00', createdAt: '2025-01-01T00:00:00.000Z',
    })
    expect(evento?.encontro?.tipoConcilio).toBe('pgp')
  })

  it('rodar de novo não faz nada e não duplica', async () => {
    const c = await cenario()
    await gravarAntigo(c, 'pgp')
    const migracao = new MigracaoPgpParaConcilio(c.database)
    await migracao.migrar(c.accountId, c.key)
    expect(await migracao.migrar(c.accountId, c.key)).toEqual({ migrados: 0, ilegiveis: 0 })
    expect(await new AgendaService(c.database).listEvents(c.accountId, c.key)).toHaveLength(1)
  })

  it('não toca em viagem nem em outros tipos antigos', async () => {
    const c = await cenario()
    const viagem = await gravarAntigo(c, 'travel')
    await gravarAntigo(c, 'meeting')
    expect((await new MigracaoPgpParaConcilio(c.database).migrar(c.accountId, c.key)).migrados).toBe(0)
    const evento = await new AgendaService(c.database).getEvent(c.accountId, c.key, viagem)
    expect(evento?.category).toBe('travel')
    expect(evento?.allDay).toBe(true)
  })

  /* Antes mesmo de migrar — ou chegando de outro aparelho —, a leitura já mostra Concílio. */
  it('a leitura apresenta PGP como Concílio mesmo sem migrar', async () => {
    const c = await cenario()
    const id = await gravarAntigo(c, 'pgp')
    const evento = await new AgendaService(c.database).getEvent(c.accountId, c.key, id)
    expect(evento?.category).toBe('council')
    expect(evento?.encontro?.tipoConcilio).toBe('pgp')
  })

  it('nada é apagado: a quantidade de registros continua a mesma', async () => {
    const c = await cenario()
    await gravarAntigo(c, 'pgp'); await gravarAntigo(c, 'pgp'); await gravarAntigo(c, 'travel')
    const antes = await c.database.vaultRecords.count()
    await new MigracaoPgpParaConcilio(c.database).migrar(c.accountId, c.key)
    expect(await c.database.vaultRecords.count()).toBe(antes)
  })
})
