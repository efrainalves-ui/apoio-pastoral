import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { encryptPayload, generateMasterKey } from '../crypto/vault'
import { ApoioDatabase } from '../db/database'
import { VaultRepository } from '../db/repository'
import { EvangelismPlanningService } from '../evangelism/service'
import { GoalsService } from '../goals/service'
import { SermonService } from './service'

vi.mock('../auth/supabase', async (importarOriginal) => ({
  ...await importarOriginal<Record<string, unknown>>(),
  hasSupabaseConfiguration: false,
  ensureRemoteDevice: vi.fn(() => Promise.resolve()),
}))

const CONTA = 'conta-ficticia-resiliencia'
const bancos: ApoioDatabase[] = []

beforeEach(() => localStorage.clear())
afterEach(async () => {
  await Promise.all(bancos.splice(0).map((banco) => banco.delete()))
  localStorage.clear()
})

function novoBanco() {
  const banco = new ApoioDatabase(`resiliencia-${crypto.randomUUID()}`)
  bancos.push(banco)
  return banco
}

/**
 * Grava um registro cujo selo de integridade não bate com o identificador.
 *
 * É o estado real que apareceu no aparelho do pastor: o AAD amarra o texto
 * cifrado ao identificador, e um registro em que os dois discordam não abre —
 * a tela dizia "Registro não confere com o conteúdo guardado".
 */
async function gravarIlegivel(banco: ApoioDatabase, chave: CryptoKey, tipo: string) {
  const id = crypto.randomUUID()
  const envelopeDeOutro = await encryptPayload(chave, { schemaVersion: 1, type: tipo, data: {} }, crypto.randomUUID())
  await new VaultRepository(banco).saveEncrypted(CONTA, 'aparelho-ficticio', id, envelopeDeOutro, tipo as never)
}

describe('um registro ilegível esconde só a si mesmo', () => {
  /*
    Era o defeito: a lista usava o decifrador que lança, e um único registro
    ruim derrubava a leitura inteira. O pastor via "0 no acervo" e um aviso
    vermelho, com a biblioteca inteira intacta atrás.
  */
  it('a biblioteca de sermões continua aparecendo', async () => {
    const banco = novoBanco(); const chave = await generateMasterKey()
    const service = new SermonService(banco)
    await service.create(CONTA, chave, {
      title: 'Sermão Fictício', theme: '', mainText: 'João 3.16', complementaryTexts: '', objective: '',
      introduction: '', content: '', conclusion: '', appeal: '', notes: '', tags: [], status: 'draft',
    } as never)
    await gravarIlegivel(banco, chave, 'sermon')

    const lista = await service.list(CONTA, chave)
    expect(lista.map(({ title }) => title)).toEqual(['Sermão Fictício'])
  })

  it('as metas continuam aparecendo', async () => {
    const banco = novoBanco(); const chave = await generateMasterKey()
    const service = new GoalsService(banco)
    await service.saveGoal(CONTA, chave, { churchId: 'igreja-ficticia', year: 2026, metric: 'baptisms', target: 10 })
    await gravarIlegivel(banco, chave, 'goal')

    expect(await service.listGoals(CONTA, chave)).toHaveLength(1)
  })

  it('o planejamento anual continua aparecendo', async () => {
    const banco = novoBanco(); const chave = await generateMasterKey()
    const service = new EvangelismPlanningService(banco)
    await service.saveGoal(CONTA, chave, {
      title: 'Meta Fictícia', description: '', responsible: '', notes: '',
      year: 2026, churchIds: [], status: 'planned', startDate: '2026-01-01', dueDate: '2026-12-31',
    } as never)
    await gravarIlegivel(banco, chave, 'annual_goal')

    expect(await service.listGoals(CONTA, chave)).toHaveLength(1)
  })

  /* O que não abriu fica registrado, para a tela de sincronização poder contar. */
  it('o ilegível vai para a quarentena em vez de sumir sem rastro', async () => {
    const banco = novoBanco(); const chave = await generateMasterKey()
    await gravarIlegivel(banco, chave, 'sermon')

    await new SermonService(banco).list(CONTA, chave)
    expect(await banco.corruptedRecords.count()).toBe(1)
  })
})

describe('caminhos que apagam recusam em vez de pular', () => {
  /*
    O espelho do defeito anterior, e o mais perigoso dos dois.

    Na exibição, pular o registro ilegível é o certo. No apagamento, pular o
    deixaria sobreviver ao distrito novo — dado do distrito antigo dentro do
    seguinte. E apagá-lo às cegas seria apagar o que ninguém conferiu. A única
    saída honesta é recusar dizendo quantos são.
  */
  it('começar um distrito novo recusa enquanto houver registro que não abre', async () => {
    const banco = novoBanco(); const chave = await generateMasterKey()
    await gravarIlegivel(banco, chave, 'church')

    const { NewDistrictService } = await import('../district/newDistrict')
    await expect(new NewDistrictService(banco).preview(CONTA, chave, 'empty')).rejects.toThrow('não abriram neste aparelho')
  })
})
