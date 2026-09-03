import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { encryptPayload, generateMasterKey } from '../crypto/vault'
import { BackupService } from '../backup/service'
import { FamilyBudgetDatabase } from '../family-budget/database'
import { ReadingDatabase } from '../reading/database'
import { ApoioDatabase } from './database'
import { VaultRepository } from './repository'
import { countCorruptedRecords, listCorruptedRecords, readPayload, readPayloads } from './corrupted'

/**
 * Um registro cifrado que não abre não pode derrubar o aparelho inteiro.
 *
 * Antes, a quarentena vivia em um conjunto na memória: a contagem sumia a cada
 * recarregamento, e — pior — quem lia em lote chamava `decryptPayload`, que
 * levanta exceção. Um único registro corrompido derrubava a criação do backup,
 * a exportação dos dados de uma pessoa, o encerramento do distrito e as
 * listagens. Para o pastor, isso é indistinguível de ter perdido tudo.
 */
const CONTA = 'conta-ficticia-quarentena'
const APARELHO = 'aparelho-ficticio'
const bancos: ApoioDatabase[] = []
const bancosLeitura: ReadingDatabase[] = []
const bancosFamilia: FamilyBudgetDatabase[] = []

afterEach(async () => {
  await Promise.all(bancos.splice(0).map((banco) => banco.delete()))
  await Promise.all(bancosLeitura.splice(0).map((banco) => banco.delete()))
  await Promise.all(bancosFamilia.splice(0).map((banco) => banco.delete()))
})

function novoBanco() {
  const banco = new ApoioDatabase(`quarentena-${crypto.randomUUID()}`)
  bancos.push(banco)
  return banco
}

async function gravar(banco: ApoioDatabase, chave: CryptoKey, tipo: string, dados: object) {
  const id = crypto.randomUUID()
  await new VaultRepository(banco).saveEncrypted(CONTA, APARELHO, id, await encryptPayload(chave, { schemaVersion: 1, type: tipo, data: dados }, id), 'person')
  return id
}

describe('quarentena de registros cifrados que não abrem', () => {
  it('devolve o conteúdo quando o registro abre e não guarda nada de lado', async () => {
    const banco = novoBanco(); const chave = await generateMasterKey()
    const id = await gravar(banco, chave, 'person', { name: 'Pessoa Fictícia Íntegra' })

    const payload = await readPayload(chave, (await banco.vaultRecords.get(id))!, banco)

    expect(payload?.type).toBe('person')
    expect(await countCorruptedRecords(CONTA, banco)).toBe(0)
  })

  it('guarda de lado o registro que não abre e devolve nulo', async () => {
    const banco = novoBanco(); const chave = await generateMasterKey(); const outraChave = await generateMasterKey()
    const id = await gravar(banco, outraChave, 'person', { name: 'Registro Ilegível Fictício' })

    const payload = await readPayload(chave, (await banco.vaultRecords.get(id))!, banco)

    expect(payload).toBeNull()
    const emQuarentena = await listCorruptedRecords(CONTA, banco)
    expect(emQuarentena).toHaveLength(1)
    expect(emQuarentena[0]).toMatchObject({ recordId: id, accountId: CONTA, reason: 'nao-abriu' })
  })

  it('a quarentena sobrevive ao fechamento do navegador', async () => {
    // O conjunto em memória zerava a cada recarregamento: o aviso sumia e o
    // pastor nunca ficava sabendo que havia registro ilegível.
    const nome = `quarentena-persistente-${crypto.randomUUID()}`
    const primeiro = new ApoioDatabase(nome); bancos.push(primeiro)
    const chave = await generateMasterKey(); const outraChave = await generateMasterKey()
    const id = crypto.randomUUID()
    await new VaultRepository(primeiro).saveEncrypted(CONTA, APARELHO, id, await encryptPayload(outraChave, { schemaVersion: 1, type: 'person', data: { name: 'Ilegível' } }, id), 'person')
    await readPayload(chave, (await primeiro.vaultRecords.get(id))!, primeiro)
    primeiro.close()

    const depois = new ApoioDatabase(nome); bancos.push(depois)
    expect(await countCorruptedRecords(CONTA, depois)).toBe(1)
  })

  it('reconhece o envelope colocado na linha de outro registro', async () => {
    const banco = novoBanco(); const chave = await generateMasterKey()
    const certo = await gravar(banco, chave, 'person', { name: 'Pessoa Fictícia' })
    const trocado = await banco.vaultRecords.get(certo)
    await banco.vaultRecords.put({ ...trocado!, id: 'linha-de-outro-registro' })

    const payload = await readPayload(chave, (await banco.vaultRecords.get('linha-de-outro-registro'))!, banco)

    expect(payload).toBeNull()
    expect((await listCorruptedRecords(CONTA, banco))[0]?.reason).toBe('vinculo')
  })

  it('sai da quarentena sozinho quando o registro volta a abrir', async () => {
    const banco = novoBanco(); const chave = await generateMasterKey(); const outraChave = await generateMasterKey()
    const id = await gravar(banco, outraChave, 'person', { name: 'Ilegível Fictício' })
    await readPayload(chave, (await banco.vaultRecords.get(id))!, banco)
    expect(await countCorruptedRecords(CONTA, banco)).toBe(1)

    // Uma sincronização ou uma restauração trouxe a versão boa.
    const bom = await banco.vaultRecords.get(id)
    await banco.vaultRecords.put({ ...bom!, ...(await encryptPayload(chave, { schemaVersion: 1, type: 'person', data: { name: 'Pessoa Fictícia Recuperada' } }, id)) })

    const payload = await readPayload(chave, (await banco.vaultRecords.get(id))!, banco)

    expect(payload?.type).toBe('person')
    expect(await countCorruptedRecords(CONTA, banco)).toBe(0)
  })

  it('a leitura em lote pula o ruim e entrega todos os íntegros', async () => {
    const banco = novoBanco(); const chave = await generateMasterKey(); const outraChave = await generateMasterKey()
    await gravar(banco, chave, 'person', { name: 'Pessoa Fictícia Um' })
    await gravar(banco, outraChave, 'person', { name: 'Ilegível Fictício' })
    await gravar(banco, chave, 'person', { name: 'Pessoa Fictícia Dois' })

    const registros = await banco.vaultRecords.where('accountId').equals(CONTA).toArray()
    const { opened, skipped } = await readPayloads(chave, registros, banco)

    expect(opened).toHaveLength(2)
    expect(skipped).toHaveLength(1)
  })

  it('um registro corrompido não impede a criação do backup', async () => {
    // O backup é justamente o que resolve um registro corrompido; era ele o
    // primeiro a cair.
    const banco = novoBanco(); const chave = await generateMasterKey(); const outraChave = await generateMasterKey()
    await gravar(banco, chave, 'person', { name: 'Pessoa Fictícia Íntegra' })
    await gravar(banco, outraChave, 'person', { name: 'Ilegível Fictício' })
    const leitura = new ReadingDatabase(`leitura-${crypto.randomUUID()}`); bancosLeitura.push(leitura)
    const familia = new FamilyBudgetDatabase(`orcamento-${crypto.randomUUID()}`); bancosFamilia.push(familia)

    const backup = await new BackupService(banco, leitura, familia).create(CONTA, chave, 'codigo-ficticio-de-backup')

    expect(backup.summary.recordCount).toBe(1)
    expect(backup.summary.skippedCount).toBe(1)
    expect(await countCorruptedRecords(CONTA, banco)).toBe(1)
  })

  it('a quarentena é por conta: uma não vê a da outra', async () => {
    const banco = novoBanco(); const chave = await generateMasterKey(); const outraChave = await generateMasterKey()
    const id = crypto.randomUUID()
    await new VaultRepository(banco).saveEncrypted('outra-conta-ficticia', APARELHO, id, await encryptPayload(outraChave, { schemaVersion: 1, type: 'person', data: { name: 'Ilegível' } }, id), 'person')
    await readPayload(chave, (await banco.vaultRecords.get(id))!, banco)

    expect(await countCorruptedRecords(CONTA, banco)).toBe(0)
    expect(await countCorruptedRecords('outra-conta-ficticia', banco)).toBe(1)
  })
})
