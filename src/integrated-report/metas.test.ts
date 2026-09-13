import { afterEach, describe, expect, it } from 'vitest'
import { generateMasterKey } from '../crypto/vault'
import { ApoioDatabase } from '../db/database'
import { GoalsService } from '../goals/service'
import { RelatorioIntegradoService } from './service'
import { indicadorPorId } from './catalogo'
import {
  LIGACOES_COM_METAS, METRICAS_DO_RELATORIO, SEM_METRICA_DE_META,
  lancamentosDoTrimestre, mesesDoTrimestre, totalDoDistritoNaMeta,
} from './metas'
import type { RelatorioIntegradoEntity, ValorDoIndicador } from './types'

const GERAL = 'ministerio-pessoal--numero-de-pessoas-recebendo-estudos-biblicos'
const ASA = 'acao-solidaria-adventista--numero-de-pessoas-recebendo-estudos-biblicos-pela-asa'
const PEQUENOS_GRUPOS = 'escola-sabatina--numero-de-pequenos-grupos-da-igreja'

function relatorio(churchId: string, trimestre: string, valores: Record<string, ValorDoIndicador>, recusados: string[] = []): RelatorioIntegradoEntity {
  return {
    id: crypto.randomUUID(), churchId, trimestre, valores,
    ...(recusados.length ? { recusados } : {}),
    origem: { arquivo: 'relatorio-ficticio.pdf', paginas: [1, 2, 3] },
    importBatchId: 'lote-ficticio', createdAt: '', updatedAt: '',
  }
}
const numero = (valor: number): ValorDoIndicador => ({ tipo: 'numero', valor })

describe('a ligação entre o Relatório Integrado e as Metas', () => {
  it('é escrita pelos identificadores estáveis, e todos existem no catálogo', () => {
    for (const ligacao of LIGACOES_COM_METAS) {
      for (const id of ligacao.indicadores) expect(indicadorPorId(id), id).not.toBeNull()
    }
    for (const { id } of SEM_METRICA_DE_META) expect(indicadorPorId(id), id).not.toBeNull()
  })

  /* Batismo pertence ao relatório do ACMS e não entra nesta integração. */
  it('nunca alimenta meta de batismo', () => {
    expect(METRICAS_DO_RELATORIO).not.toContain('baptisms')
    expect(METRICAS_DO_RELATORIO).not.toContain('rebaptisms')
  })

  it('o trimestre vira os três meses dele, e o lançamento fica no último', () => {
    expect(mesesDoTrimestre('2026-1')).toEqual({ ano: 2026, meses: [1, 2, 3], mesDoLancamento: 3 })
    expect(mesesDoTrimestre('2026-4')).toEqual({ ano: 2026, meses: [10, 11, 12], mesDoLancamento: 12 })
  })
})

describe('lançamentos por igreja e por trimestre', () => {
  /* O pastor confirmou que os dois somam: a ASA traz gente que o outro não conta. */
  it('soma os dois indicadores de estudos bíblicos', () => {
    const lancamentos = lancamentosDoTrimestre([
      relatorio('igreja-a', '2026-1', { [GERAL]: numero(12), [ASA]: numero(3) }),
    ], '2026-1')
    expect(lancamentos).toHaveLength(1)
    expect(lancamentos[0]).toMatchObject({ churchId: 'igreja-a', metric: 'bible_studies', amount: 15, date: '2026-03-01' })
  })

  it('guarda a origem: relatório, trimestre, arquivo e cada indicador', () => {
    const [lancamento] = lancamentosDoTrimestre([
      relatorio('igreja-a', '2026-1', { [GERAL]: numero(12), [ASA]: numero(3) }),
    ], '2026-1')
    expect(lancamento?.reference).toContain('Relatório Integrado')
    expect(lancamento?.reference).toContain('1º trimestre de 2026')
    expect(lancamento?.reference).toContain('relatorio-ficticio.pdf')
    expect(lancamento?.reference).toContain('12')
    expect(lancamento?.reference).toContain('3')
  })

  /* Zero é resposta e vira lançamento de zero. */
  it('zero informado vira lançamento de zero', () => {
    const lancamentos = lancamentosDoTrimestre([relatorio('igreja-a', '2026-1', { [GERAL]: numero(0) })], '2026-1')
    expect(lancamentos).toHaveLength(1)
    expect(lancamentos[0]?.amount).toBe(0)
  })

  /* Ausência não é zero: quem não informou não gera lançamento nenhum. */
  it('indicador ausente não gera lançamento', () => {
    expect(lancamentosDoTrimestre([relatorio('igreja-a', '2026-1', {})], '2026-1')).toEqual([])
  })

  /* Valor recusado na conferência não está em `valores`, e por isso não chega à meta. */
  it('valor bloqueado não alimenta a meta', () => {
    const lancamentos = lancamentosDoTrimestre([
      relatorio('igreja-a', '2026-1', { [ASA]: numero(3) }, [GERAL]),
    ], '2026-1')
    expect(lancamentos[0]?.amount).toBe(3)
  })

  it('só o trimestre pedido gera lançamento', () => {
    const relatorios = [
      relatorio('igreja-a', '2026-1', { [GERAL]: numero(12) }),
      relatorio('igreja-a', '2026-2', { [GERAL]: numero(7) }),
    ]
    expect(lancamentosDoTrimestre(relatorios, '2026-2')[0]?.amount).toBe(7)
  })

  /* Situação da igreja não acumula e por isso não vira meta. */
  it('Pequenos Grupos não alimenta meta nenhuma', () => {
    expect(lancamentosDoTrimestre([relatorio('igreja-a', '2026-1', { [PEQUENOS_GRUPOS]: numero(5) })], '2026-1')).toEqual([])
  })

  it('o total do distrito sai da soma das igrejas', () => {
    const lancamentos = lancamentosDoTrimestre([
      relatorio('igreja-a', '2026-1', { [GERAL]: numero(12) }),
      relatorio('igreja-b', '2026-1', { [GERAL]: numero(8), [ASA]: numero(2) }),
      relatorio('igreja-c', '2026-1', { [GERAL]: numero(0) }),
    ], '2026-1')
    expect(totalDoDistritoNaMeta(lancamentos, 'bible_studies')).toBe(22)
  })
})

/*
  A gravação de verdade, contra um cofre real: o lançamento chega à meta,
  reenviar substitui em vez de somar, e corrigir um valor recalcula o progresso.
*/
describe('as metas depois de gravar', () => {
  const bancos: ApoioDatabase[] = []
  afterEach(async () => { await Promise.all(bancos.splice(0).map((banco) => banco.delete())) })

  async function cenario() {
    const database = new ApoioDatabase(`metas-ficticias-${crypto.randomUUID()}`)
    bancos.push(database)
    return {
      database, key: await generateMasterKey(), accountId: crypto.randomUUID(),
      relatorios: new RelatorioIntegradoService(database), goals: new GoalsService(database),
    }
  }

  async function importar(
    c: Awaited<ReturnType<typeof cenario>>,
    trimestre: string,
    valores: Record<string, ValorDoIndicador>,
    id?: string,
  ) {
    const gravado = await c.relatorios.gravar(c.accountId, c.key, {
      churchId: 'igreja-a', trimestre, valores,
      origem: { arquivo: 'relatorio-ficticio.pdf', paginas: [1] },
      importBatchId: 'lote', createdAt: '', updatedAt: '',
    }, id)
    const guardados = await c.relatorios.listar(c.accountId, c.key)
    const { ano, meses } = mesesDoTrimestre(trimestre)
    await c.goals.replaceReportEntries(
      c.accountId, c.key, METRICAS_DO_RELATORIO, [{ ano, meses }],
      lancamentosDoTrimestre(guardados, trimestre),
    )
    return gravado
  }

  const soma = (entries: Array<{ metric: string; amount: number }>) =>
    entries.filter(({ metric }) => metric === 'bible_studies').reduce((total, item) => total + item.amount, 0)

  it('o lançamento chega à meta com a origem guardada', async () => {
    const c = await cenario()
    await importar(c, '2026-1', { [GERAL]: numero(12), [ASA]: numero(3) })

    const entries = await c.goals.listEntries(c.accountId, c.key)
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ churchId: 'igreja-a', metric: 'bible_studies', amount: 15, source: 'pdf' })
    expect(entries[0]?.reference).toContain('1º trimestre de 2026')
    expect(entries[0]?.reference).toContain('relatorio-ficticio.pdf')
  })

  /* Reenviar o mesmo relatório substitui o lançamento; não dobra o progresso. */
  it('reenviar o mesmo trimestre não duplica', async () => {
    const c = await cenario()
    const gravado = await importar(c, '2026-1', { [GERAL]: numero(12), [ASA]: numero(3) })
    await importar(c, '2026-1', { [GERAL]: numero(12), [ASA]: numero(3) }, gravado.id)

    const entries = await c.goals.listEntries(c.accountId, c.key)
    expect(entries).toHaveLength(1)
    expect(soma(entries)).toBe(15)
  })

  /* Corrigir um valor depois recalcula o progresso, em vez de acrescentar. */
  it('corrigir o relatório recalcula a meta', async () => {
    const c = await cenario()
    const gravado = await importar(c, '2026-1', { [GERAL]: numero(40), [ASA]: numero(3) })
    expect(soma(await c.goals.listEntries(c.accountId, c.key))).toBe(43)

    await importar(c, '2026-1', { [GERAL]: numero(4), [ASA]: numero(3) }, gravado.id)
    const entries = await c.goals.listEntries(c.accountId, c.key)
    expect(entries).toHaveLength(1)
    expect(soma(entries)).toBe(7)
  })

  /* Trimestres diferentes somam no ano; um não apaga o outro. */
  it('dois trimestres somam no ano sem se apagarem', async () => {
    const c = await cenario()
    await importar(c, '2026-1', { [GERAL]: numero(12) })
    await importar(c, '2026-2', { [GERAL]: numero(8) })

    const entries = await c.goals.listEntries(c.accountId, c.key)
    expect(entries).toHaveLength(2)
    expect(soma(entries)).toBe(20)
  })

  /* Valor recusado não está em `valores` e por isso não chega à meta. */
  it('valor bloqueado não vira lançamento', async () => {
    const c = await cenario()
    await importar(c, '2026-1', { [ASA]: numero(3) })
    expect(soma(await c.goals.listEntries(c.accountId, c.key))).toBe(3)
  })

  it('trimestre sem nenhum indicador de meta não lança nada', async () => {
    const c = await cenario()
    await importar(c, '2026-1', { [PEQUENOS_GRUPOS]: numero(5) })
    expect(await c.goals.listEntries(c.accountId, c.key)).toEqual([])
  })
})
