import { afterEach, describe, expect, it } from 'vitest'
import { generateMasterKey } from '../crypto/vault'
import { ApoioDatabase } from '../db/database'
import type { ChurchEntity } from '../district/types'
import { PeopleService } from '../people/service'
import { emptyPersonInput } from '../people/types'
import { ehDizimoOnline, parseDizimoOnlineText, parseFidelityText, parseMemberText } from './parsers'
import { normalizePdfLayout, validatePdfFile } from './pdf'
import { ImportService } from './service'

const churches: ChurchEntity[] = [
  { id: 'church-a', districtId: 'district', name: 'Igreja Aurora Fictícia', type: 'organized_church', externalCode: '', address: '', worshipSchedules: [], administrativeNotes: '', status: 'active', history: [], createdAt: '2026-01-01', updatedAt: '2026-01-01' },
  { id: 'church-b', districtId: 'district', name: 'Grupo Horizonte Fictício', type: 'group', externalCode: '', address: '', worshipSchedules: [], administrativeNotes: '', status: 'active', history: [], createdAt: '2026-01-01', updatedAt: '2026-01-01' },
  { id: 'church-c', districtId: 'district', name: 'Ponto Fictício de Pregação', type: 'preaching_point', externalCode: '', address: '', worshipSchedules: [], administrativeNotes: '', status: 'active', history: [], createdAt: '2026-01-01', updatedAt: '2026-01-01' },
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

  it('o mesmo arquivo pode ser aplicado a outro ano', async () => {
    // Sem isto o pastor ficava trancado: as leituras aplicadas antes de existir
    // a pergunta do ano contavam pela data da importação, e reenviar o arquivo
    // dizendo de que ano ele era voltava recusado como repetido.
    const { masterKey, accountId, people, imports } = await fixture()
    const person = await people.createPerson(accountId, masterKey, { ...emptyPersonInput(), name: 'Pessoa Dois Anos Fictícia', birthDate: '1985-03-20', currentChurchId: 'church-a' })
    const rows = parseFidelityText('IGREJA: Igreja Aurora Fictícia\nPessoa Dois Anos Fictícia | 9')

    const de2025 = await imports.previewFidelity(accountId, masterKey, 'hash-dois-anos', rows, [person], churches, 2025)
    expect(de2025.alreadyImported).toBe(false)
    await imports.applyPreview(accountId, masterKey, de2025)

    const guardada = (await people.getPerson(accountId, masterKey, person.id))!
    const repetido = await imports.previewFidelity(accountId, masterKey, 'hash-dois-anos', rows, [guardada], churches, 2025)
    expect(repetido.alreadyImported).toBe(true)

    const de2026 = await imports.previewFidelity(accountId, masterKey, 'hash-dois-anos', rows, [guardada], churches, 2026)
    expect(de2026.alreadyImported).toBe(false)
    expect(de2026.changes).toHaveLength(1)
    await imports.applyPreview(accountId, masterKey, de2026)

    const comDoisAnos = (await people.getPerson(accountId, masterKey, person.id))!
    expect(comDoisAnos.fidelity?.referenceYear).toBe(2026)
    expect(comDoisAnos.fidelityHistory.map(({ referenceYear }) => referenceYear)).toEqual([2025])
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

  /*
    O ponto de pregação recebe gente que, no registro da Associação, é membro de
    outra igreja. As duas verdades disputavam o mesmo campo: cada importação
    devolvia a pessoa à igreja de origem e desfazia o trabalho do pastor, sem
    dizer nada. A escolha dele passa a ficar.
  */
  it('a importação não tira do ponto de pregação quem o pastor colocou lá', async () => {
    const { masterKey, accountId, people, imports } = await fixture()
    const rows = parseMemberText('IGREJA: Igreja Aurora Fictícia\nPessoa Gama Fictícia | 10/05/1990')
    await imports.applyPreview(accountId, masterKey, await imports.previewMembers(accountId, masterKey, 'hash-1', rows, [], churches))

    const [pessoa] = await people.listPeople(accountId, masterKey)
    await people.updatePerson(accountId, masterKey, pessoa!.id, {
      ...emptyPersonInput(), name: pessoa!.name, birthDate: pessoa!.birthDate!, currentChurchId: 'church-c',
    })

    // O mesmo relatório, de novo: continua dizendo que ela é da Aurora.
    const depois = await people.listPeople(accountId, masterKey)
    const previa = await imports.previewMembers(accountId, masterKey, 'hash-2', rows, depois, churches)
    expect(previa.updatedPeople).toHaveLength(0)
    expect(previa.mantidasOndeVoceColocou).toHaveLength(1)
    expect(previa.mantidasOndeVoceColocou[0]!.nextData.currentChurchId).toBe('church-c')

    await imports.applyPreview(accountId, masterKey, previa)
    const final = (await people.listPeople(accountId, masterKey))[0]!
    expect(final.currentChurchId).toBe('church-c')
  })

  /* O vínculo oficial não se perde: ele fica registrado para a divergência ser vista. */
  it('guarda o vínculo oficial de quem ficou no ponto de pregação', async () => {
    const { masterKey, accountId, people, imports } = await fixture()
    const rows = parseMemberText('IGREJA: Igreja Aurora Fictícia\nPessoa Delta Fictícia | 10/05/1990')
    await imports.applyPreview(accountId, masterKey, await imports.previewMembers(accountId, masterKey, 'hash-1', rows, [], churches))
    const [pessoa] = await people.listPeople(accountId, masterKey)
    await people.updatePerson(accountId, masterKey, pessoa!.id, {
      ...emptyPersonInput(), name: pessoa!.name, birthDate: pessoa!.birthDate!, currentChurchId: 'church-c',
    })

    const previa = await imports.previewMembers(accountId, masterKey, 'hash-2', rows, await people.listPeople(accountId, masterKey), churches)
    await imports.applyPreview(accountId, masterKey, previa)

    const final = (await people.listPeople(accountId, masterKey))[0]!
    expect(final.memberships.some((vinculo) => vinculo.churchId === 'church-a')).toBe(true)
    expect(final.currentChurchId).toBe('church-c')
  })

  /* E não é acusada de ter sumido só porque o relatório a traz noutra igreja. */
  it('quem o pastor lotou não vira ausente do relatório', async () => {
    const { masterKey, accountId, people, imports } = await fixture()
    const rows = parseMemberText('IGREJA: Igreja Aurora Fictícia\nPessoa Épsilon Fictícia | 10/05/1990')
    await imports.applyPreview(accountId, masterKey, await imports.previewMembers(accountId, masterKey, 'hash-1', rows, [], churches))
    const [pessoa] = await people.listPeople(accountId, masterKey)
    await people.updatePerson(accountId, masterKey, pessoa!.id, {
      ...emptyPersonInput(), name: pessoa!.name, birthDate: pessoa!.birthDate!, currentChurchId: 'church-c',
    })

    // Um relatório que não traz esta pessoa em lugar nenhum.
    const outras = parseMemberText('IGREJA: Ponto Fictício de Pregação\nPessoa Zeta Fictícia | 01/02/1985')
    const previa = await imports.previewMembers(accountId, masterKey, 'hash-3', outras, await people.listPeople(accountId, masterKey), churches)
    expect(previa.missingPeople).toHaveLength(0)
  })

  /* Sem escolha do pastor, o relatório continua mandando. */
  it('sem escolha do pastor, a importação continua movendo', async () => {
    const { masterKey, accountId, people, imports } = await fixture()
    const rows = parseMemberText('IGREJA: Igreja Aurora Fictícia\nPessoa Eta Fictícia | 10/05/1990')
    await imports.applyPreview(accountId, masterKey, await imports.previewMembers(accountId, masterKey, 'hash-1', rows, [], churches))

    const mudou = parseMemberText('IGREJA: Grupo Horizonte Fictício\nPessoa Eta Fictícia | 10/05/1990')
    const previa = await imports.previewMembers(accountId, masterKey, 'hash-2', mudou, await people.listPeople(accountId, masterKey), churches)
    expect(previa.updatedPeople).toHaveLength(1)
    expect(previa.mantidasOndeVoceColocou).toHaveLength(0)

    await imports.applyPreview(accountId, masterKey, previa)
    expect((await people.listPeople(accountId, masterKey))[0]!.currentChurchId).toBe('church-b')
  })

  /*
    O relatório "Dízimo e Oferta Online" é outra fonte sobre a mesma pergunta,
    com outro formato: lançamento a lançamento, agrupado por data de capitação,
    com dízimo e ofertas na mesma lista. As posições abaixo são as do relatório
    real; os nomes, não.
  */
  const linhaDeLancamento = (y: number, igreja: string, nome: string, remessa: string) => [
    { text: 'Pago', x: 20, y },
    { text: igreja, x: 80, y },
    { text: nome, x: 212, y },
    { text: remessa, x: 346, y },
    { text: ' 150,00', x: 436, y },
  ]
  const linhaDeTipo = (y: number, tipo: string) => [{ text: ' 1', x: 101, y }, { text: tipo, x: 135, y }]

  function paginaDoDizimoOnline(lancamentos: Array<{ nome: string; remessa: string; tipo: string; igreja?: string }>) {
    const items = [
      { text: 'Dízimo e Oferta Online', x: 20, y: 820 },
      { text: 'Dízimos e ofertas importadas por data - 01/01/2026 até 31/08/2026', x: 20, y: 800 },
      { text: 'Data de Capitação: 03/01/2026', x: 20, y: 770 },
    ]
    let y = 740
    for (const l of lancamentos) {
      items.push(...linhaDeLancamento(y, l.igreja ?? '75 Igreja Fictícia do Abade', l.nome, l.remessa))
      items.push(...linhaDeTipo(y - 12, l.tipo))
      y -= 40
    }
    return [{ width: 595, height: 842, items }]
  }

  it('lê o Dízimo Online, conta meses distintos e descarta as ofertas', () => {
    const texto = normalizePdfLayout(paginaDoDizimoOnline([
      { nome: 'Pessoa Ípsilon Fictícia', remessa: '01/2026 - 1', tipo: 'Dízimo' },
      { nome: 'Pessoa Ípsilon Fictícia', remessa: '01/2026 - 3', tipo: 'Dízimo' },
      { nome: 'Pessoa Ípsilon Fictícia', remessa: '02/2026 - 1', tipo: 'Dízimo' },
      { nome: 'Pessoa Ípsilon Fictícia', remessa: '03/2026 - 1', tipo: 'Ofertas' },
      { nome: 'Pessoa Ômega Fictícia', remessa: '05/2026 - 2', tipo: 'Construção' },
    ]))

    expect(ehDizimoOnline(texto)).toBe(true)
    const lido = parseDizimoOnlineText(texto)
    expect(lido.periodo).toEqual({ de: '2026-01', ate: '2026-08' })
    expect(lido.mesesDoPeriodo).toBe(8)
    expect(lido.ofertasIgnoradas).toBe(2)
    expect(lido.linhas).toHaveLength(1)
    // Duas devoluções em janeiro contam um mês: a pergunta é em quantos meses.
    expect(lido.linhas[0]!.meses).toEqual(['2026-01', '2026-02'])
  })

  it('separa por igreja, porque o mesmo nome pode existir em duas', () => {
    const texto = normalizePdfLayout(paginaDoDizimoOnline([
      { nome: 'Pessoa Igual Fictícia', remessa: '01/2026 - 1', tipo: 'Dízimo', igreja: '75 Igreja Fictícia do Abade' },
      { nome: 'Pessoa Igual Fictícia', remessa: '02/2026 - 1', tipo: 'Dízimo', igreja: '1.046 Ponto Fictício do Abade' },
    ]))
    const lido = parseDizimoOnlineText(texto)
    expect(lido.linhas).toHaveLength(2)
  })

  /* Só ofertas não é relatório de fidelidade: não vale a pena abrir por engano. */
  it('não reconhece como Dízimo Online um PDF sem nenhum dízimo', () => {
    const texto = normalizePdfLayout(paginaDoDizimoOnline([
      { nome: 'Pessuma Ômega Fictícia', remessa: '01/2026 - 1', tipo: 'Ofertas' },
    ]))
    expect(ehDizimoOnline(texto)).toBe(false)
  })

  /* Sem remessa legível, a data de capitação dá o mês — é ela que agrupa o bloco. */
  it('cai na data de capitação quando a remessa não traz o mês', () => {
    const texto = normalizePdfLayout(paginaDoDizimoOnline([
      { nome: 'Pessoa Teta Fictícia', remessa: 'sem remessa', tipo: 'Dízimo' },
    ]))
    expect(parseDizimoOnlineText(texto).linhas[0]!.meses).toEqual(['2026-01'])
  })

  /*
    O nome vem cortado na largura da coluna. Quando o corte identifica uma
    pessoa só, vale; quando serve a duas, vira divergência — adivinhar aqui é
    atribuir dízimo a quem não devolveu.
  */
  it('aceita o nome cortado quando ele identifica uma pessoa só', async () => {
    const { masterKey, accountId, people, imports } = await fixture()
    const rows = parseMemberText('IGREJA: Igreja Aurora Fictícia\nKedima Fictícia Moraes | 10/05/1990\nPessoa Outra Fictícia | 11/06/1991')
    await imports.applyPreview(accountId, masterKey, await imports.previewMembers(accountId, masterKey, 'hash-m', rows, [], churches))

    const texto = normalizePdfLayout(paginaDoDizimoOnline([
      { nome: 'Kedima Fictícia Mo', remessa: '01/2026 - 1', tipo: 'Dízimo' },
      { nome: 'Kedima Fictícia Mo', remessa: '02/2026 - 1', tipo: 'Dízimo' },
    ]))
    const previa = await imports.previewDizimoOnline(accountId, masterKey, 'hash-d', parseDizimoOnlineText(texto), await people.listPeople(accountId, masterKey), churches)
    expect(previa.issues).toHaveLength(0)
    expect(previa.changes).toHaveLength(1)
    expect(previa.changes[0]!.nextData.fidelity?.months).toBe(2)
    expect(previa.changes[0]!.nextData.fidelity?.category).toBe('non_systematic_tither')
  })

  it('o nome cortado que serve a duas pessoas vira divergência', async () => {
    const { masterKey, accountId, people, imports } = await fixture()
    const rows = parseMemberText('IGREJA: Igreja Aurora Fictícia\nMariana Fictícia Alfa | 10/05/1990\nMariana Fictícia Beta | 11/06/1991')
    await imports.applyPreview(accountId, masterKey, await imports.previewMembers(accountId, masterKey, 'hash-m', rows, [], churches))

    const texto = normalizePdfLayout(paginaDoDizimoOnline([{ nome: 'Mariana Fictícia', remessa: '01/2026 - 1', tipo: 'Dízimo' }]))
    const previa = await imports.previewDizimoOnline(accountId, masterKey, 'hash-d', parseDizimoOnlineText(texto), await people.listPeople(accountId, masterKey), churches)
    expect(previa.changes).toHaveLength(0)
    expect(previa.issues[0]?.kind).toBe('ambiguous_person')
  })

  /* As duas fontes do mesmo ano somam meses distintos, na régua de doze. */
  it('soma com a leitura que o relatório de fidelidade já tinha deixado', async () => {
    const { masterKey, accountId, people, imports } = await fixture()
    const rows = parseMemberText('IGREJA: Igreja Aurora Fictícia\nPessoa Soma Fictícia | 10/05/1990')
    await imports.applyPreview(accountId, masterKey, await imports.previewMembers(accountId, masterKey, 'hash-m', rows, [], churches))

    const fidelidade = parseFidelityText('IGREJA: Igreja Aurora Fictícia\nPessoa Soma Fictícia | 5')
    await imports.applyPreview(accountId, masterKey, await imports.previewFidelity(accountId, masterKey, 'hash-f', fidelidade, await people.listPeople(accountId, masterKey), churches, 2026))
    expect((await people.listPeople(accountId, masterKey))[0]!.fidelity?.months).toBe(5)

    const texto = normalizePdfLayout(paginaDoDizimoOnline([
      { nome: 'Pessoa Soma Fictícia', remessa: '06/2026 - 1', tipo: 'Dízimo' },
      { nome: 'Pessoa Soma Fictícia', remessa: '07/2026 - 1', tipo: 'Dízimo' },
      { nome: 'Pessoa Soma Fictícia', remessa: '08/2026 - 1', tipo: 'Dízimo' },
    ]))
    const previa = await imports.previewDizimoOnline(accountId, masterKey, 'hash-d', parseDizimoOnlineText(texto), await people.listPeople(accountId, masterKey), churches)
    await imports.applyPreview(accountId, masterKey, previa)

    const final = (await people.listPeople(accountId, masterKey))[0]!
    expect(final.fidelity?.months).toBe(8)
    expect(final.fidelity?.category).toBe('tither')
    expect(final.fidelity?.source).toContain('Dízimo Online')
  })

  /* Aplicar duas vezes o mesmo arquivo não empilha meses. */
  it('o mesmo arquivo aplicado de novo é recusado', async () => {
    const { masterKey, accountId, people, imports } = await fixture()
    const rows = parseMemberText('IGREJA: Igreja Aurora Fictícia\nPessoa Repete Fictícia | 10/05/1990')
    await imports.applyPreview(accountId, masterKey, await imports.previewMembers(accountId, masterKey, 'hash-m', rows, [], churches))
    const texto = normalizePdfLayout(paginaDoDizimoOnline([{ nome: 'Pessoa Repete Fictícia', remessa: '01/2026 - 1', tipo: 'Dízimo' }]))

    const primeira = await imports.previewDizimoOnline(accountId, masterKey, 'hash-d', parseDizimoOnlineText(texto), await people.listPeople(accountId, masterKey), churches)
    await imports.applyPreview(accountId, masterKey, primeira)

    const segunda = await imports.previewDizimoOnline(accountId, masterKey, 'hash-d', parseDizimoOnlineText(texto), await people.listPeople(accountId, masterKey), churches)
    expect(segunda.alreadyImported).toBe(true)
    await expect(imports.applyPreview(accountId, masterKey, segunda)).rejects.toThrow('já foi aplicado')
  })
})
