import { CheckCircle2, TriangleAlert, Upload } from 'lucide-react'
import { useState } from 'react'
import type { ChurchEntity } from '../../district/types'
import { GOAL_LABELS } from '../../goals/types'
import { extractPdfText, pdfHash, validatePdfFile } from '../../imports/pdf'
import { conferir, resumoDaConferencia, valoresParaGravar, type ConferenciaDoRelatorio, type ValorLido } from '../../integrated-report/conferencia'
import { ehRelatorioIntegrado, lerRelatorioIntegrado } from '../../integrated-report/leitura'
import { lancamentosDoTrimestre, totalDoDistritoNaMeta } from '../../integrated-report/metas'
import { rotuloCurto } from '../../integrated-report/painel'
import { arquivoEhPdf, FRASE_DO_ENVIO, MENSAGEM_DE_FORMATO } from '../../integrated-report/resumo'
import { RelatorioIntegradoService } from '../../integrated-report/service'
import { rotuloDoTrimestre, type RelatorioIntegradoEntity, type ValorDoIndicador } from '../../integrated-report/types'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { formatarNumero, MarcaDePossivelErro } from './Graficos'

const service = new RelatorioIntegradoService()

export function textoDoValor(valor: ValorDoIndicador): string {
  if (valor.tipo === 'sim_nao') return valor.valor ? 'Sim' : 'Não'
  if (valor.tipo === 'por_sabado') return `2º sábado ${valor.segundo ?? '—'} · 7º sábado ${valor.setimo ?? '—'}`
  if (valor.tipo === 'por_classe') {
    const classes = Object.entries(valor.classes).map(([classe, numero]) => `${classe} ${numero}`).join(' · ')
    return `${formatarNumero(valor.total)} no total${classes ? ` · ${classes}` : ''}`
  }
  return formatarNumero(valor.valor)
}

interface Props {
  accountId: string
  masterKey: CryptoKey
  churches: readonly ChurchEntity[]
  relatorios: readonly RelatorioIntegradoEntity[]
  /** Depois de gravar: a página recarrega, sincroniza as metas e abre o trimestre gravado. */
  aoGravar: (trimestre: string) => Promise<RelatorioIntegradoEntity[]>
}

function marcaDoValor(item: ValorLido, churchId: string, trimestre: string, igreja: string) {
  if (!item.possivelErro || !item.anterior || item.anterior.numero === null || item.numero === null) return null
  return <MarcaDePossivelErro igreja={igreja} erro={{ churchId, trimestre, indicadorId: item.indicador.id, anterior: { trimestre: item.anterior.trimestre, numero: item.anterior.numero }, atual: item.numero }} />
}

/**
 * Enviar um novo relatório, no fim da página.
 *
 * O PDF é aberto na memória e descartado; ficam os números por igreja, todos
 * como vieram. Não há número a aprovar ou recusar: o que muda de forma extrema
 * recebe só um asterisco, e é gravado do mesmo jeito.
 */
export function EnvioDoRelatorio({ accountId, masterKey, churches, relatorios, aoGravar }: Props) {
  const [conferencia, setConferencia] = useState<ConferenciaDoRelatorio | null>(null)
  const [confirmado, setConfirmado] = useState(false)
  const [busy, setBusy] = useState(false)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')

  const resumo = conferencia ? resumoDaConferencia(conferencia) : null
  const nomeDaIgreja = (id: string) => churches.find((church) => church.id === id)?.name ?? 'Igreja'
  const comoFicaria: RelatorioIntegradoEntity[] = !conferencia ? [] : conferencia.igrejas.filter((igreja) => igreja.church).map((igreja) => ({
    id: 'previa', churchId: igreja.church!.id, trimestre: conferencia.trimestre, valores: valoresParaGravar(igreja),
    origem: { arquivo: conferencia.arquivo, paginas: igreja.paginas }, importBatchId: '', createdAt: '', updatedAt: '',
  }))
  const paraMetas = conferencia ? lancamentosDoTrimestre(comoFicaria, conferencia.trimestre) : []

  async function escolherArquivo(arquivo: File | undefined) {
    if (!arquivo) return
    setBusy(true); setErro(''); setAviso(''); setConferencia(null); setConfirmado(false)
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

  async function gravar() {
    if (!conferencia) return
    setBusy(true); setErro('')
    try {
      const lote = crypto.randomUUID()
      let gravadas = 0
      for (const igreja of conferencia.igrejas) {
        if (!igreja.church) continue
        const existente = relatorios.find((item) => item.churchId === igreja.church!.id && item.trimestre === conferencia.trimestre)
        await service.gravar(accountId, masterKey, {
          churchId: igreja.church.id,
          trimestre: conferencia.trimestre,
          valores: valoresParaGravar(igreja),
          origem: { arquivo: conferencia.arquivo, paginas: igreja.paginas },
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
      setConferencia(null); setConfirmado(false)
    } catch (motivo) {
      setErro(motivo instanceof Error ? motivo.message : 'Não foi possível gravar o relatório.')
    } finally { setBusy(false) }
  }

  return <>
    <Card id="enviar" title="Enviar novo relatório" className="ri-envio">
      <p className="card-copy">{FRASE_DO_ENVIO}</p>
      {erro && <div className="alert alert--error" role="alert">{erro}</div>}
      {aviso && <div className="alert alert--success" role="status">{aviso}</div>}
      <label className="field">
        <span className="field__label">Arquivo</span>
        <input className="field__input" type="file" accept=".pdf,application/pdf" disabled={busy} onChange={(evento) => void escolherArquivo(evento.target.files?.[0])} />
      </label>
    </Card>

    {conferencia && <Card eyebrow="Antes de gravar" title={`${rotuloDoTrimestre(conferencia.trimestre)} · ${conferencia.arquivo}`} className="ri-envio">
      {conferencia.jaAplicado && <div className="alert alert--success"><CheckCircle2 />Este arquivo já foi aplicado para este trimestre. Gravar de novo substitui os valores.</div>}
      <div className="ri-envio__resumo">
        <div><small>Igrejas no relatório</small><strong>{conferencia.igrejas.length}</strong></div>
        <div><small>Valores lidos</small><strong>{resumo?.valores ?? 0}</strong></div>
        <div><small>Possíveis erros de digitação</small><strong>{resumo?.possiveisErros ?? 0}</strong></div>
        <div><small>Sem informação</small><strong>{resumo?.semInformacao ?? 0}</strong></div>
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

      {conferencia.naoReconhecidos.length > 0 && <div className="issue-list">
        <h3>Indicadores que o catálogo não conhece</h3>
        {conferencia.naoReconhecidos.map((nome) => <div key={nome}><strong>{nome}</strong><span>Não será gravado.</span></div>)}
      </div>}

      <div className="ri-envio__igrejas">
        {conferencia.igrejas.map((igreja) => {
          const nome = igreja.church?.name ?? igreja.nomeNoRelatorio
          const erros = igreja.valores.filter(({ possivelErro }) => possivelErro).length
          return <details className="ri-dobra" key={igreja.nomeNoRelatorio}>
            <summary>
              <span><strong>{nome}</strong><small>{igreja.church ? `Páginas ${igreja.paginas.join(', ')}` : 'Sem igreja cadastrada'}</small></span>
              <span className="ri-dobra__contas">{igreja.valores.length} valores{erros ? ` · ${erros} *` : ''}{igreja.naoInformados.length ? ` · ${igreja.naoInformados.length} sem informação` : ''}</span>
            </summary>
            <ul className="ri-valores">
              {igreja.valores.map((item) => <li key={item.indicador.id}>
                <span title={item.indicador.rotulo}>{rotuloCurto(item.indicador)}</span>
                <strong>{textoDoValor(item.valor)}{marcaDoValor(item, igreja.church?.id ?? '', conferencia.trimestre, nome)}</strong>
              </li>)}
            </ul>
            {igreja.naoInformados.length > 0 && <>
              <h4 className="ri-dobra__subtitulo">{igreja.naoInformados.length} indicador(es) sem informação</h4>
              <ul className="lista-simples">{igreja.naoInformados.map((indicador) => <li key={indicador.id}>{indicador.rotulo}</li>)}</ul>
            </>}
          </details>
        })}
      </div>

      <label className="confirmation-check">
        <input type="checkbox" checked={confirmado} onChange={(evento) => setConfirmado(evento.target.checked)} />
        <span>Conferi os números acima e autorizo a gravação.</span>
      </label>
      <Button disabled={!confirmado || busy} onClick={() => void gravar()} icon={<Upload size={17} />}>
        {busy ? 'Gravando…' : `Gravar ${rotuloDoTrimestre(conferencia.trimestre)}`}
      </Button>
    </Card>}
  </>
}
