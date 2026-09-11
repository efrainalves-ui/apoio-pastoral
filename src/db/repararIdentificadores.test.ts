import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { encryptPayload, generateMasterKey } from '../crypto/vault'
import { ApoioDatabase } from './database'
import { ehUuid } from './identificadores'
import { ReparoDeIdentificadores } from './repararIdentificadores'
import { VaultRepository } from './repository'

vi.mock('../auth/supabase', async (importarOriginal) => ({
  ...await importarOriginal<Record<string, unknown>>(),
  hasSupabaseConfiguration: false,
  ensureRemoteDevice: vi.fn(() => Promise.resolve()),
}))

const CONTA = 'conta-ficticia-reparo'
const bancos: ApoioDatabase[] = []

beforeEach(() => localStorage.clear())
afterEach(async () => {
  await Promise.all(bancos.splice(0).map((banco) => banco.delete()))
  localStorage.clear()
})

function novoBanco() {
  const banco = new ApoioDatabase(`reparo-${crypto.randomUUID()}`)
  bancos.push(banco)
  return banco
}

describe('reparo dos identificadores que o serviço recusa', () => {
  /*
    O serviço converte `record_id` para `uuid`, e a conversão que falha derruba o
    lote inteiro. Um registro torto bastava para nada mais sair do aparelho.
  */
  it('regrava o registro torto sob um identificador válido', async () => {
    const banco = novoBanco(); const chave = await generateMasterKey()
    const repo = new VaultRepository(banco)
    await repo.saveEncrypted(CONTA, 'aparelho-ficticio', 'work-config-conta-ficticia',
      await encryptPayload(chave, { schemaVersion: 1, type: 'work_config', data: { campo: 'Campo Fictício' } }, 'work-config-conta-ficticia'), 'work_config')

    expect(await new ReparoDeIdentificadores(banco).reparar(CONTA)).toMatchObject({ reparados: 1 })

    const guardados = await banco.vaultRecords.where('accountId').equals(CONTA).toArray()
    expect(guardados).toHaveLength(1)
    expect(ehUuid(guardados[0]!.id)).toBe(true)
    expect(guardados[0]?.recordType).toBe('work_config')
  })

  /* O conteúdo cifrado atravessa como está: o reparo não precisa da chave. */
  it('o conteúdo é preservado', async () => {
    const banco = novoBanco(); const chave = await generateMasterKey()
    const envelope = await encryptPayload(chave, { schemaVersion: 1, type: 'work_config', data: { campo: 'Campo Fictício' } }, 'work-config-conta-ficticia')
    await new VaultRepository(banco).saveEncrypted(CONTA, 'aparelho-ficticio', 'work-config-conta-ficticia', envelope, 'work_config')

    await new ReparoDeIdentificadores(banco).reparar(CONTA)

    const [guardado] = await banco.vaultRecords.where('accountId').equals(CONTA).toArray()
    expect(guardado?.ciphertext).toBe(envelope.ciphertext)
  })

  /*
    As operações presas são descartadas: elas nunca chegaram ao serviço, e
    mantê-las travaria a fila de novo no primeiro envio.
  */
  it('descarta as operações que estavam presas', async () => {
    const banco = novoBanco(); const chave = await generateMasterKey()
    await new VaultRepository(banco).saveEncrypted(CONTA, 'aparelho-ficticio', 'pessoal-migracao-abc',
      await encryptPayload(chave, { schemaVersion: 1, type: 'pessoal_migracao', data: { ids: [] } }, 'pessoal-migracao-abc'), 'pessoal_migracao')

    const antes = await banco.outbox.where('recordId').equals('pessoal-migracao-abc').count()
    expect(antes).toBeGreaterThan(0)

    const resultado = await new ReparoDeIdentificadores(banco).reparar(CONTA)
    expect(resultado.operacoesDescartadas).toBe(antes)
    expect(await banco.outbox.where('recordId').equals('pessoal-migracao-abc').count()).toBe(0)
  })

  it('não mexe no que já está válido', async () => {
    const banco = novoBanco(); const chave = await generateMasterKey()
    const id = crypto.randomUUID()
    await new VaultRepository(banco).saveEncrypted(CONTA, 'aparelho-ficticio', id,
      await encryptPayload(chave, { schemaVersion: 1, type: 'person', data: {} }, id), 'person')

    expect(await new ReparoDeIdentificadores(banco).reparar(CONTA)).toMatchObject({ reparados: 0, operacoesDescartadas: 0 })
    expect((await banco.vaultRecords.get(id))?.id).toBe(id)
  })

  it('rodar de novo não faz nada', async () => {
    const banco = novoBanco(); const chave = await generateMasterKey()
    await new VaultRepository(banco).saveEncrypted(CONTA, 'aparelho-ficticio', 'work-config-x',
      await encryptPayload(chave, { schemaVersion: 1, type: 'work_config', data: {} }, 'work-config-x'), 'work_config')

    const reparo = new ReparoDeIdentificadores(banco)
    await reparo.reparar(CONTA)
    expect(await reparo.reparar(CONTA)).toMatchObject({ reparados: 0 })
  })
})
