/**
 * Datas, horários e fusos da Central.
 *
 * Um lembrete guarda a data e o horário como o pastor os escolheu — "dia 5, às
 * 08:00" — junto com o fuso em que escolheu. O instante real só é calculado
 * quando precisa ser comparado com agora ou enviado para notificação. Assim um
 * lembrete das 08:00 continua às 08:00 depois de uma mudança de horário de
 * verão, e a data nunca escorrega um dia por conta do UTC.
 */

const DIA_MS = 86_400_000

export function fusoDoAparelho(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo' } catch { return 'America/Sao_Paulo' }
}

export function partesDaData(data: string): [number, number, number] {
  const [ano, mes, dia] = data.split('-').map(Number)
  return [ano ?? 1970, mes ?? 1, dia ?? 1]
}

export const doisDigitos = (valor: number) => String(valor).padStart(2, '0')
export const chaveDeData = (ano: number, mes: number, dia: number) => `${ano}-${doisDigitos(mes)}-${doisDigitos(dia)}`

/** Soma dias a uma data `YYYY-MM-DD`, sem passar por fuso. */
export function somarDias(data: string, dias: number): string {
  const [ano, mes, dia] = partesDaData(data)
  const d = new Date(Date.UTC(ano, mes - 1, dia) + dias * DIA_MS)
  return chaveDeData(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate())
}

export function diferencaEmDias(de: string, ate: string): number {
  const [a1, m1, d1] = partesDaData(de); const [a2, m2, d2] = partesDaData(ate)
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / DIA_MS)
}

export function diaDaSemana(data: string): number {
  const [ano, mes, dia] = partesDaData(data)
  return new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay()
}

export function ultimoDiaDoMes(ano: number, mes: number): number {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate()
}

interface PartesNoFuso { ano: number; mes: number; dia: number; hora: number; minuto: number; segundo: number }

function partesNoFuso(instante: number, fuso: string): PartesNoFuso {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: fuso, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(instante))
  const valor = (tipo: string) => Number(partes.find((parte) => parte.type === tipo)?.value ?? 0)
  return { ano: valor('year'), mes: valor('month'), dia: valor('day'), hora: valor('hour') % 24, minuto: valor('minute'), segundo: valor('second') }
}

/** Quanto o fuso está à frente do UTC naquele instante, em milissegundos. */
function deslocamentoDoFuso(instante: number, fuso: string): number {
  const p = partesNoFuso(instante, fuso)
  return Date.UTC(p.ano, p.mes - 1, p.dia, p.hora, p.minuto, p.segundo) - Math.floor(instante / 1000) * 1000
}

/**
 * O instante de uma data e hora de parede num fuso.
 *
 * Numa hora que o fuso pula (início do horário de verão), vale o instante
 * seguinte que existe; numa hora que se repete, vale a primeira.
 */
export function instanteNoFuso(data: string, hora: string, fuso: string): Date {
  const [ano, mes, dia] = partesDaData(data)
  const [h, m] = (hora || '00:00').split(':').map(Number)
  const comoUtc = Date.UTC(ano, mes - 1, dia, h ?? 0, m ?? 0)
  const primeiro = deslocamentoDoFuso(comoUtc, fuso)
  let instante = comoUtc - primeiro
  const segundo = deslocamentoDoFuso(instante, fuso)
  if (segundo !== primeiro) {
    const alternativo = comoUtc - segundo
    instante = deslocamentoDoFuso(alternativo, fuso) === segundo ? Math.min(instante, alternativo) : instante
  }
  return new Date(instante)
}

export function dataNoFuso(instante: Date, fuso: string): string {
  const p = partesNoFuso(instante.getTime(), fuso)
  return chaveDeData(p.ano, p.mes, p.dia)
}

export function horaNoFuso(instante: Date, fuso: string): string {
  const p = partesNoFuso(instante.getTime(), fuso)
  return `${doisDigitos(p.hora)}:${doisDigitos(p.minuto)}`
}

/** Texto de data curto em português: "seg., 5 de out." com ano quando não é o atual. */
export function dataLegivelCurta(data: string, hoje: string): string {
  const [ano, mes, dia] = partesDaData(data)
  const opcoes: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }
  if (ano !== partesDaData(hoje)[0]) opcoes.year = 'numeric'
  return new Intl.DateTimeFormat('pt-BR', opcoes).format(new Date(Date.UTC(ano, mes - 1, dia, 12)))
}
