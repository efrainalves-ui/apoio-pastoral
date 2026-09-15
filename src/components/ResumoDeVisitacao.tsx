import { HeartHandshake, Minus, TrendingDown, TrendingUp } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuthVault } from '../auth/AuthVaultContext'
import { resumoDeVisitacaoNoInicio } from '../care/resumoNoInicio'
import { CareService } from '../care/service'
import type { FollowUpEntity, VisitEntity } from '../care/types'
import { useReloadOnSync } from '../sync/useReloadOnSync'

const care = new CareService()

/** O cartão curto de visitação na tela inicial; o toque leva às respostas completas. */
export function ResumoDeVisitacao() {
  const { account, masterKey } = useAuthVault()
  const [visits, setVisits] = useState<VisitEntity[]>([])
  const [followUps, setFollowUps] = useState<FollowUpEntity[]>([])
  const carregar = useCallback(async () => {
    if (!account || !masterKey) return
    try {
      const [proximasVisitas, proximosAcompanhamentos] = await Promise.all([care.listVisits(account.id, masterKey), care.listFollowUps(account.id, masterKey)])
      setVisits(proximasVisitas); setFollowUps(proximosAcompanhamentos)
    } catch { /* sem leitura, o cartão mostra zero e o caminho para a Visitação continua */ }
  }, [account, masterKey])
  useReloadOnSync(carregar)
  const hoje = useMemo(() => new Date(), [])
  const resumo = resumoDeVisitacaoNoInicio(visits, followUps, hoje)
  const tendencia = resumo.tendencia
  const Icone = !tendencia || tendencia.diferenca === 0 ? Minus : tendencia.diferenca > 0 ? TrendingUp : TrendingDown
  const sinal = tendencia && tendencia.diferenca > 0 ? '+' : tendencia && tendencia.diferenca < 0 ? '−' : ''

  return (
    <Link className="card resumo-visitacao" to="/app/visitacao?aba=respostas" aria-labelledby="resumo-visitacao-titulo" aria-describedby="resumo-visitacao-numeros">
      <span className="resumo-visitacao__topo">
        <span>
          <span className="eyebrow">Últimos 30 dias</span>
          <h2 className="card__title" id="resumo-visitacao-titulo">Resumo de Visitação</h2>
        </span>
        <HeartHandshake className="accent-icon" aria-hidden="true" />
      </span>
      <dl className="resumo-visitacao__numeros" id="resumo-visitacao-numeros">
        <div>
          <dt>Visitas realizadas</dt>
          <dd>{resumo.realizadas}</dd>
          {tendencia && <dd className="resumo-visitacao__tendencia"><Icone aria-hidden="true" />{sinal}{Math.abs(tendencia.diferenca)} vs. 30 dias anteriores</dd>}
        </div>
        <div><dt>Pessoas e famílias visitadas</dt><dd>{resumo.visitados}</dd></div>
        <div><dt>Acompanhamentos pendentes</dt><dd>{resumo.acompanhamentosPendentes}</dd></div>
      </dl>
    </Link>
  )
}
