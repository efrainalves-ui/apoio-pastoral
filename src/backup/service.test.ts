import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { decryptPayload, encryptPayload, generateMasterKey } from '../crypto/vault'
import { ApoioDatabase } from '../db/database'
import { ReadingDatabase } from '../reading/database'
import { FamilyBudgetDatabase } from '../family-budget/database'
import { BackupService, pendingBackupRestore } from './service'

const databases: ApoioDatabase[] = []
afterEach(async () => { localStorage.clear(); await Promise.all(databases.splice(0).map((database) => database.delete())) })

async function seed(database: ApoioDatabase, accountId: string, key: CryptoKey, id: string, name: string) {
  await database.vaultRecords.put({ id, accountId, recordType: 'district', version: 1, createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z', ...(await encryptPayload(key, { schemaVersion: 1, type: 'district', data: { name } }, id)) })
}

describe('backup protegido e isolado por conta', () => {
  it('restaura na mesma conta, recusa código errado e não persiste texto legível', async () => {
    const source = new ApoioDatabase(`backup-source-${crypto.randomUUID()}`); const target = new ApoioDatabase(`backup-target-${crypto.randomUUID()}`); databases.push(source, target)
    const sourceKey = await generateMasterKey(); const targetKey = await generateMasterKey(); const accountId = 'conta-ficticia-a'
    await seed(source, accountId, sourceKey, 'district-fixture', 'Distrito Fictício')
    const file = (await new BackupService(source).create(accountId, sourceKey, 'codigo-ficticio-123')).file
    await expect(new BackupService(target).restore(accountId, targetKey, 'codigo-errado-123', file)).rejects.toThrow()
    expect(await target.vaultRecords.count()).toBe(0)
    await new BackupService(target).restore(accountId, targetKey, 'codigo-ficticio-123', file)
    const restored = await target.vaultRecords.get('district-fixture')
    expect(restored && await decryptPayload(targetKey, restored)).toMatchObject({ data: { name: 'Distrito Fictício' } })
    expect(JSON.stringify(await target.vaultRecords.toArray())).not.toContain('Distrito Fictício')
  })

  it('recusa restauração em outra conta sem gravar registros', async () => {
    const source = new ApoioDatabase(`backup-account-source-${crypto.randomUUID()}`); const target = new ApoioDatabase(`backup-account-target-${crypto.randomUUID()}`); databases.push(source, target)
    const key = await generateMasterKey(); await seed(source, 'conta-ficticia-a', key, 'fixture-a', 'Distrito Fictício A')
    const file = (await new BackupService(source).create('conta-ficticia-a', key, 'codigo-ficticio-123')).file
    await expect(new BackupService(target).restore('conta-ficticia-b', await generateMasterKey(), 'codigo-ficticio-123', file)).rejects.toThrow('outra conta')
    expect(await target.vaultRecords.count()).toBe(0)
  })

  it('não deixa restauração parcial quando um registro conflita com outra conta', async () => {
    const source = new ApoioDatabase(`backup-atomic-source-${crypto.randomUUID()}`); const target = new ApoioDatabase(`backup-atomic-target-${crypto.randomUUID()}`); databases.push(source, target)
    const sourceKey = await generateMasterKey(); const targetKey = await generateMasterKey()
    await seed(source, 'conta-ficticia-a', sourceKey, 'fixture-livre', 'Distrito Fictício Livre')
    await seed(source, 'conta-ficticia-a', sourceKey, 'fixture-conflito', 'Distrito Fictício Conflito')
    await seed(target, 'conta-ficticia-b', targetKey, 'fixture-conflito', 'Outro Distrito Fictício')
    const file = (await new BackupService(source).create('conta-ficticia-a', sourceKey, 'codigo-ficticio-123')).file
    await expect(new BackupService(target).restore('conta-ficticia-a', targetKey, 'codigo-ficticio-123', file)).rejects.toThrow()
    expect(await target.vaultRecords.get('fixture-livre')).toBeUndefined()
    expect((await target.vaultRecords.get('fixture-conflito'))?.accountId).toBe('conta-ficticia-b')
  })
})

/**
 * O que uma revisão adversarial faz com um arquivo de backup: manda outro
 * arquivo, manda pela metade, manda gigante, manda de outra conta, e tenta
 * restaurar em um navegador que nunca viu essa conta.
 */
describe('backup diante de arquivo ruim', () => {
  const bancos: ApoioDatabase[] = []
  const leituras: ReadingDatabase[] = []
  const orcamentos: FamilyBudgetDatabase[] = []
  afterEach(async () => {
    await Promise.all([
      ...bancos.splice(0).map((banco) => banco.delete()),
      ...leituras.splice(0).map((banco) => banco.delete()),
      ...orcamentos.splice(0).map((banco) => banco.delete()),
    ])
  })

  function ambiente(rotulo: string) {
    const banco = new ApoioDatabase(`backup-${rotulo}-${crypto.randomUUID()}`); bancos.push(banco)
    const leitura = new ReadingDatabase(`leitura-${rotulo}-${crypto.randomUUID()}`); leituras.push(leitura)
    const orcamento = new FamilyBudgetDatabase(`orcamento-${rotulo}-${crypto.randomUUID()}`); orcamentos.push(orcamento)
    return { banco, servico: new BackupService(banco, leitura, orcamento), leitura, orcamento }
  }

  it('recusa um arquivo que não é backup deste aplicativo', async () => {
    const { servico, banco } = ambiente('estranho')
    await expect(servico.restore('conta-ficticia-a', await generateMasterKey(), 'codigo-ficticio-123', { formato: 'outro' }))
      .rejects.toThrow('Verifique o arquivo')
    expect(await banco.vaultRecords.count()).toBe(0)
  })

  it('recusa um arquivo truncado', async () => {
    const origem = ambiente('truncado-origem')
    const key = await generateMasterKey()
    await seed(origem.banco, 'conta-ficticia-a', key, 'fixture-a', 'Distrito Fictício A')
    const { file } = await origem.servico.create('conta-ficticia-a', key, 'codigo-ficticio-123')
    const cortado = { ...file, ciphertext: file.ciphertext.slice(0, Math.floor(file.ciphertext.length / 2)) }

    const destino = ambiente('truncado-destino')
    await expect(destino.servico.restore('conta-ficticia-a', key, 'codigo-ficticio-123', cortado)).rejects.toThrow('Verifique o arquivo')
    expect(await destino.banco.vaultRecords.count()).toBe(0)
  })

  it('recusa um arquivo de versão diferente sem tentar abrir', async () => {
    const { servico } = ambiente('versao')
    await expect(servico.restore('conta-ficticia-a', await generateMasterKey(), 'codigo-ficticio-123', {
      format: 'apoio-pastoral-backup', version: 3, salt: 'x', iv: 'x', ciphertext: 'x',
    })).rejects.toThrow('outra versão do aplicativo')
  })

  it('recusa um arquivo grande demais para ser deste aplicativo', async () => {
    const { servico } = ambiente('gigante')
    const enorme = { format: 'apoio-pastoral-backup', version: 4, salt: 'x', iv: 'x', ciphertext: 'a'.repeat(70 * 1024 * 1024) }
    await expect(servico.restore('conta-ficticia-a', await generateMasterKey(), 'codigo-ficticio-123', enorme))
      .rejects.toThrow('grande demais')
  })

  it('leva leitura e orçamento familiar no mesmo arquivo e devolve num navegador novo', async () => {
    const origem = ambiente('pessoal-origem')
    const key = await generateMasterKey()
    await seed(origem.banco, 'conta-ficticia-a', key, 'fixture-a', 'Distrito Fictício A')
    const envelopeLeitura = await encryptPayload(key, { schemaVersion: 1, type: 'personal_reading_book', data: { title: 'Livro Fictício' } }, 'leitura-1')
    await origem.leitura.records.put({ id: 'leitura-1', accountId: 'conta-ficticia-a', recordType: 'book', createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z', ...envelopeLeitura })
    const envelopeOrcamento = await encryptPayload(key, { schemaVersion: 1, type: 'family_budget_expense', data: { amount: 10 } }, 'orcamento-1')
    await origem.orcamento.records.put({ id: 'orcamento-1', accountId: 'conta-ficticia-a', recordType: 'expense', createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z', ...envelopeOrcamento })

    const { file, summary } = await origem.servico.create('conta-ficticia-a', key, 'codigo-ficticio-123')
    expect(summary.personalCount).toBe(2)

    const destino = ambiente('pessoal-destino')
    const resultado = await destino.servico.restore('conta-ficticia-a', key, 'codigo-ficticio-123', file)

    expect(resultado.personalCount).toBe(2)
    expect(await destino.leitura.records.get('leitura-1')).toMatchObject({ accountId: 'conta-ficticia-a' })
    expect(await destino.orcamento.records.get('orcamento-1')).toMatchObject({ accountId: 'conta-ficticia-a' })
    expect(JSON.stringify(await destino.leitura.records.toArray())).not.toContain('Livro Fictício')
  })
})

/**
 * Restauração validada antes de começar, atômica por etapas e retomável.
 *
 * A auditoria apontou três coisas: a conferência do conteúdo acontecia com a
 * restauração já em andamento, uma interrupção deixava metade de um backup
 * dentro do cofre sem nada pendente que fizesse alguém voltar, e a
 * sincronização subia esse estado pela metade para os outros aparelhos.
 */
describe('restauração validada, atômica e retomável', () => {
  const CONTA = 'conta-ficticia-restauracao'
  const CODIGO = 'codigo-ficticio-de-backup'

  async function arquivoFicticio(quantos: number) {
    const origem = new ApoioDatabase(`restauro-origem-${crypto.randomUUID()}`); databases.push(origem)
    const chave = await generateMasterKey()
    for (let indice = 0; indice < quantos; indice += 1) {
      await seed(origem, CONTA, chave, `registro-ficticio-${indice}`, `Distrito Fictício ${indice}`)
    }
    return { file: (await new BackupService(origem).create(CONTA, chave, CODIGO)).file, chave }
  }

  it('confere o arquivo inteiro antes de gravar o primeiro registro', async () => {
    const destino = new ApoioDatabase(`restauro-destino-${crypto.randomUUID()}`); databases.push(destino)
    const { file } = await arquivoFicticio(3)
    const adulterado = { ...file, ciphertext: `${file.ciphertext.slice(0, -4)}AAAA` }

    await expect(new BackupService(destino).restore(CONTA, await generateMasterKey(), CODIGO, adulterado)).rejects.toThrow()

    expect(await destino.vaultRecords.count()).toBe(0)
    // Nem a marca de pendência foi gravada: a conferência vem antes de tudo.
    expect(await destino.pendingActions.count()).toBe(0)
  })

  it('não deixa marca pendente quando a restauração termina', async () => {
    const destino = new ApoioDatabase(`restauro-completo-${crypto.randomUUID()}`); databases.push(destino)
    const { file } = await arquivoFicticio(3)

    const resultado = await new BackupService(destino).restore(CONTA, await generateMasterKey(), CODIGO, file)

    expect(resultado.completed).toBe(true)
    expect(resultado.recordCount).toBe(3)
    expect(await pendingBackupRestore(CONTA, destino)).toBeNull()
  })

  it('interrompida no meio, deixa a pendência e retoma sem repetir o que já entrou', async () => {
    const destino = new ApoioDatabase(`restauro-interrompido-${crypto.randomUUID()}`); databases.push(destino)
    const { file } = await arquivoFicticio(3)
    const chave = await generateMasterKey()

    // Simula a interrupção: a marca fica com um registro já aplicado e os
    // outros não, exatamente como o navegador fechado no meio deixaria.
    await destino.pendingActions.put({
      id: `${CONTA}:restore_backup`, accountId: CONTA, kind: 'restore_backup',
      createdAt: new Date().toISOString(), stage: 'restoring_pastoral',
      restore: { file, appliedRecordIds: ['registro-ficticio-0'], appliedPersonalIds: [], totalRecords: 3, totalPersonal: 0 },
    })
    await seed(destino, CONTA, chave, 'registro-ficticio-0', 'Distrito Fictício 0')

    const pendente = await pendingBackupRestore(CONTA, destino)
    expect(pendente).toMatchObject({ applied: 1, total: 3 })

    const resultado = await new BackupService(destino).resume(CONTA, chave, CODIGO)

    expect(resultado.completed).toBe(true)
    expect(await destino.vaultRecords.count()).toBe(3)
    expect(await pendingBackupRestore(CONTA, destino)).toBeNull()
    // O registro que já estava lá não foi gravado de novo: uma segunda
    // gravação criaria uma operação a mais na fila de envio, sem necessidade.
    const fila = await destino.outbox.where('recordId').equals('registro-ficticio-0').toArray()
    expect(fila).toHaveLength(0)
  })

  it('a retomada exige o mesmo código: o arquivo guardado continua cifrado', async () => {
    const destino = new ApoioDatabase(`restauro-codigo-${crypto.randomUUID()}`); databases.push(destino)
    const { file } = await arquivoFicticio(2)
    await destino.pendingActions.put({
      id: `${CONTA}:restore_backup`, accountId: CONTA, kind: 'restore_backup',
      createdAt: new Date().toISOString(), stage: 'restoring_pastoral',
      restore: { file, appliedRecordIds: [], appliedPersonalIds: [], totalRecords: 2, totalPersonal: 0 },
    })

    await expect(new BackupService(destino).resume(CONTA, await generateMasterKey(), 'codigo-ficticio-errado')).rejects.toThrow()
    expect(await pendingBackupRestore(CONTA, destino)).not.toBeNull()
    // O conteúdo aberto nunca é gravado no banco local: só o arquivo cifrado.
    expect(JSON.stringify(await destino.pendingActions.toArray())).not.toContain('Distrito Fictício')
  })

  it('recusa retomar o que não começou', async () => {
    const destino = new ApoioDatabase(`restauro-sem-pendencia-${crypto.randomUUID()}`); databases.push(destino)
    await expect(new BackupService(destino).resume(CONTA, await generateMasterKey(), CODIGO)).rejects.toThrow('Não há restauração pendente')
  })

  it('recusa um backup de outra conta antes de gravar e sem deixar pendência', async () => {
    const destino = new ApoioDatabase(`restauro-outra-conta-${crypto.randomUUID()}`); databases.push(destino)
    const { file } = await arquivoFicticio(2)

    await expect(new BackupService(destino).restore('conta-ficticia-vizinha', await generateMasterKey(), CODIGO, file)).rejects.toThrow('outra conta')

    expect(await destino.vaultRecords.count()).toBe(0)
    expect(await destino.pendingActions.count()).toBe(0)
  })
})
