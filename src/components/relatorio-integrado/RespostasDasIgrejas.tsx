import { CircleAlert, CircleCheck, CircleDashed } from 'lucide-react'
import { indicadorPorId } from '../../integrated-report/catalogo'
import { respostasDoAno, rotuloCurto, type SituacaoDaResposta } from '../../integrated-report/painel'
import type { RelatorioIntegradoEntity } from '../../integrated-report/types'

const ROTULO: Record<SituacaoDaResposta, string> = { respondeu: 'Respondeu', incompleto: 'Informação incompleta', sem_relatorio: 'Não respondeu' }
const ICONE = { respondeu: CircleCheck, incompleto: CircleAlert, sem_relatorio: CircleDashed } as const

interface Props {
  relatorios: readonly RelatorioIntegradoEntity[]
  igrejas: readonly string[]
  nomeDaIgreja: (churchId: string) => string
  ano: number
  trimestreAtivo: number | null
  aoAbrirIgreja: (churchId: string) => void
}

/** Quem respondeu cada trimestre, de relance: forma, cor e palavra dizem a mesma coisa. */
export function RespostasDasIgrejas({ relatorios, igrejas, nomeDaIgreja, ano, trimestreAtivo, aoAbrirIgreja }: Props) {
  const respostas = respostasDoAno(relatorios, igrejas, ano)
  const responderam = (indice: number) => respostas.filter(({ trimestres }) => trimestres[indice]!.situacao !== 'sem_relatorio').length

  return <>
    <ul className="ri-legenda" aria-label="Legenda">
      {(Object.keys(ROTULO) as SituacaoDaResposta[]).map((situacao) => {
        const Icone = ICONE[situacao]
        return <li key={situacao} className={`ri-legenda__item ri-resposta--${situacao}`}><Icone aria-hidden="true" size={15} />{ROTULO[situacao]}</li>
      })}
      <li className="ri-legenda__item ri-legenda__item--erro"><span aria-hidden="true">*</span>Possível erro de digitação</li>
    </ul>

    <div className="ri-respostas" role="table" aria-label={`Respostas das igrejas em ${ano}`}>
      <div className="ri-respostas__cabeca" role="row">
        <span role="columnheader">Igreja</span>
        {[0, 1, 2, 3].map((indice) => <span role="columnheader" key={indice} className={trimestreAtivo === indice + 1 ? 'ri-coluna-ativa' : undefined}>
          {indice + 1}º tri<small>{responderam(indice)}/{igrejas.length}</small>
        </span>)}
      </div>
      {respostas.map(({ churchId, trimestres }) => <div className="ri-respostas__linha" role="row" key={churchId}>
        <span role="rowheader" className="ri-respostas__igreja"><button type="button" className="text-button" onClick={() => aoAbrirIgreja(churchId)}>{nomeDaIgreja(churchId)}</button></span>
        {trimestres.map((resposta, indice) => {
          const Icone = ICONE[resposta.situacao]
          const faltando = resposta.faltando.map((id) => { const indicador = indicadorPorId(id); return indicador ? rotuloCurto(indicador) : id })
          return <span role="cell" key={resposta.trimestre}
            className={`ri-resposta ri-resposta--${resposta.situacao}${trimestreAtivo === indice + 1 ? ' ri-coluna-ativa' : ''}`}
            title={faltando.length ? `Sem informação: ${faltando.join(', ')}` : ROTULO[resposta.situacao]}>
            <span className="ri-resposta__tri" aria-hidden="true">{indice + 1}º tri</span>
            <Icone aria-hidden="true" size={16} />
            <span className="ri-resposta__texto">{ROTULO[resposta.situacao]}</span>
            {resposta.possiveisErros > 0 && <span className="ri-resposta__erro" aria-label={`${resposta.possiveisErros} possível(is) erro(s) de digitação`}>*{resposta.possiveisErros > 1 ? resposta.possiveisErros : ''}</span>}
          </span>
        })}
      </div>)}
    </div>
  </>
}
