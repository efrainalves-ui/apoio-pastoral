import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { decryptRecord, encryptPayload, generateMasterKey } from '../crypto/vault'
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

async function gravarTorto(banco: ApoioDatabase, chave: CryptoKey, id: string, tipo: string, dados: unknown) {
  await new VaultRepository(banco).saveEncrypted(
    CONTA, 'aparelho-ficticio', id,
    await encryptPayload(chave, { schemaVersion: 1, type: tipo, data: dados }, id),
    tipo as never,
  )
}

describe('reparo dos identificadores que o serviço recusa', () => {
  /*
    O serviço converte `record_id` para `uuid`, e a conversão que falha derruba o
    lote inteiro. Um registro torto bastava para nada mais sair do aparelho.
  */
  it('regrava o registro torto sob um identificador válido', async () => {
    const banco = novoBanco(); const chave = await generateMasterKey()
    await gravarTorto(banco, chave, 'work-config-conta-ficticia', 'work_config', { campo: 'Campo Fictício' })

    expect(await new ReparoDeIdentificadores(banco).reparar(CONTA, chave)).toMatchObject({ reparados: 1, ilegiveis: 0 })

    const guardados = await banco.vaultRecords.where('accountId').equals(CONTA).toArray()
    expect(guardados).toHaveLength(1)
    expect(ehUuid(guardados[0]!.id)).toBe(true)
    expect(guardados[0]?.recordType).toBe('work_config')
  })

  /*
    O teste que importa, e o que faltava antes.

    O AAD amarra o texto cifrado ao identificador do registro. Copiar o envelope
    para outro id produz exatamente o defeito que ele existe para impedir — e a
    tela diz "Registro não confere com o conteúdo guardado". Mover é recifrar.
  */
  it('o registro reparado continua legível', async () => {
    const banco = novoBanco(); const chave = await generateMasterKey()
    await gravarTorto(banco, chave, 'work-config-conta-ficticia', 'work_config', { campo: 'Campo Fictício' })

    await new ReparoDeIdentificadores(banco).reparar(CONTA, chave)

    const [guardado] = await banco.vaultRecords.where('accountId').equals(CONTA).toArray()
    const payload = await decryptRecord(chave, guardado!)
    expect(payload?.type).toBe('work_config')
    expect(payload?.data).toMatchObject({ campo: 'Campo Fictício' })
  })

  /*
    As operações presas são descartadas: elas nunca chegaram ao serviço, e
    mantê-las travaria a fila de novo no primeiro envio.
  */
  it('descarta as operações que estavam presas', async () => {
    const banco = novoBanco(); const chave = await generateMasterKey()
    await gravarTorto(banco, chave, 'pessoal-migracao-abc', 'pessoal_migracao', { ids: [] })

    const antes = await banco.outbox.where('recordId').equals('pessoal-migracao-abc').count()
    expect(antes).toBeGreaterThan(0)

    const resultado = await new ReparoDeIdentificadores(banco).reparar(CONTA, chave)
    expect(resultado.operacoesDescartadas).toBe(antes)
    expect(await banco.outbox.where('recordId').equals('pessoal-migracao-abc').count()).toBe(0)
  })

  /*
    Um registro que não abre fica onde está. Movê-lo às cegas produziria um
    ilegível sob identificador novo, e nem o original sobraria para tentar de
    novo em outro aparelho.
  */
  it('o que não abre não é movido', async () => {
    const banco = novoBanco(); const chave = await generateMasterKey()
    const outraChave = await generateMasterKey()
    await gravarTorto(banco, outraChave, 'work-config-ilegivel', 'work_config', { campo: 'Não abre' })

    expect(await new ReparoDeIdentificadores(banco).reparar(CONTA, chave)).toMatchObject({ reparados: 0, ilegiveis: 1 })
    expect(await banco.vaultRecords.get('work-config-ilegivel')).toBeTruthy()
  })

  it('não mexe no que já está válido', async () => {
    const banco = novoBanco(); const chave = await generateMasterKey()
    const id = crypto.randomUUID()
    await gravarTorto(banco, chave, id, 'person', {})

    expect(await new ReparoDeIdentificadores(banco).reparar(CONTA, chave)).toMatchObject({ reparados: 0, operacoesDescartadas: 0 })
    expect((await banco.vaultRecords.get(id))?.id).toBe(id)
  })

  it('rodar de novo não faz nada', async () => {
    const banco = novoBanco(); const chave = await generateMasterKey()
    await gravarTorto(banco, chave, 'work-config-x', 'work_config', {})

    const reparo = new ReparoDeIdentificadores(banco)
    await reparo.reparar(CONTA, chave)
    expect(await reparo.reparar(CONTA, chave)).toMatchObject({ reparados: 0 })
  })
})
