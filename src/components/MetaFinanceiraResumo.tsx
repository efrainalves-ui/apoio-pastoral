import { Link } from 'react-router-dom'
import { MONTH_LABELS, formatGoalValue } from '../goals/format'
import { crescimentoDaMeta, monthlyResults } from '../goals/areas'
import { useGoalSources } from '../goals/useGoalSources'
import { AreaChart } from './ui/AreaChart'
import { ProgressRing } from './ui/ProgressRing'

/**
 * A meta de dízimos no Início: quanto do caminho, e como o ano vem andando.
 *
 * O anel responde "quanto falta"; o gráfico responde "está subindo ou caindo".
 * São perguntas diferentes, e nenhuma das duas se responde com uma lista de
 * doze números — que é o que havia aqui.
 *
 * Fica calado enquanto não houver relatório do ano: um anel em zero por cento
 * não informa nada e ainda parece que a igreja não devolveu nada.
 */
export function MetaFinanceiraResumo() {
  const { goals, sources, ready } = useGoalSources()
  const ano = new Date().getFullYear()
  if (!ready) return null

  const crescimento = crescimentoDaMeta('tithes', goals, sources, ano)
  if (crescimento.ateOMes === 0) return null

  const porMes = monthlyResults('tithes', sources, ano)
  const ponto = (valor: number) => `${valor >= 0 ? '+' : '−'}${Math.abs(valor).toFixed(1).replace('.', ',')}%`

  return (
    <section className="faixa" aria-label="Meta de dízimos">
      <p className="rotulo-secao">Dízimos · janeiro a {MONTH_LABELS[crescimento.ateOMes - 1]}</p>

      <div className="meta-anel">
        <ProgressRing
          percent={crescimento.percentDaMeta}
          label="da meta de crescimento"
          tone={crescimento.alcancado !== null && crescimento.alcancado < 0 ? 'atencao' : 'ok'}
        >
          {crescimento.percentDaMeta}%
        </ProgressRing>
        <dl className="meta-anel__lados">
          <div className="meta-anel__par">
            <dt>Cresceu</dt>
            <dd>{crescimento.alcancado === null ? '—' : ponto(crescimento.alcancado)}</dd>
          </div>
          <div className="meta-anel__par">
            <dt>Alvo do ano</dt>
            <dd>{crescimento.alvo > 0 ? `+${crescimento.alvo}%` : 'A definir'}</dd>
          </div>
          {crescimento.alvo > 0 && <div className="meta-anel__par">
            <dt>Faltam</dt>
            <dd className="falta">{crescimento.falta.toFixed(1).replace('.', ',')} pontos</dd>
          </div>}
        </dl>
      </div>

      <AreaChart
        valores={porMes}
        rotulos={MONTH_LABELS}
        label="Entradas de dízimo mês a mês"
        formatar={(valor) => formatGoalValue('tithes', valor)}
      />

      <Link className="text-link" to="/app/metas/tithes">Abrir metas de dízimos</Link>
    </section>
  )
}
