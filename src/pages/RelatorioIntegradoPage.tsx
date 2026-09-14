import { ArrowRight, CheckCircle2, FileSearch } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuthVault } from '../auth/AuthVaultContext'
import { BarrasPorIgreja, BarrasTrimestrais, formatarNumero, SituacaoDoValor, Variacao } from '../components/relatorio-integrado/Graficos'
import { EnvioDoRelatorio, textoDoValor } from '../components/relatorio-integrado/EnvioDoRelatorio'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { DistrictService } from '../district/service'
import type { ChurchEntity } from '../district/types'
import { EvangelismPlanningService } from '../evangelism/service'
import type { EvangelismCampaignEntity } from '../evangelism/types'
import { origemDosEstudos } from '../goals/areas'
import { GoalsService } from '../goals/service'
import type { GoalEntryEntity } from '../goals/types'
import { CAMPANHAS_NO_RELATORIO } from '../integrated-report/campanhas'
import { CATALOGO_DO_RELATORIO, indicadorPorId } from '../integrated-report/catalogo'
import {
  campanhasParaRegistrar, diferencasDeCadastro, PEQUENOS_GRUPOS, UNIDADES_DE_ACAO,
  type CampanhasParaRegistrar, type DiferencaDeCadastro,
} from '../integrated-report/ligacoes'
import {
  anosDosRelatorios, AREAS_DO_RELATORIO, comparacaoDoPeriodo, comparar, coberturaDoPeriodo, entregasDoAno, estudosDoPeriodo,
  faixasDoIndicador, historicoDeEnvios, INDICADORES_NUMERICOS, leituraDaIgreja, leituraDoDistrito, rotuloCurtoDoTrimestre,
  serieTrimestral, trimestreAnterior, valoresAguardando, type Leitura, type LeituraDoDistrito, type Periodo, type ValorAguardando,
} from '../integrated-report/painel'
import { RelatorioIntegradoService } from '../integrated-report/service'
import { sincronizarMetas } from '../integrated-report/sincronizarMetas'
import { rotuloDoTrimestre, type RelatorioIntegradoEntity } from '../integrated-report/types'
import { MissionaryService } from '../missionary/service'
import { useReloadOnSync } from '../sync/useReloadOnSync'

const service = new RelatorioIntegradoService()
const districtService = new DistrictService()
const metas = new GoalsService()
const evangelismo = new EvangelismPlanningService()
const missionary = new MissionaryService()

const ESTUDOS_GERAIS = 'ministerio-pessoal--numero-de-pessoas-recebendo-estudos-biblicos'
const ALUNOS = 'escola-sabatina--numero-de-alunos-da-escola-sabatina'
const TREINAMENTOS = 'ministerio-pessoal--numero-de-treinamentos-encontros-missionarios'

/** O que aparece na evolução quando nenhuma área está filtrada. */
const PRINCIPAIS = [
  ESTUDOS_GERAIS, 'acao-solidaria-adventista--numero-de-pessoas-recebendo-estudos-biblicos-pela-asa', PEQUENOS_GRUPOS, UNIDADES_DE_ACAO, ALUNOS,
  'escola-sabatina--numero-de-alunos-presentes', 'escola-sabatina--numero-de-professores-em-cada-classe', CAMPANHAS_NO_RELATORIO,
  'ministerio-pessoal--numero-de-classes-biblicas-em-funcionamento', 'ministerio-pessoal--numero-de-duplas-missionarias-ministrando-estudos-biblicos',
  TREINAMENTOS, 'secretaria--numero-de-presentes-no-culto-divino',
]

const DESTAQUES: ReadonlyArray<{ id: string; rotulo: string }> = [
  { id: PEQUENOS_GRUPOS, rotulo: 'Pequenos Grupos' },
  { id: UNIDADES_DE_ACAO, rotulo: 'Unidades de Ação' },
  { id: ALUNOS, rotulo: 'Alunos da Escola Sabatina' },
  { id: CAMPANHAS_NO_RELATORIO, rotulo: 'Campanhas evangelísticas' },
]

const ABAS: ReadonlyArray<{ trimestre: number | null; rotulo: string }> = [
  { trimestre: 1, rotulo: '1º trimestre' }, { trimestre: 2, rotulo: '2º trimestre' }, { trimestre: 3, rotulo: '3º trimestre' },
  { trimestre: 4, rotulo: '4º trimestre' }, { trimestre: null, rotulo: 'Ano completo' },
]

/** Um número do distrito, ou o motivo de não haver número. */
function NumeroDoDistrito({ leitura, igrejas }: { leitura: LeituraDoDistrito; igrejas: number }) {
  if (leitura.numero !== null) return <>{formatarNumero(leitura.numero)}</>
  const situacao = leitura.semRelatorio === igrejas ? 'sem_relatorio' : leitura.aguardando > 0 ? 'aguardando' : leitura.recusados > 0 ? 'recusado' : 'nao_respondido'
  return <span className="ri-sem-numero">—<SituacaoDoValor situacao={situacao} /></span>
}

function textoDaLeitura(leitura: Leitura): string {
  if (leitura.situacao === 'informado') return leitura.valor && leitura.trimestre && leitura.valor.tipo !== 'por_classe' ? textoDoValor(leitura.valor) : leitura.numero === null ? '—' : formatarNumero(leitura.numero)
  if (leitura.situacao === 'aguardando') return `${leitura.numero ?? '—'} · aguardando`
  return leitura.situacao === 'sem_relatorio' ? 'sem relatório' : leitura.situacao === 'recusado' ? 'recusado' : 'não respondido'
}

/** O número anterior e o atual, com os trimestres, ao lado da diferença. */
function DeParaAntes({ c }: { c: { anterior: number | null; atual: number | null; de: string | null; para: string | null } }) {
  if (!c.de || !c.para || c.anterior === null || c.atual === null) return null
  return <small className="ri-destaque__antes">{rotuloCurtoDoTrimestre(c.de)}: {formatarNumero(c.anterior)} → {rotuloCurtoDoTrimestre(c.para)}: {formatarNumero(c.atual)}</small>
}

export function RelatorioIntegradoPage() {
  const { account, masterKey } = useAuthVault()
  const location = useLocation()
  const anoCorrente = new Date().getFullYear()
  const [churches, setChurches] = useState<ChurchEntity[]>([])
  const [relatorios, setRelatorios] = useState<RelatorioIntegradoEntity[]>([])
  const [campanhas, setCampanhas] = useState<EvangelismCampaignEntity[]>([])
  const [entries, setEntries] = useState<GoalEntryEntity[]>([])
  const [nominais, setNominais] = useState<Array<{ churchId: string; startedAt: string }>>([])
  const [classes, setClasses] = useState<Array<{ churchId: string }>>([])
  const [grupos, setGrupos] = useState<Array<{ churchId: string; active: boolean }>>([])
  const [ano, setAno] = useState(anoCorrente)
  const [abaEscolhida, setAba] = useState<number | null | undefined>(undefined)
  const [igrejaId, setIgrejaId] = useState('')
  const [area, setArea] = useState('')
  const [indicadorId, setIndicadorId] = useState(ESTUDOS_GERAIS)
  const [carregando, setCarregando] = useState(true)
  const [busy, setBusy] = useState(false)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [correcoes, setCorrecoes] = useState<Record<string, string>>({})
  const [confirmandoCampanhas, setConfirmandoCampanhas] = useState('')
  const carregou = useRef(false)

  const carregar = useCallback(async (): Promise<RelatorioIntegradoEntity[]> => {
    if (!account || !masterKey) return []
    if (!carregou.current) setCarregando(true)
    try {
      const district = await districtService.getDistrict(account.id, masterKey)
      const [listaIgrejas, listaRelatorios, listaCampanhas, listaEstudos, listaClasses, listaGrupos] = await Promise.all([
        district ? districtService.listChurches(account.id, masterKey, district.id) : [],
        service.listar(account.id, masterKey),
        evangelismo.listCampaigns(account.id, masterKey),
        missionary.listStudies(account.id, masterKey),
        missionary.listClasses(account.id, masterKey),
        missionary.listSmallGroups(account.id, masterKey),
      ])
      // O relatório já guardado é levado às metas aqui, sem novo envio: só o trimestre que diverge é regravado.
      const recalculados = await sincronizarMetas(account.id, masterKey, listaRelatorios, metas)
      if (recalculados.length) setAviso(`Metas atualizadas: ${recalculados.map(rotuloDoTrimestre).join(', ')}.`)
      setEntries(await metas.listEntries(account.id, masterKey))
      setChurches(listaIgrejas); setRelatorios(listaRelatorios); setCampanhas(listaCampanhas)
      setNominais(listaEstudos); setClasses(listaClasses); setGrupos(listaGrupos)
      setErro('')
      return listaRelatorios
    } catch (motivo) {
      setErro(motivo instanceof Error ? motivo.message : 'Não foi possível abrir os relatórios.')
      return []
    } finally { carregou.current = true; setCarregando(false) }
  }, [account, masterKey])
  const recarregar = useCallback(async () => { await carregar() }, [carregar])
  useReloadOnSync(recarregar)

  useEffect(() => {
    if (!carregando && location.hash === '#enviar') document.getElementById('enviar')?.scrollIntoView({ block: 'start' })
  }, [carregando, location.hash])

  const ativas = useMemo(() => churches.filter(({ status }) => status === 'active'), [churches])
  const idsAtivos = useMemo(() => ativas.map(({ id }) => id), [ativas])
  const nomeDaIgreja = (id: string) => churches.find((church) => church.id === id)?.name ?? 'Igreja'
  const anos = anosDosRelatorios(relatorios, anoCorrente)
  const trimestrePadrao = [4, 3, 2, 1].find((numero) => relatorios.some(({ trimestre }) => trimestre === `${ano}-${numero}`)) ?? null
  const aba = abaEscolhida === undefined ? trimestrePadrao : abaEscolhida
  const periodo: Periodo = { ano, trimestre: aba }
  const igrejas = igrejaId ? [igrejaId] : idsAtivos
  const indicadoresDaArea = area ? INDICADORES_NUMERICOS.filter(({ secao }) => secao === area) : INDICADORES_NUMERICOS
  const indicador = indicadorPorId(indicadorId)

  const aguardando = valoresAguardando(relatorios.filter(({ churchId }) => idsAtivos.includes(churchId)), ano)
  const cadastroDaIgreja = (churchId: string) => ({
    unidades: classes.filter((classe) => classe.churchId === churchId).length,
    pequenosGrupos: grupos.filter((grupo) => grupo.churchId === churchId && grupo.active).length,
  })
  const diferencas = diferencasDeCadastro(relatorios, idsAtivos, ano, cadastroDaIgreja).filter(({ conferida }) => !conferida)
  const paraRegistrar = campanhasParaRegistrar(relatorios.filter(({ churchId }) => idsAtivos.includes(churchId)), campanhas, ano).filter(({ faltam }) => faltam > 0)
  const aCompletar = campanhas.filter(({ aCompletar: marca, origemRelatorio }) => marca && origemRelatorio?.trimestre.startsWith(`${ano}-`))

  async function agir(acao: () => Promise<unknown>, mensagem: string) {
    if (!account || !masterKey) return
    setBusy(true); setErro(''); setAviso('')
    try { await acao(); await carregar(); setAviso(mensagem) } catch (motivo) {
      setErro(motivo instanceof Error ? motivo.message : 'Não foi possível concluir.')
    } finally { setBusy(false) }
  }

  const decidir = (item: ValorAguardando, decisao: Parameters<RelatorioIntegradoService['decidirPendente']>[4]) =>
    agir(() => service.decidirPendente(account!.id, masterKey!, item.relatorio.id, item.indicadorId, decisao), decisao.tipo === 'recusado' ? 'Valor recusado.' : 'Valor confirmado.')
  const conferir = (diferenca: DiferencaDeCadastro) =>
    agir(() => service.marcarConferido(account!.id, masterKey!, diferenca.relatorioId, diferenca.indicadorId, { relatorio: diferenca.relatorio, cadastro: diferenca.cadastro }), 'Diferença conferida.')
  const cadastrarCampanhas = (linha: CampanhasParaRegistrar) =>
    agir(async () => { await evangelismo.criarCampanhasACompletar(account!.id, masterKey!, [linha]); setConfirmandoCampanhas('') }, `${linha.faltam} campanha(s) a completar criada(s) no Evangelismo.`)

  if (carregando) return <div className="app-loading" role="status">Abrindo o Relatório Integrado…</div>

  const envio = account && masterKey
    ? <EnvioDoRelatorio
        accountId={account.id} masterKey={masterKey} churches={churches} relatorios={relatorios} campanhas={campanhas}
        aoGravar={async (trimestre) => { const guardados = await carregar(); setAno(Number(trimestre.slice(0, 4))); setAba(Number(trimestre.slice(5))); return guardados }}
      />
    : null

  const cobertura = coberturaDoPeriodo(relatorios, idsAtivos, periodo)
  const estudos = estudosDoPeriodo(relatorios, igrejas, periodo)
  const comparacaoDosEstudos = (() => {
    if (aba !== null) {
      const antes = trimestreAnterior(ano, aba)
      return { ...comparar(estudosDoPeriodo(relatorios, igrejas, antes), estudos), de: `${antes.ano}-${antes.trimestre}`, para: `${ano}-${aba}` }
    }
    const comNumero = [1, 2, 3, 4].map((trimestre) => ({ trimestre: `${ano}-${trimestre}`, numero: estudosDoPeriodo(relatorios, igrejas, { ano, trimestre }) })).filter(({ numero }) => numero !== null)
    const [penultimo, ultimo] = comNumero.slice(-2)
    return { ...comparar(penultimo?.numero ?? null, ultimo?.numero ?? null), de: penultimo?.trimestre ?? null, para: ultimo?.trimestre ?? null }
  })()
  const origem = origemDosEstudos({ entries, studies: nominais, uapgs: [] }, ano)
  const serie = serieTrimestral(relatorios, igrejas, indicadorId, ano)
  const faixas = faixasDoIndicador(relatorios, igrejas, ALUNOS, periodo)
  const anterioresDaSerie = serie.map((_, indice) => indice === 0 ? leituraDoDistrito(relatorios, igrejas, indicadorId, { ano: ano - 1, trimestre: 4 }) : serie[indice - 1]!)
  const evolucao = area ? indicadoresDaArea.map(({ id }) => id) : PRINCIPAIS
  const rotuloDoPeriodo = aba === null ? `Ano de ${ano}` : `${aba}º trimestre de ${ano}`
  const pendentesTotal = aguardando.length + diferencas.length

  return <div className="page-stack ri">
    <header className="page-hero ri-topo">
      <div><p className="eyebrow">Metas</p><h1>Relatório Integrado</h1></div>
      <label className="field ri-ano">
        <span className="field__label">Ano</span>
        <select className="field__input" value={ano} onChange={(evento) => { setAno(Number(evento.target.value)); setAba(undefined) }}>
          {anos.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </label>
    </header>

    {erro && <div className="alert alert--error" role="alert">{erro}</div>}
    {aviso && <div className="alert alert--success" role="status">{aviso}</div>}

    {/* O envio fica sempre na mesma posição da árvore: sem isso, o primeiro relatório gravado trocava o layout e apagava a confirmação. */}
    {relatorios.length === 0 ? <Card><div className="empty-state"><FileSearch /><strong>Nenhum relatório guardado</strong></div></Card> : <>

    <div className="segmented ri-abas" role="tablist" aria-label="Período">
      {ABAS.map(({ trimestre, rotulo }) => <button
        key={rotulo} type="button" role="tab" aria-selected={aba === trimestre}
        className={aba === trimestre ? 'active' : ''} onClick={() => setAba(trimestre)}
      >{rotulo}</button>)}
    </div>

    <div className="ri-filtros">
      <label className="field"><span className="field__label">Igreja</span>
        <select className="field__input" value={igrejaId} onChange={(evento) => setIgrejaId(evento.target.value)}>
          <option value="">Distrito</option>
          {ativas.map((church) => <option key={church.id} value={church.id}>{church.name}</option>)}
        </select>
      </label>
      <label className="field"><span className="field__label">Área</span>
        <select className="field__input" value={area} onChange={(evento) => {
          setArea(evento.target.value)
          const primeiro = INDICADORES_NUMERICOS.find(({ secao }) => !evento.target.value || secao === evento.target.value)
          if (primeiro && evento.target.value && indicador?.secao !== evento.target.value) setIndicadorId(primeiro.id)
        }}>
          <option value="">Todas</option>
          {AREAS_DO_RELATORIO.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </label>
      <label className="field"><span className="field__label">Indicador</span>
        <select className="field__input" value={indicadorId} onChange={(evento) => setIndicadorId(evento.target.value)}>
          {indicadoresDaArea.map((item) => <option key={item.id} value={item.id}>{item.rotulo}</option>)}
        </select>
      </label>
    </div>

    <section className="ri-destaques" aria-label={`Principais números · ${rotuloDoPeriodo}`}>
      <article className="ri-destaque ri-destaque--principal">
        <small>Estudos bíblicos</small>
        <strong>{estudos === null ? '—' : formatarNumero(estudos)}</strong>
        <Variacao comparacao={comparacaoDosEstudos} />
        <DeParaAntes c={comparacaoDosEstudos} />
        <small className="ri-destaque__nota">Gerais e ASA · soma</small>
      </article>
      {DESTAQUES.map(({ id, rotulo }) => {
        const leitura = leituraDoDistrito(relatorios, igrejas, id, periodo)
        const comparacao = comparacaoDoPeriodo(relatorios, igrejas, id, periodo)
        const somar = indicadorPorId(id)?.tratamento === 'somar'
        return <article className="ri-destaque" key={id}>
          <small>{rotulo}</small>
          <strong><NumeroDoDistrito leitura={leitura} igrejas={igrejas.length} /></strong>
          <Variacao comparacao={comparacao} />
          <DeParaAntes c={comparacao} />
          <small className="ri-destaque__nota">{somar ? 'Soma' : aba === null && leitura.trimestre ? `Último trimestre · ${rotuloCurtoDoTrimestre(leitura.trimestre)}` : 'Último trimestre'}{leitura.aguardando > 0 ? ` · ${leitura.aguardando} aguardando` : ''}</small>
        </article>
      })}
      <article className="ri-destaque">
        <small>Igrejas que responderam</small>
        <strong>{cobertura.responderam.length}<span className="ri-destaque__de">/{idsAtivos.length}</span></strong>
        <small className="ri-destaque__nota">{cobertura.naoResponderam.length} sem relatório</small>
      </article>
    </section>

    <div className="ri-grade">
      <Card title={indicador?.rotulo ?? 'Indicador'} eyebrow={`Por trimestre · ${igrejaId ? nomeDaIgreja(igrejaId) : 'Distrito'} · ${ano}`} className="ri-grade__largo">
        <BarrasTrimestrais
          label={`${indicador?.rotulo ?? ''} por trimestre em ${ano}`}
          pontos={serie.map((leitura, indice) => ({
            rotulo: `${indice + 1}º tri`, numero: leitura.numero, ativo: aba === null || aba === indice + 1,
            ...(leitura.numero === null ? { nota: leitura.semRelatorio === igrejas.length ? 'Sem relatório' : leitura.aguardando ? 'Aguardando' : 'Não respondido' } : {}),
          }))}
        />
        <div className="rolagem-tabela">
          <table className="tabela-simples ri-tabela">
            <thead><tr><th scope="col">Trimestre</th><th scope="col">Anterior</th><th scope="col">Atual</th><th scope="col">Diferença</th><th scope="col">Igrejas</th></tr></thead>
            <tbody>
              {serie.map((leitura, indice) => {
                const comparacao = comparar(anterioresDaSerie[indice]!.numero, leitura.numero)
                return <tr key={indice} className={aba === indice + 1 ? 'ri-tabela__atual' : ''}>
                  <th scope="row">{indice + 1}º trimestre</th>
                  <td className="numero-tabela">{comparacao.anterior === null ? '—' : formatarNumero(comparacao.anterior)}</td>
                  <td className="numero-tabela">{leitura.numero === null ? '—' : formatarNumero(leitura.numero)}</td>
                  <td><Variacao comparacao={comparacao} /></td>
                  <td className="numero-tabela">{leitura.informaram}/{igrejas.length}</td>
                </tr>
              })}
              <tr className="ri-tabela__total">
                <th scope="row">Ano</th><td />
                <td className="numero-tabela"><NumeroDoDistrito leitura={leituraDoDistrito(relatorios, igrejas, indicadorId, { ano, trimestre: null })} igrejas={igrejas.length} /></td>
                <td colSpan={2}><small>{indicador?.tratamento === 'somar' ? 'Soma dos trimestres' : 'Último trimestre confirmado'}</small></td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      {!igrejaId && <Card title="Comparação entre igrejas" eyebrow={`${indicador?.rotulo ?? ''} · ${rotuloDoPeriodo}`}>
        <BarrasPorIgreja
          label={`${indicador?.rotulo ?? ''} por igreja · ${rotuloDoPeriodo}`}
          linhas={ativas.map((church) => {
            const leitura = leituraDaIgreja(relatorios, church.id, indicadorId, periodo)
            return { chave: church.id, rotulo: church.name, numero: leitura.numero, situacao: leitura.situacao }
          })}
        />
      </Card>}
    </div>

    <Card title="Ligação com as Metas" eyebrow={String(ano)}>
      <div className="ri-ligacoes">
        <section className="ri-ligacao">
          <h3>Estudos Bíblicos</h3>
          <dl>
            <div><dt>Alcançado na meta</dt><dd>{formatarNumero(origem.resultado)}</dd></div>
            <div><dt>Resultado oficial do relatório</dt><dd>{formatarNumero(origem.oficial)}</dd></div>
            <div><dt>Cadastro nominal</dt><dd>{formatarNumero(origem.nominal)}</dd></div>
            <div><dt>Diferença</dt><dd>{origem.diferenca === null ? '—' : `${origem.diferenca > 0 ? '+' : origem.diferenca < 0 ? '−' : ''}${formatarNumero(Math.abs(origem.diferenca))}`}</dd></div>
          </dl>
          <p className="ri-ligacao__origem">{origem.incluidos.length ? `Trimestres incluídos: ${origem.incluidos.map(rotuloCurtoDoTrimestre).join(', ')}` : 'Nenhum trimestre incluído'}</p>
          <Link className="text-link" to="/app/metas/bible_studies">Abrir a meta <ArrowRight size={14} /></Link>
        </section>
        <section className="ri-ligacao">
          <h3>Escola Sabatina e Pequenos Grupos</h3>
          <dl>
            {[{ id: UNIDADES_DE_ACAO, rotulo: 'Unidades de Ação', cadastro: classes.filter(({ churchId }) => idsAtivos.includes(churchId)).length },
              { id: PEQUENOS_GRUPOS, rotulo: 'Pequenos Grupos', cadastro: grupos.filter(({ churchId, active }) => active && idsAtivos.includes(churchId)).length }].map((linha) => {
              const vigente = leituraDoDistrito(relatorios, idsAtivos, linha.id, { ano, trimestre: null })
              return <div key={linha.id}><dt>{linha.rotulo}</dt><dd>{vigente.numero === null ? '—' : formatarNumero(vigente.numero)}<small> relatório · {linha.cadastro} cadastro</small></dd></div>
            })}
          </dl>
          {faixas && <div className="ri-faixas" aria-label="Alunos da Escola Sabatina por faixa">
            {faixas.faixas.map(({ rotulo, numero }) => <div key={rotulo}><small>{rotulo}</small><strong>{numero === null ? '—' : formatarNumero(numero)}</strong></div>)}
            <div className="ri-faixas__total"><small>Total de alunos</small><strong>{faixas.total === null ? '—' : formatarNumero(faixas.total)}</strong></div>
          </div>}
          <Link className="text-link" to="/app/metas/uapg">Abrir Escola Sabatina <ArrowRight size={14} /></Link>
        </section>
        <section className="ri-ligacao">
          <h3>Evangelismo e treinamentos</h3>
          <dl>
            <div><dt>Campanhas no relatório</dt><dd><NumeroDoDistrito leitura={leituraDoDistrito(relatorios, idsAtivos, CAMPANHAS_NO_RELATORIO, { ano, trimestre: null })} igrejas={idsAtivos.length} /></dd></div>
            <div><dt>Treinamentos</dt><dd><NumeroDoDistrito leitura={leituraDoDistrito(relatorios, idsAtivos, TREINAMENTOS, { ano, trimestre: null })} igrejas={idsAtivos.length} /></dd></div>
          </dl>
          <p className="ri-ligacao__origem">Campanhas vão para o Evangelismo · treinamentos ficam no relatório</p>
          <Link className="text-link" to="/app/evangelismo">Abrir Evangelismo <ArrowRight size={14} /></Link>
        </section>
      </div>
    </Card>

    <Card id="pendencias" title="Pendências" eyebrow={pendentesTotal ? `${pendentesTotal} para confirmar` : 'Em dia'}>
      {pendentesTotal === 0 && <p className="ri-vazio"><CheckCircle2 aria-hidden="true" size={18} />Nenhuma pendência</p>}
      {aguardando.length > 0 && <div className="ri-pendencias">
        <h3>Valores aguardando confirmação</h3>
        {aguardando.map((item) => {
          const chave = `${item.relatorio.id}|${item.indicadorId}`
          return <div className="ri-pendencia" key={chave}>
            <span><strong>{nomeDaIgreja(item.relatorio.churchId)} · {rotuloCurtoDoTrimestre(item.relatorio.trimestre)}</strong><small>{item.rotulo}</small></span>
            <div className="ri-pendencia__acoes" role="group" aria-label={`Decisão sobre ${item.rotulo} em ${nomeDaIgreja(item.relatorio.churchId)}`}>
              <Button variant="primary" disabled={busy} onClick={() => void decidir(item, { tipo: 'aprovado' })}>Confirmar {item.numero ?? ''}</Button>
              <input className="field__input ri-pendencia__campo" type="number" min="0" aria-label={`Valor corrigido de ${item.rotulo}`} value={correcoes[chave] ?? ''} onChange={(evento) => setCorrecoes({ ...correcoes, [chave]: evento.target.value })} />
              <Button variant="secondary" disabled={busy || !correcoes[chave]} onClick={() => void decidir(item, { tipo: 'corrigido', valor: Number(correcoes[chave]) })}>Corrigir</Button>
              <Button variant="quiet" disabled={busy} onClick={() => void decidir(item, { tipo: 'recusado' })}>Recusar</Button>
            </div>
          </div>
        })}
      </div>}
      {diferencas.length > 0 && <div className="ri-pendencias">
        <h3>Relatório diferente do cadastro</h3>
        {diferencas.map((diferenca) => <div className="ri-pendencia" key={`${diferenca.churchId}|${diferenca.indicadorId}`}>
          <span><strong>{nomeDaIgreja(diferenca.churchId)} · {diferenca.rotulo}</strong><small>Relatório ({rotuloCurtoDoTrimestre(diferenca.trimestre)}): {diferenca.relatorio} · Cadastro: {diferenca.cadastro}</small></span>
          <div className="ri-pendencia__acoes">
            <Button variant="secondary" disabled={busy} onClick={() => void conferir(diferenca)}>Conferido</Button>
            <Link className="button button--quiet" to={diferenca.para}>Abrir cadastro</Link>
          </div>
        </div>)}
      </div>}
    </Card>

    <Card title="Dados para registrar" eyebrow={paraRegistrar.length ? `${paraRegistrar.length} igreja(s)` : 'Em dia'}>
      {paraRegistrar.length === 0 && aCompletar.length === 0 && <p className="ri-vazio"><CheckCircle2 aria-hidden="true" size={18} />Nada para registrar</p>}
      {paraRegistrar.map((linha) => {
        const chave = `${linha.churchId}|${linha.trimestre}`
        return <div className="ri-pendencia" key={chave}>
          <span><strong>{nomeDaIgreja(linha.churchId)} · {rotuloCurtoDoTrimestre(linha.trimestre)}</strong><small>Relatório: {linha.declaradas} campanhas — Cadastradas: {linha.cadastradas} — Faltam registrar: {linha.faltam}</small></span>
          <div className="ri-pendencia__acoes">
            {confirmandoCampanhas === chave
              ? <><Button disabled={busy} onClick={() => void cadastrarCampanhas(linha)}>Confirmar {linha.faltam} a completar</Button><Button variant="quiet" onClick={() => setConfirmandoCampanhas('')}>Cancelar</Button></>
              : <Button variant="secondary" onClick={() => setConfirmandoCampanhas(chave)}>Cadastrar as que faltam</Button>}
          </div>
        </div>
      })}
      {aCompletar.length > 0 && <div className="ri-pendencias">
        <h3>A completar no Evangelismo</h3>
        {aCompletar.map((campanha) => <div className="ri-pendencia" key={campanha.id}>
          <span><strong>{nomeDaIgreja(campanha.origemRelatorio!.churchId)} · {rotuloCurtoDoTrimestre(campanha.origemRelatorio!.trimestre)}</strong><small>Campanha {campanha.origemRelatorio!.indice} · a completar</small></span>
          <div className="ri-pendencia__acoes"><Link className="button button--quiet" to={`/app/evangelismo/${campanha.id}`}>Completar</Link></div>
        </div>)}
      </div>}
    </Card>

    <Card title="Evolução do distrito" eyebrow={`${area || 'Principais indicadores'} · ${igrejaId ? nomeDaIgreja(igrejaId) : 'Distrito'} · ${ano}`}>
      <div className="rolagem-tabela">
        <table className="tabela-simples ri-tabela ri-tabela--evolucao">
          <thead><tr><th scope="col">Indicador</th>{[1, 2, 3, 4].map((numero) => <th scope="col" key={numero} className="numero-tabela">{numero}º tri</th>)}<th scope="col" className="numero-tabela">Ano</th><th scope="col">Tendência</th></tr></thead>
          <tbody>
            {evolucao.map((id) => {
              const item = indicadorPorId(id)
              const linha = serieTrimestral(relatorios, igrejas, id, ano)
              const doAno = leituraDoDistrito(relatorios, igrejas, id, { ano, trimestre: null })
              return <tr key={id}>
                <th scope="row"><button type="button" className="text-button ri-tabela__indicador" onClick={() => setIndicadorId(id)}>{item?.rotulo}</button><small>{item?.tratamento === 'somar' ? 'Soma' : 'Último trimestre'}</small></th>
                {linha.map((leitura, indice) => <td key={indice} className={leitura.numero === null ? 'numero-tabela ri-tabela__vazio' : 'numero-tabela'} title={`${leitura.informaram} informaram · ${leitura.semRelatorio} sem relatório · ${leitura.naoResponderam} não responderam${leitura.aguardando ? ` · ${leitura.aguardando} aguardando` : ''}`}>
                  {leitura.numero === null ? '—' : formatarNumero(leitura.numero)}
                </td>)}
                <td className="numero-tabela ri-tabela__ano">{doAno.numero === null ? '—' : formatarNumero(doAno.numero)}</td>
                <td><Variacao comparacao={comparacaoDoPeriodo(relatorios, igrejas, id, { ano, trimestre: null })} /></td>
              </tr>
            })}
          </tbody>
        </table>
      </div>
    </Card>

    <Card title="Detalhamento por igreja" eyebrow={area || 'Todas as áreas'}>
      {!igrejaId && <label className="field ri-ano"><span className="field__label">Igreja</span>
        <select className="field__input" value={igrejaId} onChange={(evento) => setIgrejaId(evento.target.value)}>
          <option value="">Escolher</option>
          {ativas.map((church) => <option key={church.id} value={church.id}>{church.name}</option>)}
        </select>
      </label>}
      {igrejaId && <>
        <p className="ri-detalhe__igreja"><strong>{nomeDaIgreja(igrejaId)}</strong><button type="button" className="text-button" onClick={() => setIgrejaId('')}>Voltar ao distrito</button></p>
        {AREAS_DO_RELATORIO.filter((secao) => !area || secao === area).map((secao, indiceDaSecao) => <details className="ri-secao" key={secao} open={Boolean(area) || indiceDaSecao === 0}>
        <summary>{secao}</summary>
        <div className="rolagem-tabela">
          <table className="tabela-simples ri-tabela">
            <thead><tr><th scope="col">Indicador</th>{[1, 2, 3, 4].map((numero) => <th scope="col" key={numero}>{numero}º tri</th>)}<th scope="col">Ano</th></tr></thead>
            <tbody>
              {CATALOGO_DO_RELATORIO.filter((item) => item.secao === secao).map((item) => <tr key={item.id}>
                <th scope="row">{item.rotulo}</th>
                {[1, 2, 3, 4].map((trimestre) => {
                  const leitura = leituraDaIgreja(relatorios, igrejaId, item.id, { ano, trimestre })
                  return <td key={trimestre} className={`ri-celula ri-celula--${leitura.situacao}`}>{textoDaLeitura(leitura)}</td>
                })}
                {(() => { const leitura = leituraDaIgreja(relatorios, igrejaId, item.id, { ano, trimestre: null }); return <td className={`ri-celula ri-celula--${leitura.situacao} ri-tabela__ano`}>{textoDaLeitura(leitura)}</td> })()}
              </tr>)}
            </tbody>
          </table>
        </div>
        </details>)}
      </>}
    </Card>

    <Card title="Respostas das igrejas" eyebrow={rotuloDoPeriodo}>
      <div className="ri-cobertura">
        <div><h3>Responderam · {cobertura.responderam.length}</h3><ul className="chip-row">{cobertura.responderam.map((id) => <li className="ri-chip ri-chip--ok" key={id}>{nomeDaIgreja(id)}</li>)}</ul></div>
        <div><h3>Não responderam · {cobertura.naoResponderam.length}</h3><ul className="chip-row">{cobertura.naoResponderam.map((id) => <li className="ri-chip" key={id}>{nomeDaIgreja(id)}</li>)}</ul></div>
      </div>
      <div className="rolagem-tabela">
        <table className="tabela-simples ri-tabela">
          <thead><tr><th scope="col">Igreja</th>{[1, 2, 3, 4].map((numero) => <th scope="col" key={numero}>{numero}º tri</th>)}</tr></thead>
          <tbody>{entregasDoAno(relatorios, idsAtivos, ano).map(({ churchId, trimestres }) => <tr key={churchId}>
            <th scope="row">{nomeDaIgreja(churchId)}</th>
            {trimestres.map((entregue, indice) => <td key={indice} className={entregue ? 'ri-entregue' : 'ri-tabela__vazio'}>{entregue ? 'Enviado' : 'Sem relatório'}</td>)}
          </tr>)}</tbody>
        </table>
      </div>
    </Card>

    <Card title="Histórico dos relatórios enviados">
      <div className="rolagem-tabela">
        <table className="tabela-simples ri-tabela">
          <thead><tr><th scope="col">Trimestre</th><th scope="col">Arquivo</th><th scope="col" className="numero-tabela">Igrejas</th><th scope="col">Gravado em</th></tr></thead>
          <tbody>{historicoDeEnvios(relatorios).map((envioGuardado) => <tr key={`${envioGuardado.lote}|${envioGuardado.trimestre}`}>
            <th scope="row">{rotuloDoTrimestre(envioGuardado.trimestre)}</th>
            <td>{envioGuardado.arquivo}</td>
            <td className="numero-tabela">{envioGuardado.igrejas}</td>
            <td>{envioGuardado.em ? new Date(envioGuardado.em).toLocaleDateString('pt-BR') : '—'}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </Card>
    </>}

    {envio}
  </div>
}
