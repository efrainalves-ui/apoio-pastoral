import { afterEach, describe, expect, it } from 'vitest'
import { generateMasterKey } from '../crypto/vault'
import { ApoioDatabase } from '../db/database'
import type { ChurchEntity } from '../district/types'
import { PeopleService } from '../people/service'
import { emptyPersonInput } from '../people/types'
import { parseFidelityText, parseMemberText } from './parsers'
import { normalizePdfLayout, validatePdfFile } from './pdf'
import { ImportService } from './service'

const churches: ChurchEntity[] = [
  { id: 'church-a', districtId: 'district', name: 'Igreja Aurora Fictícia', type: 'organized_church', externalCode: '', address: '', worshipSchedules: [], administrativeNotes: '', status: 'active', history: [], createdAt: '2026-01-01', updatedAt: '2026-01-01' },
  { id: 'church-b', districtId: 'district', name: 'Grupo Horizonte Fictício', type: 'group', externalCode: '', address: '', worshipSchedules: [], administrativeNotes: '', status: 'active', history: [], createdAt: '2026-01-01', updatedAt: '2026-01-01' },
]

describe('importadores locais e idempotentes', () => {
  const databases: ApoioDatabase[] = []
  afterEach(async () => Promise.all(databases.map((database) => database.delete())))
  async function fixture() {
    const database = new ApoioDatabase(`import-test-${crypto.randomUUID()}`); databases.push(database)
    const masterKey = await generateMasterKey(); const accountId = crypto.randomUUID()
    return { database, masterKey, accountId, people: new PeopleService(database), imports: new ImportService(database) }
  }

  it('reconhece igrejas, homônimos com nascimentos distintos e dados que exigem revisão', () => {
    const rows = parseMemberText(`IGREJA: Igreja Aurora Fictícia\nPessoa Modelo Fictícia | 10/05/1990\nPessoa Modelo Fictícia | 11/05/1991\nPessoa 123 Inválida | 01/01/1800`)
    expect(rows).toHaveLength(3)
    expect(rows[0]?.birthDate).toBe('1990-05-10')
    expect(rows[1]?.birthDate).toBe('1991-05-11')
    expect(rows[2]).toMatchObject({ birthDate: null, needsReview: true })
  })

  it('normaliza o relatório paginado em duas colunas sem confundir a data do cabeçalho', () => {
    const text = normalizePdfLayout([{ width: 600, height: 840, items: [
      { text: 'Emitido', x: 18, y: 810 }, { text: '20/08/2026', x: 88, y: 810 },
      { text: 'Igreja Aurora Fictícia', x: 18, y: 740 }, { text: 'Membros', x: 490, y: 740 }, { text: '2', x: 560, y: 740 },
      { text: 'Pessoa Coluna Um Fictícia', x: 18, y: 700 }, { text: '10/05/1990', x: 234, y: 700 },
      { text: 'Pessoa Coluna Dois Fictícia', x: 310, y: 700 }, { text: '11/06/1991', x: 503, y: 700 },
    ] }])
    const rows = parseMemberText(text)
    expect(rows).toHaveLength(2)
    expect(rows.map(({ churchName }) => churchName)).toEqual(['Igreja Aurora Fictícia', 'Igreja Aurora Fictícia'])
  })

  it('reconhece faixas do relatório de fidelidade e ignora as demais colunas', () => {
    const text = normalizePdfLayout([{ width: 600, height: 840, items: [
      { text: 'Fidelidade da Igreja', x: 18, y: 810 }, { text: 'Relatório local', x: 430, y: 810 },
      { text: 'Igreja Aurora Fictícia', x: 430, y: 790 },
      { text: 'Membros de 8 Para 12 Transações', x: 18, y: 760 },
      { text: 'Pessoa Faixa Fictícia', x: 18, y: 720 }, { text: 'Ocupação fictícia', x: 150, y: 720 }, { text: '42', x: 250, y: 720 }, { text: 'Dado descartado', x: 300, y: 720 },
      { text: 'Membros sem registro', x: 18, y: 680 },
      { text: 'Pessoa Zero Fictícia', x: 18, y: 640 }, { text: 'Outra ocupação', x: 150, y: 640 }, { text: '39', x: 250, y: 640 },
    ] }])
    const rows = parseFidelityText(text)
    expect(rows).toEqual([
      { churchName: 'Igreja Aurora Fictícia', name: 'Pessoa Faixa Fictícia', months: null, range: '8-12', category: 'tither' },
      { churchName: 'Igreja Aurora Fictícia', name: 'Pessoa Zero Fictícia', months: null, category: 'non_tither' },
    ])
    expect(JSON.stringify(rows)).not.toContain('Ocupação')
    expect(JSON.stringify(rows)).not.toContain('descartado')
  })

  it('rejeita PDF vazio, escaneado, inválido ou em formato inesperado sem preparar alterações', () => {
    expect(() => validatePdfFile({ name: 'arquivo.txt', size: 10, type: 'text/plain' })).toThrow('PDF válido')
    expect(() => validatePdfFile({ name: 'vazio.pdf', size: 0, type: 'application/pdf' })).toThrow('vazio')
    expect(() => parseMemberText('')).toThrow('OCR')
    expect(() => parseMemberText('conteúdo sem linhas reconhecíveis')).toThrow('não foi reconhecido')
    expect(() => parseFidelityText('imagem sem texto estruturado')).toThrow('não foi reconhecido')
  })

  it('aplica membros uma vez, preserva ciphertext e desfaz a última importação com segurança', async () => {
    const { database, masterKey, accountId, people, imports } = await fixture()
    const rows = parseMemberText('IGREJA: Igreja Aurora Fictícia\nPessoa Alfa Fictícia | 10/05/1990\nPessoa Beta Fictícia | 11/06/1991')
    const preview = await imports.previewMembers(accountId, masterKey, 'hash-members', rows, [], churches)
    expect(preview.newPeople).toHaveLength(2)
    const result = await imports.applyPreview(accountId, masterKey, preview)
    expect(result.batch.summary.created).toBe(2)
    const saved = await people.listPeople(accountId, masterKey)
    const repeated = await imports.previewMembers(accountId, masterKey, 'hash-members', rows, saved, churches)
    expect(repeated.alreadyImported).toBe(true)
    expect(repeated.newPeople).toHaveLength(0)
    const persisted = JSON.stringify({ records: await database.vaultRecords.toArray(), outbox: await database.outbox.toArray() })
    expect(persisted).not.toContain('Pessoa Alfa')
    await imports.undoLatest(accountId, masterKey, 'members')
    expect(await people.listPeople(accountId, masterKey)).toHaveLength(0)
  })

  it('não confunde homônimos e uma falha de lote não deixa cadastro parcial', async () => {
    const { database, masterKey, accountId, imports } = await fixture()
    const rows = parseMemberText('IGREJA: Igreja Aurora Fictícia\nPessoa Igual Fictícia | 10/05/1990\nPessoa Igual Fictícia | 11/05/1991')
    const preview = await imports.previewMembers(accountId, masterKey, 'hash-homonimos', rows, [], churches)
    expect(preview.newPeople).toHaveLength(2)
    preview.newPeople[1]!.personId = preview.newPeople[0]!.personId
    await expect(imports.applyPreview(accountId, masterKey, preview)).rejects.toThrow('repetir o mesmo registro')
    expect(await database.vaultRecords.where('recordType').equals('person').count()).toBe(0)
    expect(await database.outbox.count()).toBe(0)
  })

  it('classifica fidelidade por meses, informa divergências e descarta campos não necessários', async () => {
    const { database, masterKey, accountId, people, imports } = await fixture()
    const person = await people.createPerson(accountId, masterKey, { ...emptyPersonInput(), name: 'Pessoa Fidelidade Fictícia', birthDate: '1985-03-20', currentChurchId: 'church-a' })
    const rows = parseFidelityText('IGREJA: Igreja Aurora Fictícia\nPessoa Fidelidade Fictícia | 9\nPessoa Não Localizada Fictícia | 0')
    const preview = await imports.previewFidelity(accountId, masterKey, 'hash-fidelity', rows, [person], churches, 2026)
    expect(preview.categories).toEqual({ tither: 1, nonSystematicTither: 0, nonTither: 1 })
    expect(preview.changes).toHaveLength(1)
    expect(preview.issues[0]?.kind).toBe('person_not_found')
    await imports.applyPreview(accountId, masterKey, preview)
    const updated = await people.getPerson(accountId, masterKey, person.id)
    expect(updated?.fidelity).toMatchObject({ months: 9, category: 'tither', source: 'PDF local de fidelidade 2026', referenceYear: 2026 })
    expect(JSON.stringify(await database.vaultRecords.toArray())).not.toContain('Pessoa Fidelidade')
    expect(JSON.stringify(updated)).not.toContain('profissão')
    expect(JSON.stringify(updated)).not.toContain('nome da mãe')
  })

  it('preserva a faixa sem inventar quantidade exata', async () => {
    const { masterKey, accountId, people, imports } = await fixture()
    const person = await people.createPerson(accountId, masterKey, { ...emptyPersonInput(), name: 'Pessoa Faixa Fictícia', birthDate: '1988-04-12', currentChurchId: 'church-a' })
    const rows = parseFidelityText('IGREJA: Igreja Aurora Fictícia\nPessoa Faixa Fictícia | FAIXA_8_12')
    const preview = await imports.previewFidelity(accountId, masterKey, 'hash-range', rows, [person], churches, 2026)
    expect(preview.categories).toEqual({ tither: 1, nonSystematicTither: 0, nonTither: 0 })
    expect(preview.associatedCategories).toEqual({ tither: 1, nonSystematicTither: 0, nonTither: 0 })
    expect(preview.changes).toHaveLength(1)
    expect(preview.changes[0]?.nextData.fidelity).toMatchObject({ months: null, rangeMin: 8, rangeMax: 12, category: 'tither', precision: 'range' })
    expect(preview.issues).toHaveLength(0)
  })

  it('classifica faixas e categoria sem inventar meses e deixa somente ambiguidades reais pendentes', async () => {
    const { masterKey, accountId, people, imports } = await fixture()
    const first = await people.createPerson(accountId, masterKey, { ...emptyPersonInput(), name: 'Pessoa Horizonte Fictícia', birthDate: '1988-04-12', currentChurchId: 'church-a' })
    const second = await people.createPerson(accountId, masterKey, { ...emptyPersonInput(), name: 'Pessoa Vale Fictícia', birthDate: '1989-05-13', currentChurchId: 'church-a' })
    const rows = parseFidelityText('IGREJA: Igreja Aurora Fictícia\nPessoa Horizonte Fictícia | FAIXA_1_7\nPessoa Vale Fictícia | CATEGORIA_NAO_DIZIMISTA')
    const preview = await imports.previewFidelity(accountId, masterKey, 'hash-official-categories', rows, [first, second], churches, 2026)
    expect(preview.categories).toEqual({ tither: 0, nonSystematicTither: 1, nonTither: 1 })
    expect(preview.changes).toHaveLength(2)
    expect(preview.issues).toHaveLength(0)
    expect(preview.changes[0]?.nextData.fidelity).toMatchObject({ months: null, rangeMin: 1, rangeMax: 7, category: 'non_systematic_tither', precision: 'range' })
    expect(preview.changes[1]?.nextData.fidelity).toMatchObject({ months: null, rangeMin: 0, rangeMax: 0, category: 'non_tither', precision: 'category_only' })
  })

  it('mantém linha repetida pendente sem impedir a associação segura original', async () => {
    const { masterKey, accountId, people, imports } = await fixture()
    const person = await people.createPerson(accountId, masterKey, { ...emptyPersonInput(), name: 'Pessoa Duplicada Fictícia', birthDate: '1987-03-11', currentChurchId: 'church-a' })
    const rows = parseFidelityText('IGREJA: Igreja Aurora Fictícia\nPessoa Duplicada Fictícia | FAIXA_8_12\nPessoa Duplicada Fictícia | FAIXA_8_12')
    const preview = await imports.previewFidelity(accountId, masterKey, 'hash-duplicate-row', rows, [person], churches, 2026)
    expect(preview.changes).toHaveLength(1)
    expect(preview.issues).toHaveLength(1)
    expect(preview.issues[0]?.kind).toBe('duplicate_row')
  })

  it('sinaliza nome semelhante sem criar associação automática', async () => {
    const { masterKey, accountId, people, imports } = await fixture()
    const person = await people.createPerson(accountId, masterKey, { ...emptyPersonInput(), name: 'Pessoa Modelo Aurora Fictícia', birthDate: '1988-04-12', currentChurchId: 'church-a' })
    const rows = parseFidelityText('IGREJA: Igreja Aurora Fictícia\nPessoa Aurora Modelo Fictícia | 0')
    const preview = await imports.previewFidelity(accountId, masterKey, 'hash-similar', rows, [person], churches, 2026)
    expect(preview.changes).toHaveLength(0)
    expect(preview.issues[0]?.message).toContain('nome semelhante')
    const resolved = imports.resolveFidelityIssue(preview, preview.issues[0]!.id, person.id, [person], churches)
    expect(resolved.changes).toHaveLength(1)
    expect(resolved.issues).toHaveLength(0)
  })

  it('localiza nome exatamente igual em outra igreja sem mover a pessoa', async () => {
    const { masterKey, accountId, people, imports } = await fixture()
    const person = await people.createPerson(accountId, masterKey, { ...emptyPersonInput(), name: 'Pessoa Igual Fictícia', currentChurchId: 'church-b' })
    const preview = await imports.previewFidelity(accountId, masterKey, 'hash-outra-igreja', parseFidelityText('IGREJA: Igreja Aurora Fictícia\nPessoa Igual Fictícia | 0'), [person], churches, 2026)
    expect(preview.issues).toHaveLength(0)
    expect(preview.changes[0]).toMatchObject({ personId: person.id, churchName: 'Grupo Horizonte Fictício' })
    expect(person.currentChurchId).toBe('church-b')
  })

  it('mantém nomes semelhantes e inexistentes pendentes', async () => {
    const { masterKey, accountId, people, imports } = await fixture()
    const person = await people.createPerson(accountId, masterKey, { ...emptyPersonInput(), name: 'Pessoa Modelo Fictícia', currentChurchId: 'church-b' })
    const preview = await imports.previewFidelity(accountId, masterKey, 'hash-pendentes', parseFidelityText('IGREJA: Igreja Aurora Fictícia\nPessoa Modelo Diferente Fictícia | 0\nPessoa Inexistente Fictícia | 0'), [person], churches, 2026)
    const result = imports.locateFidelityIssuesAutomatically(preview, [person], churches)
    expect(result).toMatchObject({ resolved: 0, pending: 2, manual: 2 })
  })

  it('permite escolher igreja e pessoa manualmente e desfazer a associação', async () => {
    const { masterKey, accountId, people, imports } = await fixture()
    const person = await people.createPerson(accountId, masterKey, { ...emptyPersonInput(), name: 'Pessoa Manual Fictícia', currentChurchId: 'church-b' })
    const preview = await imports.previewFidelity(accountId, masterKey, 'hash-manual', parseFidelityText('IGREJA: Igreja Aurora Fictícia\nPessoa Vinda do PDF Fictícia | 0'), [person], churches, 2026)
    const resolved = imports.resolveFidelityIssue(preview, preview.issues[0]!.id, person.id, [person], churches)
    expect(resolved.changes).toHaveLength(1)
    expect(resolved.resolvedIssues?.[0]).toMatchObject({ personId: person.id, automatic: false })
    expect(imports.undoFidelityIssueAssociation(resolved, person.id)).toMatchObject({ changes: [], issues: [preview.issues[0]] })
  })

  it('migra em memória o modelo antigo de fidelidade sem perder a classificação', async () => {
    const { database, masterKey, accountId, people } = await fixture()
    const person = await people.createPerson(accountId, masterKey, { ...emptyPersonInput(), name: 'Pessoa Legado Fictícia', birthDate: '1980-04-12', currentChurchId: 'church-a' })
    const record = await database.vaultRecords.get(person.id)
    expect(record).toBeDefined()
    const legacy = { ...person, fidelity: { months: 9, category: 'systematic', updatedAt: '2026-01-01T00:00:00.000Z', source: 'Fonte fictícia', importBatchId: 'batch' } }
    const { id: _id, ...legacyData } = legacy; void _id
    const { encryptPayload } = await import('../crypto/vault')
    await database.vaultRecords.put({ ...record!, ...(await encryptPayload(masterKey, { schemaVersion: 1, type: 'person', data: legacyData }, person.id)) })
    const migrated = await people.getPerson(accountId, masterKey, person.id)
    expect(migrated?.fidelity).toMatchObject({ months: 9, rangeMin: 9, rangeMax: 9, category: 'tither', precision: 'exact', importedAt: '2026-01-01T00:00:00.000Z' })
    expect(migrated?.incomeStatus).toBe('unknown')
  })
})
