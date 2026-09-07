import { ArrowLeft, FileUp } from 'lucide-react'
import { useCallback, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuthVault } from '../auth/AuthVaultContext'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Field } from '../components/ui/Field'
import {
  AREA_TARGET_METRIC, AREA_USES_PDF, GOAL_AREAS, GOAL_AREA_LABELS,
  areaComparison, churchProgress, type GoalArea,
} from '../goals/areas'
import { MONTH_LABELS, formatGoalValue } from '../goals/format'
import { GoalsService, parseGoalsPdf } from '../goals/service'
import { HISTORY_AREAS, type GoalHistoryData, type GoalImportPreview } from '../goals/types'
import { useGoalSources } from '../goals/useGoalSources'
import { extractPdfText, pdfHash, validatePdfFile } from '../imports/pdf'
import { AREA_PDF_DOCUMENT, ehFinanceira, variacaoNoMesmoPeriodo, ANOS_DE_HISTORICO, PERCENT_TARGET_AREAS, anosComResultado, comparacaoMensal, resumoPorAno, resumoPorIgrejaEAno } from '../goals/areas'
import { previaDeBatismos, previaFinanceira, type PreviaDeRelatorio } from '../goals/importacaoAcms'
import { comparativoDeDoadores } from '../goals/doadores'
import { MissionaryPage } from './MissionaryPage'
import { PeopleService } from '../people/service'
import type { PersonEntity } from '../people/types'
import { useReloadOnSync } from '../sync/useReloadOnSync'

const goalsService = new GoalsService()
const peopleService = new PeopleService()

export function GoalAreaPage() {
  const { account, masterKey } = useAuthVault()
  const { area: areaParam = '' } = useParams()
  const area = GOAL_AREAS.includes(areaParam as GoalArea) ? areaParam as GoalArea : null
  const { goals, sources, churches, ready, reload } = useGoalSources()
  const [districtInput, setDistrictInput] = useState('')
  const [previousInput, setPreviousInput] = useState('')
  const [churchInputs, setChurchInputs] = useState<Record<string, string>>({})
  const [preview, setPreview] = useState<GoalImportPreview | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  // As pessoas entram só para contar doadores: é a metade em gente da meta
  // financeira, e ela diz o que o dinheiro sozinho não diz — se o crescimento
  // veio de mais gente participando ou de poucos dando mais.
  const [pessoas, setPessoas] = useState<PersonEntity[]>([])
  const [doadoresInput, setDoadoresInput] = useState('')
  // A meta definida vira número, não formulário. O campo volta quando alguém
  // pede para alterar — que é o gesto raro, e não o estado normal da tela.
  const [alterandoMeta, setAlterandoMeta] = useState(false)
  const [corrigindoAnoAnterior, setCorrigindoAnoAnterior] = useState(false)
  // Contra qual ano comparar. O padrão é o anterior, e a escolha existe porque
  // quem chega com quatro anos de distrito pode enviar os relatórios antigos.
  const [anoBase, setAnoBase] = useState<number | null>(null)
  const carregarPessoas = useCallback(async () => {
    if (!account || !masterKey) return
    setPessoas(await peopleService.listPeople(account.id, masterKey))
  }, [account, masterKey])
  useReloadOnSync(carregarPessoas)

  const year = new Date().getFullYear()
  // O texto que saiu do PDF fica à mão quando nada é reconhecido. Sem isso, o
  // pastor só tem "não reconhecido" e ninguém consegue descobrir o porquê — o
  // arquivo dele não pode sair do aparelho para alguém olhar.
  const [textoLido, setTextoLido] = useState('')
  const [mostrarTexto, setMostrarTexto] = useState(false)
  // O Comparativo traz o ano anterior junto. Guardá-lo aqui é o que permite
  // gravar a base de comparação no mesmo gesto, sem pedir para ninguém digitar
  // o ano passado inteiro.
  const [anoAnteriorDoPdf, setAnoAnteriorDoPdf] = useState<{ ano: number; total: number } | null>(null)

  if (!area) return <div className="page-stack"><p>Meta não encontrada.</p><Link className="text-link" to="/app/metas">Voltar às metas</Link></div>
  if (!ready) return <div className="app-loading" role="status">Abrindo a meta…</div>

  const progresso = areaComparison(area, goals, sources, year)
  const guardaHistorico = HISTORY_AREAS.includes(area as GoalHistoryData['area'])
  const anosDisponiveis = anosComResultado(area, sources, year)
  const anosResumidos = resumoPorAno(area, sources, year)
  const igrejasPorAno = resumoPorIgrejaEAno(area, sources, anosResumidos.map(({ ano }) => ano), churches.map(({ id }) => id))
  const anoComparado = anoBase ?? anosDisponiveis[0] ?? year - 1
  const comparacao = comparacaoMensal(area, sources, year, anoComparado)
  const porIgreja = churchProgress(area, goals, sources, year, churches.map(({ id }) => id))
  const anoTerminou = year < new Date().getFullYear() || new Date().getMonth() === 11
  /**
   * Sem nenhum resultado, enviar o relatório é o que a tela existe para pedir —
   * então ele sobe. Com dados dentro, o que importa é o acompanhamento, e o
   * envio vira manutenção: desce para o fim, discreto.
   */
  const semNenhumResultado = progresso.result === 0 && !progresso.hasPrevious

  async function salvarMeta(event: FormEvent, churchId: string | null, valor: string) {
    event.preventDefault()
    if (!account || !masterKey || !area) return
    setError(''); setNotice('')
    try {
      // A meta do distrito na área financeira é combinada como aumento sobre o
      // ano anterior. As das igrejas continuam em valor: distribuir a
      // porcentagem do distrito entre elas é outra conversa.
      const emPorcentagem = PERCENT_TARGET_AREAS.includes(area) && churchId === null
      await goalsService.saveGoal(account.id, masterKey, {
        churchId, year, metric: AREA_TARGET_METRIC[area], target: Number(valor),
        ...(emPorcentagem ? { targetKind: 'percent' as const } : {}),
      })
      setNotice('Meta salva.')
      if (churchId === null) setDistrictInput('')
      await reload()
    } catch (motivo) {
      setError(motivo instanceof Error ? motivo.message : 'Não foi possível salvar a meta.')
    }
  }

  async function salvarAnoAnterior(event: FormEvent) {
    event.preventDefault()
    if (!account || !masterKey || !area || !guardaHistorico) return
    setError(''); setNotice('')
    try {
      await goalsService.saveHistory(account.id, masterKey, { area: area as GoalHistoryData['area'], year: year - 1, amount: Number(previousInput), source: 'manual', reference: `Consolidado ${year - 1}` })
      setPreviousInput(''); setNotice(`Resultado de ${year - 1} guardado para comparação.`)
      await reload()
    } catch (motivo) {
      setError(motivo instanceof Error ? motivo.message : 'Não foi possível guardar o resultado do ano anterior.')
    }
  }

  /**
   * Todas as igrejas de uma vez.
   *
   * Um botão por igreja transformava distribuir a meta do distrito em doze
   * gestos iguais — e um erro no meio deixava metade salva e metade não, sem
   * ninguém saber qual metade.
   */
  async function salvarMetasDasIgrejas(event: FormEvent) {
    event.preventDefault()
    if (!account || !masterKey || !area) return
    const preenchidas = Object.entries(churchInputs).filter(([, valor]) => valor.trim())
    if (!preenchidas.length) return
    setBusy(true); setError(''); setNotice('')
    try {
      for (const [churchId, valor] of preenchidas) {
        await goalsService.saveGoal(account.id, masterKey, { churchId, year, metric: AREA_TARGET_METRIC[area], target: Number(valor) })
      }
      setChurchInputs({})
      setNotice(preenchidas.length === 1 ? 'Meta salva.' : `${preenchidas.length} metas salvas.`)
      await reload()
    } catch (motivo) {
      setError(motivo instanceof Error ? motivo.message : 'Não foi possível salvar as metas.')
    } finally { setBusy(false) }
  }

  async function salvarMetaDeDoadores(event: FormEvent) {
    event.preventDefault()
    if (!account || !masterKey || !area) return
    setError(''); setNotice('')
    try {
      await goalsService.saveGoal(account.id, masterKey, {
        churchId: null, year, metric: 'donors', target: Number(doadoresInput), targetKind: 'percent',
      })
      setDoadoresInput('')
      setNotice('Meta de doadores salva.')
      await reload()
    } catch (motivo) {
      setError(motivo instanceof Error ? motivo.message : 'Não foi possível salvar a meta de doadores.')
    }
  }

  async function lerPdf(file?: File) {
    if (!file) return
    setBusy(true); setError(''); setNotice(''); setPreview(null)
    try {
      validatePdfFile(file)
      const bytes = await file.arrayBuffer()
      const texto = await extractPdfText(bytes)
      setTextoLido(texto)
      setMostrarTexto(false)
      setAnoAnteriorDoPdf(null)
      const hash = await pdfHash(bytes)
      if (area === 'baptisms') {
        setPreview(previaDeBatismos(texto, hash, churches))
      } else if (area && ehFinanceira(area)) {
        const lida = previaFinanceira(texto, hash, churches)
        setAnoAnteriorDoPdf({ ano: lida.anoAnterior, total: area === 'offerings' ? lida.totaisDoAnoAnterior.offerings : lida.totaisDoAnoAnterior.tithes })
        setPreview(lida)
      } else {
        setPreview(parseGoalsPdf(texto, hash))
      }
    } catch (motivo) {
      setError(motivo instanceof Error ? motivo.message : 'Não foi possível ler o arquivo. Nada foi alterado; escolha outro e tente de novo.')
    } finally { setBusy(false) }
  }

  async function aplicarPreview() {
    if (!account || !masterKey || !preview || !area) return
    setBusy(true); setError('')
    try {
      // Substituir o período coberto, não somar. Cada relatório do ACMS traz o
      // ano inteiro até a data dele: acrescentar faria os mesmos batismos
      // entrarem de novo a cada envio.
      const doRelatorio = preview as Partial<PreviaDeRelatorio>
      if (doRelatorio.periodos?.length && doRelatorio.metricas?.length) {
        await goalsService.replaceReportEntries(account.id, masterKey, doRelatorio.metricas, doRelatorio.periodos, preview.entries)
      } else {
        await goalsService.addEntries(account.id, masterKey, preview.entries.map((entry) => ({ ...entry, source: 'pdf' as const })))
      }
      // O ano anterior veio no mesmo arquivo: guardá-lo aqui é o que faz a
      // comparação existir sem trabalho manual nenhum.
      if (anoAnteriorDoPdf && guardaHistorico && anoAnteriorDoPdf.ano < year) {
        await goalsService.saveHistory(account.id, masterKey, {
          area: area as GoalHistoryData['area'],
          year: anoAnteriorDoPdf.ano,
          amount: anoAnteriorDoPdf.total,
          source: 'pdf',
          reference: `Comparativo de Entradas ${anoAnteriorDoPdf.ano}`,
        })
      }
      setPreview(null); setAnoAnteriorDoPdf(null); setNotice('Resultados aplicados.')
      await reload()
    } catch {
      setError('Não foi possível aplicar. Nada foi alterado.')
    } finally { setBusy(false) }
  }

  const nomeIgreja = (id: string) => churches.find((church) => church.id === id)?.name ?? 'Igreja'

  return (
    <div className="page-stack page-narrow">
      <Link className="text-link back-link" to="/app/metas"><ArrowLeft />Voltar às metas</Link>
      <header className="page-hero"><div><p className="eyebrow">{year}</p><h1>{GOAL_AREA_LABELS[area]}</h1></div></header>
      {error && <div className="alert alert--error" role="alert">{error}</div>}
      {notice && <div className="alert alert--success" role="status">{notice}</div>}

      <Card title="No ano">
        <div className="goal-card__numbers">
          <div><small>Meta anual</small><strong>{progresso.target > 0 ? formatGoalValue(area, progresso.objective || progresso.target) : 'A definir'}</strong></div>
          <div><small>Resultado</small><strong>{formatGoalValue(area, progresso.result)}</strong></div>
          <div><small>Falta</small><strong>{progresso.target > 0 ? formatGoalValue(area, progresso.missing) : '—'}</strong></div>
        </div>
        <div className="goal-bar" role="img" aria-label={`${progresso.percent}% da meta`}><span style={{ width: `${progresso.percent}%` }} /></div>
        <p className="goal-card__percent">{progresso.target > 0 ? `${progresso.percent}% alcançado` : 'Defina a meta do ano para acompanhar'}</p>
        {anoTerminou && progresso.target > 0 && <p className="card-copy">{progresso.reached ? 'Meta do ano alcançada.' : `Faltaram ${formatGoalValue(area, progresso.missing)} para a meta do ano.`}</p>}
      </Card>

      {/*
        Todos os anos de uma vez, mês a mês, com o total de cada um.
        A comparação de dois anos respondia "melhorou ou piorou". Não respondia
        a pergunta de quem tem quatro anos de distrito: em que mês o distrito
        batiza, e o que mudou de um ano para o outro. Para isso é preciso ver os
        anos juntos — e é daqui que sai a ideia, não do número isolado.
      */}
      {anosResumidos.length > 0 && <Card title="Ano a ano" eyebrow={`Mês a mês, com o total de cada ano`}>
        <div className="goal-months-scroll">
          <table className="goal-anos">
            <thead>
              <tr><th scope="col">Ano</th>{MONTH_LABELS.map((mes) => <th scope="col" key={mes}>{mes}</th>)}<th scope="col">Total</th><th scope="col">Variação</th></tr>
            </thead>
            <tbody>
              {anosResumidos.map(({ ano, meses, total }, indiceDoAno) => {
                // Contra o ano de cima, no mesmo período: doze meses contra
                // oito parecem uma queda enorme e podem ser um crescimento.
                const anterior = anosResumidos[indiceDoAno - 1]
                const variacao = anterior ? variacaoNoMesmoPeriodo(anterior.meses, meses) : null
                return <tr key={ano}>
                  <th scope="row">{ano}</th>
                  {meses.map((valor, indice) => <td key={indice} className={valor === 0 ? 'goal-anos__vazio' : ''}>{valor === 0 ? '—' : formatGoalValue(area, valor)}</td>)}
                  <td className="goal-anos__total">{formatGoalValue(area, total)}</td>
                  <td className={variacao === null ? 'goal-anos__vazio' : variacao < 0 ? 'quadro--falta' : 'quadro--alcancado'}>{variacao === null ? '—' : `${variacao >= 0 ? '+' : '−'}${Math.abs(variacao).toFixed(1)}%`}</td>
                </tr>
              })}
            </tbody>
          </table>
        </div>
      </Card>}

      {igrejasPorAno.length > 0 && anosResumidos.length > 1 && <Card title="Por igreja, ano a ano" eyebrow="Onde mudou">
        <div className="goal-months-scroll">
          <table className="goal-anos">
            <thead>
              <tr><th scope="col">Igreja</th>{anosResumidos.map(({ ano }) => <th scope="col" key={ano}>{ano}</th>)}<th scope="col">Variação</th></tr>
            </thead>
            <tbody>
              {igrejasPorAno.map(({ churchId, totais, meses }) => {
                const ultimo = anosResumidos[anosResumidos.length - 1]
                const penultimo = anosResumidos[anosResumidos.length - 2]
                const variacao = ultimo && penultimo
                  ? variacaoNoMesmoPeriodo(meses.get(penultimo.ano) ?? [], meses.get(ultimo.ano) ?? [])
                  : null
                return <tr key={churchId}>
                  <th scope="row" className="goal-anos__igreja">{nomeIgreja(churchId)}</th>
                  {anosResumidos.map(({ ano }) => {
                    const valor = totais.get(ano) ?? 0
                    return <td key={ano} className={valor === 0 ? 'goal-anos__vazio' : ''}>{valor === 0 ? '—' : formatGoalValue(area, valor)}</td>
                  })}
                  <td className={variacao === null ? 'goal-anos__vazio' : variacao < 0 ? 'quadro--falta' : 'quadro--alcancado'}>{variacao === null ? '—' : `${variacao >= 0 ? '+' : '−'}${Math.abs(variacao).toFixed(1)}%`}</td>
                </tr>
              })}
            </tbody>
          </table>
        </div>
      </Card>}

      {/*
        A comparação é do **mesmo período**, e não do ano inteiro passado contra
        o ano em andamento. Cento e quatorze de doze meses contra trinta e
        quatro de oito parece uma queda enorme e pode ser um crescimento: a
        conta antiga mentia, e um número que mente é pior do que número nenhum.
      */}
      {guardaHistorico && <Card title={`Comparação com ${anoComparado} e anos anteriores`} eyebrow={comparacao.ateOMes > 0 ? `Janeiro a ${MONTH_LABELS[comparacao.ateOMes - 1]}, nos dois anos` : 'Sem resultado neste ano ainda'}>
        <p className="card-copy">Envie {AREA_PDF_DOCUMENT[area]?.artigo ?? 'o'} {AREA_PDF_DOCUMENT[area]?.nome ?? 'relatório'} de anos anteriores — até {ANOS_DE_HISTORICO} atrás — para comparar com qualquer um deles, ano a ano e mês a mês.</p>
        {anosDisponiveis.length > 1 && <label className="field goal-ano-base">
          <span className="field__label">Comparar com</span>
          <select className="field__input" value={anoComparado} onChange={(event) => setAnoBase(Number(event.target.value))}>
            {anosDisponiveis.map((ano) => <option key={ano} value={ano}>{ano}</option>)}
          </select>
        </label>}
        {comparacao.ateOMes === 0
          ? <p className="field__hint">Envie {AREA_PDF_DOCUMENT[area]?.artigo ?? 'o'} {AREA_PDF_DOCUMENT[area]?.nome ?? 'relatório'} deste ano para a comparação aparecer.</p>
          : <>
            <div className="goal-compare">
              <div>
                <small>{anoComparado}</small>
                <strong>{formatGoalValue(area, comparacao.acumuladoAnterior)}</strong>
              </div>
              <div>
                <small>{year}</small>
                <strong>{formatGoalValue(area, comparacao.acumuladoAtual)}</strong>
              </div>
              <div className={`goal-compare__variacao${comparacao.variacao === null ? '' : comparacao.variacao < 0 ? ' goal-compare__variacao--queda' : ' goal-compare__variacao--alta'}`}>
                <small>No mesmo período</small>
                <strong>{comparacao.variacao === null ? '—' : `${comparacao.variacao >= 0 ? '+' : '−'}${Math.abs(comparacao.variacao)}%`}</strong>
              </div>
            </div>
            {comparacao.variacao === null && <p className="field__hint">Ainda não há resultado de {anoComparado} no mesmo período para comparar.</p>}
          </>}
      </Card>}

      {/*
        Doze meses com as duas barras lado a lado. No celular a lista rola na
        horizontal em vez de encolher: barra espremida não deixa comparar nada,
        que é a única coisa que este gráfico existe para permitir.
      */}
      <Card title="Mês a mês" eyebrow={`${anoComparado} e ${year} lado a lado`}>
        <div className="goal-months-scroll">
          <ul className="goal-months goal-months--duplo">{comparacao.meses.map(({ mes, atual, anterior }) => {
            const teto = Math.max(1, ...comparacao.meses.flatMap((item) => [item.atual, item.anterior]))
            const caiu = anterior > 0 && atual < anterior
            return <li key={MONTH_LABELS[mes - 1]}>
              <span className="goal-months__par">
                <span className="goal-months__bar goal-months__bar--anterior" title={`${MONTH_LABELS[mes - 1]} de ${anoComparado}: ${formatGoalValue(area, anterior)}`}>
                  <span style={{ height: `${Math.round((anterior / teto) * 100)}%` }} />
                </span>
                <span className={`goal-months__bar${caiu ? ' goal-months__bar--queda' : ''}`} title={`${MONTH_LABELS[mes - 1]} de ${year}: ${formatGoalValue(area, atual)}`}>
                  <span style={{ height: `${Math.round((atual / teto) * 100)}%` }} />
                </span>
              </span>
              <small>{MONTH_LABELS[mes - 1]}</small>
              {/*
                O gráfico mostra a forma; o número mostra o tamanho. Sem ele,
                dois meses parecidos ficam indistinguíveis, e é justamente a
                diferença entre eles que se foi procurar ali.
              */}
              <small className="goal-months__valores">
                <span className="goal-months__valor--anterior">{formatGoalValue(area, anterior)}</span>
                <span className={caiu ? 'goal-months__valor--queda' : ''}>{formatGoalValue(area, atual)}</span>
              </small>
            </li>
          })}</ul>
        </div>
        <p className="goal-months__legenda"><span className="goal-months__amostra goal-months__amostra--anterior" />{anoComparado}<span className="goal-months__amostra" />{year}</p>
      </Card>

      <h2 className="goal-section">Ajustes</h2>

      <Card title="Meta do distrito">
        {progresso.legacyValueTarget && <div className="alert alert--warning" role="status">
          Esta meta foi guardada como valor, antes de a área passar a ser combinada em porcentagem. Ela continua valendo assim — o aplicativo não a converte sozinho, porque transformar um valor em porcentagem inventaria um número. Informe abaixo quanto de aumento você quer sobre {year - 1}.
        </div>}
        {progresso.withoutBaseline && <div className="alert alert--warning" role="status">
          A meta está em porcentagem e ainda não há resultado de {year - 1} para comparar. Envie {AREA_PDF_DOCUMENT[area]?.artigo ?? 'o'} {AREA_PDF_DOCUMENT[area]?.nome ?? 'relatório'} — ele traz o ano anterior junto — e o objetivo aparece sozinho.
        </div>}
        {progresso.target > 0 && !alterandoMeta
          ? <p className="goal-definida">
              <strong>{PERCENT_TARGET_AREAS.includes(area) && progresso.targetKind === 'percent'
                ? `+${progresso.target}% sobre ${year - 1}${progresso.objective > 0 ? ` · ${formatGoalValue(area, progresso.objective)}` : ''}`
                : formatGoalValue(area, progresso.target)}</strong>
              <button type="button" className="text-button" onClick={() => setAlterandoMeta(true)}>Alterar</button>
            </p>
          : <form className="inline-form" onSubmit={(event) => { setAlterandoMeta(false); void salvarMeta(event, null, districtInput) }}>
              <Field
                label={PERCENT_TARGET_AREAS.includes(area) ? `Aumento sobre ${year - 1} (%)` : 'Total do ano'}
                name="district-target"
                type="number"
                min={0}
                value={districtInput}
                onChange={(event) => setDistrictInput(event.target.value)}
                hint={PERCENT_TARGET_AREAS.includes(area) ? `Quanto a mais que ${year - 1}, em porcentagem.` : undefined}
              />
              <Button type="submit" disabled={!districtInput}>Salvar</Button>
              {progresso.target > 0 && <Button type="button" variant="secondary" onClick={() => setAlterandoMeta(false)}>Cancelar</Button>}
            </form>}
        {progresso.targetsMismatch && <p className="field__hint">A soma das igrejas está em {formatGoalValue(area, progresso.churchTargetsSum)}, diferente do total do distrito.</p>}
      </Card>

      {/*
        O consolidado do ano anterior é digitado à mão só quando não veio de
        relatório nenhum. Pedir o que o aplicativo já sabe é o tipo de campo que
        faz o pastor duvidar se o número que ele está vendo vale.
      */}
      {guardaHistorico && (!progresso.hasPrevious || corrigindoAnoAnterior) && <Card title={`Resultado de ${year - 1}`} eyebrow={progresso.hasPrevious ? 'Corrigindo' : 'Sem relatório do ano anterior'}>
        <p className="card-copy">{progresso.hasPrevious
          ? `Hoje o aplicativo usa ${formatGoalValue(area, progresso.previous)}, vindo do que já foi importado. Informe outro valor apenas se este estiver errado.`
          : `Envie ${AREA_PDF_DOCUMENT[area]?.artigo ?? 'o'} ${AREA_PDF_DOCUMENT[area]?.nome ?? 'relatório'} de ${year - 1}, ou informe o total aqui.`}</p>
        <form className="inline-form" onSubmit={(event) => { setCorrigindoAnoAnterior(false); void salvarAnoAnterior(event) }}>
          <Field label={`Total de ${year - 1}`} name="previous-year" type="number" min={0} step="any" value={previousInput} onChange={(event) => setPreviousInput(event.target.value)} />
          <Button type="submit" variant="secondary" disabled={!previousInput}>Guardar</Button>
        </form>
      </Card>}
      {guardaHistorico && progresso.hasPrevious && !corrigindoAnoAnterior && <p className="goal-origem">
        Resultado de {year - 1}: <strong>{formatGoalValue(area, progresso.previous)}</strong>, do que já foi importado.
        <button type="button" className="text-button" onClick={() => setCorrigindoAnoAnterior(true)}>Corrigir</button>
      </p>}

      {area === 'tithes' && (() => {
        const metaDeDoadores = goals.find((goal) => goal.churchId === null && goal.year === year && goal.metric === 'donors')
        const doadores = comparativoDeDoadores(pessoas, year, metaDeDoadores?.target ?? 0)
        return <Card title="Doadores" eyebrow="A outra metade da meta financeira">
          <p className="card-copy">Quantas pessoas devolvem, sistemáticas ou não. Entrada maior com os mesmos doadores é uma história; entrada maior com mais gente participando é outra.</p>
          <div className="goal-card__numbers">
            <div><small>{year}</small><strong>{doadores.atual}</strong></div>
            <div><small>{year - 1}</small><strong>{doadores.temAnterior ? doadores.anterior : '—'}</strong></div>
            {doadores.objetivo > 0 && <div><small>Objetivo</small><strong>{doadores.objetivo}</strong></div>}
          </div>
          {doadores.semBaseDeComparacao
            ? <p className="field__hint">Ainda não há leitura de fidelidade de {year - 1} para comparar. Envie lá o relatório daquele ano e o objetivo aparece sozinho.</p>
            : metaDeDoadores && <p className="goal-card__percent">Meta: +{metaDeDoadores.target}% sobre {year - 1} · {doadores.percentualAlcancado}% alcançado</p>}
          <Link className="text-link" to="/app/fidelidade">Abrir fidelidade</Link>
          
          <form className="inline-form" onSubmit={(event) => void salvarMetaDeDoadores(event)}>
            <Field
              label={`Aumento de doadores sobre ${year - 1} (%)`}
              name="donors-target"
              type="number"
              min={0}
              value={doadoresInput}
              onChange={(event) => setDoadoresInput(event.target.value)}
              hint={metaDeDoadores ? `Hoje: +${metaDeDoadores.target}%` : 'Quantos por cento a mais de pessoas devolvendo.'}
            />
            <Button type="submit" disabled={!doadoresInput}>Salvar</Button>
          </form>
        </Card>
      })()}

      {/*
        Doze igrejas em blocos altos, cada uma com o seu botão, viravam uma
        página inteira de formulário. Aqui é uma linha por igreja e um botão só:
        distribuir a meta é um gesto de uma vez, não doze gestos iguais.
      */}
      <Card title="Metas das igrejas" eyebrow="Distribuição do total">
        {churches.length === 0
          ? <p className="field__hint">Cadastre igrejas para distribuir a meta.</p>
          : <form onSubmit={(event) => void salvarMetasDasIgrejas(event)}>
            <ul className="goal-church-table">
              <li className="goal-church-table__cabecalho"><span>Igreja</span><span>Resultado</span><span>Meta</span></li>
              {porIgreja.map((item) => (
                <li key={item.churchId}>
                  <span className="goal-church-table__nome">{nomeIgreja(item.churchId)}</span>
                  <span className="goal-church-table__resultado">{formatGoalValue(area, item.result)}</span>
                  <input
                    className="field__input"
                    type="number"
                    min={0}
                    aria-label={`Meta de ${nomeIgreja(item.churchId)}`}
                    placeholder={item.target > 0 ? String(item.target) : '—'}
                    value={churchInputs[item.churchId] ?? ''}
                    onChange={(event) => setChurchInputs((atual) => ({ ...atual, [item.churchId]: event.target.value }))}
                  />
                </li>
              ))}
            </ul>
            <div className="form-actions">
              <Button type="submit" disabled={busy || !Object.values(churchInputs).some((valor) => valor.trim())}>Salvar metas</Button>
            </div>
          </form>}
      </Card>

      {AREA_USES_PDF[area] && (
        <Card className={semNenhumResultado ? 'goal-pdf-card goal-pdf-card--primeiro' : 'goal-pdf-card'} title={`Enviar ${AREA_PDF_DOCUMENT[area]?.artigo ?? 'o'} ${AREA_PDF_DOCUMENT[area]?.nome ?? 'PDF'}`} eyebrow="Resultados do período">
          <p className="card-copy">{AREA_PDF_DOCUMENT[area]?.caminho}</p>
          <label className="file-picker">
            <FileUp />
            <span><strong>{busy ? 'Lendo o arquivo…' : `Escolher ${AREA_PDF_DOCUMENT[area]?.artigo ?? 'o'} ${AREA_PDF_DOCUMENT[area]?.nome ?? 'PDF'}`}</strong><small>Você confere igreja, período e totais antes de salvar.</small></span>
            <input type="file" accept="application/pdf,.pdf" disabled={busy} onChange={(event) => { void lerPdf(event.target.files?.[0]); event.currentTarget.value = '' }} />
          </label>
          {textoLido && preview?.entries.length === 0 && <>
            <button type="button" className="text-button" onClick={() => setMostrarTexto((atual) => !atual)}>
              {mostrarTexto ? 'Esconder o texto lido' : 'Ver o texto que foi lido do arquivo'}
            </button>
            {mostrarTexto && <>
              <p className="field__hint">Isto é o que o aplicativo enxergou dentro do PDF. Serve para descobrir por que o formato não foi reconhecido — o arquivo em si não sai deste aparelho.</p>
              <textarea className="field__input" rows={12} readOnly value={textoLido} aria-label="Texto lido do arquivo" />
            </>}
          </>}
          {preview && <div className="goal-preview">
            <h3>Confira antes de salvar</h3>
            {preview.entries.length === 0
              ? <p className="field__hint">Nenhum resultado foi reconhecido neste arquivo. Nada foi alterado — confira o arquivo e envie de novo.</p>
              : <ul className="goal-preview__list">{preview.entries.map((entry, indice) => (
                <li key={`${entry.churchId}-${entry.date}-${indice}`}><span>{nomeIgreja(entry.churchId)}<small>{entry.date}</small></span><strong>{formatGoalValue(area, entry.amount)}</strong></li>
              ))}</ul>}
            {preview.errors.length > 0 && <ul className="goal-preview__warnings">{preview.errors.map((aviso, indice) => <li key={indice}>{aviso}</li>)}</ul>}
            <div className="form-actions">
              <Button onClick={() => void aplicarPreview()} disabled={busy || preview.entries.length === 0}>Confirmar e salvar</Button>
              <Button variant="secondary" onClick={() => setPreview(null)}>Descartar</Button>
            </div>
          </div>}
        </Card>
      )}

      {/*
        O cadastro fica na mesma página da meta que ele alimenta. Estavam em
        telas separadas, e o pastor tinha de sair da meta para lançar o que a
        meta conta — depois voltar para ver se o número mexeu.
      */}
      {area === 'bible_studies' && <MissionaryPage embutida />}
    </div>
  )
}
