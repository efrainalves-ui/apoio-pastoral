import { CheckCircle2, FileSearch, TriangleAlert, Upload } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { useAuthVault } from '../auth/AuthVaultContext'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { DistrictService } from '../district/service'
import type { ChurchEntity } from '../district/types'
import { extractPdfText, pdfHash, validatePdfFile } from '../imports/pdf'
import { CATALOGO_DO_RELATORIO } from '../integrated-report/catalogo'
import {
  aplicarRecusas, conferir, contarPendencias,
  type ConferenciaDoRelatorio, type IgrejaConferida, type ValorAConferir,
} from '../integrated-report/conferencia'
import { ehRelatorioIntegrado, lerRelatorioIntegrado } from '../integrated-report/leitura'
import { numeroDoValor, RelatorioIntegradoService, totalDoDistrito, valorAtual } from '../integrated-report/service'
import { rotuloDoTrimestre, type RelatorioIntegradoEntity } from '../integrated-report/types'
import { useReloadOnSync } from '../sync/useReloadOnSync'

const service = new RelatorioIntegradoService()
const districtService = new DistrictService()

function textoDoValor(item: ValorAConferir): string {
  const { valor } = item
  if (valor.tipo === 'sim_nao') return valor.valor ? 'Sim' : 'Não'
  if (valor.tipo === 'por_sabado') return `2º sábado ${valor.segundo ?? '—'} · 7º sábado ${valor.setimo ?? '—'}`
  if (valor.tipo === 'por_classe') {
    const classes = Object.entries(valor.classes).map(([classe, numero]) => `${classe} ${numero}`).join(' · ')
    return `${valor.total} no total${classes ? ` · ${classes}` : ''}`
  }
  return String(valor.valor)
}

/**
 * O Relatório Integrado do trimestre, conferido antes de entrar.
 *
 * O PDF é aberto na memória e descartado; o que fica guardado são os números
 * por igreja, depois que o pastor confere. Nenhum número entra sozinho, e os
 * que destoam do trimestre anterior esperam uma decisão dele — um 45 que era 5
 * costuma ser erro de digitação, e gravá-lo em silêncio estraga o total do
 * distrito sem deixar rastro.
 */
export function RelatorioIntegradoPage() {
  const { account, masterKey } = useAuthVault()
  const [churches, setChurches] = useState<ChurchEntity[]>([])
  const [relatorios, setRelatorios] = useState<RelatorioIntegradoEntity[]>([])
  const [conferencia, setConferencia] = useState<ConferenciaDoRelatorio | null>(null)
  const [recusados, setRecusados] = useState<Record<string, string[]>>({})
  const [confirmado, setConfirmado] = useState(false)
  const [busy, setBusy] = useState(false)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')

  const carregar = useCallback(async () => {
    if (!account || !masterKey) return
    setCarregando(true)
    try {
      const district = await districtService.getDistrict(account.id, masterKey)
      const [listaIgrejas, listaRelatorios] = await Promise.all([
        district ? districtService.listChurches(account.id, masterKey, district.id) : [],
        service.listar(account.id, masterKey),
      ])
      setChurches(listaIgrejas)
      setRelatorios(listaRelatorios)
      setErro('')
    } catch (motivo) {
      setErro(motivo instanceof Error ? motivo.message : 'Não foi possível abrir os relatórios.')
    } finally { setCarregando(false) }
  }, [account, masterKey])
  useReloadOnSync(carregar)

  const ativas = useMemo(() => churches.filter(({ status }) => status === 'active'), [churches])
  const trimestres = useMemo(
    () => [...new Set(relatorios.map(({ trimestre }) => trimestre))].sort().reverse(),
    [relatorios],
  )
  const pendencias = conferencia ? contarPendencias(conferencia) : null

  async function escolherArquivo(arquivo: File | undefined) {
    if (!arquivo) return
    setBusy(true); setErro(''); setAviso(''); setConferencia(null); setRecusados({}); setConfirmado(false)
    try {
      validatePdfFile(arquivo)
      const bytes = await arquivo.arrayBuffer()
      const [hash, texto] = await Promise.all([pdfHash(bytes), extractPdfText(bytes)])
      if (!ehRelatorioIntegrado(texto)) {
        throw new Error('Este PDF não parece ser o Relatório Integrado. Nada foi importado.')
      }
      const lido = lerRelatorioIntegrado(texto)
      const jaAplicado = relatorios.some((relatorio) => relatorio.origem.arquivo === arquivo.name && relatorio.trimestre === lido.trimestre)
      setConferencia(conferir(lido, churches, relatorios, arquivo.name, hash, jaAplicado))
    } catch (motivo) {
      setErro(motivo instanceof Error ? motivo.message : 'Não foi possível ler este PDF.')
    } finally { setBusy(false) }
  }

  function alternarRecusa(igreja: IgrejaConferida, indicadorId: string) {
    const chave = igreja.nomeNoRelatorio
    const atuais = recusados[chave] ?? []
    setRecusados({
      ...recusados,
      [chave]: atuais.includes(indicadorId) ? atuais.filter((id) => id !== indicadorId) : [...atuais, indicadorId],
    })
  }

  async function gravar() {
    if (!account || !masterKey || !conferencia) return
    setBusy(true); setErro('')
    try {
      const lote = crypto.randomUUID()
      let gravadas = 0
      for (const igreja of conferencia.igrejas) {
        if (!igreja.church) continue
        const { valores, recusados: fora } = aplicarRecusas(igreja, recusados[igreja.nomeNoRelatorio] ?? [])
        const existente = relatorios.find((item) => item.churchId === igreja.church!.id && item.trimestre === conferencia.trimestre)
        await service.gravar(account.id, masterKey, {
          churchId: igreja.church.id,
          trimestre: conferencia.trimestre,
          valores,
          origem: { arquivo: conferencia.arquivo, paginas: igreja.paginas },
          ...(fora.length ? { recusados: fora } : {}),
          importBatchId: lote,
          createdAt: existente?.createdAt ?? '',
          updatedAt: '',
        }, existente?.id)
        gravadas += 1
      }
      setAviso(`${rotuloDoTrimestre(conferencia.trimestre)} gravado para ${gravadas} igreja(s).`)
      setConferencia(null); setRecusados({}); setConfirmado(false)
      await carregar()
    } catch (motivo) {
      setErro(motivo instanceof Error ? motivo.message : 'Não foi possível gravar o relatório.')
    } finally { setBusy(false) }
  }

  if (carregando) return <div className="app-loading" role="status">Abrindo o Relatório Integrado…</div>

  return <div className="page-stack">
    <header className="page-hero">
      <div><p className="eyebrow">Metas</p><h1>Relatório Integrado</h1></div>
    </header>

    {erro && <div className="alert alert--error" role="alert">{erro}</div>}
    {aviso && <div className="alert alert--success" role="status">{aviso}</div>}

    <Card eyebrow="Etapa 1" title="Enviar o PDF do trimestre">
      <label className="field">
        <span className="field__label">Arquivo</span>
        <input
          className="field__input"
          type="file"
          accept="application/pdf"
          disabled={busy}
          onChange={(evento) => void escolherArquivo(evento.target.files?.[0])}
        />
      </label>
      <p className="field__hint">O arquivo é aberto aqui no aparelho e descartado. Só os números ficam guardados.</p>
    </Card>

    {conferencia && <>
      <Card eyebrow="Etapa 2 · Conferência" title={`${rotuloDoTrimestre(conferencia.trimestre)} · ${conferencia.arquivo}`}>
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
          {conferencia.semRelatorio.map((church) => <div key={church.id}>
            <strong>{church.name}</strong>
            <span>Continua ativa. Os números dela seguem valendo os do último trimestre que informou.</span>
          </div>)}
        </div>}

        {conferencia.semCorrespondencia.length > 0 && <div className="issue-list">
          <h3><TriangleAlert />Nomes sem igreja cadastrada</h3>
          {conferencia.semCorrespondencia.map((nome) => <div key={nome}>
            <strong>{nome}</strong><span>Não será gravado. Cadastre a igreja com este nome e envie o PDF de novo.</span>
          </div>)}
        </div>}

        {conferencia.naoReconhecidos.length > 0 && <div className="issue-list">
          <h3>Indicadores que o catálogo não conhece</h3>
          {conferencia.naoReconhecidos.map((nome) => <div key={nome}><strong>{nome}</strong><span>Não será gravado.</span></div>)}
        </div>}
      </Card>

      {conferencia.igrejas.map((igreja) => {
        const foraDaGravacao = recusados[igreja.nomeNoRelatorio] ?? []
        const conferir = igreja.valores.filter(({ precisaConfirmar }) => precisaConfirmar)
        return <Card
          key={igreja.nomeNoRelatorio}
          eyebrow={igreja.church ? `Páginas ${igreja.paginas.join(', ')}` : 'Sem igreja cadastrada'}
          title={igreja.church?.name ?? igreja.nomeNoRelatorio}
        >
          {conferir.length > 0 && <div className="issue-list">
            <h3><TriangleAlert />Valores fora do padrão</h3>
            {conferir.map((item) => <div key={item.indicador.id}>
              <strong>{item.indicador.rotulo}</strong>
              <span>
                {rotuloDoTrimestre(item.anterior!.trimestre)}: {item.anterior!.numero} · agora: {item.numero}
              </span>
              <label className="confirmation-check">
                <input
                  type="checkbox"
                  checked={foraDaGravacao.includes(item.indicador.id)}
                  onChange={() => alternarRecusa(igreja, item.indicador.id)}
                />
                <span>Não gravar este número. O indicador continua valendo o trimestre anterior.</span>
              </label>
            </div>)}
          </div>}

          <details>
            <summary>Ver os {igreja.valores.length} valores lidos</summary>
            <div className="entity-list">
              {igreja.valores.map((item) => <div className="entity-row entity-row--texto" key={item.indicador.id}>
                <span>
                  <strong>{item.indicador.rotulo}</strong>
                  <small>{item.indicador.secao} · {item.indicador.tratamento === 'somar' ? 'soma no período' : 'situação da igreja'}</small>
                </span>
                <span className={foraDaGravacao.includes(item.indicador.id) ? 'valor-pendente' : ''}>
                  {foraDaGravacao.includes(item.indicador.id) ? 'recusado' : textoDoValor(item)}
                </span>
              </div>)}
            </div>
          </details>

          {igreja.naoInformados.length > 0 && <details>
            <summary>{igreja.naoInformados.length} indicador(es) sem informação</summary>
            <ul className="lista-simples">
              {igreja.naoInformados.map((indicador) => <li key={indicador.id}>{indicador.rotulo}</li>)}
            </ul>
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

    {!conferencia && <Card eyebrow="Guardado" title="Situação do distrito">
      {relatorios.length === 0
        ? <div className="empty-state"><FileSearch /><strong>Nenhum relatório guardado</strong><span>Envie o PDF de um trimestre para começar.</span></div>
        : <>
          <p className="field__hint">
            {relatorios.length} relatório(s) · {trimestres.map(rotuloDoTrimestre).join(' · ')}
          </p>
          <div className="rolagem-tabela">
            <table className="tabela-simples">
              <thead>
                <tr><th>Indicador</th><th>Tratamento</th><th>Distrito</th></tr>
              </thead>
              <tbody>
                {CATALOGO_DO_RELATORIO.map((indicador) => {
                  const total = totalDoDistrito(relatorios, indicador.id, ativas.map(({ id }) => id))
                  if (total === null) return null
                  return <tr key={indicador.id}>
                    <td>{indicador.rotulo}</td>
                    <td>{indicador.tratamento === 'somar' ? 'Soma no período' : 'Mais recente'}</td>
                    <td className="numero-tabela">{total}</td>
                  </tr>
                })}
              </tbody>
            </table>
          </div>
        </>}
    </Card>}

    {!conferencia && relatorios.length > 0 && <Card eyebrow="Por igreja" title="Último valor informado">
      <div className="entity-list">
        {ativas.map((church) => {
          const ultimo = relatorios.filter(({ churchId }) => churchId === church.id).at(-1)
          const pgs = valorAtual(relatorios, church.id, 'escola-sabatina--numero-de-pequenos-grupos-da-igreja')
          return <div className="entity-row entity-row--texto" key={church.id}>
            <span>
              <strong>{church.name}</strong>
              <small>{ultimo ? rotuloDoTrimestre(ultimo.trimestre) : 'Nenhum relatório guardado'}</small>
            </span>
            <span>{pgs ? `${numeroDoValor(pgs.valor)} Pequenos Grupos` : '—'}</span>
          </div>
        })}
      </div>
    </Card>}
  </div>
}
