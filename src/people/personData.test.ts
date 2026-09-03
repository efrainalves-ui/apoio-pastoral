import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { decryptPayload, encryptPayload, generateMasterKey } from '../crypto/vault'
import { ApoioDatabase } from '../db/database'
import { VaultRepository } from '../db/repository'
import type { VaultRecord } from '../db/types'
import { pendingRemotePurge } from '../db/purge'
import { PersonDataService, isOnlyAboutPerson, redactForPerson, withoutPerson } from './personData'

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
    expect(isOnlyAboutPerson({ schemaVersion: 1, type: 'visit', data: { targetType: 'person', targetId: 'p1' } }, 'p1', 'v1')).toBe(true)
    expect(isOnlyAboutPerson({ schemaVersion: 1, type: 'visit', data: { targetType: 'family', targetId: 'f1' } }, 'p1', 'v1')).toBe(false)
    expect(isOnlyAboutPerson({ schemaVersion: 1, type: 'prayer_request', data: { subjectType: 'person', subjectId: 'p1' } }, 'p1', 'o1')).toBe(true)
    expect(isOnlyAboutPerson({ schemaVersion: 1, type: 'prayer_request', data: { subjectType: 'anonymous', subjectId: null } }, 'p1', 'o1')).toBe(false)
    expect(isOnlyAboutPerson({ schemaVersion: 1, type: 'family', data: { memberIds: ['p1'] } }, 'p1', 'f1')).toBe(false)
  })

  it('o cadastro de uma pessoa só fala dela quando o registro é o dela', () => {
    // O achado: `person` respondia `true` para qualquer cadastro, de qualquer
    // pessoa. Era isso que fazia a exportação de uma pessoa sair com o cadastro
    // completo de todas as outras dentro.
    const cadastro = { schemaVersion: 1, type: 'person', data: { name: 'Pessoa Fictícia' } } as const
    expect(isOnlyAboutPerson(cadastro, 'p1', 'p1')).toBe(true)
    expect(isOnlyAboutPerson(cadastro, 'p1', 'p2')).toBe(false)
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
    // A família é de outras pessoas também: dela sai só o contexto e o que há
    // sobre quem pediu — nunca os outros integrantes.
    expect(texto).toContain('Registros em que esta pessoa aparece junto de outras')
    expect(texto).toContain('Família')
    expect(texto).toContain('Sobre as outras pessoas')
    expect(texto).not.toContain('Família Fictícia')
    expect(texto).not.toContain('outra-pessoa')
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

  it('tira o nome escrito na meta anual e no acompanhamento da campanha', () => {
    // Os dois guardam o nome ao lado do identificador. Apagar só o vínculo
    // deixava escrito de quem se tratava.
    const meta = withoutPerson({
      schemaVersion: 1, type: 'annual_goal',
      data: { title: 'Meta Fictícia', references: [{ type: 'person', id: 'p1', label: 'Pessoa Fictícia Apagada' }, { type: 'person', id: 'p2', label: 'Outra Pessoa' }] },
    }, 'p1')
    expect(JSON.stringify(meta)).not.toContain('Pessoa Fictícia Apagada')
    expect(JSON.stringify(meta)).toContain('Outra Pessoa')

    const campanha = withoutPerson({
      schemaVersion: 1, type: 'evangelism_campaign',
      data: {
        team: [], points: [],
        tasks: [{ id: 't1', responsibleId: 'p1', responsibleName: 'Pessoa Fictícia Apagada' }],
        followUps: [{ id: 'f1', type: 'person', recordId: 'p1', displayName: 'Pessoa Fictícia Apagada' }, { id: 'f2', type: 'person', recordId: 'p2', displayName: 'Outra Pessoa' }],
      },
    }, 'p1')
    expect(JSON.stringify(campanha)).not.toContain('Pessoa Fictícia Apagada')
    expect(JSON.stringify(campanha)).toContain('Outra Pessoa')

    const nomeacoes = withoutPerson({
      schemaVersion: 1, type: 'nomination_process',
      data: {
        formation: {}, meetings: [], officialVotes: [], reports: [], tasks: [],
        candidates: [{ id: 'c1', personId: 'p2', vote: { participantIds: ['p1', 'p2'], favorable: 2 } }],
      },
    }, 'p1')
    expect((nomeacoes?.data as { candidates: Array<{ vote: { participantIds: string[] } }> }).candidates[0]!.vote.participantIds).toEqual(['p2'])
  })

  it('a versão redigida guarda o que é da pessoa e não entrega terceiro', () => {
    const visita = redactForPerson({
      schemaVersion: 1, type: 'visit',
      data: {
        targetType: 'family', targetId: 'f1', reason: 'routine', createdAt: '2026-05-01T10:00:00.000Z',
        notes: 'Anotação da visita inteira, que fala de todos',
        versions: [{ version: 1, answers: [{ id: 'r1', subjectId: 'p1', value: 'resposta fictícia dela' }, { id: 'r2', subjectId: 'p2', value: 'resposta fictícia de outro' }] }],
      },
    }, 'p1')
    const texto = JSON.stringify(visita)

    expect(texto).toContain('resposta fictícia dela')
    expect(texto).not.toContain('resposta fictícia de outro')
    // Texto livre da visita inteira fala de todos: não sai numa exportação de
    // uma pessoa só.
    expect(texto).not.toContain('Anotação da visita inteira')
    expect(texto).toContain('routine')
  })

  it('a exportação traz a versão projetada dos registros compartilhados', async () => {
    const banco = novoBanco(); const chave = await generateMasterKey()
    const pessoa = await gravar(banco, chave, 'person', { name: 'Pessoa Fictícia Delta' })
    await gravar(banco, chave, 'small_group', { name: 'PG Fictício da Irmã Sentinela', day: 'wednesday', leaderId: pessoa, participantIds: [pessoa, 'outra-pessoa'], host: 'Rua Fictícia, 123' }, 'person')

    const texto = (await new PersonDataService(banco).exportLines(CONTA, chave, pessoa)).join('\n')

    expect(texto).toContain('Pequeno Grupo')
    // O papel dela é o que interessa a quem pede os próprios dados: dizer
    // apenas "aparece neste registro" não responde nada.
    expect(texto).toContain('Como esta pessoa aparece')
    expect(texto).toContain('líder')
    expect(texto).toContain('participante')
    expect(texto).toContain('Sobre as outras pessoas')
    // Campo estrutural sai; campo livre e endereço, não. O nome de um registro
    // compartilhado é escrito pelo pastor e pode citar quem quer que seja.
    expect(texto).toContain('wednesday')
    expect(texto).not.toContain('PG Fictício da Irmã Sentinela')
    expect(texto).not.toContain('Rua Fictícia')
    expect(texto).not.toContain('outra-pessoa')
  })

  it('exportar uma pessoa não entrega o cadastro de outra', async () => {
    // O achado central: a exportação de uma pessoa saía com o cadastro
    // completo de todas as outras pessoas da conta.
    const banco = novoBanco(); const chave = await generateMasterKey()
    const alfa = await gravar(banco, chave, 'person', { name: 'Pessoa Sentinela Alfa', whatsapp: '(61) 90000-0001', notes: 'Observação sentinela de Alfa' })
    const beta = await gravar(banco, chave, 'person', { name: 'Pessoa Sentinela Beta', whatsapp: '(61) 90000-0002', notes: 'Observação sentinela de Beta', address: 'Rua Sentinela de Beta, 45' })
    await gravar(banco, chave, 'prayer_request', { subjectType: 'person', subjectId: beta, text: 'Pedido sentinela só de Beta', privateNotes: 'Reservado sentinela de Beta' }, 'prayer_request')
    await gravar(banco, chave, 'visit', { targetType: 'person', targetId: beta, versions: [] }, 'visit')
    await gravar(banco, chave, 'family', { name: 'Família Sentinela', memberIds: [alfa, beta] }, 'family')
    await gravar(banco, chave, 'commission_meeting', {
      date: '2026-05-01', location: 'Sala Sentinela', notes: 'Observação sentinela da comissão',
      participantIds: [alfa, beta], guestNames: ['Convidado Sentinela'],
      agenda: [{ id: 'a1', title: 'Assunto Sentinela', responsibleId: beta, dueDate: '2026-06-01' }],
    }, 'commission_meeting')

    const texto = (await new PersonDataService(banco).exportLines(CONTA, chave, alfa)).join('\n')

    expect(texto).toContain('Pessoa Sentinela Alfa')
    expect(texto).toContain('Observação sentinela de Alfa')
    for (const sentinela of [
      'Pessoa Sentinela Beta', 'Observação sentinela de Beta', 'Rua Sentinela de Beta',
      '(61) 90000-0002', 'Pedido sentinela só de Beta', 'Reservado sentinela de Beta',
      'Convidado Sentinela', 'Sala Sentinela', 'Observação sentinela da comissão',
      'Assunto Sentinela', 'Família Sentinela', beta,
    ]) {
      expect(texto, `a exportação de Alfa não pode conter "${sentinela}"`).not.toContain(sentinela)
    }
  })

  it('e a exportação da outra pessoa também não entrega a primeira', async () => {
    const banco = novoBanco(); const chave = await generateMasterKey()
    const alfa = await gravar(banco, chave, 'person', { name: 'Pessoa Sentinela Alfa', notes: 'Observação sentinela de Alfa' })
    const beta = await gravar(banco, chave, 'person', { name: 'Pessoa Sentinela Beta', notes: 'Observação sentinela de Beta' })
    await gravar(banco, chave, 'visit', {
      targetType: 'family', targetId: 'f1', notes: 'Anotação sentinela da visita inteira',
      versions: [{
        version: 1,
        participants: [{ id: 'x', personId: alfa, present: true }, { id: 'y', personId: beta, present: true }],
        answers: [
          { id: 'r1', subjectId: alfa, value: 'Resposta sentinela de Alfa', question: { code: 'Q1', text: 'Pergunta do catálogo', category: 'espiritual' } },
          { id: 'r2', subjectId: beta, value: 'Resposta sentinela de Beta', question: { code: 'Q1', text: 'Pergunta do catálogo', category: 'espiritual' } },
        ],
      }],
    }, 'visit')

    const texto = (await new PersonDataService(banco).exportLines(CONTA, chave, beta)).join('\n')

    expect(texto).toContain('Resposta sentinela de Beta')
    expect(texto).toContain('Pergunta do catálogo')
    for (const sentinela of ['Pessoa Sentinela Alfa', 'Observação sentinela de Alfa', 'Resposta sentinela de Alfa', 'Anotação sentinela da visita inteira', alfa]) {
      expect(texto, `a exportação de Beta não pode conter "${sentinela}"`).not.toContain(sentinela)
    }
  })

  it('um registro ilegível não derruba a exportação', async () => {
    const banco = novoBanco(); const chave = await generateMasterKey(); const outraChave = await generateMasterKey()
    const pessoa = await gravar(banco, chave, 'person', { name: 'Pessoa Fictícia Ômega' })
    await gravar(banco, outraChave, 'person', { name: 'Registro Ilegível Fictício' })

    const texto = (await new PersonDataService(banco).exportLines(CONTA, chave, pessoa)).join('\n')

    expect(texto).toContain('Pessoa Fictícia Ômega')
    expect(texto).toContain('Registros que não abriram neste aparelho')
    expect(await banco.corruptedRecords.where('accountId').equals(CONTA).count()).toBe(1)
  })

  it('descreve o papel em comissão, nomeação e campanha sem citar terceiro', () => {
    const comissao = redactForPerson({
      schemaVersion: 1, type: 'commission_meeting',
      data: { date: '2026-05-01', presidentId: 'p1', secretaryId: 'p2', participantIds: ['p1', 'p2'], agenda: [{ id: 'a1', title: 'Assunto Fictício', responsibleId: 'p1' }] },
    }, 'p1')
    const textoComissao = JSON.stringify(comissao)
    expect(textoComissao).toContain('presidiu a reunião')
    expect(textoComissao).toContain('participante da reunião')
    expect(textoComissao).toContain('responsável por um assunto')
    expect(textoComissao).not.toContain('p2')
    // O assunto é texto livre da igreja e pode citar quem for.
    expect(textoComissao).not.toContain('Assunto Fictício')

    const nomeacoes = redactForPerson({
      schemaVersion: 1, type: 'nomination_process',
      data: {
        period: '2026-2027', formation: {}, meetings: [], officialVotes: [], reports: [], tasks: [],
        candidates: [{ id: 'c1', personId: 'p1', officeId: 'o1' }, { id: 'c2', personId: 'p2', officeId: 'o2' }],
      },
    }, 'p1')
    expect(JSON.stringify(nomeacoes)).toContain('indicada para um cargo')
    expect(JSON.stringify(nomeacoes)).not.toContain('"c2"')

    const campanha = redactForPerson({
      schemaVersion: 1, type: 'evangelism_campaign',
      data: { name: 'Campanha Fictícia', learnings: 'Aprendizado fictício sobre terceiro', team: [{ id: 'e1', personId: 'p1', role: 'music' }, { id: 'e2', personId: 'p2', role: 'sound' }], points: [], tasks: [], followUps: [] },
    }, 'p1')
    expect(JSON.stringify(campanha)).toContain('na equipe da campanha')
    expect(JSON.stringify(campanha)).toContain('music')
    expect(JSON.stringify(campanha)).not.toContain('sound')
    // Nome e aprendizados da campanha são texto livre do pastor: não saem na
    // exportação de uma pessoa.
    expect(JSON.stringify(campanha)).not.toContain('Campanha Fictícia')
    expect(JSON.stringify(campanha)).not.toContain('Aprendizado fictício')
  })

  it('um campo novo em registro compartilhado não sai sozinho', () => {
    // A regra inversa — "copie tudo e depois tire o que é de terceiro" — erra
    // sempre que aparece um campo novo, e erra entregando. Aqui a projeção é
    // aditiva: o campo que ninguém autorizou simplesmente não aparece.
    const grupo = redactForPerson({
      schemaVersion: 1, type: 'small_group',
      data: { day: 'monday', participantIds: ['p1', 'p2'], campoNovoInventado: 'Segredo fictício de terceiro' },
    }, 'p1')

    expect(JSON.stringify(grupo)).toContain('participante do Pequeno Grupo')
    expect(JSON.stringify(grupo)).not.toContain('Segredo fictício de terceiro')
    expect(JSON.stringify(grupo)).not.toContain('campoNovoInventado')
  })

  it('apaga o rastro que a exclusão deixaria para trás', async () => {
    // O envelope atual vira lápide, e sem expurgo o passado ficava inteiro:
    // cada versão anterior na fila de envio, nas revisões e na quarentena,
    // cifrada com a mesma chave que o titular usa todo dia.
    const banco = novoBanco(); const chave = await generateMasterKey()
    const pessoa = await gravar(banco, chave, 'person', { name: 'Pessoa Fictícia Épsilon', whatsapp: '(61) 90000-0000' })
    const oracao = await gravar(banco, chave, 'prayer_request', { subjectType: 'person', subjectId: pessoa, text: 'Pedido fictício reservado' }, 'prayer_request')
    await banco.syncConflicts.put({
      id: crypto.randomUUID(), accountId: CONTA, recordId: pessoa, localVersion: 1, remoteVersion: 2,
      remoteOperation: 'upsert', remotePayload: (await banco.vaultRecords.get(pessoa))!, createdAt: new Date().toISOString(), status: 'pending',
    })
    await banco.quarantine.put({
      id: crypto.randomUUID(), accountId: CONTA, recordId: oracao, reason: 'assinatura', operation: 'upsert',
      recordVersion: 1, baseVersion: 0, payload: (await banco.vaultRecords.get(oracao))!, createdAt: new Date().toISOString(),
    })

    const resultado = await new PersonDataService(banco).remove(CONTA, chave, APARELHO, pessoa)

    expect(resultado.purge.local).toBeGreaterThan(0)
    expect(await banco.syncConflicts.count()).toBe(0)
    expect(await banco.quarantine.count()).toBe(0)
    // Na fila sobra apenas o que leva a remoção aos outros aparelhos.
    const fila = await banco.outbox.toArray()
    expect(fila.every(({ operation }) => operation === 'delete')).toBe(true)
    // E o histórico do serviço fica na fila de expurgo, para depois de a
    // lápide subir: apagá-lo antes deixaria os outros sem saber da exclusão.
    // Cada registro leva junto a operação que este aparelho publicou: é ela
    // que o serviço vai exigir que ainda seja a última antes de apagar.
    const aExpurgar = await pendingRemotePurge(CONTA, banco)
    expect(aExpurgar.map(({ recordId }) => recordId).sort()).toEqual([oracao, pessoa].sort())
    const publicadas = new Set((await banco.outbox.toArray()).map(({ id }) => id))
    expect(aExpurgar.every(({ operationId }) => publicadas.has(operationId))).toBe(true)
  })

  it('não pede o expurgo da operação de outro registro, mesmo com gravação concorrente', async () => {
    // O achado: a exclusão tirava um retrato da fila antes e outro depois, e
    // chamava de "minhas" todas as operações que apareceram na diferença.
    // Qualquer coisa enfileirada no meio — outra aba, outra tela — entrava
    // junto, e o expurgo pedia ao serviço que apagasse o histórico de um
    // registro que nada tinha a ver com a pessoa.
    const banco = novoBanco(); const chave = await generateMasterKey()
    const pessoa = await gravar(banco, chave, 'person', { name: 'Pessoa Fictícia Zeta' })
    const alheio = await gravar(banco, chave, 'sermon', { title: 'Sermão Fictício Alheio' }, 'sermon')

    // Uma gravação concorrente entra na fila enquanto a exclusão acontece.
    const repositorio = new VaultRepository(banco)
    const concorrente = repositorio.saveEncrypted(
      CONTA, APARELHO, alheio,
      await encryptPayload(chave, { schemaVersion: 1, type: 'sermon', data: { title: 'Sermão Fictício Alterado' } }, alheio),
      'sermon',
    )
    const exclusao = new PersonDataService(banco).remove(CONTA, chave, APARELHO, pessoa)
    await Promise.all([concorrente, exclusao])

    const aExpurgar = await pendingRemotePurge(CONTA, banco)
    expect(aExpurgar.map(({ recordId }) => recordId)).toEqual([pessoa])
    expect(aExpurgar.some(({ recordId }) => recordId === alheio)).toBe(false)
    // E o registro alheio continua inteiro, com a alteração concorrente.
    expect((await banco.vaultRecords.get(alheio))?.deletedAt).toBeUndefined()
  })

  it('a lápide e o pedido de expurgo entram juntos, ou nenhum dos dois', async () => {
    // Entre publicar a lápide e registrar o expurgo havia uma janela: fechar o
    // navegador ali deixava a pessoa apagada da tela e o passado dela inteiro,
    // sem nada pendente que fizesse alguém voltar.
    const banco = novoBanco(); const chave = await generateMasterKey()
    const pessoa = await gravar(banco, chave, 'person', { name: 'Pessoa Fictícia Ípsilon' })
    const oracao = await gravar(banco, chave, 'prayer_request', { subjectType: 'person', subjectId: pessoa, text: 'Pedido fictício' }, 'prayer_request')

    await new PersonDataService(banco).remove(CONTA, chave, APARELHO, pessoa)

    const apagados = (await banco.vaultRecords.bulkGet([pessoa, oracao])).filter((registro) => registro?.deletedAt)
    const aExpurgar = await pendingRemotePurge(CONTA, banco)
    // Dois apagados, dois pedidos de expurgo: nunca um número sem o outro.
    expect(apagados).toHaveLength(2)
    expect(aExpurgar).toHaveLength(2)
    expect(aExpurgar.map(({ recordId }) => recordId).sort()).toEqual([oracao, pessoa].sort())
  })

  it('apagar a mesma pessoa de novo não deixa alvo de expurgo apontando para o passado', async () => {
    const banco = novoBanco(); const chave = await generateMasterKey()
    const pessoa = await gravar(banco, chave, 'person', { name: 'Pessoa Fictícia Ômega' })
    const dados = new PersonDataService(banco)

    await dados.remove(CONTA, chave, APARELHO, pessoa)
    const primeiroAlvo = (await pendingRemotePurge(CONTA, banco))[0]
    // A pessoa já está apagada: a segunda chamada não tem o que fazer e não
    // pode trocar o alvo por uma operação que nunca existiu.
    const segunda = await dados.remove(CONTA, chave, APARELHO, pessoa)

    expect(segunda.removed).toBe(0)
    expect((await pendingRemotePurge(CONTA, banco))[0]).toEqual(primeiroAlvo)
  })
})
