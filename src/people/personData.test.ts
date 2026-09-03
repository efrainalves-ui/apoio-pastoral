import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { decryptPayload, encryptPayload, generateMasterKey } from '../crypto/vault'
import { ApoioDatabase } from '../db/database'
import { VaultRepository } from '../db/repository'
import type { VaultRecord } from '../db/types'
import { PersonDataService, isOnlyAboutPerson, withoutPerson } from './personData'

const CONTA = 'conta-ficticia-pessoa'
const APARELHO = 'aparelho-ficticio'
const bancos: ApoioDatabase[] = []
afterEach(async () => { await Promise.all(bancos.splice(0).map((banco) => banco.delete())) })

function novoBanco() {
  const banco = new ApoioDatabase(`pessoa-${crypto.randomUUID()}`)
  bancos.push(banco)
  return banco
}

async function gravar(banco: ApoioDatabase, chave: CryptoKey, tipo: string, dados: object, recordType: VaultRecord['recordType'] = 'person') {
  const id = crypto.randomUUID()
  await new VaultRepository(banco).saveEncrypted(CONTA, APARELHO, id, await encryptPayload(chave, { schemaVersion: 1, type: tipo, data: dados }, id), recordType)
  return id
}

describe('classificação dos registros ligados a uma pessoa', () => {
  it('reconhece o que é só daquela pessoa', () => {
    expect(isOnlyAboutPerson({ schemaVersion: 1, type: 'visit', data: { targetType: 'person', targetId: 'p1' } }, 'p1')).toBe(true)
    expect(isOnlyAboutPerson({ schemaVersion: 1, type: 'visit', data: { targetType: 'family', targetId: 'f1' } }, 'p1')).toBe(false)
    expect(isOnlyAboutPerson({ schemaVersion: 1, type: 'prayer_request', data: { subjectType: 'person', subjectId: 'p1' } }, 'p1')).toBe(true)
    expect(isOnlyAboutPerson({ schemaVersion: 1, type: 'prayer_request', data: { subjectType: 'anonymous', subjectId: null } }, 'p1')).toBe(false)
    expect(isOnlyAboutPerson({ schemaVersion: 1, type: 'family', data: { memberIds: ['p1'] } }, 'p1')).toBe(false)
  })

  it('tira a citação da pessoa sem apagar o registro dos outros', () => {
    const familia = withoutPerson({ schemaVersion: 1, type: 'family', data: { name: 'Família Fictícia', memberIds: ['p1', 'p2'] } }, 'p1')
    expect((familia?.data as { memberIds: string[] }).memberIds).toEqual(['p2'])

    const classe = withoutPerson({ schemaVersion: 1, type: 'sabbath_class', data: { teacherId: 'p1', assistantId: 'p3', participantIds: ['p1', 'p2'] } }, 'p1')
    expect(classe?.data).toMatchObject({ teacherId: '', participantIds: ['p2'], assistantId: 'p3' })

    expect(withoutPerson({ schemaVersion: 1, type: 'family', data: { memberIds: ['p2'] } }, 'p1')).toBeNull()
  })

  it('tira as respostas da entrevista e a fidelidade dela de uma visita de família', () => {
    // As respostas trazem `subjectId`: sem tirá-las, o conteúdo mais íntimo da
    // pessoa continuava guardado depois de ela pedir para ser apagada.
    const visita = withoutPerson({
      schemaVersion: 1,
      type: 'visit',
      data: {
        targetType: 'family', targetId: 'f1',
        versions: [{ version: 1, participants: [{ id: 'a', personId: 'p1' }, { id: 'b', personId: 'p2' }], answers: [{ id: 'r1', subjectId: 'p1', value: 'resposta fictícia dela' }, { id: 'r2', subjectId: 'p2', value: 'resposta fictícia de outro' }] }],
        incomeAnswers: [{ personId: 'p1', status: 'tither' }, { personId: 'p2', status: 'tither' }],
      },
    }, 'p1')

    expect(JSON.stringify(visita)).not.toContain('resposta fictícia dela')
    expect(JSON.stringify(visita)).toContain('resposta fictícia de outro')
    expect(visita?.data).toMatchObject({ incomeAnswers: [{ personId: 'p2', status: 'tither' }] })
  })

  it('tira a pessoa da comissão, do processo de nomeações e da campanha', () => {
    const comissao = withoutPerson({
      schemaVersion: 1, type: 'commission_meeting',
      data: { presidentId: 'p1', secretaryId: 'p2', participantIds: ['p1', 'p2'], agenda: [{ id: 'a1', responsibleId: 'p1' }] },
    }, 'p1')
    expect(comissao?.data).toMatchObject({ presidentId: '', secretaryId: 'p2', participantIds: ['p2'], agenda: [{ responsibleId: '' }] })

    const nomeacoes = withoutPerson({
      schemaVersion: 1, type: 'nomination_process',
      data: {
        formation: { committeeMemberIds: ['p1', 'p2'], organizingCommitteeIds: [], presidentId: 'p1', secretaryId: 'p2', districtLeaderId: '' },
        candidates: [{ id: 'c1', personId: 'p1', confidentialNote: 'nota reservada fictícia' }, { id: 'c2', personId: 'p2' }],
        meetings: [{ id: 'm1', participantIds: ['p1', 'p2'], presidentId: 'p2', secretaryId: 'p1' }],
        officialVotes: [{ id: 'v1', participantIds: ['p1'], presidentId: 'p2', secretaryId: 'p2' }],
        reports: [{ id: 'r1', lines: [{ officeId: 'o1', personId: 'p1', personName: 'Pessoa Fictícia Apagada' }] }],
        tasks: [{ id: 't1', responsibleId: 'p1' }],
      },
    }, 'p1')
    const texto = JSON.stringify(nomeacoes)
    expect(texto).not.toContain('Pessoa Fictícia Apagada')
    expect(texto).not.toContain('nota reservada fictícia')
    expect(texto).not.toContain('p1')
    expect(texto).toContain('p2')

    const campanha = withoutPerson({
      schemaVersion: 1, type: 'evangelism_campaign',
      data: { team: [{ id: 'e1', personId: 'p1' }, { id: 'e2', personId: 'p2' }], points: [{ id: 'pt1', teamPersonIds: ['p1', 'p2'] }], tasks: [{ id: 'tk1', responsibleId: 'p1' }] },
    }, 'p1')
    expect(campanha?.data).toMatchObject({ team: [{ personId: 'p2' }], points: [{ teamPersonIds: ['p2'] }], tasks: [{ responsibleId: null }] })
  })

  it('tira a cópia guardada pela importação para desfazer', () => {
    // O lote de importação guardava os dados anteriores da pessoa inteiros.
    // Apagar a pessoa e deixar essa cópia seria apagar só a metade visível.
    const lote = withoutPerson({
      schemaVersion: 1, type: 'import_batch',
      data: { kind: 'members', undo: { createdPersonIds: ['p1', 'p2'], previousPeople: [{ id: 'p1', data: { name: 'Pessoa Fictícia Apagada' } }, { id: 'p2', data: { name: 'Outra Pessoa Fictícia' } }] } },
    }, 'p1')

    expect(JSON.stringify(lote)).not.toContain('Pessoa Fictícia Apagada')
    expect(JSON.stringify(lote)).toContain('Outra Pessoa Fictícia')
    expect(lote?.data).toMatchObject({ undo: { createdPersonIds: ['p2'] } })
  })

  it('não mexe em registro que não cita a pessoa', () => {
    for (const tipo of ['commission_meeting', 'nomination_process', 'evangelism_campaign', 'import_batch', 'visit']) {
      expect(withoutPerson({ schemaVersion: 1, type: tipo, data: { versions: [], undo: { createdPersonIds: [], previousPeople: [] }, formation: {}, participantIds: ['p2'] } }, 'p1')).toBeNull()
    }
  })
})

describe('exportação e exclusão de uma pessoa', () => {
  it('exporta os dados legíveis e conta os registros ligados', async () => {
    const banco = novoBanco(); const chave = await generateMasterKey()
    const pessoa = await gravar(banco, chave, 'person', { name: 'Pessoa Fictícia Alfa', birthDate: '1990-02-03', whatsapp: '(61) 90000-0000', pastoralStatus: 'active', notes: 'Observação fictícia' })
    await gravar(banco, chave, 'visit', { targetType: 'person', targetId: pessoa }, 'visit')
    await gravar(banco, chave, 'family', { name: 'Família Fictícia', memberIds: [pessoa, 'outra-pessoa'] }, 'family')

    const linhas = await new PersonDataService(banco).exportLines(CONTA, chave, pessoa)
    const texto = linhas.join('\n')

    expect(linhas[0]).toBe('Dados pessoais')
    expect(texto).toContain('Nome: Pessoa Fictícia Alfa')
    expect(texto).toContain('WhatsApp: (61) 90000-0000')
    expect(texto).toContain('Observações: Observação fictícia')
    // A visita fala só desta pessoa: quem pede os próprios dados recebe o
    // conteúdo, não uma contagem.
    expect(texto).toContain('Registros que falam somente desta pessoa')
    expect(texto).toContain('Visita')
    // A família é de outras pessoas também: dela fica só a indicação.
    expect(texto).toContain('Registros em que esta pessoa aparece junto de outras')
    expect(texto).toContain('- Família: 1')
    expect(texto).not.toContain('Família Fictícia')
  })

  it('a exportação traz o conteúdo dos registros que falam só dela', async () => {
    const banco = novoBanco(); const chave = await generateMasterKey()
    const pessoa = await gravar(banco, chave, 'person', { name: 'Pessoa Fictícia Gama' })
    await gravar(banco, chave, 'prayer_request', { subjectType: 'person', subjectId: pessoa, text: 'Pedido fictício de oração', privateNotes: 'Anotação reservada fictícia' }, 'prayer_request')

    const texto = (await new PersonDataService(banco).exportLines(CONTA, chave, pessoa)).join('\n')

    expect(texto).toContain('Pedido de oração')
    expect(texto).toContain('Texto: Pedido fictício de oração')
    expect(texto).toContain('Observações reservadas: Anotação reservada fictícia')
  })

  it('apaga o que era só da pessoa e desvincula o resto', async () => {
    const banco = novoBanco(); const chave = await generateMasterKey()
    const pessoa = await gravar(banco, chave, 'person', { name: 'Pessoa Fictícia Beta' })
    const visita = await gravar(banco, chave, 'visit', { targetType: 'person', targetId: pessoa, versions: [] }, 'visit')
    const oracao = await gravar(banco, chave, 'prayer_request', { subjectType: 'person', subjectId: pessoa, text: 'Pedido fictício' }, 'prayer_request')
    const acompanhamento = await gravar(banco, chave, 'follow_up', { subjectType: 'person', subjectId: pessoa }, 'follow_up')
    const estudo = await gravar(banco, chave, 'bible_study', { personId: pessoa }, 'bible_study')
    const familia = await gravar(banco, chave, 'family', { name: 'Família Fictícia', memberIds: [pessoa, 'outra-pessoa'] }, 'family')
    const visitaDeFamilia = await gravar(banco, chave, 'visit', { targetType: 'family', targetId: familia, versions: [{ participants: [{ id: 'x', kind: 'person', personId: pessoa, present: true }] }] }, 'visit')

    const resultado = await new PersonDataService(banco).remove(CONTA, chave, APARELHO, pessoa)

    expect(resultado.removed).toBe(5)
    for (const id of [pessoa, visita, oracao, acompanhamento, estudo]) {
      expect((await banco.vaultRecords.get(id))?.deletedAt).toBeTruthy()
    }
    const familiaSalva = await banco.vaultRecords.get(familia)
    expect((await decryptPayload(chave, familiaSalva!)).data).toMatchObject({ memberIds: ['outra-pessoa'] })
    const visitaSalva = await banco.vaultRecords.get(visitaDeFamilia)
    expect(JSON.stringify((await decryptPayload(chave, visitaSalva!)).data)).not.toContain(pessoa)
  })

  // O conteúdo apagado não pode continuar visível em lugar nenhum.
  it('não deixa a pessoa nem o pedido dela visíveis depois da exclusão', async () => {
    const banco = novoBanco(); const chave = await generateMasterKey()
    const pessoa = await gravar(banco, chave, 'person', { name: 'Pessoa Fictícia Gama' })
    await gravar(banco, chave, 'prayer_request', { subjectType: 'person', subjectId: pessoa, text: 'Pedido fictício reservado' }, 'prayer_request')

    await new PersonDataService(banco).remove(CONTA, chave, APARELHO, pessoa)

    const repositorio = new VaultRepository(banco)
    expect(await repositorio.list(CONTA, 'person')).toEqual([])
    expect(await repositorio.list(CONTA, 'prayer_request')).toEqual([])
    const fila = await banco.outbox.where('accountId').equals(CONTA).toArray()
    expect(fila.filter(({ operation }) => operation === 'delete')).toHaveLength(2)
    expect(JSON.stringify(fila)).not.toContain('Pedido fictício reservado')
    expect(JSON.stringify(await banco.vaultRecords.toArray())).not.toContain('Pessoa Fictícia Gama')
  })
})
