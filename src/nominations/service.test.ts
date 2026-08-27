import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { CommissionService } from '../commissions/service'
import { generateMasterKey } from '../crypto/vault'
import { ApoioDatabase } from '../db/database'
import type { PersonEntity } from '../people/types'
import { internalVote, publicReportText } from './core'
import { NominationService } from './service'

const databases: ApoioDatabase[] = []
afterEach(async()=>{await Promise.all(databases.splice(0).map((database)=>database.delete()))})
const person=(id:string,name:string,category:'tither'|'non_tither'='tither'):PersonEntity=>({id,name,birthDate:'1990-01-01',whatsapp:'',notes:'',pastoralStatus:'active',importStatus:'current',currentChurchId:'church-fixture',memberships:[],history:[],incomeStatus:'unknown',fidelity:{months:category==='tither'?12:0,rangeMin:category==='tither'?8:0,rangeMax:category==='tither'?12:0,category,precision:'exact',updatedAt:'2026-01-01',importedAt:'2026-01-01',source:'fixture',importBatchId:'fixture'},fidelityHistory:[],createdAt:'2026-01-01',updatedAt:'2026-01-01'})

describe('regras da Comissão de Nomeações',()=>{
  it('aplica 50% + 1 aos votos válidos e não conta abstenções',()=>{expect(internalVote(2,1,7,10,3)).toMatchObject({result:'approved',required:2,hasQuorum:true});expect(internalVote(1,2,0,3,3).result).toBe('rejected');expect(internalVote(3,0,0,2,3).hasQuorum).toBe(false)})

  it('percorre formação, indicação, consentimento, voto, relatório, objeção, votação oficial, vaga e Agenda sem expor conteúdo reservado',async()=>{
    const database=new ApoioDatabase(`nominations-${crypto.randomUUID()}`);databases.push(database);const service=new NominationService(database);const key=await generateMasterKey();const account='account-fixture';const people=[person('p1','Pessoa Fictícia Um'),person('p2','Pessoa Fictícia Dois'),person('p3','Pessoa Fictícia Três','non_tither')]
    let process=await service.create(account,key,'church-fixture','Nomeações 2027','p1')
    expect(process.formation.presidentId).toBe('p1');expect(process.offices.length).toBeGreaterThan(10)
    process=await service.saveFormation(account,key,process.id,{method:'organizing_committee',organizingCommitteeIds:['p1','p2','p3'],organizingVoteReference:'2026-FICTÍCIO',committeeMemberIds:['p1','p2','p3'],presidentId:'p1',secretaryId:'p2',districtLeaderId:'p1',quorum:3,electedAt:'2026-09-01',notes:'Nota de formação fictícia'})
    expect(process.status).toBe('formed')
    const custom={...process.offices[0]!,id:crypto.randomUUID(),area:'Outros',title:'Cargo Fictício',vacancies:1,description:'Descrição fictícia'}
    process=await service.saveOffice(account,key,process.id,custom);expect(process.offices.some((office)=>office.title==='Cargo Fictício')).toBe(true)
    process=await service.saveOffice(account,key,process.id,{...custom,title:'Cargo Fictício Editado'});expect(process.offices.find((office)=>office.id===custom.id)?.title).toBe('Cargo Fictício Editado')
    await expect(service.saveOffice(account,key,process.id,{...custom,id:crypto.randomUUID(),title:'Pastor associado'})).rejects.toThrow('não são cargos')
    process=await service.addCandidate(account,key,process.id,custom.id,people[2]!)
    let candidate=process.candidates[0]!;expect(candidate.fidelityAlert).toBe(true);expect(candidate.eligibility).toBe('pending')
    process=await service.createMeeting(account,key,process.id);const meeting=process.meetings[0]!
    const awaiting=await service.voteCandidate(account,key,process.id,candidate.id,meeting.id,2,1,0);expect(awaiting.candidates[0]?.status).toBe('reviewing')
    process=await service.updateCandidate(account,key,process.id,candidate.id,{consent:true,status:'accepted',conversationDate:'2026-09-02',eligibility:'confirmed',confidentialNote:'Nota confidencial fictícia'})
    candidate=process.candidates[0]!
    process=await service.voteCandidate(account,key,process.id,candidate.id,meeting.id,2,1,0);expect(process.candidates[0]).toMatchObject({status:'recommended',consent:true})
    process=await service.finalizeMeeting(account,key,process.id,meeting.id)
    await expect(service.updateMeeting(account,key,process.id,{...process.meetings[0]!,location:'Outro local'})).rejects.toThrow('protegido')
    process=await service.addMeetingCorrection(account,key,process.id,meeting.id,'Correção fictícia complementar');expect(process.meetings[0]?.corrections).toHaveLength(1)
    process=await service.addMeetingToAgenda(account,key,process.id,meeting.id);expect(process.meetings[0]?.agendaEventId).toBeTruthy()
    process=await service.generateReport(account,key,process.id,people);let report=process.reports[0]!;const publicText=publicReportText('Igreja Fictícia',process,report)
    expect(publicText).toContain('Pessoa Fictícia Três');expect(publicText).not.toContain('Nota confidencial');expect(publicText).not.toContain('dizimista');expect(publicText).not.toContain('favoráveis')
    process=await service.updateReport(account,key,process.id,{...report,presentationDate:'2026-09-05'});expect(process.status).toBe('presented')
    process=await service.addObjection(account,key,process.id,'Objeção fictícia','Conteúdo confidencial da objeção','2026-09-06');expect(process.status).toBe('objections')
    process=await service.decideObjection(account,key,process.id,process.objections[0]!.id,'changed');process=await service.generateReport(account,key,process.id,people);expect(process.reports.map((item)=>item.version)).toEqual([1,2])
    report=process.reports.at(-1)!;expect(service.reportText('Igreja Fictícia',process,report)).not.toContain('Conteúdo confidencial da objeção')
    process=await service.prepareOfficialVote(account,key,process.id,'complete','regular_church');let official=process.officialVotes[0]!;process=await service.updateOfficialVote(account,key,process.id,{...official,participantIds:['p1','p2','p3'],quorum:3,presidentId:'p1',secretaryId:'p2'});official=process.officialVotes[0]!
    process=await service.voteOfficial(account,key,process.id,official.id,2,1,0);expect(process.offices.find((office)=>office.id===custom.id)?.officialStatus).toBe('elected');expect(process.candidates[0]?.electedAt).toBeTruthy()
    await expect(service.updateOfficialVote(account,key,process.id,{...process.officialVotes[0]!,location:'Outro'})).rejects.toThrow('protegida')
    process=await service.addOfficialCorrection(account,key,process.id,official.id,'Correção complementar fictícia');expect(process.officialVotes[0]?.corrections).toHaveLength(1)
    process=await service.fillVacancy(account,key,process.id,custom.id,'permanent_nominating');expect(process.offices.find((office)=>office.id===custom.id)).toMatchObject({status:'open',officialStatus:'vacant'});expect(process.vacancyProcesses[0]?.route).toBe('permanent_nominating')
    process=await service.addTask(account,key,process.id,'Pendência fictícia','p2','2026-09-10');process=await service.updateTask(account,key,process.id,process.tasks[0]!.id,'completed');process=await service.addTaskToAgenda(account,key,process.id,process.tasks[0]!.id);expect(process.tasks[0]).toMatchObject({status:'completed'});expect(process.tasks[0]?.agendaEventId).toBeTruthy()
    process=await service.prepareOfficialVote(account,key,process.id,'by_office','administrative',custom.id);let integrated=process.officialVotes.at(-1)!;expect(integrated.administrativeMeetingId).toBeTruthy();const meetingRecord=await new CommissionService(database).meeting(account,key,integrated.administrativeMeetingId!);expect(meetingRecord?.agenda[0]?.proposal).toContain('aprovar e registrar o relatório da Comissão de Nomeações');expect(meetingRecord?.agenda[0]?.sourceMeetingId).toBe(process.id)
    await expect(service.voteOfficial(account,key,process.id,integrated.id,2,1,0)).rejects.toThrow('quórum')
    process=await service.updateOfficialVote(account,key,process.id,{...integrated,participantIds:['p1','p2','p3'],quorum:3,presidentId:'p1',secretaryId:'p2'});integrated=process.officialVotes.at(-1)!
    process=await service.voteOfficial(account,key,process.id,integrated.id,2,1,0);integrated=process.officialVotes.at(-1)!;expect(integrated.result).toBe('approved');expect(process.offices.find((office)=>office.id===custom.id)?.officialStatus).toBe('elected');expect(service.officialMinutes(process,integrated,(id)=>people.find((item)=>item.id===id)?.name??id)).toContain('resultado: aprovado')
    expect(JSON.stringify(await database.vaultRecords.toArray())).not.toContain('Nota confidencial fictícia')
  })

  it('bloqueia recomendação sem quórum e relatório sem consentimento',async()=>{const database=new ApoioDatabase(`nominations-block-${crypto.randomUUID()}`);databases.push(database);const service=new NominationService(database);const key=await generateMasterKey();const people=[person('p1','Pessoa Fictícia Um'),person('p2','Pessoa Fictícia Dois'),person('p3','Pessoa Fictícia Três')];let process=await service.create('account-fixture',key,'church-fixture','Nomeações 2028','p1');process=await service.saveFormation('account-fixture',key,process.id,{...process.formation,committeeMemberIds:['p1','p2','p3'],presidentId:'p1',secretaryId:'p2',quorum:4});process=await service.addCandidate('account-fixture',key,process.id,process.offices[0]!.id,people[2]!);process=await service.createMeeting('account-fixture',key,process.id);await expect(service.voteCandidate('account-fixture',key,process.id,process.candidates[0]!.id,process.meetings[0]!.id,3,0,0)).rejects.toThrow('quórum');await expect(service.generateReport('account-fixture',key,process.id,people)).rejects.toThrow('Nenhuma indicação')})
})
