import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { generateMasterKey } from '../crypto/vault'
import { ApoioDatabase } from '../db/database'
import { SermonService } from './service'
const databases: ApoioDatabase[] = []; afterEach(async () => { await Promise.all(databases.map((database) => database.delete())); databases.length = 0 })
const input = (title = 'Sermão fictício') => ({ title, theme: 'Esperança', mainText: 'João 3:16', complementaryTexts: 'Salmos 1', objective: '', introduction: '', content: 'Conteúdo fictício', conclusion: '', appeal: '', notes: '', tags: ['fé'], status: 'ready' as const })
describe('sermões cifrados', () => { it('cria, edita, pesquisa e remove sem texto aberto', async () => { const database = new ApoioDatabase(`sermon-${crypto.randomUUID()}`); databases.push(database); const key = await generateMasterKey(); const service = new SermonService(database); const created = await service.create('account-fixture', key, input()); expect(JSON.stringify(await database.vaultRecords.toArray())).not.toContain('Conteúdo fictício'); expect((await service.list('account-fixture', key)).filter(({ tags }) => tags.includes('fé'))).toHaveLength(1); await service.update('account-fixture', key, created.id, input('Outro sermão fictício')); expect((await service.get('account-fixture', key, created.id))?.title).toBe('Outro sermão fictício'); await service.remove('account-fixture', key, created.id); expect(await service.list('account-fixture', key)).toHaveLength(0) }) })
