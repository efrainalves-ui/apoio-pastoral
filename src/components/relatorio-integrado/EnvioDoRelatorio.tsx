import { CheckCircle2, TriangleAlert, Upload } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { ChurchEntity } from '../../district/types'
import type { EvangelismCampaignEntity } from '../../evangelism/types'
import { GOAL_LABELS } from '../../goals/types'
import { extractPdfText, pdfHash, validatePdfFile } from '../../imports/pdf'
import { conferirCampanhas, contarDivergencias } from '../../integrated-report/campanhas'
import {
  aplicarDecisoes, conferir, contarPendencias, estaPendente,
  type ConferenciaDoRelatorio, type DecisaoSobreValor, type DecisoesDaIgreja, type IgrejaConferida,
} from '../../integrated-report/conferencia'
import { ehRelatorioIntegrado, lerRelatorioIntegrado } from '../../integrated-report/leitura'
import { lancamentosDoTrimestre, totalDoDistritoNaMeta } from '../../integrated-report/metas'
import { arquivoEhPdf, FRASE_DO_ENVIO, MENSAGEM_DE_FORMATO } from '../../integrated-report/resumo'
import { RelatorioIntegradoService } from '../../integrated-report/service'
import { rotuloDoTrimestre, type RelatorioIntegradoEntity, type ValorDoIndicador } from '../../integrated-report/types'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'

const service = new RelatorioIntegradoService()

export function textoDoValor(valor: ValorDoIndicador): string {
  if (valor.tipo === 'sim_nao') return valor.valor ? 'Sim' : 'Não'
  if (valor.tipo === 'por_sabado') return `2º sábado ${valor.segundo ?? '—'} · 7º sábado ${valor.setimo ?? '—'}`
  if (valor.tipo === 'por_classe') {
    const classes = Object.entries(valor.classes).map(([classe, numero]) => `${classe} ${numero}`).join(' · ')
    return `${valor.total} no total${classes ? ` · ${classes}` : ''}`
  }
  return String(valor.valor)
}

interface Props {
  accountId: string
  masterKey: CryptoKey
  churches: readonly ChurchEntity[]
  relatorios: readonly RelatorioIntegradoEntity[]
  campanhas: readonly EvangelismCampaignEntity[]
  /** Depois de gravar: a página recarrega, sincroniza as metas e abre o trimestre gravado. */
  aoGravar: (trimestre: string) => Promise<RelatorioIntegradoEntity[]>
}

/**
 * Enviar um novo relatório, no fim da página.
 *
 * O PDF é aberto na memória e descartado; ficam os números por igreja. Os que
 * destoam do trimestre anterior podem ser aprovados, corrigidos, recusados ou
 * deixados para depois — e o que fica para depois é guardado como pendente, sem
 * alimentar meta, até o pastor decidir.
 */
export function EnvioDoRelatorio({ accountId, masterKey, churches, relatorios, campanhas, aoGravar }: Props) {
  const [conferencia, setConferencia] = useState<ConferenciaDoRelatorio | null>(null)
  const [decisoes, setDecisoes] = useState<Record<string, DecisoesDaIgreja>>({})
  const [confirmado, setConfirmado] = useState(false)
  const [busy, setBusy] = useState(false)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')

  const pendencias = conferencia ? contarPendencias(conferencia) : null
  const nomeDaIgreja = (id: string) => churches.find((church) => church.id === id)?.name ?? 'Igreja'

  /* Como o trimestre ficaria gravado, com as decisões de agora: a prévia das metas e das campanhas parte daqui. */
  const comoFicaria = useMemo<RelatorioIntegradoEntity[]>(() => !conferencia ? [] : conferencia.igrejas
    .filter((igreja) => igreja.church)
    .map((igreja) => ({
      id: 'previa', churchId: igreja.church!.id, trimestre: conferencia.trimestre,
      valores: aplicarDecisoes(igreja, decisoes[igreja.nomeNoRelatorio] ?? {}).valores,
      origem: { arquivo: conferencia.arquivo, paginas: igreja.paginas }, importBatchId: '', createdAt: '', updatedAt: '',
    })), [conferencia, decisoes])
  const paraMetas = conferencia ? lancamentosDoTrimestre(comoFicaria, conferencia.trimestre) : []
  const campanhasDivergentes = conferencia ? conferirCampanhas(comoFicaria, campanhas, conferencia.trimestre) : []

  async function escolherArquivo(arquivo: File | undefined) {
    if (!arquivo) return
    setBusy(true); setErro(''); setAviso(''); setConferencia(null); setDecisoes({}); setConfirmado(false)
    try {
      if (!arquivoEhPdf(arquivo)) throw new Error(MENSAGEM_DE_FORMATO)
      validatePdfFile(arquivo)
      const bytes = await arquivo.arrayBuffer()
      const [hash, texto] = await Promise.all([pdfHash(bytes), extractPdfText(bytes)])
      if (!ehRelatorioIntegrado(texto)) throw new Error('Este PDF não parece ser o Relatório Integrado respondido. Nada foi importado.')
      const lido = lerRelatorioIntegrado(texto)
      const jaAplicado = relatorios.some((relatorio) => relatorio.origem.arquivo === arquivo.name && relatorio.trimestre === lido.trimestre)
      setConferencia(conferir(lido, churches, relatorios, arquivo.name, hash, jaAplicado))
    } catch (motivo) {
      setErro(motivo instanceof Error ? motivo.message : 'Não foi possível ler este PDF.')
    } finally { setBusy(false) }
  }

  function decidir(igreja: IgrejaConferida, indicadorId: string, decisao: DecisaoSobreValor) {
    const chave = igreja.nomeNoRelatorio
    setDecisoes({ ...decisoes, [chave]: { ...(decisoes[chave] ?? {}), [indicadorId]: decisao } })
  }
  const decisaoDe = (igreja: IgrejaConferida, indicadorId: string): DecisaoSobreValor =>
    decisoes[igreja.nomeNoRelatorio]?.[indicadorId] ?? { tipo: 'pendente' }

  async function gravar() {
    if (!conferencia) return
    setBusy(true); setErro('')
    try {
      const lote = crypto.randomUUID()
      let gravadas = 0
      for (const igreja of conferencia.igrejas) {
        if (!igreja.church) continue
        const { valores, recusados: fora, pendentes } = aplicarDecisoes(igreja, decisoes[igreja.nomeNoRelatorio] ?? {})
        const aguardando = Object.fromEntries(igreja.valores.filter(({ indicador }) => pendentes.includes(indicador.id)).map(({ indicador, valor }) => [indicador.id, valor]))
        const existente = relatorios.find((item) => item.churchId === igreja.church!.id && item.trimestre === conferencia.trimestre)
        await service.gravar(accountId, masterKey, {
          churchId: igreja.church.id,
          trimestre: conferencia.trimestre,
          valores,
          origem: { arquivo: conferencia.arquivo, paginas: igreja.paginas },
          ...(fora.length ? { recusados: fora } : {}),
          ...(pendentes.length ? { pendentes: aguardando } : {}),
          ...(existente?.conferencias ? { conferencias: existente.conferencias } : {}),
          importBatchId: lote,
          createdAt: existente?.createdAt ?? '',
          updatedAt: '',
        }, existente?.id)
        gravadas += 1
      }
      // As metas saem do que ficou gravado, relido depois de gravar: reenviar substitui, não duplica.
      const guardados = await aoGravar(conferencia.trimestre)
      const total = totalDoDistritoNaMeta(lancamentosDoTrimestre(guardados, conferencia.trimestre), 'bible_studies')
      setAviso(`${rotuloDoTrimestre(conferencia.trimestre)} gravado para ${gravadas} igreja(s). ${GOAL_LABELS.bible_studies}: ${total} no distrito.`)
      setConferencia(null); setDecisoes({}); setConfirmado(false)
    } catch (motivo) {
      setErro(motivo instanceof Error ? motivo.message : 'Não foi possível gravar o relatório.')
    } finally { setBusy(false) }
  }

  return <>
    <Card id="enviar" title="Enviar novo relatório">
      <p className="card-copy">{FRASE_DO_ENVIO}</p>
      {erro && <div className="alert alert--error" role="alert">{erro}</div>}
      {aviso && <div className="alert alert--success" role="status">{aviso}</div>}
      <label className="field">
        <span className="field__label">Arquivo</span>
        <input className="field__input" type="file" accept=".pdf,application/pdf" disabled={busy} onChange={(evento) => void escolherArquivo(evento.target.files?.[0])} />
      </label>
    </Card>

    {conferencia && <>
      <Card eyebrow="Conferência" title={`${rotuloDoTrimestre(conferencia.trimestre)} · ${conferencia.arquivo}`}>
        {conferencia.jaAplicado && <div className="alert alert--success"><CheckCircle2 />Este arquivo já foi aplicado para este trimestre. Gravar de novo substitui os valores.</div>}
        <div className="import-metrics">
          <div><small>Igrejas no relatório</small><strong>{conferencia.igrejas.length}</strong></div>
          <div><small>Prontos</small><strong>{pendencias?.prontos ?? 0}</strong></div>
          <div><small>Precisam confirmar</small><strong>{pendencias?.confirmar ?? 0}</strong></div>
          <div><small>Sem informação</small><strong>{pendencias?.semInformacao ?? 0}</strong></div>
          <div><small>Sem relatório</small><strong>{conferencia.semRelatorio.length}</strong></div>
        </div>

        {conferencia.semRelatorio.length > 0 && <div className="issue-list">
          <h3>Igrejas sem relatório neste trimestre</h3>
          {conferencia.semRelatorio.map((church) => <div key={church.id}><strong>{church.name}</strong><span>Sem relatório</span></div>)}
        </div>}

        {conferencia.semCorrespondencia.length > 0 && <div className="issue-list">
          <h3><TriangleAlert />Nomes sem igreja cadastrada</h3>
          {conferencia.semCorrespondencia.map((nome) => <div key={nome}><strong>{nome}</strong><span>Não será gravado.</span></div>)}
        </div>}

        <div className="issue-list">
          <h3>O que vai para as Metas</h3>
          {paraMetas.length === 0
            ? <div><strong>Nada</strong></div>
            : paraMetas.map((linha) => <div key={`${linha.churchId}-${linha.metric}`}>
                <strong>{nomeDaIgreja(linha.churchId)} · {GOAL_LABELS[linha.metric]}</strong>
                <span>{linha.amount} · {linha.reference.split(' · ').slice(3).join(' · ')}</span>
              </div>)}
          {paraMetas.length > 0 && <div>
            <strong>Total do distrito · {GOAL_LABELS.bible_studies}</strong>
            <span>{totalDoDistritoNaMeta(paraMetas, 'bible_studies')}</span>
          </div>}
        </div>

        {contarDivergencias(campanhasDivergentes) > 0 && <div className="issue-list">
          <h3><TriangleAlert />Campanhas: o declarado não bate com o cadastrado</h3>
          {campanhasDivergentes.filter(({ situacao }) => situacao !== 'confere').map((linha) => <div key={linha.churchId}>
            <strong>{nomeDaIgreja(linha.churchId)}</strong>
            <span>Relatório: {linha.declaradas} · Cadastradas: {linha.cadastradas.length}</span>
          </div>)}
        </div>}

        {conferencia.naoReconhecidos.length > 0 && <div className="issue-list">
          <h3>Indicadores que o catálogo não conhece</h3>
          {conferencia.naoReconhecidos.map((nome) => <div key={nome}><strong>{nome}</strong><span>Não será gravado.</span></div>)}
        </div>}
      </Card>

      {conferencia.igrejas.map((igreja) => {
        const decididos = decisoes[igreja.nomeNoRelatorio] ?? {}
        const destoam = igreja.valores.filter(({ precisaConfirmar }) => precisaConfirmar)
        const nome = igreja.church?.name ?? igreja.nomeNoRelatorio
        return <Card key={igreja.nomeNoRelatorio} eyebrow={igreja.church ? `Páginas ${igreja.paginas.join(', ')}` : 'Sem igreja cadastrada'} title={nome}>
          {destoam.length > 0 && <div className="issue-list">
            <h3><TriangleAlert />Valores fora do padrão</h3>
            {destoam.map((item) => {
              const decisao = decisaoDe(igreja, item.indicador.id)
              return <div key={item.indicador.id}>
                <strong>{item.indicador.rotulo}</strong>
                <span>{rotuloDoTrimestre(item.anterior!.trimestre)}: {item.anterior!.numero} · agora: {item.numero}</span>
                <div className="decisao-do-valor" role="group" aria-label={`Decisão sobre ${item.indicador.rotulo} em ${nome}`}>
                  <Button variant={decisao.tipo === 'aprovado' ? 'primary' : 'secondary'} onClick={() => decidir(igreja, item.indicador.id, { tipo: 'aprovado' })}>Aprovar {item.numero}</Button>
                  <Button variant={decisao.tipo === 'recusado' ? 'danger' : 'secondary'} onClick={() => decidir(igreja, item.indicador.id, { tipo: 'recusado' })}>Recusar</Button>
                  <Button variant={decisao.tipo === 'pendente' ? 'primary' : 'quiet'} onClick={() => decidir(igreja, item.indicador.id, { tipo: 'pendente' })}>Decidir depois</Button>
                  <label className="field field--inline">
                    <span className="field__label">Corrigir para</span>
                    <input
                      className="field__input campo-da-divisao" type="number" min="0"
                      aria-label={`Valor corrigido de ${item.indicador.rotulo} em ${nome}`}
                      value={decisao.tipo === 'corrigido' ? decisao.valor : ''}
                      onChange={(evento) => decidir(igreja, item.indicador.id, evento.target.value === '' ? { tipo: 'pendente' } : { tipo: 'corrigido', valor: Number(evento.target.value) })}
                    />
                  </label>
                </div>
              </div>
            })}
          </div>}

          <details>
            <summary>Ver os {igreja.valores.length} valores lidos</summary>
            <div className="entity-list">
              {igreja.valores.map((item) => {
                const decisao = decididos[item.indicador.id]
                return <div className="entity-row entity-row--texto" key={item.indicador.id}>
                  <span><strong>{item.indicador.rotulo}</strong><small>{item.indicador.secao}</small></span>
                  <span className={estaPendente(item, decididos) || decisao?.tipo === 'recusado' ? 'valor-pendente' : ''}>
                    {decisao?.tipo === 'recusado' ? 'recusado'
                      : decisao?.tipo === 'corrigido' ? `corrigido para ${decisao.valor}`
                        : estaPendente(item, decididos) ? 'aguardando confirmação'
                          : textoDoValor(item.valor)}
                  </span>
                </div>
              })}
            </div>
          </details>

          {igreja.naoInformados.length > 0 && <details>
            <summary>{igreja.naoInformados.length} indicador(es) sem informação</summary>
            <ul className="lista-simples">{igreja.naoInformados.map((indicador) => <li key={indicador.id}>{indicador.rotulo}</li>)}</ul>
          </details>}
        </Card>
      })}

      <Card title="Gravar">
        <label className="confirmation-check">
          <input type="checkbox" checked={confirmado} onChange={(evento) => setConfirmado(evento.target.checked)} />
          <span>Conferi os números acima e autorizo a gravação.</span>
        </label>
        <Button disabled={!confirmado || busy} onClick={() => void gravar()} icon={<Upload size={17} />}>
          {busy ? 'Gravando…' : `Gravar ${rotuloDoTrimestre(conferencia.trimestre)}`}
        </Button>
      </Card>
    </>}
  </>
}
