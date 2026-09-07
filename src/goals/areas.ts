import type { GoalTargetKind, GoalEntity, GoalEntryEntity, GoalHistoryEntity, GoalMetric } from './types'

/**
 * As metas que o pastor acompanha.
 *
 * Dízimo e oferta são duas: o relatório do ACMS traz as duas colunas separadas,
 * a igreja as trata como coisas diferentes e o crescimento de uma nada diz
 * sobre o da outra. Somá-las numa só produzia um número que não existe em lugar
 * nenhum e escondia qual das duas caiu.
 */
export type GoalArea = 'tithes' | 'offerings' | 'baptisms' | 'bible_studies' | 'uapg'

/**
 * As áreas que ganham cartão e página de meta genérica.
 *
 * A Escola Sabatina fica de fora de propósito: a meta dela não se combina, ela
 * se calcula — um grupo para cada doze membros —, e a página é um quadro por
 * igreja, não um gráfico mês a mês. `uapg` continua sendo área para o que já
 * dependia disso; o que muda é onde ela aparece.
 */
export const GOAL_AREAS: GoalArea[] = ['tithes', 'offerings', 'baptisms', 'bible_studies']

export const GOAL_AREA_LABELS: Record<GoalArea, string> = {
  tithes: 'Dízimos',
  offerings: 'Ofertas',
  baptisms: 'Batismos',
  bible_studies: 'Estudos Bíblicos',
  uapg: 'Escola Sabatina e Pequenos Grupos',
}

/** Nome curto, para o resumo da tela inicial. */
export const GOAL_AREA_SHORT: Record<GoalArea, string> = {
  tithes: 'Dízimos', offerings: 'Ofertas', baptisms: 'Batismos', bible_studies: 'Estudos', uapg: 'Escola Sabatina',
}

/** As áreas que vêm do mesmo Comparativo de Entradas. */
export const AREAS_FINANCEIRAS: GoalArea[] = ['tithes', 'offerings']

export function ehFinanceira(area: GoalArea): boolean {
  return AREAS_FINANCEIRAS.includes(area)
}

/**
 * Batismos, rebatismos e profissões de fé viram uma única meta para o pastor.
 * Os lançamentos antigos continuam existindo com o indicador de origem; aqui
 * eles apenas somam no mesmo lugar.
 */
export const AREA_METRICS: Record<GoalArea, GoalMetric[]> = {
  tithes: ['tithes'],
  offerings: ['offerings'],
  baptisms: ['baptisms', 'rebaptisms', 'professions_faith'],
  bible_studies: ['bible_studies'],
  uapg: ['uapg'],
}

/** Onde a meta anual daquela área é guardada. */
export const AREA_TARGET_METRIC: Record<GoalArea, GoalMetric> = {
  tithes: 'tithes', offerings: 'offerings', baptisms: 'baptisms', bible_studies: 'bible_studies', uapg: 'uapg',
}

/** Áreas alimentadas por PDF; as outras vêm do que já está cadastrado. */
export const AREA_USES_PDF: Record<GoalArea, boolean> = {
  tithes: true, offerings: true, baptisms: true, bible_studies: false, uapg: false,
}

/**
 * O documento do ACMS que alimenta cada área, com o nome que ele tem lá.
 *
 * A tela pedia "Escolher PDF de Financeiro", e quem tem o ACMS aberto não
 * encontra nada com esse nome. Dizer o nome do relatório e o caminho até ele
 * transforma uma tentativa e erro em dois cliques.
 */
export const AREA_PDF_DOCUMENT: Partial<Record<GoalArea, { nome: string; artigo: 'a' | 'o'; caminho: string }>> = {
  baptisms: {
    nome: 'Análise de Movimentos',
    artigo: 'a',
    caminho: 'No ACMS: Relatórios → Movimento → Análise de movimento. Traz só números, sem nomes de pessoas.',
  },
  tithes: {
    nome: 'Comparativo de Entradas',
    artigo: 'o',
    caminho: 'No ACMS: Relatórios → Entrada → escolha o tipo de entrada, igreja mês a mês.',
  },
  offerings: {
    nome: 'Comparativo de Entradas',
    artigo: 'o',
    caminho: 'No ACMS: Relatórios → Entrada → escolha o tipo de entrada, igreja mês a mês.',
  },
}

export interface AreaSources {
  entries: GoalEntryEntity[]
  studies: Array<{ churchId: string; startedAt: string }>
  uapgs: Array<{ churchId: string; createdAt: string; active: boolean }>
  /** Resultados de anos fechados, guardados só para comparação. */
  history?: GoalHistoryEntity[]
}

export interface AreaResult { churchId: string; date: string; amount: number }

/**
 * Resultados da área no ano. Estudos e UAPG são lidos dos próprios cadastros,
 * para o pastor não precisar lançar a mesma informação duas vezes.
 */
export function areaResults(area: GoalArea, sources: AreaSources, year: number): AreaResult[] {
  const ano = String(year)
  if (area === 'bible_studies') {
    return sources.studies
      .filter(({ startedAt }) => startedAt.startsWith(ano))
      .map(({ churchId, startedAt }) => ({ churchId, date: startedAt.slice(0, 10), amount: 1 }))
  }
  if (area === 'uapg') {
    return sources.uapgs
      .filter(({ active, createdAt }) => active && createdAt.startsWith(ano))
      .map(({ churchId, createdAt }) => ({ churchId, date: createdAt.slice(0, 10), amount: 1 }))
  }
  const metrics = AREA_METRICS[area]
  return sources.entries
    .filter((entry) => metrics.includes(entry.metric) && entry.date.startsWith(ano))
    .map(({ churchId, date, amount }) => ({ churchId, date, amount }))
}

export interface AreaProgress {
  area: GoalArea
  target: number
  result: number
  percent: number
  missing: number
  /** Soma das metas das igrejas, para conferir com a meta do distrito. */
  churchTargetsSum: number
  targetsMismatch: boolean
  reached: boolean
}

export function districtTarget(goals: GoalEntity[], area: GoalArea, year: number): number {
  return goals.find((goal) => goal.churchId === null && goal.year === year && goal.metric === AREA_TARGET_METRIC[area])?.target ?? 0
}

export function churchTarget(goals: GoalEntity[], area: GoalArea, year: number, churchId: string): number {
  return goals.find((goal) => goal.churchId === churchId && goal.year === year && goal.metric === AREA_TARGET_METRIC[area])?.target ?? 0
}

export function areaProgress(area: GoalArea, goals: GoalEntity[], sources: AreaSources, year: number): AreaProgress {
  const target = districtTarget(goals, area, year)
  // O resultado do distrito é a soma do que veio das igrejas, contado uma vez só.
  const result = areaResults(area, sources, year).reduce((soma, item) => soma + item.amount, 0)
  const churchTargetsSum = goals
    .filter((goal) => goal.churchId !== null && goal.year === year && goal.metric === AREA_TARGET_METRIC[area])
    .reduce((soma, goal) => soma + goal.target, 0)

  return {
    area,
    target,
    result,
    percent: target > 0 ? Math.min(100, Math.round((result / target) * 100)) : 0,
    missing: Math.max(0, target - result),
    churchTargetsSum,
    targetsMismatch: target > 0 && churchTargetsSum > 0 && churchTargetsSum !== target,
    reached: target > 0 && result >= target,
  }
}

/** Resultado mês a mês, de janeiro a dezembro. */
export function monthlyResults(area: GoalArea, sources: AreaSources, year: number): number[] {
  const meses = Array.from({ length: 12 }, () => 0)
  for (const item of areaResults(area, sources, year)) {
    const mes = Number(item.date.slice(5, 7)) - 1
    if (mes >= 0 && mes < 12) meses[mes] = (meses[mes] ?? 0) + item.amount
  }
  return meses
}

export interface MesComparado { mes: number; atual: number; anterior: number }
export interface ComparacaoMensal {
  meses: MesComparado[]
  /** Último mês com resultado no ano corrente. Zero quando não há nenhum. */
  ateOMes: number
  /** Somas do mesmo período nos dois anos: janeiro até `ateOMes`. */
  acumuladoAtual: number
  acumuladoAnterior: number
  /** Crescimento no mesmo período, em porcentagem. `null` sem base. */
  variacao: number | null
}

/**
 * Os dois anos mês a mês, e o acumulado do **mesmo período**.
 *
 * Comparar o ano inteiro passado com o ano em andamento é a comparação que a
 * tela fazia, e ela mente: cento e quatorze batismos de doze meses contra trinta
 * e quatro de oito meses parece uma queda enorme, e pode ser um crescimento. A
 * comparação honesta é janeiro-a-agosto contra janeiro-a-agosto.
 *
 * O período é definido pelo último mês com resultado no ano corrente — não pelo
 * mês do calendário —, porque um relatório enviado até agosto não diz nada sobre
 * setembro, e contar setembro como zero inventaria uma queda.
 */
export function comparacaoMensal(area: GoalArea, sources: AreaSources, year: number, anoBase = year - 1): ComparacaoMensal {
  const atual = monthlyResults(area, sources, year)
  const anterior = monthlyResults(area, sources, anoBase)
  const meses = atual.map((valor, indice) => ({ mes: indice + 1, atual: valor, anterior: anterior[indice] ?? 0 }))

  let ateOMes = 0
  atual.forEach((valor, indice) => { if (valor > 0) ateOMes = indice + 1 })

  const noPeriodo = (valores: number[]) => valores.slice(0, ateOMes).reduce((soma, valor) => soma + valor, 0)
  const acumuladoAtual = noPeriodo(atual)
  const acumuladoAnterior = noPeriodo(anterior)

  return {
    meses,
    ateOMes,
    acumuladoAtual,
    acumuladoAnterior,
    variacao: acumuladoAnterior > 0 ? Math.round(((acumuladoAtual - acumuladoAnterior) / acumuladoAnterior) * 100) : null,
  }
}

/** Até onde faz sentido guardar histórico: um pastor fica no máximo cinco anos. */
export const ANOS_DE_HISTORICO = 5

/**
 * Os anos anteriores que já têm resultado, do mais recente para o mais antigo.
 *
 * O pastor pode chegar ao aplicativo com quatro anos de distrito nas costas e
 * enviar os relatórios antigos. Saber quais anos já entraram é o que permite
 * escolher contra qual comparar — e o que mostra, sem dizer, que dá para
 * mandar mais.
 */
export function anosComResultado(area: GoalArea, sources: AreaSources, year: number, limite = ANOS_DE_HISTORICO): number[] {
  const anos: number[] = []
  for (let anterior = year - 1; anterior >= year - limite; anterior -= 1) {
    if (previousResult(area, sources, anterior) > 0) anos.push(anterior)
  }
  return anos
}

export interface AnoResumido { ano: number; meses: number[]; total: number }

/**
 * Cada ano com resultado, mês a mês e com o total.
 *
 * A comparação de dois anos por vez respondia "melhorou ou piorou". Não
 * respondia a pergunta que o pastor faz olhando quatro anos de distrito: em que
 * mês o distrito batiza, e o que mudou de um ano para o outro. Para isso é
 * preciso ver todos os anos juntos.
 *
 * Os doze meses aparecem sempre, inclusive os que ainda não chegaram. Um ano
 * que termina em agosto não está terminado — mostrar setembro a dezembro
 * zerados é dizer que ainda vão acontecer, e é onde o lançamento manual entra
 * depois.
 */
export function resumoPorAno(area: GoalArea, sources: AreaSources, year: number, limite = ANOS_DE_HISTORICO): AnoResumido[] {
  const anos: AnoResumido[] = []
  for (let ano = year - limite; ano <= year; ano += 1) {
    const meses = monthlyResults(area, sources, ano)
    const total = meses.reduce((soma, valor) => soma + valor, 0)
    // Ano sem nada não vira linha vazia: ela só ocuparia espaço dizendo que não
    // há relatório daquele ano, coisa que a ausência já diz.
    if (total <= 0) continue
    anos.push({ ano, meses, total })
  }
  return anos
}

export interface IgrejaPorAno { churchId: string; totais: Map<number, number>; meses: Map<number, number[]>; total: number }

/**
 * Quanto cada igreja fez, em cada ano.
 *
 * É a pergunta seguinte à do resumo anual: sabendo que o distrito caiu, saber
 * em qual igreja caiu é o que transforma o número em visita marcada.
 */
export function resumoPorIgrejaEAno(area: GoalArea, sources: AreaSources, anos: readonly number[], churchIds: readonly string[]): IgrejaPorAno[] {
  return churchIds.map((churchId) => {
    const totais = new Map<number, number>()
    const meses = new Map<number, number[]>()
    let total = 0
    for (const ano of anos) {
      const porMes = Array<number>(12).fill(0)
      for (const item of areaResults(area, sources, ano).filter((valor) => valor.churchId === churchId)) {
        const indice = Number(item.date.slice(5, 7)) - 1
        if (indice >= 0 && indice < 12) porMes[indice] = (porMes[indice] ?? 0) + item.amount
      }
      const doAno = porMes.reduce((soma, valor) => soma + valor, 0)
      totais.set(ano, doAno)
      meses.set(ano, porMes)
      total += doAno
    }
    return { churchId, totais, meses, total }
  }).filter(({ total }) => total > 0)
}

/**
 * Quanto cresceu ou caiu de um ano para o outro, no **mesmo período**.
 *
 * Comparar o ano fechado com o ano em andamento é a conta que mente: doze meses
 * contra oito parecem uma queda enorme e podem ser um crescimento. Aqui o
 * período é o do ano mais novo, e o mais velho é cortado no mesmo mês.
 *
 * Devolve `null` quando não há base: crescer sobre nada não é porcentagem.
 */
export function variacaoNoMesmoPeriodo(anterior: readonly number[], atual: readonly number[]): number | null {
  let ateOMes = 0
  atual.forEach((valor, indice) => { if (valor > 0) ateOMes = indice + 1 })
  if (ateOMes === 0) return null
  const somar = (valores: readonly number[]) => valores.slice(0, ateOMes).reduce((total, valor) => total + valor, 0)
  const base = somar(anterior)
  if (base <= 0) return null
  return ((somar(atual) - base) / base) * 100
}

export interface ChurchProgress { churchId: string; target: number; result: number; percent: number }

/** Metas e resultados por igreja, sem ordenar por desempenho. */
export function churchProgress(area: GoalArea, goals: GoalEntity[], sources: AreaSources, year: number, churchIds: string[]): ChurchProgress[] {
  const resultados = areaResults(area, sources, year)
  return churchIds.map((churchId) => {
    const target = churchTarget(goals, area, year, churchId)
    const result = resultados.filter((item) => item.churchId === churchId).reduce((soma, item) => soma + item.amount, 0)
    return { churchId, target, result, percent: target > 0 ? Math.min(100, Math.round((result / target) * 100)) : 0 }
  })
}

/**
 * Resultado de um ano já encerrado. Vale o consolidado que o pastor registrou;
 * sem ele, vale o que estiver lançado naquele ano. Nunca soma os dois.
 */
export function previousResult(area: GoalArea, sources: AreaSources, year: number): number {
  const consolidado = (sources.history ?? []).find((item) => item.area === area && item.year === year)
  if (consolidado) return consolidado.amount
  return areaResults(area, sources, year).reduce((soma, item) => soma + item.amount, 0)
}

export interface AreaComparison extends AreaProgress {
  /** Resultado do ano anterior, quando existe. */
  previous: number
  hasPrevious: boolean
  /** Diferença do ano corrente para o anterior. */
  difference: number
  /** Como a meta do distrito foi escrita. */
  targetKind: GoalTargetKind
  /** A meta traduzida em número absoluto, que é contra o que se mede. */
  objective: number
  /**
   * Meta em porcentagem sem ano anterior para comparar.
   *
   * Dez por cento a mais do que nada não é uma meta; a tela precisa dizer isso
   * em vez de mostrar um progresso inventado.
   */
  withoutBaseline: boolean
  /**
   * Meta antiga, gravada como valor numa área que hoje se escreve em
   * porcentagem. Fica pedindo para ser reescrita, e não é convertida sozinha.
   */
  legacyValueTarget: boolean
}

/** Áreas cuja meta é combinada como aumento sobre o ano anterior. */
export const PERCENT_TARGET_AREAS: GoalArea[] = ['tithes', 'offerings']

export function areaComparison(area: GoalArea, goals: GoalEntity[], sources: AreaSources, year: number): AreaComparison {
  const progresso = areaProgress(area, goals, sources, year)
  const previous = previousResult(area, sources, year - 1)
  const hasPrevious = previous > 0
  const meta = goals.find((goal) => goal.churchId === null && goal.year === year && goal.metric === AREA_TARGET_METRIC[area])
  const emPorcentagem = PERCENT_TARGET_AREAS.includes(area)
  const targetKind: GoalTargetKind = meta?.targetKind ?? 'value'

  // Meta antiga de uma área que hoje se escreve em porcentagem: ela continua
  // valendo como valor até alguém reescrevê-la. Reinterpretar "50000" como
  // cinquenta mil por cento seria inventar um número em cima de dado real.
  const legacyValueTarget = emPorcentagem && Boolean(meta) && targetKind === 'value'
  const withoutBaseline = emPorcentagem && targetKind === 'percent' && !hasPrevious

  const objective = targetKind === 'percent'
    ? (hasPrevious ? previous * (1 + progresso.target / 100) : 0)
    : progresso.target

  return {
    ...progresso,
    percent: objective > 0 ? Math.min(100, Math.round((progresso.result / objective) * 100)) : 0,
    missing: Math.max(0, objective - progresso.result),
    previous,
    hasPrevious,
    difference: progresso.result - previous,
    targetKind,
    objective,
    withoutBaseline,
    legacyValueTarget,
  }
}
