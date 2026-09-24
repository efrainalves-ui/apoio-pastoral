import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { generateMasterKey } from '../crypto/vault'
import { ApoioDatabase } from '../db/database'
import type { LembreteEntity } from './types'

/*
  Os horários de aviso no serviço, quando a rede falha e quando dois aparelhos
  mexem na mesma conta.

  Antes, `sincronizarAgendamentos` olhava só o erro do `select` — e mesmo nele
  apenas desistia em silêncio. Erro de `delete` e de `upsert` passavam
  despercebidos: o pastor ficava sem aviso nenhum e nada na tela dizia por quê.
  Pior, um aparelho com o cofre atrasado apagava os horários que o outro tinha
  acabado de criar, porque tudo que não estava na conta dele era considerado
  sobra.
*/

const CONTA = 'conta-ficticia-agendamento'
const FUSO = 'America/Belem'
const AGORA = new Date('2026-09-14T13:00:00Z')

interface LinhaDoServico { occurrence_key: string; fire_at: string; updated_at: string }

interface Falhas { select?: unknown; delete?: unknown; upsert?: unknown }

interface Servico {
  linhas: LinhaDoServico[]
  apagadas: string[]
  gravadas: string[]
  chamadas: { select: number; delete: number; upsert: number }
  falhas: Falhas
  /** Falha só nas primeiras N chamadas de cada tipo; depois responde bem. */
  falharAte: number
}

function servicoFalso(inicial: Partial<Servico> = {}): { servico: Servico; cliente: unknown } {
  const servico: Servico = {
    linhas: [], apagadas: [], gravadas: [],
    chamadas: { select: 0, delete: 0, upsert: 0 }, falhas: {}, falharAte: Number.POSITIVE_INFINITY,
    ...inicial,
  }

  const consulta = (tipo: 'select' | 'delete' | 'upsert') => {
    servico.chamadas[tipo] += 1
    const falha = servico.chamadas[tipo] <= servico.falharAte ? servico.falhas[tipo] : undefined
    const builder = {
      eq: () => builder,
      lt: () => builder,
      in: (_coluna: string, valores: string[]) => { if (!falha) servico.apagadas.push(...valores); return builder },
      then: (resolver: (valor: { data: LinhaDoServico[] | null; error: unknown }) => unknown) =>
        Promise.resolve(resolver(falha ? { data: null, error: falha } : { data: servico.linhas, error: null })),
    }
    return builder
  }

  const cliente = {
    // O banco de homologação tem as migrations de push.
    rpc: () => Promise.resolve({ data: true, error: null }),
    from: () => ({
      select: () => consulta('select'),
      delete: () => consulta('delete'),
      upsert: (linhas: Array<{ occurrence_key: string }>) => {
        const builder = consulta('upsert')
        const falha = servico.chamadas.upsert <= servico.falharAte ? servico.falhas.upsert : undefined
        if (!falha) servico.gravadas.push(...linhas.map(({ occurrence_key }) => occurrence_key))
        return builder
      },
    }),
  }
  return { servico, cliente }
}

const bancos: ApoioDatabase[] = []

function novoBanco() {
  const banco = new ApoioDatabase(`agendamento-${crypto.randomUUID()}`)
  bancos.push(banco)
  return banco
}

function lembrete(parcial: Partial<LembreteEntity> = {}): LembreteEntity {
  return {
    id: 'l1', titulo: 'Visitar a família fictícia', observacao: '', listaId: null,
    data: '2026-09-20', hora: '09:00', fuso: FUSO, prioridade: 'normal', sinalizado: false,
    repeticao: null, notificar: true, relacionado: {}, estado: 'aberto', concluidoEm: null,
    ocorrencias: {}, createdAt: '', updatedAt: '', ...parcial,
  }
}

/** Carrega o módulo com um serviço falso e as notificações ligadas neste aparelho. */
async function carregar(cliente: unknown) {
  vi.resetModules()
  vi.doMock('../auth/supabase', () => ({
    hasSupabaseConfiguration: true,
    currentRemoteAccountId: vi.fn().mockResolvedValue('dono-ficticio'),
    getSupabaseClient: () => cliente,
  }))
  vi.doMock('../auth/device', () => ({ currentDeviceId: () => 'aparelho-ficticio' }))
  const modulo = await import('./push')
  modulo.esquecerCapacidadeDoBanco()
  return modulo
}

beforeEach(() => {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
  try { localStorage.setItem(`apoio-pastoral:push-ativo:${CONTA}`, '1') } catch { /* sem armazenamento */ }
})

afterEach(async () => {
  vi.doUnmock('../auth/supabase')
  vi.doUnmock('../auth/device')
  vi.restoreAllMocks()
  await Promise.all(bancos.splice(0).map((banco) => banco.delete()))
})

/** O aparelho já recebeu tudo até este instante: o que for mais novo é de outro. */
async function comSincronizacaoEm(banco: ApoioDatabase, quando: string | null) {
  await banco.syncState.put({ accountId: CONTA, cursor: '1', lastSyncedAt: quando, firstSyncAt: '2026-09-01T00:00:00.000Z' })
}

describe('erros do serviço no agendamento', () => {
  it('avisa quando a leitura falha, e não inventa que deu certo', async () => {
    const { servico, cliente } = servicoFalso({ falhas: { select: { message: 'indisponível', status: 503 } } })
    const { sincronizarAgendamentos } = await carregar(cliente)
    const banco = novoBanco(); await comSincronizacaoEm(banco, AGORA.toISOString())

    const resultado = await sincronizarAgendamentos(CONTA, await generateMasterKey(), [lembrete()], AGORA, FUSO, { database: banco, esperar: async () => {} })

    expect(resultado.falha).toBe('leitura')
    expect(resultado.tentarDeNovo).toBe(true)
    expect(servico.gravadas).toEqual([])
  })

  it('avisa quando a gravação falha', async () => {
    const { servico, cliente } = servicoFalso({ falhas: { upsert: { message: 'violação', code: '23505' } } })
    const { sincronizarAgendamentos } = await carregar(cliente)
    const banco = novoBanco(); await comSincronizacaoEm(banco, AGORA.toISOString())

    const resultado = await sincronizarAgendamentos(CONTA, await generateMasterKey(), [lembrete()], AGORA, FUSO, { database: banco, esperar: async () => {} })

    expect(resultado.falha).toBe('gravacao')
    expect(servico.chamadas.upsert).toBeGreaterThan(0)
  })

  it('avisa quando a remoção falha', async () => {
    const { cliente } = servicoFalso({
      linhas: [{ occurrence_key: 'a'.repeat(64), fire_at: '2026-09-25T12:00:00.000Z', updated_at: '2026-09-01T00:00:00.000Z' }],
      falhas: { delete: { message: 'indisponível', status: 503 } },
    })
    const { sincronizarAgendamentos } = await carregar(cliente)
    const banco = novoBanco(); await comSincronizacaoEm(banco, AGORA.toISOString())

    const resultado = await sincronizarAgendamentos(CONTA, await generateMasterKey(), [], AGORA, FUSO, { database: banco, esperar: async () => {} })

    expect(resultado.falha).toBe('remocao')
  })

  it('falha passageira: tenta de novo e termina bem', async () => {
    const { servico, cliente } = servicoFalso({ falhas: { select: { message: 'Failed to fetch' } }, falharAte: 1 })
    const { sincronizarAgendamentos } = await carregar(cliente)
    const banco = novoBanco(); await comSincronizacaoEm(banco, AGORA.toISOString())

    const resultado = await sincronizarAgendamentos(CONTA, await generateMasterKey(), [lembrete()], AGORA, FUSO, { database: banco, esperar: async () => {} })

    expect(servico.chamadas.select).toBe(2)
    expect(resultado.falha).toBeNull()
    expect(resultado.criados).toBe(1)
  })

  it('erro permanente não fica tentando para sempre', async () => {
    const { servico, cliente } = servicoFalso({ falhas: { select: { message: 'permissão negada', code: '42501' } } })
    const { sincronizarAgendamentos } = await carregar(cliente)
    const banco = novoBanco(); await comSincronizacaoEm(banco, AGORA.toISOString())

    const resultado = await sincronizarAgendamentos(CONTA, await generateMasterKey(), [lembrete()], AGORA, FUSO, { database: banco, esperar: async () => {} })

    expect(servico.chamadas.select).toBe(1)
    expect(resultado.tentarDeNovo).toBe(false)
  })
})

describe('dois aparelhos na mesma conta', () => {
  it('não apaga o horário que o outro aparelho acabou de criar', async () => {
    // Este aparelho sincronizou o cofre às 12:00; a linha nasceu às 12:30, no outro.
    const { servico, cliente } = servicoFalso({
      linhas: [{ occurrence_key: 'b'.repeat(64), fire_at: '2026-09-25T12:00:00.000Z', updated_at: '2026-09-14T12:30:00.000Z' }],
    })
    const { sincronizarAgendamentos } = await carregar(cliente)
    const banco = novoBanco(); await comSincronizacaoEm(banco, '2026-09-14T12:00:00.000Z')

    const resultado = await sincronizarAgendamentos(CONTA, await generateMasterKey(), [], AGORA, FUSO, { database: banco, esperar: async () => {} })

    expect(servico.apagadas).toEqual([])
    expect(resultado.removidos).toBe(0)
  })

  it('apaga o horário antigo que o próprio cofre já não pede', async () => {
    const { servico, cliente } = servicoFalso({
      linhas: [{ occurrence_key: 'c'.repeat(64), fire_at: '2026-09-25T12:00:00.000Z', updated_at: '2026-09-10T00:00:00.000Z' }],
    })
    const { sincronizarAgendamentos } = await carregar(cliente)
    const banco = novoBanco(); await comSincronizacaoEm(banco, '2026-09-14T12:00:00.000Z')

    const resultado = await sincronizarAgendamentos(CONTA, await generateMasterKey(), [], AGORA, FUSO, { database: banco, esperar: async () => {} })

    expect(servico.apagadas).toEqual(['c'.repeat(64)])
    expect(resultado.removidos).toBe(1)
  })

  it('aparelho que nunca sincronizou o cofre não apaga nada', async () => {
    const { servico, cliente } = servicoFalso({
      linhas: [{ occurrence_key: 'd'.repeat(64), fire_at: '2026-09-25T12:00:00.000Z', updated_at: '2026-09-01T00:00:00.000Z' }],
    })
    const { sincronizarAgendamentos } = await carregar(cliente)
    const banco = novoBanco(); await comSincronizacaoEm(banco, null)

    await sincronizarAgendamentos(CONTA, await generateMasterKey(), [], AGORA, FUSO, { database: banco, esperar: async () => {} })

    expect(servico.apagadas).toEqual([])
  })

  it('repetir com os mesmos dados não grava nem apaga de novo', async () => {
    const chave = await generateMasterKey()
    const { servico, cliente } = servicoFalso()
    const { sincronizarAgendamentos } = await carregar(cliente)
    const banco = novoBanco(); await comSincronizacaoEm(banco, AGORA.toISOString())

    const primeira = await sincronizarAgendamentos(CONTA, chave, [lembrete()], AGORA, FUSO, { database: banco, esperar: async () => {} })
    expect(primeira.criados).toBe(1)

    // O serviço agora tem a linha que a primeira rodada criou.
    servico.linhas = servico.gravadas.map((occurrence_key) => ({ occurrence_key, fire_at: '2026-09-20T12:00:00.000Z', updated_at: AGORA.toISOString() }))
    servico.gravadas = []

    const segunda = await sincronizarAgendamentos(CONTA, chave, [lembrete()], AGORA, FUSO, { database: banco, esperar: async () => {} })

    expect(segunda.criados).toBe(0)
    expect(segunda.removidos).toBe(0)
    expect(servico.gravadas).toEqual([])
    expect(servico.apagadas).toEqual([])
  })
})
