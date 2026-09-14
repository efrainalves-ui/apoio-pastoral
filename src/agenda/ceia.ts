import { candidateReady } from '../nominations/core'
import type { NominationProcessEntity } from '../nominations/types'
import type { PersonEntity } from '../people/types'
import type { ResponsavelDaCeia } from './types'

const semAcento = (valor: string) => valor.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('pt-BR').trim()

const CARGOS: ReadonlyArray<{ papel: 'primeiro_diacono' | 'primeira_diaconisa'; titulo: string }> = [
  { papel: 'primeiro_diacono', titulo: 'primeiro diacono' },
  { papel: 'primeira_diaconisa', titulo: 'primeira diaconisa' },
]

/**
 * Quem conduz a Ceia do Senhor, tirado dos registros atuais da igreja.
 *
 * O registro atual é o processo de nomeações mais recente da igreja: nele, o
 * cargo "Primeiro diácono" ou "Primeira diaconisa" com uma indicação pronta —
 * consentimento, elegibilidade e votação — diz quem ocupa o cargo. Sem
 * indicação pronta, o cargo fica pendente e com o nome em branco, para o pastor
 * escrever; não se chuta quem é.
 *
 * O resultado é só o ponto de partida: a tela deixa trocar, apagar e acrescentar.
 */
export function responsaveisPadraoDaCeia(
  churchId: string | null,
  processos: readonly NominationProcessEntity[],
  pessoas: readonly PersonEntity[],
): ResponsavelDaCeia[] {
  const processo = processos
    .filter((item) => item.churchId === churchId && item.status !== 'archived')
    .sort((esquerda, direita) => direita.period.localeCompare(esquerda.period))[0]

  return CARGOS.map(({ papel, titulo }) => {
    const cargo = processo?.offices.find((office) => semAcento(office.title) === titulo && office.status !== 'archived')
    const indicado = cargo ? processo!.candidates.find((candidato) => candidato.officeId === cargo.id && candidateReady(candidato)) : undefined
    const pessoa = indicado ? pessoas.find(({ id }) => id === indicado.personId) : undefined
    return { papel, personId: pessoa?.id ?? null, nome: pessoa?.name ?? '' }
  })
}

/** Quantos dos dois cargos ficaram sem pessoa. */
export function cargosPendentes(responsaveis: readonly ResponsavelDaCeia[]): number {
  return responsaveis.filter((item) => item.papel !== 'outro' && !item.personId && !item.nome.trim()).length
}
