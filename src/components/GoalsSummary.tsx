import { Flag } from 'lucide-react'
import { Link } from 'react-router-dom'
import { GOAL_AREAS, GOAL_AREA_SHORT, PERCENT_TARGET_AREAS, areaComparison, crescimentoDaMeta } from '../goals/areas'
import { formatGoalValue } from '../goals/format'
import { useGoalSources } from '../goals/useGoalSources'
import { useQuadroDeGrupos } from '../missionary/useQuadroDeGrupos'
import { Card } from './ui/Card'
import { ProgressRing } from './ui/ProgressRing'

interface Alvo {
  chave: string
  nome: string
  /** Quanto do caminho já foi vencido, de 0 a 100. */
  percent: number
  /** O que se escreve dentro do anel. */
  centro: string
  detalhe: string
  para: string
  atrasada: boolean
}

/**
 * As metas do ano, uma por anel.
 *
 * Eram barras iguais empilhadas, e a barra responde mal a pergunta que se faz
 * aqui: não é "quanto já foi" numa régua, é "quanto falta para fechar o ano". O
 * anel fecha, e um anel pela metade se lê de longe.
 *
 * Nenhum número novo: os mesmos que a página de metas mostra, no formato que
 * cada área usa — porcentagem de crescimento em dízimos e ofertas, contagem nas
 * demais.
 */
export function GoalsSummary() {
  const { goals, sources, ready } = useGoalSources()
  const { quadro } = useQuadroDeGrupos()
  const year = new Date().getFullYear()
  if (!ready) return null

  const porcentagem = (valor: number) => `${valor >= 0 ? '+' : '−'}${Math.abs(valor).toFixed(1).replace('.', ',')}%`

  const alvos: Alvo[] = GOAL_AREAS.map((area) => {
    const progresso = areaComparison(area, goals, sources, year)
    const crescimento = PERCENT_TARGET_AREAS.includes(area) ? crescimentoDaMeta(area, goals, sources, year) : null

    if (crescimento) {
      return {
        chave: area,
        nome: GOAL_AREA_SHORT[area],
        percent: crescimento.percentDaMeta,
        centro: crescimento.alcancado === null ? '—' : porcentagem(crescimento.alcancado),
        detalhe: crescimento.alvo > 0 ? `alvo +${crescimento.alvo}%` : 'alvo a definir',
        para: `/app/metas/${area}`,
        atrasada: crescimento.alvo > 0 && crescimento.percentDaMeta < 100,
      }
    }
    return {
      chave: area,
      nome: GOAL_AREA_SHORT[area],
      percent: progresso.percent,
      centro: progresso.target > 0 ? `${progresso.percent}%` : '—',
      detalhe: progresso.target > 0 ? `${formatGoalValue(area, progresso.result)} de ${formatGoalValue(area, progresso.objective)}` : 'meta a definir',
      para: `/app/metas/${area}`,
      atrasada: progresso.target > 0 && progresso.percent < 100,
    }
  })

  const percentEscola = quadro.distrito.meta > 0
    ? Math.min(100, Math.round((quadro.distrito.escolaSabatina / quadro.distrito.meta) * 100))
    : 0
  alvos.push({
    chave: 'uapg',
    nome: 'Escola Sabatina',
    percent: percentEscola,
    centro: quadro.distrito.meta > 0 ? `${percentEscola}%` : '—',
    detalhe: quadro.distrito.meta > 0 ? `${quadro.distrito.escolaSabatina} de ${quadro.distrito.meta}` : 'sem membros ainda',
    para: '/app/metas/uapg',
    atrasada: quadro.distrito.meta > 0 && percentEscola < 100,
  })

  return (
    <Card title="Metas do ano" eyebrow={String(year)} action={<Link className="icon-button" to="/app/metas" aria-label="Abrir metas"><Flag /></Link>}>
      <div className="aneis">
        {alvos.map((alvo) => (
          <Link key={alvo.chave} to={alvo.para} className="anel-meta">
            <ProgressRing percent={alvo.percent} label={`Meta de ${alvo.nome}`} size={86} tone={alvo.atrasada ? 'atencao' : 'ok'}>
              {alvo.centro}
            </ProgressRing>
            <strong>{alvo.nome}</strong>
            <small>{alvo.detalhe}</small>
          </Link>
        ))}
      </div>
    </Card>
  )
}
