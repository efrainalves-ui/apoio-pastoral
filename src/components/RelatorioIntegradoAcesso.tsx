import { FileText, TriangleAlert } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuthVault } from '../auth/AuthVaultContext'
import { coberturaDoTrimestre, estudosDoTrimestre, linhasDaEscolaSabatina, ROTA_DO_RELATORIO_INTEGRADO, ultimoTrimestre } from '../integrated-report/resumo'
import { rotuloDoTrimestre } from '../integrated-report/types'
import { useRelatorioIntegrado } from '../integrated-report/useRelatorioIntegrado'
import { MissionaryService } from '../missionary/service'
import { Card } from './ui/Card'

const missionary = new MissionaryService()

/** O que precisa ficar claro antes de alguém escolher o arquivo. */
export function OrientacaoDoRelatorioIntegrado() {
  return <div className="relatorio-orientacao">
    <p>Envie aqui o Relatório Integrado já respondido pelas igrejas naquele trimestre. Antes de enviar, converta o arquivo para PDF.</p>
    <p className="alert alert--warning"><TriangleAlert aria-hidden="true" />Não envie o formulário vazio. O arquivo precisa estar respondido com os dados das igrejas e convertido para PDF.</p>
    <ul className="lista-simples">
      <li>É o relatório trimestral respondido pelas igrejas.</li>
      <li>Word, planilha e imagem não são aceitos diretamente: converta para PDF.</li>
      <li>PDF escaneado sem texto ou OCR pode não ser reconhecido.</li>
    </ul>
  </div>
}

function BotaoDoRelatorio({ temRelatorio }: { temRelatorio: boolean }) {
  return <div className="form-actions">
    <Link className="button button--primary" to={ROTA_DO_RELATORIO_INTEGRADO}><FileText aria-hidden="true" />{temRelatorio ? 'Consultar e enviar novo trimestre' : 'Enviar Relatório Integrado em PDF'}</Link>
  </div>
}

/** Em Metas: o caminho até o relatório, perto das metas do distrito. */
export function AcessoAoRelatorioIntegrado() {
  const { relatorios, pronto } = useRelatorioIntegrado()
  const ultimo = ultimoTrimestre(relatorios)
  return <Card title="Relatório Integrado do trimestre" eyebrow={ultimo ? `Último recebido: ${rotuloDoTrimestre(ultimo)}` : 'Trimestral'}>
    <OrientacaoDoRelatorioIntegrado />
    <p>O relatório:</p>
    <ul className="lista-simples">
      <li>registra os dados trimestrais das igrejas;</li>
      <li>apresenta os totais do distrito;</li>
      <li>permite consultar cada igreja;</li>
      <li>alimenta somente as áreas com ligação definida, como a meta de Estudos Bíblicos.</li>
    </ul>
    {pronto && <BotaoDoRelatorio temRelatorio={relatorios.length > 0} />}
  </Card>
}

/** Na Escola Sabatina: o que o relatório diz, ao lado do que está cadastrado, sem misturar. */
export function DadosDoRelatorioNaEscolaSabatina({ cadastro }: { cadastro: { classes: number; pequenosGrupos: number } }) {
  const { relatorios, ativas, pronto } = useRelatorioIntegrado()
  if (!pronto) return null
  const ultimo = ultimoTrimestre(relatorios)
  if (!ultimo) return <Card title="Dados do Relatório Integrado" eyebrow="Nenhum trimestre recebido">
    <OrientacaoDoRelatorioIntegrado />
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

/** Em Estudos Bíblicos: o número informado no relatório, identificado como tal. */
export function EstudosNoRelatorioIntegrado() {
  const { account, masterKey } = useAuthVault()
  const { relatorios, ativas, pronto } = useRelatorioIntegrado()
  const [nominais, setNominais] = useState<number | null>(null)
  const ano = String(new Date().getFullYear())

  useEffect(() => {
    if (!account || !masterKey) return
    let ativo = true
    void missionary.listStudies(account.id, masterKey)
      .then((estudos) => { if (ativo) setNominais(estudos.filter(({ startedAt }) => startedAt.startsWith(ano)).length) })
      .catch(() => undefined)
    return () => { ativo = false }
  }, [account, masterKey, ano])

  if (!pronto) return null
  const ultimo = ultimoTrimestre(relatorios)
  if (!ultimo) return <Card title="Estudos Bíblicos informados no Relatório Integrado" eyebrow="Nenhum trimestre importado">
    <OrientacaoDoRelatorioIntegrado />
    <BotaoDoRelatorio temRelatorio={false} />
  </Card>
  const total = estudosDoTrimestre(relatorios, ultimo)
  return <Card title="Estudos Bíblicos informados no Relatório Integrado" eyebrow={rotuloDoTrimestre(ultimo)}>
    <div className="import-metrics">
      <div><small>Último trimestre importado</small><strong>{rotuloDoTrimestre(ultimo)}</strong></div>
      <div><small>Total informado pelo distrito</small><strong>{total ?? '—'}</strong></div>
      <div><small>Igrejas que responderam</small><strong>{coberturaDoTrimestre(relatorios, ultimo, ativas).responderam}</strong></div>
      <div><small>Cadastro nominal do aplicativo</small><strong>{nominais ?? '—'}</strong></div>
    </div>
    <p className="field__hint">Informado no relatório: estudos bíblicos gerais e da ASA somados. Reenviar o trimestre substitui os valores.</p>
    <div className="form-actions"><Link className="button button--secondary" to={ROTA_DO_RELATORIO_INTEGRADO}>Abrir o relatório completo</Link></div>
  </Card>
}
