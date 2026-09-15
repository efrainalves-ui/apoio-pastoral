import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { generateMasterKey } from '../crypto/vault'
import { ApoioDatabase } from '../db/database'
import { RelatorioIntegradoService } from './service'

vi.mock('../auth/supabase', async (importarOriginal) => ({
  ...await importarOriginal<Record<string, unknown>>(),
  hasSupabaseConfiguration: false,
  ensureRemoteDevice: vi.fn(() => Promise.resolve()),
}))

const CONTA = 'conta-ficticia-reprocessamento'
const PGS = 'escola-sabatina--numero-de-pequenos-grupos-da-igreja'
const ESTUDOS = 'ministerio-pessoal--numero-de-pessoas-recebendo-estudos-biblicos'
const CAMPANHAS = 'evangelismo--numero-de-campanhas-evangelisticas-em-geral'
const bancos: ApoioDatabase[] = []

beforeEach(() => localStorage.clear())
afterEach(async () => {
  await Promise.all(bancos.splice(0).map((banco) => banco.delete()))
  localStorage.clear()
})

describe('os relatórios já guardados, reprocessados sem novo envio', () => {
  it('o que esperava confirmação passa a valer como veio, sem mudar igreja, trimestre, páginas nem a data do envio', async () => {
    const banco = new ApoioDatabase(`reprocessamento-${crypto.randomUUID()}`); bancos.push(banco)
    const chave = await generateMasterKey()
    const servico = new RelatorioIntegradoService(banco)
    const gravado = await servico.gravar(CONTA, chave, {
      churchId: 'igreja-ficticia', trimestre: '2026-2',
      valores: { [ESTUDOS]: { tipo: 'numero', valor: 12 }, [CAMPANHAS]: { tipo: 'numero', valor: 0 } },
      pendentes: { [PGS]: { tipo: 'numero', valor: 45 } },
      recusados: ['ministerio-pessoal--numero-de-classes-biblicas-em-funcionamento'],
      origem: { arquivo: 'segundo-ficticio.pdf', paginas: [4, 5, 6] },
      importBatchId: 'lote-ficticio', createdAt: '', updatedAt: '',
    })

    expect(await servico.aceitarValoresGuardados(CONTA, chave)).toBe(1)
    const [depois] = await servico.listar(CONTA, chave)
    expect(depois).toMatchObject({
      id: gravado.id, churchId: 'igreja-ficticia', trimestre: '2026-2', updatedAt: gravado.updatedAt,
      origem: { arquivo: 'segundo-ficticio.pdf', paginas: [4, 5, 6] }, importBatchId: 'lote-ficticio',
      recusados: ['ministerio-pessoal--numero-de-classes-biblicas-em-funcionamento'],
    })
    expect(depois!.valores).toEqual({ [ESTUDOS]: { tipo: 'numero', valor: 12 }, [CAMPANHAS]: { tipo: 'numero', valor: 0 }, [PGS]: { tipo: 'numero', valor: 45 } })
    expect(depois!.pendentes).toBeUndefined()

    // Rodar de novo não encontra nada e não regrava.
    expect(await servico.aceitarValoresGuardados(CONTA, chave)).toBe(0)
    expect(await servico.listar(CONTA, chave)).toHaveLength(1)
  })
})
