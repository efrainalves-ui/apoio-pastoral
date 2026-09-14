import { CheckCircle2, FileSearch, TriangleAlert, Upload } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { useAuthVault } from '../auth/AuthVaultContext'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { DistrictService } from '../district/service'
import { GoalsService } from '../goals/service'
import { GOAL_LABELS } from '../goals/types'
import { lancamentosDoTrimestre, mesesDoTrimestre, METRICAS_DO_RELATORIO, totalDoDistritoNaMeta } from '../integrated-report/metas'
import { conferirCampanhas, contarDivergencias } from '../integrated-report/campanhas'
import { EvangelismPlanningService } from '../evangelism/service'
import type { EvangelismCampaignEntity } from '../evangelism/types'
import type { ChurchEntity } from '../district/types'
import { extractPdfText, pdfHash, validatePdfFile } from '../imports/pdf'
import { CATALOGO_DO_RELATORIO } from '../integrated-report/catalogo'
import {
  aplicarDecisoes, conferir, contarPendencias, estaPendente,
  type ConferenciaDoRelatorio, type DecisaoSobreValor, type DecisoesDaIgreja,
  type IgrejaConferida, type ValorAConferir,
} from '../integrated-report/conferencia'
import { ehRelatorioIntegrado, lerRelatorioIntegrado } from '../integrated-report/leitura'
import { arquivoEhPdf, MENSAGEM_DE_FORMATO } from '../integrated-report/resumo'
import { OrientacaoDoRelatorioIntegrado } from '../components/RelatorioIntegradoAcesso'
import { numeroDoValor, RelatorioIntegradoService, totalDoDistrito, valorAtual } from '../integrated-report/service'
import { rotuloDoTrimestre, type RelatorioIntegradoEntity } from '../integrated-report/types'
import { useReloadOnSync } from '../sync/useReloadOnSync'

const service = new RelatorioIntegradoService()
const districtService = new DistrictService()
const metas = new GoalsService()
const evangelismo = new EvangelismPlanningService()

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
  const [campanhas, setCampanhas] = useState<EvangelismCampaignEntity[]>([])
  const [conferencia, setConferencia] = useState<ConferenciaDoRelatorio | null>(null)
  /*
    A decisão de cada valor que destoa, por igreja. Nasce vazia — o que equivale
    a pendente —, e pendente não grava.
  */
  const [decisoes, setDecisoes] = useState<Record<string, DecisoesDaIgreja>>({})
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
      const [listaIgrejas, listaRelatorios, listaCampanhas] = await Promise.all([
        district ? districtService.listChurches(account.id, masterKey, district.id) : [],
        service.listar(account.id, masterKey),
        evangelismo.listCampaigns(account.id, masterKey),
      ])
      setChurches(listaIgrejas)
      setRelatorios(listaRelatorios)
      setCampanhas(listaCampanhas)
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
  /* Recusado e pendente são estados diferentes, e contam separado. */
  const contarPorTipo = (tipo: DecisaoSobreValor['tipo']) => !conferencia ? 0 : conferencia.igrejas
    .reduce((total, igreja) => total + aplicarDecisoes(igreja, decisoes[igreja.nomeNoRelatorio] ?? {})[
      tipo === 'recusado' ? 'recusados' : tipo === 'corrigido' ? 'corrigidos' : 'pendentes'].length, 0)
  const recusadosAgora = contarPorTipo('recusado')
  const pendentesAgora = contarPorTipo('pendente')
  const corrigidosAgora = contarPorTipo('corrigido')
  const nomeDaIgrejaPorId = (id: string) => churches.find((church) => church.id === id)?.name ?? 'Igreja'
  /*
    A prévia das metas parte da conferência já com as recusas aplicadas: o que o
    pastor bloqueou não pode aparecer aqui como se fosse entrar.
  */
  const paraMetas = useMemo(() => {
    if (!conferencia) return []
    const comoFicaria = conferencia.igrejas
      .filter((igreja) => igreja.church)
      .map((igreja) => ({
        id: 'previa', churchId: igreja.church!.id, trimestre: conferencia.trimestre,
        ...aplicarDecisoes(igreja, decisoes[igreja.nomeNoRelatorio] ?? {}),
        origem: { arquivo: conferencia.arquivo, paginas: igreja.paginas },
        importBatchId: '', createdAt: '', updatedAt: '',
      }))
    return lancamentosDoTrimestre(comoFicaria, conferencia.trimestre)
  }, [conferencia, decisoes])

  /*
    As campanhas não são criadas nem unidas pelo relatório: o pastor pediu que o
    aplicativo apenas diga se já existe campanha cadastrada para aquela igreja
    naquele trimestre. Onde o número declarado não bate com o cadastrado, a
    diferença aparece para ele decidir — comparada por igreja e por data, nunca
    pelo nome, que se repete entre anos e igrejas.
  */
  const conferenciaDeCampanhas = useMemo(() => {
    if (!conferencia) return []
    const comoFicaria = conferencia.igrejas
      .filter((igreja) => igreja.church)
      .map((igreja) => ({
        id: 'previa', churchId: igreja.church!.id, trimestre: conferencia.trimestre,
        ...aplicarDecisoes(igreja, decisoes[igreja.nomeNoRelatorio] ?? {}),
        origem: { arquivo: conferencia.arquivo, paginas: igreja.paginas },
        importBatchId: '', createdAt: '', updatedAt: '',
      }))
    return conferirCampanhas(comoFicaria, campanhas, conferencia.trimestre)
  }, [conferencia, decisoes, campanhas])

  async function escolherArquivo(arquivo: File | undefined) {
    if (!arquivo) return
    setBusy(true); setErro(''); setAviso(''); setConferencia(null); setDecisoes({}); setConfirmado(false)
    try {
      // Word, planilha e imagem não entram direto; nenhum conversor aqui, só o pedido de converter.
      if (!arquivoEhPdf(arquivo)) throw new Error(MENSAGEM_DE_FORMATO)
      validatePdfFile(arquivo)
      const bytes = await arquivo.arrayBuffer()
      const [hash, texto] = await Promise.all([pdfHash(bytes), extractPdfText(bytes)])
      if (!ehRelatorioIntegrado(texto)) {
        throw new Error('Este PDF não parece ser o Relatório Integrado respondido. Se ele foi escaneado sem texto ou OCR, não pode ser reconhecido. Nada foi importado.')
      }
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
    if (!account || !masterKey || !conferencia) return
    setBusy(true); setErro('')
    try {
      const lote = crypto.randomUUID()
      let gravadas = 0
      for (const igreja of conferencia.igrejas) {
        if (!igreja.church) continue
        const { valores, recusados: fora } = aplicarDecisoes(igreja, decisoes[igreja.nomeNoRelatorio] ?? {})
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
      /*
        As metas saem do que ficou gravado, não do que estava na tela.

        Reler antes de lançar é o que torna o reenvio seguro: `replaceReportEntries`
        apaga o que este relatório lançou naqueles três meses e lança de novo, então
        enviar o mesmo arquivo duas vezes não dobra o progresso da meta. E como o
        cálculo parte do que está guardado, repetir a operação depois de uma falha
        chega ao mesmo resultado.
      */
      const guardados = await service.listar(account.id, masterKey)
      const lancamentos = lancamentosDoTrimestre(guardados, conferencia.trimestre)
      const { ano, meses } = mesesDoTrimestre(conferencia.trimestre)
      await metas.replaceReportEntries(account.id, masterKey, METRICAS_DO_RELATORIO, [{ ano, meses }], lancamentos)

      const total = totalDoDistritoNaMeta(lancamentos, 'bible_studies')
      setAviso(`${rotuloDoTrimestre(conferencia.trimestre)} gravado para ${gravadas} igreja(s). ${GOAL_LABELS.bible_studies}: ${total} no distrito.`)
      setConferencia(null); setDecisoes({}); setConfirmado(false)
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
      <OrientacaoDoRelatorioIntegrado />
      <label className="field">
        <span className="field__label">Arquivo</span>
        <input
          className="field__input"
          type="file"
          accept=".pdf,application/pdf"
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

        {/*
          O que vai para as metas, antes de gravar. Um número que entra em meta
          muda o progresso do ano: o pastor precisa ver qual meta, de qual
          indicador e quanto, enquanto ainda pode recusar.
        */}
        <div className="issue-list">
          <h3>O que vai para as Metas</h3>
          {paraMetas.length === 0
            ? <div><strong>Nada</strong><span>Nenhuma igreja informou os indicadores que alimentam meta neste trimestre.</span></div>
            : paraMetas.map((linha) => <div key={`${linha.churchId}-${linha.metric}`}>
                <strong>{nomeDaIgrejaPorId(linha.churchId)} · {GOAL_LABELS[linha.metric]}</strong>
                <span>{linha.amount} · {linha.reference.split(' · ').slice(3).join(' · ')}</span>
              </div>)}
          {paraMetas.length > 0 && <div>
            <strong>Total do distrito · {GOAL_LABELS.bible_studies}</strong>
            <span>{totalDoDistritoNaMeta(paraMetas, 'bible_studies')}, somando as igrejas acima. Reenviar este relatório substitui estes lançamentos, não os duplica.</span>
          </div>}
        </div>

        {/*
          Cobertura junto dos totais: um total sem saber de quantas igrejas ele
          veio é um número que parece maior ou menor do que é.
        */}
        <div className="import-metrics">
          <div><small>Igrejas esperadas</small><strong>{ativas.length}</strong></div>
          <div><small>Enviaram relatório</small><strong>{conferencia.igrejas.filter((igreja) => igreja.church).length}</strong></div>
          <div><small>Sem informação</small><strong>{pendencias?.semInformacao ?? 0}</strong></div>
          <div><small>Confirmados</small><strong>{pendencias?.prontos ?? 0}</strong></div>
          <div><small>Pendentes</small><strong>{pendentesAgora}</strong></div>
          <div><small>Corrigidos</small><strong>{corrigidosAgora}</strong></div>
          <div><small>Recusados</small><strong>{recusadosAgora}</strong></div>
        </div>

        {contarDivergencias(conferenciaDeCampanhas) > 0 && <div className="issue-list">
          <h3><TriangleAlert />Campanhas: o declarado não bate com o cadastrado</h3>
          {conferenciaDeCampanhas.filter(({ situacao }) => situacao !== 'confere').map((linha) => <div key={linha.churchId}>
            <strong>{nomeDaIgrejaPorId(linha.churchId)}</strong>
            <span>
              Declarou {linha.declaradas} campanha(s) neste trimestre; há {linha.cadastradas.length} cadastrada(s).
              {linha.cadastradas.length > 0 ? ` (${linha.cadastradas.map(({ name }) => name).join(', ')})` : ''}
              {' '}Nada é criado nem unido: confira e cadastre o que faltar.
            </span>
          </div>)}
        </div>}

        {conferencia.naoReconhecidos.length > 0 && <div className="issue-list">
          <h3>Indicadores que o catálogo não conhece</h3>
          {conferencia.naoReconhecidos.map((nome) => <div key={nome}><strong>{nome}</strong><span>Não será gravado.</span></div>)}
        </div>}
      </Card>

      {conferencia.igrejas.map((igreja) => {
        const decididos = decisoes[igreja.nomeNoRelatorio] ?? {}
        const conferir = igreja.valores.filter(({ precisaConfirmar }) => precisaConfirmar)
        return <Card
          key={igreja.nomeNoRelatorio}
          eyebrow={igreja.church ? `Páginas ${igreja.paginas.join(', ')}` : 'Sem igreja cadastrada'}
          title={igreja.church?.name ?? igreja.nomeNoRelatorio}
        >
          {conferir.length > 0 && <div className="issue-list">
            <h3><TriangleAlert />Valores fora do padrão</h3>
            {/*
              Quatro destinos: aprovar o que está no papel, escrever o número
              certo, recusar, ou deixar para depois. Nasce em "decidir depois",
              e nesse estado não grava — mas continua à vista.
            */}
            {conferir.map((item) => {
              const decisao = decisaoDe(igreja, item.indicador.id)
              return <div key={item.indicador.id}>
                <strong>{item.indicador.rotulo}</strong>
                <span>
                  {rotuloDoTrimestre(item.anterior!.trimestre)}: {item.anterior!.numero} · agora: {item.numero}
                  {' · '}{conferencia.arquivo}, página{igreja.paginas.length > 1 ? 's' : ''} {igreja.paginas.join(', ')}
                </span>
                <div className="decisao-do-valor" role="group" aria-label={`Decisão sobre ${item.indicador.rotulo} em ${igreja.church?.name ?? igreja.nomeNoRelatorio}`}>
                  <Button
                    variant={decisao.tipo === 'aprovado' ? 'primary' : 'secondary'}
                    onClick={() => decidir(igreja, item.indicador.id, { tipo: 'aprovado' })}
                  >Aprovar {item.numero}</Button>
                  <Button
                    variant={decisao.tipo === 'recusado' ? 'danger' : 'secondary'}
                    onClick={() => decidir(igreja, item.indicador.id, { tipo: 'recusado' })}
                  >Recusar</Button>
                  <Button
                    variant={decisao.tipo === 'pendente' ? 'primary' : 'quiet'}
                    onClick={() => decidir(igreja, item.indicador.id, { tipo: 'pendente' })}
                  >Decidir depois</Button>
                  <label className="field field--inline">
                    <span className="field__label">Corrigir para</span>
                    <input
                      className="field__input campo-da-divisao"
                      type="number"
                      min="0"
                      aria-label={`Valor corrigido de ${item.indicador.rotulo} em ${igreja.church?.name ?? igreja.nomeNoRelatorio}`}
                      value={decisao.tipo === 'corrigido' ? decisao.valor : ''}
                      onChange={(evento) => decidir(igreja, item.indicador.id, evento.target.value === ''
                        ? { tipo: 'pendente' }
                        : { tipo: 'corrigido', valor: Number(evento.target.value) })}
                    />
                  </label>
                </div>
              </div>
            })}
          </div>}

          <details>
            <summary>Ver os {igreja.valores.length} valores lidos</summary>
            <div className="entity-list">
              {igreja.valores.map((item) => <div className="entity-row entity-row--texto" key={item.indicador.id}>
                <span>
                  <strong>{item.indicador.rotulo}</strong>
                  <small>{item.indicador.secao} · {item.indicador.tratamento === 'somar' ? 'soma no período' : 'situação da igreja'}</small>
                </span>
                <span className={estaPendente(item, decididos) || decididos[item.indicador.id]?.tipo === 'recusado' ? 'valor-pendente' : ''}>
                  {decididos[item.indicador.id]?.tipo === 'recusado' ? 'recusado'
                    : decididos[item.indicador.id]?.tipo === 'corrigido' ? `corrigido para ${decididos[item.indicador.id]!.tipo === 'corrigido' ? (decididos[item.indicador.id] as { valor: number }).valor : ''}`
                      : estaPendente(item, decididos) ? 'pendente'
                        : textoDoValor(item)}
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
