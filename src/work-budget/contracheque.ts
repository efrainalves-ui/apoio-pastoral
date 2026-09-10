import type { Centavos } from '../family-budget/dinheiro'

/**
 * Contracheques e demonstrativos.
 *
 * O contracheque tem três tipos de linha, e confundir o terceiro com os outros
 * dois é o erro que faz o líquido não bater. Provento entra, desconto sai, e a
 * base informativa não faz nem uma coisa nem outra: ela existe para mostrar
 * sobre que valor um cálculo incidiu — somá-la ao líquido infla a renda do
 * pastor com dinheiro que ele nunca recebeu.
 */

export const TIPOS_DE_RUBRICA = ['provento', 'desconto', 'informativa'] as const
export type TipoDeRubrica = (typeof TIPOS_DE_RUBRICA)[number]
export const TIPO_DE_RUBRICA_LABELS: Record<TipoDeRubrica, string> = {
  provento: 'Provento', desconto: 'Desconto', informativa: 'Outras bases informativas',
}

export interface Rubrica {
  codigo: string
  descricao: string
  tipo: TipoDeRubrica
  valor: Centavos
  /** Subcategoria do catálogo à qual esta linha corresponde, quando houver. */
  subcategoriaId: string
}

export interface ContrachequeData {
  /** Mês de referência `AAAA-MM`. */
  competencia: string
  /** Quando o dinheiro entrou. */
  dataDePagamento: string
  /** De onde veio: nome do arquivo, do sistema, ou "digitado à mão". */
  origem: string
  rubricas: Rubrica[]
  /** Falso até o pastor conferir linha por linha. */
  conferido: boolean
  observacao: string
  createdAt: string
  updatedAt: string
}

export type Contracheque = ContrachequeData & { id: string }

export interface TotaisDoContracheque {
  proventos: Centavos
  descontos: Centavos
  liquido: Centavos
  /** Somadas à parte, e de propósito fora do líquido. */
  basesInformativas: Centavos
}

/**
 * Os totais de um contracheque.
 *
 * A base informativa é somada à parte e nunca entra no líquido. Se um dia ela
 * entrar, o pastor verá uma renda maior do que a que caiu na conta, e vai
 * planejar o mês em cima dela.
 */
export function totaisDoContracheque(rubricas: readonly Rubrica[]): TotaisDoContracheque {
  const somar = (tipo: TipoDeRubrica) => rubricas
    .filter((rubrica) => rubrica.tipo === tipo)
    .reduce<Centavos>((total, rubrica) => total + rubrica.valor, 0)

  const proventos = somar('provento')
  const descontos = somar('desconto')
  return { proventos, descontos, liquido: proventos - descontos, basesInformativas: somar('informativa') }
}

export interface Divergencia {
  chave: string
  texto: string
  grave: boolean
}

/**
 * O que não fecha entre o contracheque e o que o pastor esperava.
 *
 * Não é acusação: é a lista do que ele precisa olhar antes de aceitar o
 * documento. Um contracheque aceito sem conferência vira o número de
 * referência do mês, e o erro passa a valer.
 */
export function divergencias(
  contracheque: Pick<ContrachequeData, 'competencia' | 'rubricas'>,
  esperado: { liquido: Centavos | null; subsistencia: Centavos | null },
): Divergencia[] {
  const totais = totaisDoContracheque(contracheque.rubricas)
  const achados: Divergencia[] = []

  if (!contracheque.rubricas.length) {
    achados.push({ chave: 'vazio', texto: 'Nenhuma rubrica informada.', grave: true })
  }

  if (esperado.liquido !== null && esperado.liquido !== totais.liquido) {
    achados.push({
      chave: 'liquido',
      texto: `Líquido do documento diferente do esperado em ${Math.abs(totais.liquido - esperado.liquido) / 100} reais.`,
      grave: true,
    })
  }

  const semSubsistencia = esperado.subsistencia !== null
    && !contracheque.rubricas.some((rubrica) => rubrica.subcategoriaId === 'subsistencia_basica')
  if (semSubsistencia) {
    achados.push({ chave: 'subsistencia', texto: 'Nenhuma rubrica apontada como subsistência básica.', grave: false })
  }

  const repetidas = new Map<string, number>()
  for (const rubrica of contracheque.rubricas) {
    if (rubrica.codigo) repetidas.set(rubrica.codigo, (repetidas.get(rubrica.codigo) ?? 0) + 1)
  }
  for (const [codigo, vezes] of repetidas) {
    if (vezes > 1) achados.push({ chave: `repetida-${codigo}`, texto: `A rubrica ${codigo} aparece ${vezes} vezes.`, grave: false })
  }

  return achados
}

/**
 * O contracheque da mesma competência que já está guardado.
 *
 * Reimportar o mês é comum — o pastor baixa o arquivo de novo, ou o recebe por
 * outro caminho. Gravar os dois dobraria a renda do mês em todo relatório, e a
 * duplicata é justamente o que ninguém percebe olhando uma tela de cada vez.
 */
export function jaExisteParaACompetencia(
  guardados: readonly Contracheque[],
  competencia: string,
): Contracheque | null {
  return guardados.find((item) => item.competencia === competencia) ?? null
}

/**
 * Renda do ministério que já está no contracheque.
 *
 * Serve para a família não contar duas vezes: o que veio pela folha não pode
 * entrar de novo como entrada digitada à mão.
 */
export function proventosPorSubcategoria(rubricas: readonly Rubrica[]): Map<string, Centavos> {
  const porItem = new Map<string, Centavos>()
  for (const rubrica of rubricas) {
    if (rubrica.tipo !== 'provento' || !rubrica.subcategoriaId) continue
    porItem.set(rubrica.subcategoriaId, (porItem.get(rubrica.subcategoriaId) ?? 0) + rubrica.valor)
  }
  return porItem
}
