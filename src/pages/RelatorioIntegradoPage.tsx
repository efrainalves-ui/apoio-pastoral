import { MarcaDaArea, MarcaDoIndicador } from '../components/plano/MarcaDaArea'
import { ArrowRight, BookOpen, FileSearch, Layers, Megaphone, School, UsersRound } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuthVault } from '../auth/AuthVaultContext'
import { AcoesDeCadastro, type CampanhasCadastradas } from '../components/relatorio-integrado/AcoesDeCadastro'
import { EnvioDoRelatorio } from '../components/relatorio-integrado/EnvioDoRelatorio'
import {
  BarrasPorIgreja, FaixaDeTendencias, formatarNumero, GraficoDeLinha, MarcaDePossivelErro, ParDeTrimestres, SituacaoDoValor, Variacao,
} from '../components/relatorio-integrado/Graficos'
import { IndicadoresCompletos } from '../components/relatorio-integrado/IndicadoresCompletos'
import { RelatorioDaIgreja } from '../components/relatorio-integrado/RelatorioDaIgreja'
import { RespostasDasIgrejas } from '../components/relatorio-integrado/RespostasDasIgrejas'
import { Card } from '../components/ui/Card'
import { ProgressRing } from '../components/ui/ProgressRing'
import { DistrictService } from '../district/service'
import type { ChurchEntity } from '../district/types'
import { EvangelismPlanningService } from '../evangelism/service'
import type { EvangelismCampaignEntity } from '../evangelism/types'
import { GoalsService } from '../goals/service'
import { CAMPANHAS_NO_RELATORIO, campanhasSemNome } from '../integrated-report/campanhas'
import { indicadorPorId } from '../integrated-report/catalogo'
import {
  acoesPorIgreja, cadastrosParaCompletar, campanhasParaRegistrar, DUPLAS_MISSIONARIAS, PEQUENOS_GRUPOS, UNIDADES_DE_ACAO, type CampanhasParaRegistrar,
} from '../integrated-report/ligacoes'
import {
  anosDosRelatorios, AREAS_DO_RELATORIO, comparacaoDoPeriodo, comparar, coberturaDoPeriodo, desempenhoDasIgrejas, ESTUDOS_ASA, ESTUDOS_GERAIS,
  estudosDoPeriodo, faixasDoIndicador, historicoDeEnvios, INDICADORES_NUMERICOS, leituraDoDistrito, possivelErroNoValor, rotuloCurto,
  rotuloCurtoDoTrimestre, serieTrimestral, tendenciasDosIndicadores, trimestreAnterior, type ComparacaoDoPeriodo, type Periodo, type Tendencia,
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

const ALUNOS = 'escola-sabatina--numero-de-alunos-da-escola-sabatina'
const TREINAMENTOS = 'ministerio-pessoal--numero-de-treinamentos-encontros-missionarios'

/** Os indicadores que dizem como o distrito está, na leitura de crescimento e redução. */
const PRINCIPAIS = [
  ESTUDOS_GERAIS, ESTUDOS_ASA, PEQUENOS_GRUPOS, UNIDADES_DE_ACAO, ALUNOS,
  'escola-sabatina--numero-de-alunos-presentes', 'escola-sabatina--numero-de-professores-em-cada-classe', CAMPANHAS_NO_RELATORIO,
  'ministerio-pessoal--numero-de-classes-biblicas-em-funcionamento', DUPLAS_MISSIONARIAS, TREINAMENTOS, 'secretaria--numero-de-presentes-no-culto-divino',
]

const DESTAQUES = [
  { id: PEQUENOS_GRUPOS, rotulo: 'Pequenos Grupos', tom: 'grupos', Icone: UsersRound },
  { id: UNIDADES_DE_ACAO, rotulo: 'Unidades de Ação', tom: 'unidades', Icone: Layers },
  { id: ALUNOS, rotulo: 'Alunos da Escola Sabatina', tom: 'alunos', Icone: School },
  { id: CAMPANHAS_NO_RELATORIO, rotulo: 'Campanhas evangelísticas', tom: 'campanhas', Icone: Megaphone },
] as const

const ABAS: ReadonlyArray<{ trimestre: number | null; rotulo: string }> = [
  { trimestre: 1, rotulo: '1º trimestre' }, { trimestre: 2, rotulo: '2º trimestre' }, { trimestre: 3, rotulo: '3º trimestre' },
  { trimestre: 4, rotulo: '4º trimestre' }, { trimestre: null, rotulo: 'Ano completo' },
]

/** O número anterior e o atual, com os trimestres, ao lado da diferença. */
function DeParaAntes({ c }: { c: ComparacaoDoPeriodo }) {
  if (!c.de || !c.para || c.anterior === null || c.atual === null) return null
  return <small className="ri-destaque__antes">{rotuloCurtoDoTrimestre(c.de)} {formatarNumero(c.anterior)} → {rotuloCurtoDoTrimestre(c.para)} {formatarNumero(c.atual)}</small>
}

export function RelatorioIntegradoPage() {
  const { account, masterKey } = useAuthVault()
  const location = useLocation()
  const anoCorrente = new Date().getFullYear()
  const [churches, setChurches] = useState<ChurchEntity[]>([])
  const [relatorios, setRelatorios] = useState<RelatorioIntegradoEntity[]>([])
  const [campanhas, setCampanhas] = useState<EvangelismCampaignEntity[]>([])
  const [classes, setClasses] = useState<Array<{ churchId: string }>>([])
  const [grupos, setGrupos] = useState<Array<{ churchId: string; active: boolean }>>([])
  const [pares, setPares] = useState<Array<{ churchId: string; active: boolean }>>([])
  const [ano, setAno] = useState(anoCorrente)
  const [abaEscolhida, setAba] = useState<number | null | undefined>(undefined)
  const [igrejaId, setIgrejaId] = useState('')
  const [area, setArea] = useState('')
  const [indicadorId, setIndicadorId] = useState(ESTUDOS_GERAIS)
  const [carregando, setCarregando] = useState(true)
  const [busy, setBusy] = useState(false)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [cadastradasAgora, setCadastradasAgora] = useState<CampanhasCadastradas[]>([])
  const carregou = useRef(false)

  const carregar = useCallback(async (): Promise<RelatorioIntegradoEntity[]> => {
    if (!account || !masterKey) return []
    if (!carregou.current) setCarregando(true)
    try {
      const district = await districtService.getDistrict(account.id, masterKey)
      // O que já está guardado é reprocessado aqui, sem novo envio: os números que esperavam confirmação passam a valer como vieram.
      await service.aceitarValoresGuardados(account.id, masterKey)
      const [listaIgrejas, listaRelatorios, listaCampanhas, listaClasses, listaGrupos, listaPares] = await Promise.all([
        district ? districtService.listChurches(account.id, masterKey, district.id) : [],
        service.listar(account.id, masterKey),
        evangelismo.listCampaigns(account.id, masterKey),
        missionary.listClasses(account.id, masterKey),
        missionary.listSmallGroups(account.id, masterKey),
        missionary.listPairs(account.id, masterKey),
      ])
      const nomeDe = (id: string) => listaIgrejas.find((church) => church.id === id)?.name ?? 'Igreja'
      const semNome = campanhasSemNome(listaCampanhas, listaRelatorios, nomeDe)
      let campanhasAtuais = listaCampanhas
      if (semNome.length && await evangelismo.nomearCampanhasDoRelatorio(account.id, masterKey, semNome)) campanhasAtuais = await evangelismo.listCampaigns(account.id, masterKey)
      const recalculados = await sincronizarMetas(account.id, masterKey, listaRelatorios, metas)
      if (recalculados.length) setAviso(`Metas atualizadas: ${recalculados.map(rotuloDoTrimestre).join(', ')}.`)
      setChurches(listaIgrejas); setRelatorios(listaRelatorios); setCampanhas(campanhasAtuais)
      setClasses(listaClasses); setGrupos(listaGrupos); setPares(listaPares)
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
  const igrejas = useMemo(() => igrejaId ? [igrejaId] : idsAtivos, [igrejaId, idsAtivos])
  const nomeDaIgreja = useCallback((id: string) => churches.find((church) => church.id === id)?.name ?? 'Igreja', [churches])
  const anos = anosDosRelatorios(relatorios, anoCorrente)
  const trimestrePadrao = [4, 3, 2, 1].find((numero) => relatorios.some(({ trimestre }) => trimestre === `${ano}-${numero}`)) ?? null
  const aba = abaEscolhida === undefined ? trimestrePadrao : abaEscolhida
  const periodo: Periodo = { ano, trimestre: aba }
  const indicadoresDaArea = area ? INDICADORES_NUMERICOS.filter(({ secao }) => secao === area) : INDICADORES_NUMERICOS
  const indicador = indicadorPorId(indicadorId)

  const cadastroDaIgreja = (churchId: string) => ({
    unidades: classes.filter((classe) => classe.churchId === churchId).length,
    pequenosGrupos: grupos.filter((grupo) => grupo.churchId === churchId && grupo.active).length,
    duplas: pares.filter((par) => par.churchId === churchId && par.active).length,
  })
  const acoes = acoesPorIgreja(
    campanhasParaRegistrar(relatorios.filter(({ churchId }) => igrejas.includes(churchId)), campanhas, ano),
    cadastrosParaCompletar(relatorios, igrejas, ano, cadastroDaIgreja),
  )
  const jaDoRelatorio = (churchId: string, trimestre: string) => campanhas.filter(({ origemRelatorio }) => origemRelatorio?.churchId === churchId && origemRelatorio.trimestre === trimestre).length

  async function cadastrarCampanhas(linha: CampanhasParaRegistrar) {
    if (!account || !masterKey) return
    setBusy(true); setErro(''); setAviso('')
    try {
      await evangelismo.registrarCampanhasDoRelatorio(account.id, masterKey, [{ ...linha, igreja: nomeDaIgreja(linha.churchId) }])
      const doTrimestre = (await evangelismo.listCampaigns(account.id, masterKey))
        .filter(({ origemRelatorio }) => origemRelatorio?.churchId === linha.churchId && origemRelatorio.trimestre === linha.trimestre)
        .sort((a, b) => (a.origemRelatorio?.indice ?? 0) - (b.origemRelatorio?.indice ?? 0))
      setCadastradasAgora((atual) => [...atual.filter((grupo) => grupo.churchId !== linha.churchId || grupo.trimestre !== linha.trimestre), { churchId: linha.churchId, trimestre: linha.trimestre, campanhas: doTrimestre }])
      await carregar()
    } catch (motivo) {
      setErro(motivo instanceof Error ? motivo.message : 'Não foi possível cadastrar a campanha.')
    } finally { setBusy(false) }
  }

  function abrirIgreja(churchId: string) {
    setIgrejaId(churchId)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  if (carregando) return <div className="app-loading" role="status">Abrindo o Relatório Integrado…</div>

  const envio = account && masterKey
    ? <EnvioDoRelatorio
        accountId={account.id} masterKey={masterKey} churches={churches} relatorios={relatorios}
        aoGravar={async (trimestre) => { const guardados = await carregar(); setAno(Number(trimestre.slice(0, 4))); setAba(Number(trimestre.slice(5))); return guardados }}
      />
    : null

  const escopo = igrejaId ? nomeDaIgreja(igrejaId) : 'Distrito'
  const rotuloDoPeriodo = aba === null ? `Ano de ${ano}` : `${aba}º trimestre de ${ano}`
  const cobertura = coberturaDoPeriodo(relatorios, idsAtivos, periodo)
  const percentualDeCobertura = idsAtivos.length ? Math.round((cobertura.responderam.length / idsAtivos.length) * 100) : 0
  const estudos = estudosDoPeriodo(relatorios, igrejas, periodo)
  const comparacaoDosEstudos: ComparacaoDoPeriodo = (() => {
    if (aba !== null) {
      const antes = trimestreAnterior(ano, aba)
      return { ...comparar(estudosDoPeriodo(relatorios, igrejas, antes), estudos), de: `${antes.ano}-${antes.trimestre}`, para: `${ano}-${aba}` }
    }
    const comNumero = [1, 2, 3, 4].map((trimestre) => ({ trimestre: `${ano}-${trimestre}`, numero: estudosDoPeriodo(relatorios, igrejas, { ano, trimestre }) })).filter(({ numero }) => numero !== null)
    const [penultimo, ultimo] = comNumero.slice(-2)
    return { ...comparar(penultimo?.numero ?? null, ultimo?.numero ?? null), de: penultimo?.trimestre ?? null, para: ultimo?.trimestre ?? null }
  })()
  const nomeDoIndicador = indicador ? rotuloCurto(indicador) : 'Indicador'
  const serie = serieTrimestral(relatorios, igrejas, indicadorId, ano)
  const comparacaoDoIndicador = comparacaoDoPeriodo(relatorios, igrejas, indicadorId, periodo)
  const tendencias = tendenciasDosIndicadores(relatorios, igrejas, PRINCIPAIS, periodo)
  const contagemDeTendencias = { alta: tendencias.alta.length, queda: tendencias.queda.length, estavel: tendencias.estavel.length, sem_base: tendencias.sem_base.length } satisfies Record<Tendencia, number>
  const faixas = faixasDoIndicador(relatorios, igrejas, ALUNOS, periodo)
  const leituraDoPeriodo = leituraDoDistrito(relatorios, igrejas, indicadorId, periodo)
  const desempenho = desempenhoDasIgrejas(relatorios, idsAtivos, indicadorId, periodo)
  const avancaram = desempenho.filter(({ comparacao }) => comparacao.tendencia === 'alta').sort((a, b) => b.comparacao.diferenca! - a.comparacao.diferenca!).slice(0, 5)
  const acompanhar = [
    ...desempenho.filter(({ comparacao }) => comparacao.tendencia === 'queda').sort((a, b) => a.comparacao.diferenca! - b.comparacao.diferenca!),
    ...desempenho.filter(({ leitura }) => leitura.situacao !== 'informado'),
  ].slice(0, 6)
  const totalDeAcoes = acoes.reduce((soma, acao) => soma + acao.campanhasFaltando + acao.cadastrosFaltando, 0)
  const acoesDeCadastro = <AcoesDeCadastro acoes={acoes} nomeDaIgreja={nomeDaIgreja} jaDoRelatorio={jaDoRelatorio} cadastradasAgora={cadastradasAgora.filter(({ churchId }) => igrejas.includes(churchId))} busy={busy} aoCadastrar={cadastrarCampanhas} abertas={Boolean(igrejaId)} />

  return <div className="page-stack ri">
    <header className="page-hero ri-topo">
      <div><p className="eyebrow">Metas</p><h1>Relatório Integrado</h1>{relatorios.length > 0 && <p className="ri-topo__periodo">{escopo} · {rotuloDoPeriodo}</p>}</div>
    </header>

    {erro && <div className="alert alert--error" role="alert">{erro}</div>}
    {aviso && <div className="alert alert--success" role="status">{aviso}</div>}

    {/* O envio fica sempre na mesma posição da árvore: sem isso, o primeiro relatório gravado trocava o layout e apagava a confirmação. */}
    {relatorios.length === 0 ? <Card><div className="empty-state"><FileSearch /><strong>Nenhum relatório guardado</strong></div></Card> : <>

    <section className="ri-controles" aria-label="Período e filtros">
      <div className="ri-controles__periodo">
        <label className="field ri-ano">
          <span className="field__label">Ano</span>
          <select className="field__input" value={ano} onChange={(evento) => { setAno(Number(evento.target.value)); setAba(undefined) }}>
            {anos.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <div className="segmented ri-abas" role="tablist" aria-label="Período">
          {ABAS.map(({ trimestre, rotulo }) => <button
            key={rotulo} type="button" role="tab" aria-selected={aba === trimestre}
            className={aba === trimestre ? 'active' : ''} onClick={() => setAba(trimestre)}
          >{rotulo}</button>)}
        </div>
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
            {indicadoresDaArea.map((item) => <option key={item.id} value={item.id} title={item.rotulo}>{rotuloCurto(item)}</option>)}
          </select>
        </label>
      </div>
    </section>

    {igrejaId
      ? <RelatorioDaIgreja relatorios={relatorios} churchId={igrejaId} nome={nomeDaIgreja(igrejaId)} ano={ano} trimestre={aba} acoes={acoesDeCadastro} aoVoltar={() => setIgrejaId('')} />
      : <section className="ri-bloco" aria-labelledby="ri-visao">
          <h2 className="ri-bloco__titulo" id="ri-visao">Visão geral</h2>
          <div className="ri-destaques">
            <article className="ri-destaque ri-destaque--estudos">
              <span className="ri-destaque__icone" aria-hidden="true"><BookOpen size={18} /></span>
              <small className="ri-destaque__rotulo">Estudos bíblicos</small><MarcaDaArea area="discipleship" compacta />
              <strong className="ri-destaque__numero">{estudos === null ? '—' : formatarNumero(estudos)}</strong>
              <Variacao comparacao={comparacaoDosEstudos} />
              <DeParaAntes c={comparacaoDosEstudos} />
              <Link className="ri-destaque__link" to="/app/metas/bible_studies">Meta de estudos <ArrowRight size={13} aria-hidden="true" /></Link>
            </article>
            {DESTAQUES.map(({ id, rotulo, tom, Icone }) => {
              const leitura = leituraDoDistrito(relatorios, igrejas, id, periodo)
              const comparacao = comparacaoDoPeriodo(relatorios, igrejas, id, periodo)
              return <article className={`ri-destaque ri-destaque--${tom}`} key={id}>
                <span className="ri-destaque__icone" aria-hidden="true"><Icone size={18} /></span>
                <small className="ri-destaque__rotulo">{rotulo}</small><MarcaDoIndicador id={id} />
                <strong className="ri-destaque__numero">{leitura.numero === null ? '—' : formatarNumero(leitura.numero)}</strong>
                <Variacao comparacao={comparacao} />
                <DeParaAntes c={comparacao} />
                {leitura.numero === null && <SituacaoDoValor situacao={leitura.semRelatorio === igrejas.length ? 'sem_relatorio' : 'nao_respondido'} />}
              </article>
            })}
            <article className="ri-destaque ri-destaque--respostas">
              <ProgressRing percent={percentualDeCobertura} label={`Igrejas que responderam: ${cobertura.responderam.length} de ${idsAtivos.length}`} size={68}>
                <span>{percentualDeCobertura}%</span>
              </ProgressRing>
              <small className="ri-destaque__rotulo">Igrejas que responderam</small>
              <strong className="ri-destaque__numero">{cobertura.responderam.length}<span className="ri-destaque__de">/{idsAtivos.length}</span></strong>
            </article>
          </div>
        </section>}

    <section className="ri-bloco" aria-labelledby="ri-evolucao">
      <h2 className="ri-bloco__titulo" id="ri-evolucao">Evolução e comparações</h2>
      <div className="ri-grade">
        <Card title={nomeDoIndicador} eyebrow={`${escopo} · ${ano}`} className="ri-grade__largo" action={<span className="ri-acao-indicador"><MarcaDoIndicador id={indicadorId} /><span className="ri-selo">{indicador?.tratamento === 'somar' ? 'Soma' : 'Último trimestre'}</span></span>}>
          <GraficoDeLinha label={`${nomeDoIndicador} por trimestre em ${ano}`} pontos={serie.map((leitura, indice) => ({ rotulo: `${indice + 1}º tri`, numero: leitura.numero, ativo: aba === indice + 1 }))} />
          <dl className="ri-rodape">
            <div><dt>{aba === null ? 'Ano' : rotuloDoPeriodo}</dt><dd>{leituraDoPeriodo.numero === null ? '—' : formatarNumero(leituraDoPeriodo.numero)}</dd></div>
            <div><dt>Igrejas que informaram</dt><dd>{leituraDoPeriodo.informaram}/{igrejas.length}</dd></div>
          </dl>
        </Card>
        <Card title={aba === null ? 'Últimos dois trimestres' : 'Com o trimestre anterior'} eyebrow={nomeDoIndicador}>
          <ParDeTrimestres comparacao={comparacaoDoIndicador} de={comparacaoDoIndicador.de} para={comparacaoDoIndicador.para} />
          <h3 className="ri-subtitulo">Crescimento, redução e estabilidade</h3>
          <FaixaDeTendencias contagem={contagemDeTendencias} />
        </Card>
        {faixas && <Card title="Escola Sabatina por faixa" eyebrow={rotuloDoPeriodo} className="ri-grade__inteiro">
          <div className="ri-faixas" aria-label="Alunos da Escola Sabatina por faixa">
            {faixas.faixas.map(({ rotulo, numero }) => <div key={rotulo}><small>{rotulo}</small><strong>{numero === null ? '—' : formatarNumero(numero)}</strong></div>)}
            <div className="ri-faixas__total"><small>Total de alunos</small><strong>{faixas.total === null ? '—' : formatarNumero(faixas.total)}</strong></div>
          </div>
        </Card>}
      </div>
    </section>

    {!igrejaId && <section className="ri-bloco" aria-labelledby="ri-desempenho">
      <h2 className="ri-bloco__titulo" id="ri-desempenho">Desempenho das igrejas</h2>
      <div className="ri-grade">
        <Card title="Comparação entre igrejas" eyebrow={`${nomeDoIndicador} · ${rotuloDoPeriodo}`} className="ri-grade__largo">
          <BarrasPorIgreja
            label={`${nomeDoIndicador} por igreja · ${rotuloDoPeriodo}`}
            linhas={desempenho.map(({ churchId, leitura }) => {
              const possivel = aba === null ? null : possivelErroNoValor(relatorios, churchId, indicadorId, `${ano}-${aba}`)
              return { chave: churchId, rotulo: nomeDaIgreja(churchId), numero: leitura.numero, situacao: leitura.situacao, nota: possivel ? <MarcaDePossivelErro erro={possivel} igreja={nomeDaIgreja(churchId)} /> : null }
            })}
          />
        </Card>
        <div className="ri-coluna">
          <Card title="Mais avançaram" eyebrow={nomeDoIndicador}>
            {avancaram.length === 0
              ? <p className="ri-vazio">Nenhuma igreja avançou</p>
              : <ol className="ri-ranking">{avancaram.map(({ churchId, comparacao }) => <li key={churchId}>
                  <button type="button" className="text-button" onClick={() => abrirIgreja(churchId)}>{nomeDaIgreja(churchId)}</button>
                  <DeParaAntes c={comparacao} />
                  <Variacao comparacao={comparacao} />
                </li>)}</ol>}
          </Card>
          <Card title="Precisam de acompanhamento" eyebrow={nomeDoIndicador}>
            {acompanhar.length === 0
              ? <p className="ri-vazio">Nenhuma igreja em queda</p>
              : <ul className="ri-ranking ri-ranking--atencao">{acompanhar.map(({ churchId, comparacao, leitura }) => <li key={churchId}>
                  <button type="button" className="text-button" onClick={() => abrirIgreja(churchId)}>{nomeDaIgreja(churchId)}</button>
                  {leitura.situacao === 'informado' ? <><DeParaAntes c={comparacao} /><Variacao comparacao={comparacao} /></> : <SituacaoDoValor situacao={leitura.situacao} />}
                </li>)}</ul>}
          </Card>
        </div>
      </div>
    </section>}

    {!igrejaId && <section className="ri-bloco" aria-labelledby="ri-acoes">
      <h2 className="ri-bloco__titulo" id="ri-acoes">Ações de cadastro{totalDeAcoes > 0 && <span className="ri-bloco__conta">{totalDeAcoes}</span>}</h2>
      <Card className="ri-card-acoes">{acoesDeCadastro}</Card>
    </section>}

    <section className="ri-bloco" aria-labelledby="ri-indicadores">
      <h2 className="ri-bloco__titulo" id="ri-indicadores">Indicadores completos</h2>
      <Card eyebrow={`${area || 'Todas as áreas'} · ${escopo} · ${ano}`}>
        <IndicadoresCompletos relatorios={relatorios} igrejas={igrejas} nomeDaIgreja={nomeDaIgreja} ano={ano} area={area} trimestreAtivo={aba}
          aoEscolher={(id) => { setIndicadorId(id); document.getElementById('ri-evolucao')?.scrollIntoView({ block: 'start', behavior: 'smooth' }) }} />
      </Card>
    </section>

    <section className="ri-bloco" aria-labelledby="ri-respostas">
      <h2 className="ri-bloco__titulo" id="ri-respostas">Respostas das igrejas</h2>
      <Card eyebrow={String(ano)}>
        <RespostasDasIgrejas relatorios={relatorios} igrejas={igrejas} nomeDaIgreja={nomeDaIgreja} ano={ano} trimestreAtivo={aba} aoAbrirIgreja={abrirIgreja} />
      </Card>
    </section>

    <section className="ri-bloco" aria-labelledby="ri-historico">
      <h2 className="ri-bloco__titulo" id="ri-historico">Histórico dos relatórios</h2>
      <Card>
        <ul className="ri-historico">{historicoDeEnvios(relatorios).map((envioGuardado) => <li key={`${envioGuardado.lote}|${envioGuardado.trimestre}`}>
          <span className="ri-historico__trimestre">{rotuloDoTrimestre(envioGuardado.trimestre)}</span>
          <span className="ri-historico__arquivo">{envioGuardado.arquivo}</span>
          <span className="ri-historico__meta">{envioGuardado.igrejas} {envioGuardado.igrejas === 1 ? 'igreja' : 'igrejas'} · {envioGuardado.em ? new Date(envioGuardado.em).toLocaleDateString('pt-BR') : '—'}</span>
        </li>)}</ul>
      </Card>
    </section>
    </>}

    {envio}
  </div>
}
