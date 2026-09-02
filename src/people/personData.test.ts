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
})

describe('exportação e exclusão de uma pessoa', () => {
  it('exporta os dados legíveis e conta os registros ligados', async () => {
    const banco = novoBanco(); const chave = await generateMasterKey()
    const pessoa = await gravar(banco, chave, 'person', { name: 'Pessoa Fictícia Alfa', birthDate: '1990-02-03', whatsapp: '(61) 90000-0000', pastoralStatus: 'active', notes: 'Observação fictícia' })
    await gravar(banco, chave, 'visit', { targetType: 'person', targetId: pessoa }, 'visit')
    await gravar(banco, chave, 'family', { name: 'Família Fictícia', memberIds: [pessoa, 'outra-pessoa'] }, 'family')

    const linhas = await new PersonDataService(banco).exportLines(CONTA, chave, pessoa)

    expect(linhas[0]).toBe('Nome: Pessoa Fictícia Alfa')
    expect(linhas.join('\n')).toContain('- visit: 1')
    expect(linhas.join('\n')).toContain('- family: 1')
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
