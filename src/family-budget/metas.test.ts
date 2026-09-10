import { describe, expect, it } from 'vitest'
import { emCentavos } from './dinheiro'
import {
  copiarPlanejamento, guardadoNaMeta, objetivoDaMeta, preverMeta,
  reservaMensalDoFundo, somarMeses, totaisDoPlanejamento,
  type Aporte, type MetaData, type PlanejamentoData,
} from './metas'

const HOJE = '2026-09-10'
const carimbos = { createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' }

function meta(overrides: Partial<MetaData> = {}): MetaData {
  return {
    especie: 'meta', nome: 'Meta fictícia', categoria: 'casa', integranteId: null,
    objetivo: emCentavos(12_000), dataInicial: '2026-09-01', prazo: '2027-07',
    contribuicaoPlanejada: emCentavos(700), contaId: null, mesesDeReserva: 0,
    despesaEssencial: 0, observacao: '', status: 'ativa', ...carimbos, ...overrides,
  }
}

const aporte = (metaId: string, valor: number): Aporte => ({
  id: crypto.randomUUID(), metaId, valor: emCentavos(valor), data: '2026-09-05',
  contaId: null, integranteId: null, observacao: '', ...carimbos,
})

describe('objetivo da meta', () => {
  it('a meta comum usa o valor informado', () => {
    expect(objetivoDaMeta(meta())).toBe(emCentavos(12_000))
  })

  /*
    A reserva não se informa em reais: informa-se quanto a casa gasta por mês e
    quantos meses se quer cobrir. O objetivo é consequência das duas coisas.
  */
  it('a reserva vem da despesa essencial vezes os meses', () => {
    const reserva = meta({ especie: 'reserva', despesaEssencial: emCentavos(4000), mesesDeReserva: 6, objetivo: 0 })
    expect(objetivoDaMeta(reserva)).toBe(emCentavos(24_000))
  })

  it('reserva sem despesa informada cai no valor manual', () => {
    const reserva = meta({ especie: 'reserva', despesaEssencial: 0, mesesDeReserva: 6, objetivo: emCentavos(9000) })
    expect(objetivoDaMeta(reserva)).toBe(emCentavos(9000))
  })
})

describe('quanto já foi guardado', () => {
  it('soma só os aportes da própria meta', () => {
    const aportes = [aporte('m1', 1200), aporte('m1', 2000), aporte('m2', 500)]
    expect(guardadoNaMeta(aportes, 'm1')).toBe(emCentavos(3200))
    expect(guardadoNaMeta(aportes, 'm3')).toBe(0)
  })
})

describe('previsão da meta', () => {
  /*
    Duas contas diferentes: o que o prazo exige e o que o ritmo atual entrega.
    Mostrar só a primeira faz a meta parecer viável quando não é.
  */
  it('diz o que o prazo exige e o que o ritmo atual entrega', () => {
    const previsao = preverMeta(meta({ contribuicaoPlanejada: emCentavos(700) }), emCentavos(3200), HOJE)
    expect(previsao.falta).toBe(emCentavos(8800))
    expect(previsao.necessarioPorMes).toBe(emCentavos(880))
    expect(previsao.mesesNoRitmoAtual).toBe(13)
    expect(previsao.conclusaoNoRitmoAtual).toBe('2027-10')
    expect(previsao.noRitmo).toBe(false)
  })

  it('reconhece quando a contribuição dá conta do prazo', () => {
    const previsao = preverMeta(meta({ contribuicaoPlanejada: emCentavos(900) }), emCentavos(3200), HOJE)
    expect(previsao.noRitmo).toBe(true)
  })

  it('meta alcançada não pede mais nada', () => {
    const previsao = preverMeta(meta(), emCentavos(12_000), HOJE)
    expect(previsao.falta).toBe(0)
    expect(previsao.mesesNoRitmoAtual).toBe(0)
  })

  it('sem contribuição não inventa data de conclusão', () => {
    expect(preverMeta(meta({ contribuicaoPlanejada: 0 }), 0, HOJE).conclusaoNoRitmoAtual).toBeNull()
  })

  it('meta sem prazo não exige nada por mês', () => {
    expect(preverMeta(meta({ prazo: '' }), 0, HOJE).necessarioPorMes).toBeNull()
  })
})

describe('fundo planejado', () => {
  /*
    IPVA de dois mil e quatrocentos que vence em doze meses são duzentos por
    mês. O fundo existe para a despesa previsível deixar de ser susto anual.
  */
  it('divide a despesa prevista pelos meses que faltam', () => {
    const fundo = meta({ especie: 'fundo', nome: 'IPVA', objetivo: emCentavos(2400), prazo: '2027-09' })
    expect(reservaMensalDoFundo(fundo, 0, HOJE)).toBe(emCentavos(200))
  })

  it('desconta o que já está guardado', () => {
    const fundo = meta({ especie: 'fundo', objetivo: emCentavos(2400), prazo: '2027-09' })
    expect(reservaMensalDoFundo(fundo, emCentavos(1200), HOJE)).toBe(emCentavos(100))
  })

  it('sem prazo não sugere valor mensal', () => {
    expect(reservaMensalDoFundo(meta({ especie: 'fundo', prazo: '' }), 0, HOJE)).toBeNull()
  })
})

describe('planejamento mensal', () => {
  const planejamento: PlanejamentoData = {
    mes: '2026-09',
    rendaPrevista: { p1: emCentavos(5000), '': emCentavos(300) },
    orcamento: { moradia: emCentavos(1800), alimentacao: emCentavos(1200) },
    ...carimbos,
  }

  it('soma a renda e o que já foi distribuído', () => {
    expect(totaisDoPlanejamento(planejamento)).toEqual({
      renda: emCentavos(5300), planejado: emCentavos(3000),
      aDistribuir: emCentavos(2300), estourou: false,
    })
  })

  it('avisa quando o plano passa da renda', () => {
    const demais = { ...planejamento, orcamento: { moradia: emCentavos(6000) } }
    const totais = totaisDoPlanejamento(demais)
    expect(totais.estourou).toBe(true)
    expect(totais.aDistribuir).toBeLessThan(0)
  })

  /*
    Quem planeja todo mês repete quase tudo: o aluguel é o mesmo, a escola é a
    mesma. Recomeçar do zero é o que faz desistir no segundo mês.
  */
  it('copia o mês anterior sem levar junto os carimbos', () => {
    const copia = copiarPlanejamento(planejamento, '2026-10')
    expect(copia.mes).toBe('2026-10')
    expect(copia.orcamento).toEqual(planejamento.orcamento)
    expect(copia.rendaPrevista).toEqual(planejamento.rendaPrevista)
    expect(copia.createdAt).toBe('')
  })

  it('a cópia não compartilha os objetos com a origem', () => {
    const copia = copiarPlanejamento(planejamento, '2026-10')
    copia.orcamento.moradia = emCentavos(1)
    expect(planejamento.orcamento.moradia).toBe(emCentavos(1800))
  })
})

describe('somar meses', () => {
  it('atravessa o ano', () => {
    expect(somarMeses('2026-09', 13)).toBe('2027-10')
    expect(somarMeses('2026-12', 1)).toBe('2027-01')
    expect(somarMeses('2026-09', 0)).toBe('2026-09')
  })
})
