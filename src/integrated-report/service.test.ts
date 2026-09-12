import { afterEach, describe, expect, it } from 'vitest'
import { generateMasterKey } from '../crypto/vault'
import { ApoioDatabase } from '../db/database'
import { CATALOGO_DO_RELATORIO, CLASSES_DA_ESCOLA_SABATINA, indicadorPorId } from './catalogo'
import {
  destoa, numeroDoValor, RelatorioIntegradoService, semRelatorio, totalDoDistrito, valorAtual,
} from './service'
import type { RelatorioIntegradoEntity } from './types'

const IGREJAS = ['igreja-a', 'igreja-b', 'igreja-c']
const PEQUENOS_GRUPOS = 'escola-sabatina--numero-de-pequenos-grupos-da-igreja'
const CAMPANHAS = 'evangelismo--numero-de-campanhas-evangelisticas-em-geral'

function relatorio(churchId: string, trimestre: string, valores: RelatorioIntegradoEntity['valores']): RelatorioIntegradoEntity {
  return {
    id: crypto.randomUUID(), churchId, trimestre, valores,
    origem: { arquivo: 'relatorio-ficticio.pdf', paginas: [1] },
    importBatchId: 'lote-ficticio', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

/*
  Batismo pertence a outro relatório, e o pastor mandou ignorá-lo por completo.
  O teste guarda a ausência: quem reconstruir o catálogo do PDF vai trazê-lo de
  volta sem perceber, porque ele está lá no papel.
*/
describe('o catálogo do Relatório Integrado', () => {
  it('não traz nenhuma contagem de batismo', () => {
    const comBatismo = CATALOGO_DO_RELATORIO.filter(({ rotulo }) =>
      /levad[ao]s? ao batismo|batizados por|n[úu]mero de batismos/iu.test(rotulo))
    expect(comBatismo).toEqual([])
  })

  it('tem identificador único para cada indicador', () => {
    const ids = CATALOGO_DO_RELATORIO.map(({ id }) => id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('classifica resultado do período como somar e situação da igreja como atualizar', () => {
    expect(indicadorPorId(CAMPANHAS)?.tratamento).toBe('somar')
    expect(indicadorPorId(PEQUENOS_GRUPOS)?.tratamento).toBe('atualizar')
  })
})

describe('o valor que vale hoje', () => {
  /*
    Um trimestre sem resposta não apaga o anterior: a igreja que não entregou o
    relatório não passou a ter zero Pequenos Grupos, ela passou a não ter dito
    quantos tem.
  */
  it('mantém o valor do trimestre anterior quando o seguinte não informou', () => {
    const relatorios = [
      relatorio('igreja-a', '2026-1', { [PEQUENOS_GRUPOS]: { tipo: 'numero', valor: 5 } }),
      relatorio('igreja-a', '2026-2', {}),
    ]
    expect(valorAtual(relatorios, 'igreja-a', PEQUENOS_GRUPOS)).toMatchObject({ trimestre: '2026-1' })
    expect(numeroDoValor(valorAtual(relatorios, 'igreja-a', PEQUENOS_GRUPOS)?.valor)).toBe(5)
  })

  it('o trimestre mais recente que informou substitui o anterior', () => {
    const relatorios = [
      relatorio('igreja-a', '2026-1', { [PEQUENOS_GRUPOS]: { tipo: 'numero', valor: 5 } }),
      relatorio('igreja-a', '2026-2', { [PEQUENOS_GRUPOS]: { tipo: 'numero', valor: 4 } }),
    ]
    expect(numeroDoValor(valorAtual(relatorios, 'igreja-a', PEQUENOS_GRUPOS)?.valor)).toBe(4)
  })

  /* Zero é resposta; ausência não. Confundir as duas é a raiz do problema. */
  it('zero é resposta e vale como resposta', () => {
    const relatorios = [
      relatorio('igreja-a', '2026-1', { [PEQUENOS_GRUPOS]: { tipo: 'numero', valor: 5 } }),
      relatorio('igreja-a', '2026-2', { [PEQUENOS_GRUPOS]: { tipo: 'numero', valor: 0 } }),
    ]
    expect(numeroDoValor(valorAtual(relatorios, 'igreja-a', PEQUENOS_GRUPOS)?.valor)).toBe(0)
  })
})

describe('o total do distrito', () => {
  const relatorios = [
    relatorio('igreja-a', '2026-1', { [PEQUENOS_GRUPOS]: { tipo: 'numero', valor: 5 }, [CAMPANHAS]: { tipo: 'numero', valor: 1 } }),
    relatorio('igreja-a', '2026-2', { [PEQUENOS_GRUPOS]: { tipo: 'numero', valor: 4 }, [CAMPANHAS]: { tipo: 'numero', valor: 2 } }),
    relatorio('igreja-b', '2026-1', { [PEQUENOS_GRUPOS]: { tipo: 'numero', valor: 2 }, [CAMPANHAS]: { tipo: 'numero', valor: 3 } }),
  ]

  /* Situação: o primeiro trimestre não soma com o segundo. */
  it('soma apenas o valor mais recente de cada igreja', () => {
    expect(totalDoDistrito(relatorios, PEQUENOS_GRUPOS, IGREJAS)).toBe(6)
  })

  /* Resultado: o ano é a soma do que aconteceu nele. */
  it('soma todos os trimestres quando o indicador é resultado do período', () => {
    expect(totalDoDistrito(relatorios, CAMPANHAS, IGREJAS)).toBe(6)
  })

  it('igreja fora da lista de ativas não entra no total', () => {
    expect(totalDoDistrito(relatorios, PEQUENOS_GRUPOS, ['igreja-a'])).toBe(4)
  })

  it('sem nenhum valor, o total é desconhecido e não zero', () => {
    expect(totalDoDistrito([], PEQUENOS_GRUPOS, IGREJAS)).toBeNull()
  })
})

/*
  Igreja sem relatório não é igreja sem números: o pastor confirmou que algumas
  simplesmente não entregam. Ela aparece como quem não entregou, não como quem
  zerou.
*/
describe('igrejas que não entregaram', () => {
  it('aponta quem faltou naquele trimestre', () => {
    const relatorios = [relatorio('igreja-a', '2026-2', {}), relatorio('igreja-b', '2026-2', {})]
    expect(semRelatorio(relatorios, '2026-2', IGREJAS)).toEqual(['igreja-c'])
  })
})

describe('valores que destoam', () => {
  it('interrompe quando o número triplica ou despenca', () => {
    expect(destoa(5, 45)).toBe(true)
    expect(destoa(27, 0)).toBe(true)
    expect(destoa(523, 95)).toBe(true)
  })

  it('deixa passar a variação comum', () => {
    expect(destoa(5, 4)).toBe(false)
    expect(destoa(3, 5)).toBe(false)
  })

  /* Base pequena varia muito por natureza; interromper ali só ensina a ignorar o aviso. */
  it('não interrompe quando a base é pequena demais para comparar', () => {
    expect(destoa(1, 4)).toBe(false)
    expect(destoa(2, 9)).toBe(false)
  })

  it('sem os dois lados, não há o que comparar', () => {
    expect(destoa(null, 45)).toBe(false)
    expect(destoa(5, null)).toBe(false)
  })
})

describe('a leitura por classe da Escola Sabatina', () => {
  it('guarda cada classe separada e devolve o total', () => {
    const valor = {
      tipo: 'por_classe' as const,
      classes: { Adultos: 9, Jovens: 6, 'Classes Bíblicas': 2 },
      total: 17,
    }
    expect(numeroDoValor(valor)).toBe(17)
    expect(valor.classes.Adultos).toBe(9)
    expect(CLASSES_DA_ESCOLA_SABATINA).toContain('Pré-Adolescentes')
  })
})

describe('gravar e ler do cofre', () => {
  const bancos: ApoioDatabase[] = []
  afterEach(async () => { await Promise.all(bancos.splice(0).map((banco) => banco.delete())) })

  async function cenario() {
    const database = new ApoioDatabase(`relatorio-ficticio-${crypto.randomUUID()}`); bancos.push(database)
    return { database, key: await generateMasterKey(), accountId: crypto.randomUUID(), service: new RelatorioIntegradoService(database) }
  }

  it('grava e lê de volta sem deixar número em claro no banco', async () => {
    const { database, key, accountId, service } = await cenario()
    await service.gravar(accountId, key, {
      churchId: 'igreja-a', trimestre: '2026-1',
      valores: { [PEQUENOS_GRUPOS]: { tipo: 'numero', valor: 5 } },
      origem: { arquivo: 'relatorio-ficticio.pdf', paginas: [10] },
      importBatchId: 'lote-ficticio', createdAt: '', updatedAt: '',
    })

    const lidos = await service.listar(accountId, key)
    expect(lidos).toHaveLength(1)
    expect(numeroDoValor(lidos[0]!.valores[PEQUENOS_GRUPOS])).toBe(5)
    expect(JSON.stringify(await database.vaultRecords.toArray())).not.toContain(PEQUENOS_GRUPOS)
  })

  it('recusa trimestre fora do formato', async () => {
    const { key, accountId, service } = await cenario()
    await expect(service.gravar(accountId, key, {
      churchId: 'igreja-a', trimestre: '2026', valores: {},
      origem: { arquivo: 'x.pdf', paginas: [] }, importBatchId: '', createdAt: '', updatedAt: '',
    })).rejects.toThrow('formato 2026-1')
  })
})
