import { Fragment } from 'react'
import type { ChurchEntity } from '../../district/types'
import { fidelityCareSummary, type FidelityCareSummary } from '../../people/fidelitySummary'
import type { PersonEntity } from '../../people/types'

const ESTADOS = [
  { chave: 'faithful', rotulo: 'Fiéis', classe: 'fieis' },
  { chave: 'followingUp', rotulo: 'Em acompanhamento', classe: 'acompanhamento' },
  { chave: 'toEvaluate', rotulo: 'A avaliar', classe: 'avaliar' },
] as const

const contar = (resumo: FidelityCareSummary) => resumo.faithful + resumo.followingUp + resumo.toEvaluate

/** A barra é a mesma conta dos três números, em proporção — nada de novo é calculado. */
function Distribuicao({ resumo }: { resumo: FidelityCareSummary }) {
  const total = contar(resumo)
  if (!total) return null
  return <span className="fidelidade-igreja__barra" aria-hidden="true">
    {ESTADOS.map(({ chave, classe }) => {
      const parte = resumo[chave]
      return parte > 0 ? <span key={chave} className={`fidelidade-igreja__parte fidelidade-igreja__parte--${classe}`} style={{ width: `${(parte / total) * 100}%` }} /> : null
    })}
  </span>
}

/**
 * A fidelidade de cada igreja, para escolher onde trabalhar.
 *
 * Os números são os do resumo de sempre — fiéis, em acompanhamento e a avaliar —,
 * sem nenhuma conta nova. O cartão é o atalho: tocar nele recorta a lista de
 * pessoas para avaliar naquela igreja, que é o passo seguinte do pastor.
 */
export function FidelidadePorIgreja({ igrejas, pessoas, igrejaSelecionada, onEscolherIgreja }: {
  igrejas: readonly ChurchEntity[]
  pessoas: readonly PersonEntity[]
  igrejaSelecionada: string
  onEscolherIgreja: (igrejaId: string) => void
}) {
  const doDistrito = fidelityCareSummary([...pessoas])

  return <div className="fidelidade-visao">
    <div className="fidelidade-resumo">
      {ESTADOS.map(({ chave, rotulo }) => <div key={chave}>
        <span>{rotulo}</span>
        <strong>{doDistrito[chave]}</strong>
      </div>)}
    </div>

    <ul className="fidelidade-igrejas">
      {igrejas.map((igreja) => {
        const resumo = fidelityCareSummary(pessoas.filter((pessoa) => pessoa.currentChurchId === igreja.id))
        const escolhida = igreja.id === igrejaSelecionada
        return <li key={igreja.id}>
          <button
            type="button"
            className={`fidelidade-igreja${escolhida ? ' fidelidade-igreja--escolhida' : ''}`}
            aria-pressed={escolhida}
            onClick={() => onEscolherIgreja(escolhida ? '' : igreja.id)}
          >
            {/*
              Os espaços são escritos à mão, e ficam entre os blocos.

              O JSX descarta a quebra de linha entre elementos, e o nome anunciado
              sairia "Igreja Central Fictícia1Fiéis1Em acompanhamento". Espaço no
              fim de cada bloco não resolve: ele é aparado antes de o nome ser
              montado. Só vale o que está entre um bloco e o seguinte.
            */}
            <span className="fidelidade-igreja__nome">{igreja.name}</span>{' '}
            <span className="fidelidade-igreja__estados">
              {ESTADOS.map(({ chave, rotulo, classe }, indice) => <Fragment key={chave}>
                {indice > 0 && ' '}
                <span className={`fidelidade-estado fidelidade-estado--${classe}`}>
                  <strong>{resumo[chave]}</strong>{' '}<small>{rotulo}</small>
                </span>
              </Fragment>)}
            </span>
            <Distribuicao resumo={resumo} />
          </button>
        </li>
      })}
    </ul>
  </div>
}
