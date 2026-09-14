import { FileText } from 'lucide-react'
import { Link } from 'react-router-dom'
import { origemDosEstudos } from '../goals/areas'
import { useGoalSources } from '../goals/useGoalSources'
import { coberturaDoTrimestre, FRASE_DO_ENVIO, linhasDaEscolaSabatina, ROTA_DO_RELATORIO_INTEGRADO, ultimoTrimestre } from '../integrated-report/resumo'
import { rotuloCurtoDoTrimestre } from '../integrated-report/painel'
import { rotuloDoTrimestre } from '../integrated-report/types'
import { useRelatorioIntegrado } from '../integrated-report/useRelatorioIntegrado'
import { Card } from './ui/Card'

function BotaoDoRelatorio({ temRelatorio }: { temRelatorio: boolean }) {
  return <div className="form-actions">
    <Link className="button button--primary" to={ROTA_DO_RELATORIO_INTEGRADO}><FileText aria-hidden="true" />{temRelatorio ? 'Abrir o Relatório Integrado' : 'Enviar Relatório Integrado em PDF'}</Link>
    {temRelatorio && <Link className="button button--secondary" to={`${ROTA_DO_RELATORIO_INTEGRADO}#enviar`}>Enviar novo relatório</Link>}
  </div>
}

/** Em Metas, no fim da página: o caminho até o relatório. */
export function AcessoAoRelatorioIntegrado() {
  const { relatorios, pronto } = useRelatorioIntegrado()
  const ultimo = ultimoTrimestre(relatorios)
  return <Card title="Relatório Integrado do trimestre" eyebrow={ultimo ? `Último recebido: ${rotuloDoTrimestre(ultimo)}` : 'Trimestral'}>
    <p className="card-copy">{FRASE_DO_ENVIO}</p>
    {pronto && <BotaoDoRelatorio temRelatorio={relatorios.length > 0} />}
  </Card>
}

/** Na Escola Sabatina: o que o relatório diz, ao lado do que está cadastrado, sem misturar. */
export function DadosDoRelatorioNaEscolaSabatina({ cadastro }: { cadastro: { classes: number; pequenosGrupos: number } }) {
  const { relatorios, ativas, pronto } = useRelatorioIntegrado()
  if (!pronto) return null
  const ultimo = ultimoTrimestre(relatorios)
  if (!ultimo) return <Card title="Dados do Relatório Integrado" eyebrow="Nenhum trimestre recebido">
    <p className="card-copy">{FRASE_DO_ENVIO}</p>
    <BotaoDoRelatorio temRelatorio={false} />
  </Card>
  const cobertura = coberturaDoTrimestre(relatorios, ultimo, ativas)
  return <Card title="Dados do Relatório Integrado" eyebrow={rotuloDoTrimestre(ultimo)}>
    <div className="import-metrics">
      <div><small>Último trimestre recebido</small><strong>{rotuloDoTrimestre(ultimo)}</strong></div>
      <div><small>Igrejas que responderam</small><strong>{cobertura.responderam}</strong></div>
      <div><small>Igrejas sem relatório</small><strong>{cobertura.semRelatorio}</strong></div>
    </div>
    <div className="rolagem-tabela">
      <table className="tabela-simples">
        <thead><tr><th scope="col">Indicador</th><th scope="col">Cadastro atual do aplicativo</th><th scope="col">Informado no Relatório Integrado do trimestre</th></tr></thead>
        <tbody>{linhasDaEscolaSabatina(relatorios, ativas, cadastro).map((linha) => <tr key={linha.rotulo}>
          <td>{linha.rotulo}</td>
          <td className="numero-tabela">{linha.cadastro ?? '—'}</td>
          <td className="numero-tabela">{linha.informado ?? '—'}</td>
        </tr>)}</tbody>
      </table>
    </div>
    <div className="form-actions"><Link className="button button--secondary" to={ROTA_DO_RELATORIO_INTEGRADO}>Consultar os detalhes</Link></div>
  </Card>
}

/**
 * Em Estudos Bíblicos: de onde vem o alcançado.
 *
 * O resultado é por número, do Relatório Integrado; o cadastro por nome é
 * opcional e aparece só para conferência.
 */
export function EstudosNoRelatorioIntegrado() {
  const { sources, ready } = useGoalSources()
  const { relatorios, pronto } = useRelatorioIntegrado()
  const ano = new Date().getFullYear()
  if (!pronto || !ready) return null
  if (!ultimoTrimestre(relatorios)) return <Card title="Estudos Bíblicos informados no Relatório Integrado" eyebrow="Nenhum trimestre importado">
    <p className="card-copy">{FRASE_DO_ENVIO}</p>
    <BotaoDoRelatorio temRelatorio={false} />
  </Card>
  const origem = origemDosEstudos(sources, ano)
  return <Card title="Estudos Bíblicos informados no Relatório Integrado" eyebrow={String(ano)}>
    <div className="import-metrics">
      <div><small>Resultado oficial do relatório</small><strong>{origem.oficial}</strong></div>
      <div><small>Cadastro nominal</small><strong>{origem.nominal}</strong></div>
      <div><small>Diferença</small><strong>{origem.diferenca === null ? '—' : `${origem.diferenca > 0 ? '+' : origem.diferenca < 0 ? '−' : ''}${Math.abs(origem.diferenca)}`}</strong></div>
      <div><small>Trimestres incluídos</small><strong>{origem.incluidos.length ? origem.incluidos.map(rotuloCurtoDoTrimestre).join(', ') : '—'}</strong></div>
    </div>
    <div className="form-actions"><Link className="button button--secondary" to={ROTA_DO_RELATORIO_INTEGRADO}>Abrir o relatório completo</Link></div>
  </Card>
}
