import type { ConfiguracaoDoTrabalhoData, DependenteData } from './configuracao'
import type { LancamentoDoTrabalhoData } from './lancamento'
import type { AquisicaoLetraData, ItemDoCatalogoLetra, OrcamentoLetraData } from './letra'

/**
 * Orçamento do trabalho: o dinheiro do ministério, separado do da família.
 *
 * A separação não é organização: é a diferença entre o auxílio de combustível
 * que a igreja paga e o dinheiro de casa. Misturar os dois faz o pastor não
 * saber quanto do próprio bolso saiu para o trabalho — que é exatamente a
 * pergunta que este módulo existe para responder.
 *
 * Estes registros são do distrito, vivem no cofre pastoral cifrado e entram no
 * encerramento de distrito. O orçamento familiar e a lista de compras ficam no
 * banco pessoal e não são tocados por ele.
 */

/** Auxílios que a igreja repassa. Cada um funciona como um cartão com saldo. */
export const ALLOWANCE_CATEGORIES = ['fuel', 'water', 'internet', 'phone', 'other'] as const
export type AllowanceCategory = (typeof ALLOWANCE_CATEGORIES)[number]
export const ALLOWANCE_CATEGORY_LABELS: Record<AllowanceCategory, string> = {
  fuel: 'Combustível', water: 'Água', internet: 'Internet', phone: 'Telefone', other: 'Outro auxílio',
}

/** Despesas do ministério. Nem toda despesa tem auxílio correspondente. */
export const WORK_EXPENSE_CATEGORIES = ['fuel', 'food', 'water', 'phone', 'internet', 'maintenance', 'other'] as const
export type WorkExpenseCategory = (typeof WORK_EXPENSE_CATEGORIES)[number]
export const WORK_EXPENSE_CATEGORY_LABELS: Record<WorkExpenseCategory, string> = {
  fuel: 'Combustível', food: 'Alimentação', water: 'Água', phone: 'Telefone',
  internet: 'Internet', maintenance: 'Manutenção', other: 'Outras despesas',
}

/**
 * Qual auxílio cobre esta despesa, quando o nome coincide.
 *
 * É sugestão, não regra: o pastor troca na tela. Alimentação e manutenção não
 * têm auxílio correspondente e saem do bolso, a não ser que ele aponte outro.
 */
export function suggestedAllowance(category: WorkExpenseCategory): AllowanceCategory | null {
  switch (category) {
    case 'fuel': return 'fuel'
    case 'water': return 'water'
    case 'phone': return 'phone'
    case 'internet': return 'internet'
    default: return null
  }
}

export interface WorkTimestamps { createdAt: string; updatedAt: string }

export interface WorkAllowanceData extends WorkTimestamps {
  category: AllowanceCategory
  /** Nome do auxílio ou do cartão, como o pastor o reconhece. */
  description: string
  amount: number
  date: string
  /** Igreja que repassou, quando faz sentido registrar. */
  churchId: string | null
  notes: string
}

export interface WorkExpenseData extends WorkTimestamps {
  category: WorkExpenseCategory
  description: string
  amount: number
  date: string
  /** Auxílio que cobre esta despesa, ou `null` quando ela sai do bolso. */
  allowanceCategory: AllowanceCategory | null
  /** Vínculos opcionais, todos escolhidos à mão. */
  churchId: string | null
  visitId: string | null
  agendaEventId: string | null
  notes: string
}

/**
 * Quilometragem informada pelo pastor.
 *
 * Sem GPS, sem rastreamento e sem localização automática: os quilômetros são
 * digitados. Um aplicativo pastoral que sabe por onde o pastor andou é um
 * aplicativo que sabe demais.
 */
export interface MileageData extends WorkTimestamps {
  date: string
  churchId: string | null
  /** Motivo ou compromisso, em texto livre. Opcional. */
  reason: string
  agendaEventId: string | null
  kilometers: number
  /** Gasto informado, quando o pastor quiser registrar. */
  amount: number | null
  notes: string
}

export type WorkBudgetRecordType = 'work_allowance' | 'work_expense' | 'mileage'
export type WorkDataByType = {
  work_allowance: WorkAllowanceData
  work_expense: WorkExpenseData
  mileage: MileageData
}
export type WorkEntity<T> = T & { id: string }

export type WorkAllowanceEntity = WorkEntity<WorkAllowanceData>
export type WorkExpenseEntity = WorkEntity<WorkExpenseData>
export type MileageEntity = WorkEntity<MileageData>

export interface WorkBudgetSnapshot {
  month: string
  allowances: WorkAllowanceEntity[]
  expenses: WorkExpenseEntity[]
  mileage: MileageEntity[]
}

/*
  Os tipos abaixo entraram depois, e por isso entram somando.

  Auxílios, despesas e quilometragem continuam gravados e lidos exatamente como
  antes: registro já cifrado no aparelho do pastor não se converte por conta de
  uma versão nova do aplicativo. O modelo novo convive com o antigo em vez de
  substituí-lo.
*/

export type WorkBudgetExtraRecordType =
  | 'work_config' | 'work_dependent' | 'work_entry'
  | 'letra_budget' | 'letra_item' | 'letra_acquisition'

export type WorkBudgetAnyRecordType = WorkBudgetRecordType | WorkBudgetExtraRecordType

export type WorkExtraDataByType = {
  work_config: ConfiguracaoDoTrabalhoData
  work_dependent: DependenteData
  work_entry: LancamentoDoTrabalhoData
  letra_budget: OrcamentoLetraData
  /*
    O item do catálogo LETRA guarda tudo menos o próprio `id`: o identificador é
    o do registro no cofre, e duplicá-lo dentro do payload abriria espaço para
    os dois divergirem.
  */
  letra_item: Omit<ItemDoCatalogoLetra, 'id'> & WorkTimestamps
  letra_acquisition: AquisicaoLetraData
}

export type WorkAnyDataByType = WorkDataByType & WorkExtraDataByType
