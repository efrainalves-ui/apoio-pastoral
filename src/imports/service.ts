import { currentDeviceId } from '../auth/device'
import { decryptPayload, encryptPayload } from '../crypto/vault'
import { db, type ApoioDatabase } from '../db/database'
import { VaultRepository, type EncryptedMutation } from '../db/repository'
import { type ChurchEntity } from '../district/types'
import { type FamilyData } from '../families/types'
import { fidelityCategory, FIDELITY_CATEGORY_LABELS, IMPORT_STATUS_LABELS, type FidelityCategory, type FidelitySnapshot, type PersonData, type PersonEntity, type PersonHistoryEntry } from '../people/types'
import { leituraDoAno, mesclarFidelidade } from '../people/leiturasDeFidelidade'
import { normalizePersonName } from '../people/validation'
import type { FidelityImportPreview, ImportApplyResult, ImportBatchData, ImportBatchEntity, ImportIssue, MemberImportPreview, ParsedFidelityRow, ParsedMemberRow, PlannedPersonChange } from './types'

function storedPerson(person: PersonEntity): PersonData { const { id: _id, ...data } = person; void _id; return data }
function personKey(name: string, birthDate: string | null): string { return `${normalizePersonName(name)}|${birthDate ?? '?'}` }
function churchByName(churches: ChurchEntity[]): Map<string, ChurchEntity> { return new Map(churches.map((church) => [normalizePersonName(church.name), church])) }
function issue(kind: ImportIssue['kind'], churchName: string, displayName: string, message: string, sourceRow?: ParsedFidelityRow): ImportIssue { return { id: crypto.randomUUID(), kind, churchName, displayName, message, ...(sourceRow ? { sourceRow } : {}) } }
function tokenSimilarity(left: string, right: string): number {
  const leftTokens = new Set(left.split(' ').filter(Boolean)); const rightTokens = new Set(right.split(' ').filter(Boolean))
  const shared = [...leftTokens].filter((token) => rightTokens.has(token)).length
  return leftTokens.size + rightTokens.size ? 2 * shared / (leftTokens.size + rightTokens.size) : 0
}
function similarNames(name: string, people: PersonEntity[]): PersonEntity[] {
  const normalized = normalizePersonName(name)
  if (normalized.length < 8) return []
  return people.filter((person) => {
    const candidate = normalizePersonName(person.name)
    return candidate.length >= 8 && (candidate.includes(normalized) || normalized.includes(candidate) || tokenSimilarity(normalized, candidate) >= 0.72)
  })
}

function rowCategory(row: ParsedFidelityRow): FidelityCategory {
  if (row.category) return row.category
  if (row.range === '8-12') return 'tither'
  if (row.range === '1-7') return 'non_systematic_tither'
  return fidelityCategory(row.months ?? 0)
}

function fidelitySnapshot(row: ParsedFidelityRow, category: FidelityCategory, now: string, referenceYear: number): FidelitySnapshot {
  const exact = typeof row.months === 'number'
  const rangeMin = exact ? row.months! : row.range === '8-12' ? 8 : row.range === '1-7' ? 1 : category === 'tither' ? 8 : category === 'non_systematic_tither' ? 1 : 0
  const rangeMax = exact ? row.months! : row.range === '8-12' ? 12 : row.range === '1-7' ? 7 : category === 'tither' ? 12 : category === 'non_systematic_tither' ? 7 : 0
  return { referenceYear, months: exact ? row.months : null, rangeMin, rangeMax, category, precision: exact ? 'exact' : row.range ? 'range' : 'category_only', updatedAt: now, importedAt: now, source: `PDF local de fidelidade ${referenceYear}`, importBatchId: '' }
}

function sameFidelity(left: FidelitySnapshot | null, right: FidelitySnapshot): boolean {
  return Boolean(left && left.months === right.months && left.rangeMin === right.rangeMin && left.rangeMax === right.rangeMax && left.category === right.category && left.precision === right.precision)
}

export class ImportService {
  private readonly repository: VaultRepository
  constructor(private readonly database: ApoioDatabase = db) { this.repository = new VaultRepository(database) }

  async listBatches(accountId: string, masterKey: CryptoKey, kind?: ImportBatchData['kind']): Promise<ImportBatchEntity[]> {
    const batches: ImportBatchEntity[] = []
    for (const record of await this.repository.list(accountId, 'import_batch')) {
      const payload = await decryptPayload(masterKey, record)
      if (payload.type !== 'import_batch') continue
      const data = payload.data as ImportBatchData
      if (!kind || data.kind === kind) batches.push({ id: record.id, ...data })
    }
    return batches.sort((a, b) => b.appliedAt.localeCompare(a.appliedAt))
  }

  async previewMembers(accountId: string, masterKey: CryptoKey, fileHash: string, rows: ParsedMemberRow[], people: PersonEntity[], churches: ChurchEntity[]): Promise<MemberImportPreview> {
    const alreadyImported = (await this.listBatches(accountId, masterKey, 'members')).some((batch) => batch.fileHash === fileHash && batch.status === 'applied')
    const churchMap = churchByName(churches); const issues: ImportIssue[] = []; const churchCounts: Record<string, number> = {}
    const newPeople: PlannedPersonChange[] = []; const updatedPeople: PlannedPersonChange[] = []; const seen = new Set<string>(); const importedKeys = new Set<string>(); const importedChurchIds = new Set<string>(); let unchanged = 0
    const now = new Date().toISOString()
    for (const row of rows) {
      churchCounts[row.churchName] = (churchCounts[row.churchName] ?? 0) + 1
      const church = churchMap.get(normalizePersonName(row.churchName))
      if (!church) { issues.push(issue('unknown_church', row.churchName, row.name, 'A igreja não corresponde a uma unidade cadastrada.')); continue }
      importedChurchIds.add(church.id)
      if (row.needsReview || /\d/u.test(row.name)) { issues.push(issue(/\d/u.test(row.name) ? 'invalid_name' : 'invalid_birth_date', row.churchName, row.name, 'O nome ou nascimento exige correção antes de entrar no cadastro.')); continue }
      const key = personKey(row.name, row.birthDate)
      if (seen.has(key)) { issues.push(issue('duplicate_row', row.churchName, row.name, 'A mesma identidade aparece mais de uma vez no PDF.')); continue }
      seen.add(key); importedKeys.add(key)
      const exact = people.filter((person) => personKey(person.name, person.birthDate) === key)
      if (!row.birthDate && exact.length > 0) { issues.push(issue('possible_duplicate', row.churchName, row.name, 'Nascimento desconhecido: confirme manualmente para não unir homônimos.')); continue }
      if (exact.length > 1) { issues.push(issue('possible_duplicate', row.churchName, row.name, 'Há mais de uma pessoa compatível; nenhuma alteração automática foi preparada.')); continue }
      if (exact.length === 0) {
        const personId = crypto.randomUUID()
        const data: PersonData = { name: row.name.trim(), birthDate: row.birthDate, whatsapp: '', notes: '', pastoralStatus: 'active', importStatus: 'current', currentChurchId: church.id, memberships: [{ id: crypto.randomUUID(), churchId: church.id, source: 'member_import', validFrom: now }], history: [{ id: crypto.randomUUID(), at: now, event: 'created', source: 'Importação de membros' }], incomeStatus: 'unknown', fidelity: null, fidelityHistory: [], createdAt: now, updatedAt: now }
        newPeople.push({ personId, previousData: null, nextData: data, churchName: church.name }); continue
      }
      const current = exact[0]!; const previousData = storedPerson(current); const history = [...current.history]; const memberships = current.memberships.map((membership) => ({ ...membership })); let changed = false
      if (current.currentChurchId !== church.id) {
        const active = memberships.find((membership) => !membership.validTo); if (active) active.validTo = now
        memberships.push({ id: crypto.randomUUID(), churchId: church.id, source: 'member_import', validFrom: now })
        history.push({ id: crypto.randomUUID(), at: now, event: 'church_changed', from: current.currentChurchId, to: church.id, source: 'Importação de membros' }); changed = true
      }
      if (current.importStatus !== 'current') { history.push({ id: crypto.randomUUID(), at: now, event: 'import_status_changed', from: IMPORT_STATUS_LABELS[current.importStatus], to: IMPORT_STATUS_LABELS.current, source: 'Importação de membros' }); changed = true }
      if (current.name !== row.name.trim()) { history.push({ id: crypto.randomUUID(), at: now, event: 'details_updated', changedFields: ['nome'], source: 'Importação de membros' }); changed = true }
      if (changed) updatedPeople.push({ personId: current.id, previousData, nextData: { ...previousData, name: row.name.trim(), currentChurchId: church.id, memberships, importStatus: 'current', history, updatedAt: now }, churchName: church.name }); else unchanged += 1
    }
    const missingPeople: PlannedPersonChange[] = []
    for (const person of people) {
      if (person.importStatus !== 'current' || !importedChurchIds.has(person.currentChurchId) || importedKeys.has(personKey(person.name, person.birthDate))) continue
      const history: PersonHistoryEntry[] = [...person.history, { id: crypto.randomUUID(), at: now, event: 'import_status_changed', from: IMPORT_STATUS_LABELS.current, to: IMPORT_STATUS_LABELS.missing, source: 'Importação de membros' }]
      missingPeople.push({ personId: person.id, previousData: storedPerson(person), nextData: { ...storedPerson(person), importStatus: 'missing', history, updatedAt: now }, churchName: churches.find(({ id }) => id === person.currentChurchId)?.name ?? 'Igreja' })
    }
    return { kind: 'members', fileHash, parsedRows: rows.length, churchCounts, newPeople, updatedPeople, missingPeople, unchanged, issues, alreadyImported }
  }

  async previewFidelity(accountId: string, masterKey: CryptoKey, fileHash: string, rows: ParsedFidelityRow[], people: PersonEntity[], churches: ChurchEntity[], referenceYear: number): Promise<FidelityImportPreview> {
    const alreadyImported = (await this.listBatches(accountId, masterKey, 'fidelity')).some((batch) => batch.fileHash === fileHash && batch.status === 'applied' && (batch.modelVersion ?? 1) >= 3)
    const churchMap = churchByName(churches); const issues: ImportIssue[] = []; const churchCounts: Record<string, number> = {}; const changes: PlannedPersonChange[] = []; const seen = new Set<string>(); let unchanged = 0
    const categories = { tither: 0, nonSystematicTither: 0, nonTither: 0 }; const associatedCategories = { tither: 0, nonSystematicTither: 0, nonTither: 0 }; const now = new Date().toISOString()
    for (const row of rows) {
      churchCounts[row.churchName] = (churchCounts[row.churchName] ?? 0) + 1
      const category = rowCategory(row)
      if (category === 'tither') categories.tither += 1; else if (category === 'non_systematic_tither') categories.nonSystematicTither += 1; else categories.nonTither += 1
      const church = churchMap.get(normalizePersonName(row.churchName))
      const signature = `${church?.id ?? normalizePersonName(row.churchName)}|${normalizePersonName(row.name)}`
      if (seen.has(signature)) { issues.push(issue('duplicate_row', row.churchName, row.name, 'A pessoa aparece mais de uma vez para esta igreja.', row)); continue }
      seen.add(signature)
      const matches = people.filter((person) => normalizePersonName(person.name) === normalizePersonName(row.name))
      if (matches.length === 0) {
        const similar = similarNames(row.name, people)
        issues.push(issue('person_not_found', row.churchName, row.name, similar.length ? 'Há pessoa(s) com nome semelhante; nenhuma associação será presumida.' : 'Pessoa não encontrada no distrito.', row))
        continue
      }
      if (matches.length > 1) { issues.push(issue('ambiguous_person', row.churchName, row.name, 'Mais de uma pessoa possui este nome no distrito.', row)); continue }
      const person = matches[0]!; const previousData = storedPerson(person)
      if (category === 'tither') associatedCategories.tither += 1; else if (category === 'non_systematic_tither') associatedCategories.nonSystematicTither += 1; else associatedCategories.nonTither += 1
      const snapshot = fidelitySnapshot(row, category, now, referenceYear)
      // Compara com a leitura daquele mesmo ano, não com a mais recente: mandar
      // 2025 quando 2026 já existe é acrescentar história, não repeti-la.
      if (sameFidelity(leituraDoAno(person, referenceYear), snapshot)) { unchanged += 1; continue }
      const history: PersonHistoryEntry[] = [...person.history, { id: crypto.randomUUID(), at: now, event: 'fidelity_updated', from: person.fidelity ? FIDELITY_CATEGORY_LABELS[person.fidelity.category] : 'Sem informação', to: FIDELITY_CATEGORY_LABELS[category], source: `Importação de fidelidade ${referenceYear}` }]
      changes.push({ personId: person.id, previousData, nextData: { ...previousData, ...mesclarFidelidade(person, snapshot), history, updatedAt: now }, churchName: churches.find((item) => item.id === person.currentChurchId)?.name ?? 'Igreja' })
    }
    return { kind: 'fidelity', fileHash, referenceYear, parsedRows: rows.length, churchCounts, changes, unchanged, issues, alreadyImported, categories, associatedCategories }
  }

  resolveFidelityIssue(preview: FidelityImportPreview, issueId: string, personId: string, people: PersonEntity[], churches: ChurchEntity[], automatic = false): FidelityImportPreview {
    const currentIssue = preview.issues.find(({ id }) => id === issueId)
    const row = currentIssue?.sourceRow; const person = people.find(({ id }) => id === personId)
    if (!currentIssue || !row || !person) throw new Error('Selecione uma pessoa válida para revisar a divergência.')
    const church = churches.find(({ id }) => id === person.currentChurchId)
    if (!church) throw new Error('Selecione uma pessoa vinculada a uma igreja.')
    if (preview.changes.some((change) => change.personId === person.id)) throw new Error('Esta pessoa já possui uma correspondência preparada neste lote.')
    const category = rowCategory(row); const now = new Date().toISOString(); const previousData = storedPerson(person); const snapshot = fidelitySnapshot(row, category, now, preview.referenceYear)
    const history: PersonHistoryEntry[] = [...person.history, { id: crypto.randomUUID(), at: now, event: 'fidelity_updated', from: person.fidelity ? FIDELITY_CATEGORY_LABELS[person.fidelity.category] : 'Sem informação', to: FIDELITY_CATEGORY_LABELS[category], source: `Revisão manual da importação de fidelidade ${preview.referenceYear}` }]
    const change: PlannedPersonChange = { personId: person.id, previousData, nextData: { ...previousData, ...mesclarFidelidade(person, snapshot), history, updatedAt: now }, churchName: church.name }
    const associatedCategories = { ...preview.associatedCategories }
    if (category === 'tither') associatedCategories.tither += 1; else if (category === 'non_systematic_tither') associatedCategories.nonSystematicTither += 1; else associatedCategories.nonTither += 1
    return { ...preview, changes: [...preview.changes, change], issues: preview.issues.filter(({ id }) => id !== issueId), associatedCategories, resolvedIssues: [...(preview.resolvedIssues ?? []), { issue: currentIssue, personId, automatic }] }
  }

  locateFidelityIssuesAutomatically(preview: FidelityImportPreview, people: PersonEntity[], churches: ChurchEntity[]): { preview: FidelityImportPreview; resolved: number; pending: number; manual: number } {
    let next = preview; let resolved = 0
    for (const item of preview.issues) {
      if (item.kind !== 'person_not_found' || !item.sourceRow) continue
      const matches = people.filter((person) => normalizePersonName(person.name) === normalizePersonName(item.sourceRow!.name))
      if (matches.length === 1) { next = this.resolveFidelityIssue(next, item.id, matches[0]!.id, people, churches, true); resolved += 1 }
    }
    const pending = next.issues.length
    return { preview: next, resolved, pending, manual: next.issues.filter((item) => item.kind === 'person_not_found' || item.kind === 'ambiguous_person').length }
  }

  undoFidelityIssueAssociation(preview: FidelityImportPreview, personId: string): FidelityImportPreview {
    const resolved = (preview.resolvedIssues ?? []).find((item) => item.personId === personId)
    if (!resolved) return preview
    const change = preview.changes.find((item) => item.personId === personId)
    if (!change) return preview
    const category = change.nextData.fidelity!.category; const associatedCategories = { ...preview.associatedCategories }
    if (category === 'tither') associatedCategories.tither -= 1; else if (category === 'non_systematic_tither') associatedCategories.nonSystematicTither -= 1; else associatedCategories.nonTither -= 1
    return { ...preview, changes: preview.changes.filter((item) => item.personId !== personId), issues: [...preview.issues, resolved.issue], associatedCategories, resolvedIssues: (preview.resolvedIssues ?? []).filter((item) => item !== resolved) }
  }

  async applyPreview(accountId: string, masterKey: CryptoKey, preview: MemberImportPreview | FidelityImportPreview): Promise<ImportApplyResult> {
    if (preview.alreadyImported) throw new Error('Este PDF já foi aplicado. A importação idêntica não cria duplicidades.')
    const batchId = crypto.randomUUID(); const appliedAt = new Date().toISOString()
    const changes = preview.kind === 'members' ? [...preview.newPeople, ...preview.updatedPeople, ...preview.missingPeople] : preview.changes
    const prepared = changes.map((change) => ({ ...change, nextData: { ...change.nextData, updatedAt: appliedAt, ...(preview.kind === 'fidelity' && change.nextData.fidelity ? { fidelity: { ...change.nextData.fidelity, updatedAt: appliedAt, importBatchId: batchId } } : {}) } }))
    const summary = { parsedRows: preview.parsedRows, created: prepared.filter(({ previousData }) => !previousData).length, updated: preview.kind === 'members' ? preview.updatedPeople.length : preview.changes.length, missing: preview.kind === 'members' ? preview.missingPeople.length : 0, unchanged: preview.unchanged, issues: preview.issues.length }
    const batchData: ImportBatchData = { kind: preview.kind, modelVersion: preview.kind === 'fidelity' ? 3 : 1, fileHash: preview.fileHash, source: preview.kind === 'members' ? 'PDF local de membros' : 'PDF local de fidelidade', status: 'applied', createdAt: appliedAt, appliedAt, summary, churchCounts: preview.churchCounts, issues: preview.issues, undo: { createdPersonIds: prepared.filter(({ previousData }) => !previousData).map(({ personId }) => personId), previousPeople: prepared.filter(({ previousData }) => previousData).map(({ personId, previousData }) => ({ id: personId, data: previousData! })) } }
    const mutations: EncryptedMutation[] = await Promise.all(prepared.map(async ({ personId, nextData }) => ({ recordId: personId, recordType: 'person' as const, envelope: await encryptPayload(masterKey, { schemaVersion: 1, type: 'person', data: nextData }, personId) })))
    mutations.push({ recordId: batchId, recordType: 'import_batch', envelope: await encryptPayload(masterKey, { schemaVersion: 1, type: 'import_batch', data: batchData }, batchId) })
    await this.repository.applyEncryptedMutations(accountId, currentDeviceId(accountId), mutations)
    return { batch: { id: batchId, ...batchData }, people: prepared.map(({ personId, nextData }) => ({ id: personId, ...nextData })) }
  }

  async undoLatest(accountId: string, masterKey: CryptoKey, kind: ImportBatchData['kind']): Promise<ImportBatchEntity> {
    const batch = (await this.listBatches(accountId, masterKey, kind)).find(({ status }) => status === 'applied')
    if (!batch) throw new Error('Não existe importação aplicada para desfazer.')
    const later = (await this.listBatches(accountId, masterKey, kind)).some((candidate) => candidate.status === 'applied' && candidate.appliedAt > batch.appliedAt)
    if (later) throw new Error('Somente a importação aplicada mais recentemente pode ser desfeita.')
    const records = await this.database.vaultRecords.bulkGet([...batch.undo.createdPersonIds, ...batch.undo.previousPeople.map(({ id }) => id)])
    for (const record of records) {
      if (!record || record.deletedAt) throw new Error('A importação não pode ser desfeita com segurança porque há alterações posteriores.')
      const payload = await decryptPayload(masterKey, record)
      if (payload.type !== 'person' || (payload.data as PersonData).updatedAt !== batch.appliedAt) throw new Error('A importação não pode ser desfeita com segurança porque há alterações posteriores.')
    }
    if (batch.undo.createdPersonIds.length) {
      for (const record of await this.repository.list(accountId, 'family')) {
        const payload = await decryptPayload(masterKey, record)
        if (payload.type === 'family' && (payload.data as FamilyData).memberIds.some((id) => batch.undo.createdPersonIds.includes(id))) throw new Error('Remova das famílias as pessoas criadas pela importação antes de desfazer.')
      }
    }
    const now = new Date().toISOString(); const mutations: EncryptedMutation[] = []
    for (const previous of batch.undo.previousPeople) mutations.push({ recordId: previous.id, recordType: 'person', envelope: await encryptPayload(masterKey, { schemaVersion: 1, type: 'person', data: previous.data }, previous.id) })
    for (const personId of batch.undo.createdPersonIds) mutations.push({ recordId: personId, recordType: 'person', operation: 'delete', envelope: await encryptPayload(masterKey, { schemaVersion: 1, type: 'person_tombstone', data: { deletedAt: now } }, personId) })
    const { id: _id, ...existingBatchData } = batch; void _id
    const storedBatch: ImportBatchData = { ...existingBatchData, status: 'undone', undoneAt: now }
    mutations.push({ recordId: batch.id, recordType: 'import_batch', envelope: await encryptPayload(masterKey, { schemaVersion: 1, type: 'import_batch', data: storedBatch }, batch.id) })
    await this.repository.applyEncryptedMutations(accountId, currentDeviceId(accountId), mutations)
    return { id: batch.id, ...storedBatch }
  }
}
