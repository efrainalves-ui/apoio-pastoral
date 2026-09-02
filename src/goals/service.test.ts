import 'fake-indexeddb/auto'; import { afterEach, describe, expect, it } from 'vitest'; import { generateMasterKey } from '../crypto/vault'; import { ApoioDatabase } from '../db/database'; import { GoalsService, parseGoalsPdf } from './service'
const databases: ApoioDatabase[] = []; afterEach(async()=>{await Promise.all(databases.map((item)=>item.delete())); databases.length=0})
describe('metas cifradas',()=>{it('faz prévia local e guarda lançamentos sem plaintext',async()=>{const preview=parseGoalsPdf('church-fixture|2026-01-15|tithes_offerings|120|Janeiro', 'hash');expect(preview.entries).toHaveLength(1);const database=new ApoioDatabase(`goals-${crypto.randomUUID()}`);databases.push(database);const key=await generateMasterKey();const service=new GoalsService(database);await service.addEntries('account-fixture',key,preview.entries.map((entry)=>({...entry,source:'pdf' as const})));await service.saveGoal('account-fixture',key,{churchId:'church-fixture',year:2026,metric:'tithes_offerings',target:500});expect(JSON.stringify(await database.vaultRecords.toArray())).not.toContain('Janeiro');expect(await service.listEntries('account-fixture',key)).toHaveLength(1)})})

describe('resultado consolidado do ano anterior', () => {
  it('guarda por área e ano, atualiza no lugar e não vira lançamento', async () => {
    const database = new ApoioDatabase(`goals-history-${crypto.randomUUID()}`); databases.push(database)
    const key = await generateMasterKey(); const service = new GoalsService(database)

    await service.saveHistory('account-fixture', key, { area: 'baptisms', year: 2025, amount: 30, source: 'manual', reference: 'Consolidado 2025' })
    await service.saveHistory('account-fixture', key, { area: 'baptisms', year: 2025, amount: 32, source: 'manual', reference: 'Consolidado 2025 revisado' })
    await service.saveHistory('account-fixture', key, { area: 'financial', year: 2025, amount: 12_000, source: 'pdf', reference: 'Relatório fictício' })

    const historico = await service.listHistory('account-fixture', key)
    expect(historico).toHaveLength(2)
    expect(historico.find((item) => item.area === 'baptisms')?.amount).toBe(32)
    expect(await service.listEntries('account-fixture', key)).toHaveLength(0)
    expect(JSON.stringify(await database.vaultRecords.toArray())).not.toContain('Relatório fictício')
  })

  it('recusa ano ainda em andamento e valor inválido', async () => {
    const database = new ApoioDatabase(`goals-history-invalido-${crypto.randomUUID()}`); databases.push(database)
    const key = await generateMasterKey(); const service = new GoalsService(database)

    await expect(service.saveHistory('account-fixture', key, { area: 'baptisms', year: new Date().getFullYear(), amount: 10, source: 'manual', reference: '' })).rejects.toThrow('ano já encerrado')
    await expect(service.saveHistory('account-fixture', key, { area: 'baptisms', year: 2025, amount: -1, source: 'manual', reference: '' })).rejects.toThrow('resultado válido')
  })
})
