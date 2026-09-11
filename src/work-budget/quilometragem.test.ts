import { describe, expect, it } from 'vitest'
import { emCentavos } from '../family-budget/dinheiro'
import { parcelaPessoal } from './lancamento'
import { lancamentoDeQuilometragem, previstoDaQuilometragem, semLancamento } from './quilometragem'
import type { MileageData } from './types'

const contexto = { fpe: emCentavos(7000), percentualDeAudit: 80 }

function deslocamento(overrides: Partial<MileageData> = {}): MileageData {
  return {
    date: '2026-09-03', churchId: null, reason: '', agendaEventId: null,
    kilometers: 0, amount: null, notes: '', createdAt: '', updatedAt: '', ...overrides,
  }
}

describe('previsto pelos quilômetros', () => {
  it('é quilômetros vezes o valor por quilômetro', () => {
    expect(previstoDaQuilometragem(120, emCentavos(1.5), contexto).previsto).toBe(emCentavos(180))
  })

  it('fecha no centavo quando a conta quebra', () => {
    // 37,4 km × R$ 1,27 = R$ 47,498 → 47,50.
    expect(previstoDaQuilometragem(37.4, emCentavos(1.27), contexto).previsto).toBe(emCentavos(47.5))
  })

  /*
    Sem valor por quilômetro configurado, o previsto é nulo — e nulo aqui
    significa "ainda não configurado", nunca zero. Zero seria lido como "este
    trajeto não vale nada".
  */
  it('sem valor por quilômetro não inventa número', () => {
    const resultado = previstoDaQuilometragem(120, null, contexto)
    expect(resultado.previsto).toBeNull()
    expect(resultado.memoria.pendencia).toContain('não configurado')
  })

  it('a memória guarda a base que foi usada', () => {
    const { memoria } = previstoDaQuilometragem(120, emCentavos(1.5), contexto, 'Regra local de quilometragem')
    expect(memoria).toMatchObject({
      base: 'VALOR_FIXO_LOCAL', valorDaBase: emCentavos(1.5),
      fpeUtilizado: emCentavos(7000), referencia: 'Regra local de quilometragem',
    })
  })
})

describe('o lançamento que nasce do deslocamento', () => {
  it('cai na categoria de quilometragem, na competência da data', () => {
    const lancamento = lancamentoDeQuilometragem(deslocamento({ kilometers: 120, date: '2026-09-03' }), emCentavos(1.5), contexto)
    expect(lancamento).toMatchObject({ subcategoriaId: 'quilometragem', competencia: '2026-09', data: '2026-09-03' })
    expect(lancamento.previsto).toBe(emCentavos(180))
  })

  /*
    Abastecer o carro é desembolso do pastor; os quilômetros geram o previsto. A
    diferença entre os dois é o que o trajeto custou a ele — que é a pergunta
    que o módulo existe para responder.
  */
  it('o gasto informado é o que saiu do bolso até o reembolso cair', () => {
    const lancamento = lancamentoDeQuilometragem(deslocamento({ kilometers: 120, amount: emCentavos(200) }), emCentavos(1.5), contexto)
    expect(lancamento.valorPago).toBe(emCentavos(200))
    expect(parcelaPessoal(lancamento)).toBe(emCentavos(200))
  })

  it('sem gasto informado, não inventa desembolso', () => {
    expect(lancamentoDeQuilometragem(deslocamento({ kilometers: 120 }), emCentavos(1.5), contexto).valorPago).toBe(0)
  })

  it('sem motivo, a descrição fica sendo os quilômetros', () => {
    expect(lancamentoDeQuilometragem(deslocamento({ kilometers: 120 }), emCentavos(1.5), contexto).descricao).toBe('120 km')
    expect(lancamentoDeQuilometragem(deslocamento({ kilometers: 120, reason: 'Visita' }), emCentavos(1.5), contexto).descricao).toBe('Visita')
  })

  it('leva a igreja e o compromisso junto', () => {
    const lancamento = lancamentoDeQuilometragem(
      deslocamento({ kilometers: 40, churchId: 'igreja-ficticia', agendaEventId: 'compromisso-ficticio' }),
      emCentavos(1.5), contexto,
    )
    expect(lancamento).toMatchObject({ churchId: 'igreja-ficticia', agendaEventId: 'compromisso-ficticio' })
  })

  it('sem valor por quilômetro, nasce pendente em vez de zerado em silêncio', () => {
    const lancamento = lancamentoDeQuilometragem(deslocamento({ kilometers: 120 }), null, contexto)
    expect(lancamento.previsto).toBe(0)
    expect(lancamento.memoria?.pendencia).toContain('não configurado')
  })
})

describe('não pedir duas vezes o mesmo trajeto', () => {
  /*
    Sem o vínculo guardado, cada visita à tela ofereceria lançar os mesmos
    quilômetros de novo, e o mês fecharia pedindo duas vezes o mesmo trajeto.
  */
  it('separa os que já viraram lançamento', () => {
    const lista = [
      { id: 'a', workEntryId: null },
      { id: 'b', workEntryId: 'lancamento-ficticio' },
      { id: 'c' },
    ]
    expect(semLancamento(lista).map(({ id }) => id)).toEqual(['a', 'c'])
  })
})
