import type { Centavos } from '../family-budget/dinheiro'
import { lancamentoVazio, type LancamentoDoTrabalhoData } from './lancamento'
import type { ContextoDoCalculo, MemoriaDeCalculo } from './parametros'
import type { MileageData } from './types'

/**
 * Quilometragem dentro do ciclo do reembolso.
 *
 * O deslocamento é informado em quilômetros, e não em dinheiro — é a única
 * entrada do módulo que começa assim. Mas o que a instituição devolve é
 * dinheiro, e enquanto o deslocamento viveu numa tela à parte ele ficava fora
 * do previsto/solicitado/aprovado/recebido: o pastor via os quilômetros de um
 * lado e a conta do mês do outro, sem ligação entre os dois.
 *
 * O valor por quilômetro é configuração, com vigência, como todo o resto. Sem
 * ele o previsto é nulo, e nulo aqui significa "ainda não configurado" — nunca
 * zero.
 */

export interface PrevistoDaQuilometragem {
  /** O que a regra devolve pelos quilômetros rodados. */
  previsto: Centavos | null
  memoria: MemoriaDeCalculo
}

export function previstoDaQuilometragem(
  quilometros: number,
  valorPorKm: Centavos | null,
  contexto: Pick<ContextoDoCalculo, 'fpe' | 'percentualDeAudit'>,
  referencia = '',
): PrevistoDaQuilometragem {
  const comum = {
    fpeUtilizado: contexto.fpe,
    percentualDeAuditUtilizado: contexto.percentualDeAudit,
    base: 'VALOR_FIXO_LOCAL' as const,
    valorDaBase: valorPorKm,
    percentualAplicado: null,
    tetoAplicado: null,
    limitadoPeloTeto: false,
    referencia,
  }

  if (valorPorKm === null) {
    return {
      previsto: null,
      memoria: { ...comum, valor: 0, parcelaPessoal: 0, pendencia: 'Valor por quilômetro ainda não configurado.' },
    }
  }

  const valor = Math.round(quilometros * valorPorKm)
  return { previsto: valor, memoria: { ...comum, valor, parcelaPessoal: 0, pendencia: null } }
}

/**
 * O lançamento que nasce de um deslocamento.
 *
 * `valorPago` é o gasto que o pastor informou, quando informou — abastecer o
 * carro é desembolso dele. Os quilômetros geram o previsto, e é a diferença
 * entre os dois que diz quanto do trajeto saiu do bolso.
 */
export function lancamentoDeQuilometragem(
  deslocamento: Pick<MileageData, 'date' | 'kilometers' | 'amount' | 'reason' | 'churchId' | 'agendaEventId'>,
  valorPorKm: Centavos | null,
  contexto: Pick<ContextoDoCalculo, 'fpe' | 'percentualDeAudit'>,
  referencia = '',
): LancamentoDoTrabalhoData {
  const { previsto, memoria } = previstoDaQuilometragem(deslocamento.kilometers, valorPorKm, contexto, referencia)
  const base = lancamentoVazio(deslocamento.date.slice(0, 7), deslocamento.date)

  return {
    ...base,
    subcategoriaId: 'quilometragem',
    descricao: deslocamento.reason.trim() || `${deslocamento.kilometers.toLocaleString('pt-BR')} km`,
    valorPago: deslocamento.amount ?? 0,
    previsto: previsto ?? 0,
    memoria,
    churchId: deslocamento.churchId,
    agendaEventId: deslocamento.agendaEventId,
  }
}

/**
 * Deslocamentos que ainda não viraram lançamento.
 *
 * O vínculo é guardado no próprio deslocamento. Sem ele, cada visita à tela
 * ofereceria lançar de novo os mesmos quilômetros, e o mês fecharia pedindo
 * duas vezes o mesmo trajeto.
 */
export function semLancamento<T extends { id: string; workEntryId?: string | null }>(
  deslocamentos: readonly T[],
): T[] {
  return deslocamentos.filter((deslocamento) => !deslocamento.workEntryId)
}
