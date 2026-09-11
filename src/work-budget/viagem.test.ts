import { describe, expect, it } from 'vitest'
import { emCentavos } from '../family-budget/dinheiro'
import { lancamentoVazio, type LancamentoDoTrabalhoData } from './lancamento'
import { daViagem, diariasSugeridas, previstoDasDiarias, resumoDaViagem, viagemVazia } from './viagem'

const contexto = { fpe: emCentavos(7000), percentualDeAudit: 80 }

function despesa(overrides: Partial<LancamentoDoTrabalhoData> = {}): LancamentoDoTrabalhoData {
  return { ...lancamentoVazio('2026-09', '2026-09-11'), subcategoriaId: 'hospedagem', ...overrides }
}

describe('diárias sugeridas', () => {
  /*
    Uma viagem de 10 a 13 são três noites. Se a regra da instituição conta
    quatro dias, o pastor corrige — inventar a regra aqui erraria em silêncio em
    todo lugar que usa a outra.
  */
  it('conta as noites entre a saída e o retorno', () => {
    expect(diariasSugeridas('2026-09-10', '2026-09-13')).toBe(3)
  })

  it('ida e volta no mesmo dia não rende noite', () => {
    expect(diariasSugeridas('2026-09-10', '2026-09-10')).toBe(0)
  })

  it('atravessa a virada do mês', () => {
    expect(diariasSugeridas('2026-09-29', '2026-10-02')).toBe(3)
  })

  it('retorno antes da saída não vira número negativo', () => {
    expect(diariasSugeridas('2026-09-13', '2026-09-10')).toBe(0)
  })

  it('sem datas, zero', () => {
    expect(diariasSugeridas('', '2026-09-13')).toBe(0)
  })
})

describe('previsto das diárias', () => {
  it('é diárias vezes o valor da diária', () => {
    expect(previstoDasDiarias(3, emCentavos(180), contexto).valor).toBe(emCentavos(540))
  })

  /*
    Sem valor de diária configurado, fica pendente em vez de zero — zero seria
    lido como "esta viagem não rende diária nenhuma".
  */
  it('sem valor configurado fica pendente', () => {
    const memoria = previstoDasDiarias(3, null, contexto)
    expect(memoria.valor).toBe(0)
    expect(memoria.pendencia).toContain('não configurado')
  })

  it('a memória guarda a base usada', () => {
    expect(previstoDasDiarias(3, emCentavos(180), contexto, 'Regra local de diária')).toMatchObject({
      base: 'VALOR_FIXO_LOCAL', valorDaBase: emCentavos(180), referencia: 'Regra local de diária',
    })
  })
})

describe('relatório da viagem', () => {
  const viagem = { ...viagemVazia('viagem', '2026-09-10'), diarias: 3, valorDaDiariaUsado: emCentavos(180) }
  const despesas = [
    despesa({ subcategoriaId: 'passagem', valorPago: emCentavos(600), previsto: emCentavos(600) }),
    despesa({ subcategoriaId: 'hospedagem', valorPago: emCentavos(450), previsto: emCentavos(400), recebido: emCentavos(400), situacao: 'recebido' }),
  ]

  /*
    Diária e despesa somam-se, mas nunca se confundem: a diária é devida pelos
    dias fora, independentemente do que foi gasto; a despesa é reembolsada pelo
    que custou. Tratá-las como uma coisa só faria a viagem parecer paga duas
    vezes ou nenhuma.
  */
  it('separa o que vem das diárias do que vem das despesas', () => {
    const resumo = resumoDaViagem(viagem, despesas, contexto)
    expect(resumo.previstoDasDiarias).toBe(emCentavos(540))
    expect(resumo.previstoDasDespesas).toBe(emCentavos(1000))
    expect(resumo.previstoTotal).toBe(emCentavos(1540))
  })

  it('soma o que foi pago e o que já voltou', () => {
    const resumo = resumoDaViagem(viagem, despesas, contexto)
    expect(resumo.pago).toBe(emCentavos(1050))
    expect(resumo.recebido).toBe(emCentavos(400))
    // 600 inteiros ainda fora do bolso, e 50 que a hospedagem não cobriu.
    expect(resumo.doBolso).toBe(emCentavos(650))
  })

  /*
    Mudança não tem diária: o obreiro não está a serviço fora, está se mudando.
    Mas as despesas dela seguem valendo, e o total é o delas — zerar o total
    seria mentir ao contrário.
  */
  it('mudança não rende diária, e ainda assim tem previsto', () => {
    const mudanca = { ...viagem, tipo: 'mudanca' as const }
    const resumo = resumoDaViagem(mudanca, despesas, contexto)
    expect(resumo.previstoDasDiarias).toBeNull()
    expect(resumo.previstoTotal).toBe(emCentavos(1000))
  })

  it('viagem sem despesa nenhuma ainda rende as diárias', () => {
    const resumo = resumoDaViagem(viagem, [], contexto)
    expect(resumo.previstoDasDiarias).toBe(emCentavos(540))
    expect(resumo.despesas).toBe(0)
  })

  it('sem valor de diária, o total fica pendente em vez de mentir', () => {
    const resumo = resumoDaViagem({ ...viagem, valorDaDiariaUsado: null }, despesas, contexto)
    expect(resumo.previstoTotal).toBeNull()
    expect(resumo.pendencia).toContain('não configurado')
  })
})

describe('despesas de uma viagem', () => {
  it('separa as que pertencem à viagem', () => {
    const lista = [
      { id: 'a', viagemId: 'viagem-1' },
      { id: 'b', viagemId: 'viagem-2' },
      { id: 'c', viagemId: null },
      { id: 'd' },
    ]
    expect(daViagem(lista, 'viagem-1').map(({ id }) => id)).toEqual(['a'])
  })
})
