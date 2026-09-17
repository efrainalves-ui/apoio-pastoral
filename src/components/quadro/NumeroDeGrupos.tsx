import { rotuloDoTrimestre } from '../../integrated-report/types'
import type { NumeroDeGrupos, TotalDeGrupos } from '../../missionary/metasDeGrupos'

export const SEM_INFORMACAO_NO_TRIMESTRE = 'Sem informação neste trimestre'
export const SEM_INFORMACAO = 'Sem informação'

export const rotuloDoPeriodo = (trimestre: string) => `Dados do ${rotuloDoTrimestre(trimestre)}`

/** O trimestre dos números: texto quando há um só, escolha quando há mais. */
export function PeriodoDoQuadro({ trimestre, trimestres, aoEscolher }: { trimestre: string | null; trimestres: readonly string[]; aoEscolher: (trimestre: string) => void }) {
  if (!trimestre) return null
  if (trimestres.length < 2) return <p className="quadro-periodo">{rotuloDoPeriodo(trimestre)}</p>
  return <select className="field__input quadro-periodo__escolha" aria-label="Trimestre" value={trimestre} onChange={(evento) => aoEscolher(evento.target.value)}>
    {trimestres.map((item) => <option key={item} value={item}>{rotuloDoPeriodo(item)}</option>)}
  </select>
}

const classeDoAlcance = (numero: number, meta: number) => numero >= meta ? 'quadro--alcancado' : 'quadro--falta'

/**
 * Um número do quadro com a sua origem.
 *
 * Sem informação é texto, nunca zero. Quando relatório e cadastro divergem, os
 * dois aparecem: o do relatório como alcançado, o do cadastro para conferir.
 */
export function NumeroDoQuadro({ item, meta, comTrimestre, mostrarOrigem = true }: { item: NumeroDeGrupos; meta: number; comTrimestre: boolean; mostrarOrigem?: boolean }) {
  return <div className="quadro-numero">
    {item.numero === null
      ? <strong className="quadro--sem-informacao">{comTrimestre ? SEM_INFORMACAO_NO_TRIMESTRE : SEM_INFORMACAO}</strong>
      : <strong className={classeDoAlcance(item.numero, meta)}>{item.numero}<small>/{meta}</small></strong>}
    {mostrarOrigem && item.origem === 'relatorio' && <small className="quadro-origem">Relatório Integrado</small>}
    {mostrarOrigem && item.origem === 'cadastro' && <small className="quadro-origem">Cadastro</small>}
    {(item.divergente || (item.numero === null && item.cadastro > 0)) && <small className={item.divergente ? 'quadro-divergencia' : 'quadro-origem'}>Cadastro: {item.cadastro}</small>}
  </div>
}

/** O total do distrito no mesmo trimestre, dizendo quantas igrejas ficaram de fora. */
export function TotalDoQuadro({ total, meta, comTrimestre }: { total: TotalDeGrupos; meta: number; comTrimestre: boolean }) {
  return <div className="quadro-numero">
    {total.numero === null
      ? <strong className="quadro--sem-informacao">{comTrimestre ? SEM_INFORMACAO_NO_TRIMESTRE : SEM_INFORMACAO}</strong>
      : <strong className={classeDoAlcance(total.numero, meta)}>{total.numero}<small>/{meta}</small></strong>}
    {total.numero !== null && total.semInformacao > 0 && <small className="quadro-origem">{total.semInformacao} sem informação</small>}
  </div>
}
