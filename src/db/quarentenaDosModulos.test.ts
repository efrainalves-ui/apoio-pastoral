import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { AgendaService } from '../agenda/service'
import { CareService } from '../care/service'
import { CasamentoService } from '../casamentos/service'
import { CommissionService } from '../commissions/service'
import { encryptPayload, generateMasterKey } from '../crypto/vault'
import { DistrictService } from '../district/service'
import { FamilyService } from '../families/service'
import { FamilyBudgetService } from '../family-budget/service'
import { FamilyBudgetDatabase } from '../family-budget/database'
import { LembreteService } from '../lembretes/service'
import { MissionaryService } from '../missionary/service'
import { NominationService } from '../nominations/service'
import { PeopleService } from '../people/service'
import { countCorruptedRecords, listCorruptedRecords } from './corrupted'
import { ApoioDatabase } from './database'
import { VaultRepository } from './repository'
import type { VaultRecord } from './types'

/**
 * Um registro ilegível não pode desaparecer em silêncio.
 *
 * Estes módulos abriam os registros por `decryptRecord`, que guardava o
 * identificador num conjunto na memória: a contagem sumia a cada
 * recarregamento e a tela de Sincronização nunca ficava sabendo. Para o
 * pastor, o cadastro simplesmente não estava mais lá — indistinguível de
 * perda. Aqui cada módulo é obrigado a usar a quarentena persistente.
 */
const CONTA = 'conta-ficticia-modulos'
const APARELHO = 'aparelho-ficticio-modulos'
const bancos: ApoioDatabase[] = []
const bancosFamilia: FamilyBudgetDatabase[] = []

afterEach(async () => {
  await Promise.all(bancos.splice(0).map((banco) => banco.delete()))
  await Promise.all(bancosFamilia.splice(0).map((banco) => banco.delete()))
})

function novoBanco() {
  const banco = new ApoioDatabase(`quarentena-modulos-${crypto.randomUUID()}`)
  bancos.push(banco)
  return banco
}

/** Grava um registro cifrado com outra chave: neste aparelho ele não abre. */
async function gravarIlegivel(banco: ApoioDatabase, tipo: VaultRecord['recordType'], payloadType: string): Promise<string> {
  const outraChave = await generateMasterKey()
  const id = crypto.randomUUID()
  await new VaultRepository(banco).saveEncrypted(
    CONTA, APARELHO, id,
    await encryptPayload(outraChave, { schemaVersion: 1, type: payloadType, data: { nome: 'Fictício' } }, id),
    tipo,
  )
  return id
}

interface Caso {
  nome: string
  tipo: VaultRecord['recordType']
  payload: string
  ler: (banco: ApoioDatabase, chave: CryptoKey) => Promise<unknown>
}

const casos: Caso[] = [
  { nome: 'pessoas', tipo: 'person', payload: 'person', ler: (banco, chave) => new PeopleService(banco).listPeople(CONTA, chave) },
  { nome: 'famílias', tipo: 'family', payload: 'family', ler: (banco, chave) => new FamilyService(banco).listFamilies(CONTA, chave) },
  { nome: 'agenda', tipo: 'agenda_event', payload: 'agenda_event', ler: (banco, chave) => new AgendaService(banco).listEvents(CONTA, chave) },
  { nome: 'visitas', tipo: 'visit', payload: 'visit', ler: (banco, chave) => new CareService(banco).listVisits(CONTA, chave) },
  { nome: 'tarefas', tipo: 'task', payload: 'task', ler: (banco, chave) => new CareService(banco).listTasks(CONTA, chave) },
  { nome: 'comissão', tipo: 'commission_meeting', payload: 'commission_meeting', ler: (banco, chave) => new CommissionService(banco).meetings(CONTA, chave) },
  { nome: 'nomeações', tipo: 'nomination_process', payload: 'nomination_process', ler: (banco, chave) => new NominationService(banco).list(CONTA, chave) },
  { nome: 'casamentos', tipo: 'wedding', payload: 'wedding', ler: (banco, chave) => new CasamentoService(banco).listar(CONTA, chave) },
  { nome: 'classes da Escola Sabatina', tipo: 'sabbath_class', payload: 'sabbath_class', ler: (banco, chave) => new MissionaryService(banco).listClasses(CONTA, chave) },
  { nome: 'distrito', tipo: 'district', payload: 'district', ler: (banco, chave) => new DistrictService(banco).getDistrict(CONTA, chave) },
  { nome: 'lembretes', tipo: 'reminder', payload: 'reminder', ler: (banco, chave) => new LembreteService(banco).lembretes(CONTA, chave) },
]

describe('quarentena persistente em todos os módulos', () => {
  for (const caso of casos) {
    it(`guarda de lado o registro ilegível de ${caso.nome}`, async () => {
      const banco = novoBanco()
      const chave = await generateMasterKey()
      const id = await gravarIlegivel(banco, caso.tipo, caso.payload)

      await caso.ler(banco, chave)

      expect(await countCorruptedRecords(CONTA, banco)).toBe(1)
      expect((await listCorruptedRecords(CONTA, banco))[0]).toMatchObject({ recordId: id, recordType: caso.tipo })
    })

    it(`tira da quarentena o registro de ${caso.nome} quando chega uma versão legível`, async () => {
      const banco = novoBanco()
      const chave = await generateMasterKey()
      const id = await gravarIlegivel(banco, caso.tipo, caso.payload)
      await caso.ler(banco, chave)
      expect(await countCorruptedRecords(CONTA, banco)).toBe(1)

      // A sincronização trouxe a versão boa, cifrada com a chave deste aparelho.
      const anterior = (await banco.vaultRecords.get(id))!
      await banco.vaultRecords.put({
        ...anterior,
        ...(await encryptPayload(chave, { schemaVersion: 1, type: caso.payload, data: { nome: 'Fictício' } }, id)),
        version: anterior.version + 1,
      })

      await caso.ler(banco, chave)

      expect(await countCorruptedRecords(CONTA, banco)).toBe(0)
    })
  }

  it('guarda de lado o lançamento ilegível do Orçamento Familiar', async () => {
    const banco = novoBanco()
    const bancoFamilia = new FamilyBudgetDatabase(`quarentena-orcamento-${crypto.randomUUID()}`)
    bancosFamilia.push(bancoFamilia)
    const chave = await generateMasterKey()
    const outraChave = await generateMasterKey()
    const id = crypto.randomUUID()
    const agora = new Date().toISOString()
    await bancoFamilia.records.put({
      id, accountId: CONTA, recordType: 'income', createdAt: agora, updatedAt: agora,
      ...(await encryptPayload(outraChave, { schemaVersion: 1, type: 'family_budget_income', data: { month: '2026-09' } }, id)),
    })

    await new FamilyBudgetService(bancoFamilia, banco).snapshot(CONTA, chave, '2026-09')

    expect(await countCorruptedRecords(CONTA, banco)).toBe(1)
  })
})
