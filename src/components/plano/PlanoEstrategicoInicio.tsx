import { ChevronRight } from 'lucide-react'
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useRelatorioIntegrado } from '../../integrated-report/useRelatorioIntegrado'
import { AREAS_DO_PLANO, TITULO_DO_PLANO, anoDeReferencia, formatarNumero, resultadoDaArea } from '../../plano-estrategico/areas'
import { SimboloDaArea } from './SimboloDaArea'

/**
 * Os quatro cartões do Plano Estratégico na tela inicial.
 *
 * Cada um mostra o símbolo, o nome da área, o número e o propósito. O que o
 * número conta e de que trimestre ele vem ficam na página da área: no cartão,
 * eles competiriam com o que importa.
 */
export function PlanoEstrategicoInicio() {
  const { relatorios, ativas, pronto } = useRelatorioIntegrado()
  const anoCorrente = useMemo(() => new Date().getFullYear(), [])
  if (!pronto) return null
  const ano = anoDeReferencia(relatorios, anoCorrente)

  return (
    <section className="plano-estrategico" aria-labelledby="plano-estrategico-titulo">
      <h2 className="plano-estrategico__titulo" id="plano-estrategico-titulo">{TITULO_DO_PLANO}</h2>
      <ul className="plano-cards">
        {AREAS_DO_PLANO.map((area) => {
          const { numero } = resultadoDaArea(relatorios, ativas, area, { ano, trimestre: null })
          const valor = numero === null ? 'sem informação' : formatarNumero(numero)
          return (
            <li key={area.slug}>
              <Link
                className={`plano-card area--${area.slug}`}
                to={`/app/plano-estrategico/${area.slug}`}
                aria-label={`${area.nome}: ${valor}. Ver detalhes`}
                aria-describedby={`plano-${area.slug}-texto`}
              >
                <span className="plano-card__faixa" aria-hidden="true" />
                <span className="plano-card__cabeca"><SimboloDaArea simbolo={area.simbolo} /><strong className="plano-card__nome">{area.nome}</strong></span>
                <span className="plano-card__numero">{numero === null ? '—' : formatarNumero(numero)}</span>
                <span className="plano-card__texto" id={`plano-${area.slug}-texto`}>{area.explicacao}</span>
                <span className="plano-card__rodape">
                  <span className="plano-card__acao">Ver detalhes<ChevronRight aria-hidden="true" /></span>
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
