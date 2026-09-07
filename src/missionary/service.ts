import { currentDeviceId } from '../auth/device'
import { decryptRecord, encryptPayload } from '../crypto/vault'
import { db, type ApoioDatabase } from '../db/database'
import { VaultRepository } from '../db/repository'
import type { BibleStudyData, BibleStudyEntity, InterestData, InterestEntity, InterestStatus, MissionaryPairData, MissionaryPairEntity, SabbathClassData, SabbathClassEntity, SmallGroupData, SmallGroupEntity, UapgData, UapgEntity } from './types'

type MissionaryType = 'interest' | 'bible_study' | 'missionary_pair' | 'sabbath_class' | 'small_group' | 'uapg'
export class MissionaryService {
  private readonly repo: VaultRepository
  constructor(database: ApoioDatabase = db) { this.repo = new VaultRepository(database) }
  private async list<T>(accountId: string, key: CryptoKey, type: MissionaryType): Promise<T[]> {
    const records = await this.repo.list(accountId, type)
    const items = await Promise.all(records.map(async record => { const payload = await decryptRecord(key, record); return payload?.type === type ? { id: record.id, ...(payload.data as object) } as T : null }))
    return items.filter(Boolean) as T[]
  }
  listInterests(accountId: string, key: CryptoKey) { return this.list<InterestEntity>(accountId, key, 'interest') }
  listStudies(accountId: string, key: CryptoKey) { return this.list<BibleStudyEntity>(accountId, key, 'bible_study') }
  listPairs(accountId: string, key: CryptoKey) { return this.list<MissionaryPairEntity>(accountId, key, 'missionary_pair') }
  listClasses(accountId: string, key: CryptoKey) { return this.list<SabbathClassEntity>(accountId, key, 'sabbath_class') }
  listSmallGroups(accountId: string, key: CryptoKey) { return this.list<SmallGroupEntity>(accountId, key, 'small_group') }
  listUapgs(accountId: string, key: CryptoKey) { return this.list<UapgEntity>(accountId, key, 'uapg') }
  private async save<T extends object>(accountId:string,key:CryptoKey,type:'sabbath_class'|'small_group'|'uapg',data:T):Promise<{id:string}&T>{const id=crypto.randomUUID();await this.repo.saveEncrypted(accountId,currentDeviceId(accountId),id,await encryptPayload(key,{schemaVersion:1,type,data},id),type);return {id,...data} }
  async saveClass(accountId:string,key:CryptoKey,data:Omit<SabbathClassData,'createdAt'|'updatedAt'>){if(!data.churchId||!data.teacherId)throw new Error('Informe igreja e professor.');const now=new Date().toISOString();return this.save(accountId,key,'sabbath_class',{...data,createdAt:now,updatedAt:now})}
  async updateClass(accountId:string,key:CryptoKey,id:string,data:Omit<SabbathClassData,'createdAt'|'updatedAt'>){if(!data.churchId||!data.teacherId)throw new Error('Informe igreja e professor.');const current=(await this.listClasses(accountId,key)).find(item=>item.id===id);if(!current)throw new Error('Classe não encontrada.');const stored:SabbathClassData={...data,createdAt:current.createdAt,updatedAt:new Date().toISOString()};await this.replace(accountId,key,id,'sabbath_class',stored);return{id,...stored}}
  /**
   * Cria ou atualiza as unidades de uma igreja a partir do relatório do ACMS.
   *
   * Não passa por `saveClass` porque o relatório não diz quem é o professor, e
   * exigi-lo aqui impediria a importação inteira por causa de um dado que o
   * documento não tem. A classe entra sem professor, e o pastor o escolhe
   * depois; o que o relatório sabe — nome e quem participa — entra completo.
   *
   * Casa pelo nome dentro da igreja: reenviar o relatório atualiza a unidade em
   * vez de criar outra igual ao lado.
   */
  async importarClasses(accountId: string, key: CryptoKey, churchId: string, unidades: ReadonlyArray<{ nome: string; participantIds: string[]; visitors: string[] }>) {
    if (!churchId) throw new Error('Escolha a igreja deste relatório.')
    const existentes = (await this.listClasses(accountId, key)).filter((item) => item.churchId === churchId)
    const chave = (valor: string) => valor.normalize('NFD').replace(/[\u0300-\u036f]/gu, '').toLocaleLowerCase('pt-BR').replace(/\s+/gu, ' ').trim()
    let criadas = 0; let atualizadas = 0
    for (const unidade of unidades) {
      const atual = existentes.find((item) => chave(item.name ?? '') === chave(unidade.nome))
      const now = new Date().toISOString()
      if (atual) {
        const stored: SabbathClassData = { ...atual, name: unidade.nome, participantIds: unidade.participantIds, visitors: unidade.visitors, createdAt: atual.createdAt, updatedAt: now }
        await this.replace(accountId, key, atual.id, 'sabbath_class', stored)
        atualizadas += 1
      } else {
        await this.save(accountId, key, 'sabbath_class', { name: unidade.nome, churchId, teacherId: '', assistantId: null, ageGroup: 'other', participantIds: unidade.participantIds, visitors: unidade.visitors, createdAt: now, updatedAt: now })
        criadas += 1
      }
    }
    return { criadas, atualizadas }
  }

  async saveSmallGroup(accountId:string,key:CryptoKey,data:Omit<SmallGroupData,'createdAt'|'updatedAt'>){if(!data.name.trim()||!data.churchId||!data.leaderId)throw new Error('Informe nome, igreja e líder.');const now=new Date().toISOString();return this.save(accountId,key,'small_group',{...data,name:data.name.trim(),createdAt:now,updatedAt:now})}
  async updateSmallGroup(accountId:string,key:CryptoKey,id:string,data:Omit<SmallGroupData,'createdAt'|'updatedAt'>){if(!data.name.trim()||!data.churchId||!data.leaderId)throw new Error('Informe nome, igreja e líder.');const current=(await this.listSmallGroups(accountId,key)).find(item=>item.id===id);if(!current)throw new Error('PG não encontrado.');const stored:SmallGroupData={...data,name:data.name.trim(),createdAt:current.createdAt,updatedAt:new Date().toISOString()};await this.replace(accountId,key,id,'small_group',stored);return{id,...stored}}
  async saveUapg(accountId:string,key:CryptoKey,data:Omit<UapgData,'createdAt'|'updatedAt'>){if(!data.name.trim()||!data.churchId)throw new Error('Informe nome e igreja.');const now=new Date().toISOString();return this.save(accountId,key,'uapg',{...data,name:data.name.trim(),createdAt:now,updatedAt:now})}
  async updateUapg(accountId:string,key:CryptoKey,id:string,data:Omit<UapgData,'createdAt'|'updatedAt'>){if(!data.name.trim()||!data.churchId)throw new Error('Informe nome e igreja.');const current=(await this.listUapgs(accountId,key)).find(item=>item.id===id);if(!current)throw new Error('UAPG não encontrada.');const stored:UapgData={...data,name:data.name.trim(),createdAt:current.createdAt,updatedAt:new Date().toISOString()};await this.replace(accountId,key,id,'uapg',stored);return{id,...stored}}
  async remove(accountId:string,key:CryptoKey,id:string){const record=await this.repo.list(accountId);const current=record.find(item=>item.id===id);if(!current)throw new Error('Registro não encontrado.');await this.repo.deleteEncrypted(accountId,currentDeviceId(accountId),id,await encryptPayload(key,{schemaVersion:1,type:'removed',data:{at:new Date().toISOString()}},id))}
  async replace(accountId:string,key:CryptoKey,id:string,type:'sabbath_class'|'small_group'|'uapg',data:object){await this.repo.saveEncrypted(accountId,currentDeviceId(accountId),id,await encryptPayload(key,{schemaVersion:1,type,data},id),type)}
  async savePair(accountId: string, key: CryptoKey, churchId: string, memberIds: string[]) {
    if (!churchId || memberIds.length !== 2 || memberIds[0] === memberIds[1]) throw new Error('Selecione dois integrantes diferentes da mesma igreja.')
    const id = crypto.randomUUID(); const now = new Date().toISOString(); const data: MissionaryPairData = { churchId, memberIds, active: true, createdAt: now, updatedAt: now }
    await this.repo.saveEncrypted(accountId, currentDeviceId(accountId), id, await encryptPayload(key, { schemaVersion: 1, type: 'missionary_pair', data }, id), 'missionary_pair'); return { id, ...data }
  }
  async saveInterest(accountId: string, key: CryptoKey, input: Omit<InterestData, 'createdAt' | 'updatedAt'>, id: string = crypto.randomUUID()) {
    if (!input.churchId || !input.name.trim()) throw new Error('Informe igreja e nome do interessado.')
    const existing = (await this.listInterests(accountId, key)).find(item => item.id === id); const now = new Date().toISOString()
    const data: InterestData = { ...input, name: input.name.trim(), contact: input.contact.trim(), notes: input.notes.trim(), createdAt: existing?.createdAt ?? now, updatedAt: now }
    await this.repo.saveEncrypted(accountId, currentDeviceId(accountId), id, await encryptPayload(key, { schemaVersion: 1, type: 'interest', data }, id), 'interest')
    return { id, ...data }
  }
  async startStudy(accountId: string, key: CryptoKey, interest: InterestEntity, startedAt: string) {
    const now = new Date().toISOString(); const id = crypto.randomUUID(); const data: BibleStudyData = { interestId: interest.id, churchId: interest.churchId, startedAt, completedAt: null, status: 'in_progress', followUp: '', outcome: null, createdAt: now, updatedAt: now }
    await this.repo.saveEncrypted(accountId, currentDeviceId(accountId), id, await encryptPayload(key, { schemaVersion: 1, type: 'bible_study', data }, id), 'bible_study')
    await this.saveInterest(accountId, key, { ...interest, status: 'bible_study' }, interest.id); return { id, ...data }
  }
  async completeStudy(accountId: string, key: CryptoKey, study: BibleStudyEntity, interest: InterestEntity, outcome: 'continue_interested' | 'baptized', followUp: string) {
    const now = new Date().toISOString(); const data: BibleStudyData = { ...study, status: 'completed', completedAt: now, outcome, followUp: followUp.trim(), updatedAt: now }
    await this.repo.saveEncrypted(accountId, currentDeviceId(accountId), study.id, await encryptPayload(key, { schemaVersion: 1, type: 'bible_study', data }, study.id), 'bible_study')
    await this.saveInterest(accountId, key, { ...interest, status: 'study_finished' }, interest.id)
  }
  async updateStatus(accountId: string, key: CryptoKey, interest: InterestEntity, status: InterestStatus) { return this.saveInterest(accountId, key, { ...interest, status }, interest.id) }
}
