import { chaveDeData, diaDaSemana, diferencaEmDias, partesDaData, somarDias, ultimoDiaDoMes } from './tempo'
import type { LembreteData, RegraDeRepeticao } from './types'

const LIMITE_DE_PASSOS = 5000

/** O dia `dia` do mês, ou o último dia do mês quando ele não existe. */
function diaValido(ano: number, mes: number, dia: number): string {
  return chaveDeData(ano, mes, Math.min(dia, ultimoDiaDoMes(ano, mes)))
}

/**
 * A primeira ocorrência da regra na data `aPartirDe` ou depois dela.
 *
 * `inicio` é a data da primeira ocorrência da série. Devolve `null` quando a
 * série terminou (`ate`) antes disso.
 */
export function proximaOcorrencia(regra: RegraDeRepeticao, inicio: string, aPartirDe: string): string | null {
  const intervalo = Math.max(1, Math.floor(regra.intervalo || 1))
  const piso = aPartirDe < inicio ? inicio : aPartirDe
  const dentroDoFim = (data: string | null) => data !== null && (!regra.ate || data <= regra.ate) ? data : null

  if (regra.frequencia === 'diaria') {
    const passos = Math.ceil(diferencaEmDias(inicio, piso) / intervalo)
    return dentroDoFim(somarDias(inicio, Math.max(0, passos) * intervalo))
  }

  if (regra.frequencia === 'semanal') {
    const dias = (regra.diasDaSemana?.length ? regra.diasDaSemana : [diaDaSemana(inicio)]).filter((dia) => dia >= 0 && dia <= 6)
    const domingoDoInicio = somarDias(inicio, -diaDaSemana(inicio))
    for (let deslocamento = 0; deslocamento < LIMITE_DE_PASSOS; deslocamento += 1) {
      const candidata = somarDias(piso, deslocamento)
      if (regra.ate && candidata > regra.ate) return null
      const semanas = Math.floor(diferencaEmDias(domingoDoInicio, candidata) / 7)
      if (semanas % intervalo === 0 && dias.includes(diaDaSemana(candidata)) && candidata >= inicio) return candidata
    }
    return null
  }

  if (regra.frequencia === 'mensal') {
    const [anoInicio, mesInicio, diaInicio] = partesDaData(inicio)
    const dia = regra.diaDoMes && regra.diaDoMes >= 1 && regra.diaDoMes <= 31 ? regra.diaDoMes : diaInicio
    for (let passo = 0; passo < LIMITE_DE_PASSOS; passo += 1) {
      const meses = mesInicio - 1 + passo * intervalo
      const candidata = diaValido(anoInicio + Math.floor(meses / 12), (meses % 12) + 1, dia)
      if (regra.ate && candidata > regra.ate) return null
      if (candidata >= piso && candidata >= inicio) return candidata
    }
    return null
  }

  const [anoInicio, mesInicio, diaInicio] = partesDaData(inicio)
  for (let passo = 0; passo < LIMITE_DE_PASSOS; passo += 1) {
    const candidata = diaValido(anoInicio + passo * intervalo, mesInicio, diaInicio)
    if (regra.ate && candidata > regra.ate) return null
    if (candidata >= piso) return candidata
  }
  return null
}

/** As ocorrências entre duas datas, inclusive, até um limite. */
export function ocorrenciasEntre(regra: RegraDeRepeticao, inicio: string, de: string, ate: string, limite = 400): string[] {
  const saida: string[] = []
  let cursor: string | null = de
  while (cursor && cursor <= ate && saida.length < limite) {
    const proxima = proximaOcorrencia(regra, inicio, cursor)
    if (!proxima || proxima > ate) break
    saida.push(proxima)
    cursor = somarDias(proxima, 1)
  }
  return saida
}

/**
 * A ocorrência aberta de uma série: a primeira que ainda não foi concluída nem
 * pulada. Uma série tem, no máximo, uma ocorrência aberta por vez — por isso
 * concluir uma calcula a seguinte e não há como gerar duas.
 */
export function ocorrenciaAberta(lembrete: Pick<LembreteData, 'repeticao' | 'data' | 'ocorrencias'>): string | null {
  if (!lembrete.repeticao || !lembrete.data) return null
  let cursor: string | null = lembrete.data
  for (let passo = 0; cursor && passo < LIMITE_DE_PASSOS; passo += 1) {
    const ocorrencia = proximaOcorrencia(lembrete.repeticao, lembrete.data, cursor)
    if (!ocorrencia) return null
    if (!lembrete.ocorrencias[ocorrencia]?.estado) return ocorrencia
    cursor = somarDias(ocorrencia, 1)
  }
  return null
}

/** Texto curto da repetição: "Todo mês, no dia 5". */
export function textoDaRepeticao(regra: RegraDeRepeticao | null, inicio: string): string {
  if (!regra) return ''
  const n = Math.max(1, regra.intervalo || 1)
  const nomesDosDias = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']
  if (regra.frequencia === 'diaria') return n === 1 ? 'Todo dia' : `A cada ${n} dias`
  if (regra.frequencia === 'semanal') {
    const dias = (regra.diasDaSemana?.length ? regra.diasDaSemana : inicio ? [diaDaSemana(inicio)] : []).map((dia) => nomesDosDias[dia]).join(', ')
    return n === 1 ? `Toda semana${dias ? `: ${dias}` : ''}` : `A cada ${n} semanas${dias ? `: ${dias}` : ''}`
  }
  if (regra.frequencia === 'mensal') {
    const dia = regra.diaDoMes ?? (inicio ? partesDaData(inicio)[2] : 1)
    return n === 1 ? `Todo mês, no dia ${dia}` : `A cada ${n} meses, no dia ${dia}`
  }
  return n === 1 ? 'Todo ano' : `A cada ${n} anos`
}
