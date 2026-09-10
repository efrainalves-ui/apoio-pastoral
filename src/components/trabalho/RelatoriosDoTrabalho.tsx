import { useMemo, useState } from 'react'
import { formatar } from '../../family-budget/dinheiro'
import type { Contracheque } from '../../work-budget/contracheque'
import { SITUACAO_DO_LANCAMENTO_LABELS, type LancamentoDoTrabalho } from '../../work-budget/lancamento'
import type { AquisicaoLetra, ItemDoCatalogoLetra, OrcamentoLetraData } from '../../work-budget/letra'
import {
  doBolsoPorFamilia, evolucao, noPeriodo, porFamilia, porSituacao, porSubcategoria,
  relatorioDoAno, ultimosMeses, type LinhaDoRelatorio,
} from '../../work-budget/relatorios'
import { AreaChart } from '../ui/AreaChart'
import { Card } from '../ui/Card'

interface RelatoriosDoTrabalhoProps {
  mes: string
  lancamentos: LancamentoDoTrabalho[]
  contracheques: Contracheque[]
  orcamentoLetra: (OrcamentoLetraData & { id: string }) | null
  itensLetra: ItemDoCatalogoLetra[]
  aquisicoes: AquisicaoLetra[]
}

const RECORTES = { mes: 'Mês', trimestre: 'Trimestre', ano: 'Ano' } as const
type Recorte = keyof typeof RECORTES

/**
 * Os relatórios do Trabalho.
 *
 * Todos saem das mesmas funções que as telas usam. Um relatório que soma por
 * conta própria diverge do painel, e o pastor fica sem saber em qual dos dois
 * acreditar.
 */
export function RelatoriosDoTrabalho({
  mes, lancamentos, contracheques, orcamentoLetra, itensLetra, aquisicoes,
}: RelatoriosDoTrabalhoProps) {
  const [recorte, setRecorte] = useState<Recorte>('mes')
  const ano = mes.slice(0, 4)

  const limites = useMemo(() => {
    if (recorte === 'ano') return { de: `${ano}-01`, ate: `${ano}-12` }
    if (recorte === 'trimestre') {
      const meses = ultimosMeses(mes, 3)
      return { de: meses[0] ?? mes, ate: mes }
    }
    return { de: mes, ate: mes }
  }, [recorte, mes, ano])

  const noRecorte = useMemo(() => noPeriodo(lancamentos, limites), [lancamentos, limites])
  const familias = useMemo(() => porFamilia(noRecorte), [noRecorte])
  const itens = useMemo(() => porSubcategoria(noRecorte), [noRecorte])
  const bolso = useMemo(() => doBolsoPorFamilia(noRecorte), [noRecorte])
  const situacoes = useMemo(() => porSituacao(noRecorte), [noRecorte])
  const linha = useMemo(() => evolucao(lancamentos, ultimosMeses(mes, 6)), [lancamentos, mes])
  const doAno = useMemo(
    () => relatorioDoAno(ano, { lancamentos, contracheques, orcamentoLetra, itensLetra, aquisicoes }),
    [ano, lancamentos, contracheques, orcamentoLetra, itensLetra, aquisicoes],
  )

  return <>
    <div className="tira-filtros" role="group" aria-label="Período do relatório">
      {(Object.keys(RECORTES) as Recorte[]).map((opcao) => <button
        key={opcao}
        type="button"
        aria-pressed={recorte === opcao}
        className={`chip-filtro ${recorte === opcao ? 'chip-filtro--ativo' : ''}`}
        onClick={() => setRecorte(opcao)}
      >{RECORTES[opcao]}</button>)}
    </div>

    {noRecorte.length === 0 && <div className="empty-state">
      <strong>Nada lançado neste período</strong>
      <span>Escolha outro período ou registre um lançamento.</span>
    </div>}

    {noRecorte.length > 0 && <>
      <Quadro titulo="Por categoria" linhas={familias} />
      <Quadro titulo="Por item" linhas={itens.slice(0, 12)} />
      {/*
        Diferente do pago: o pago inclui o que voltou. Esta é a conta que
        responde à pergunta que o módulo existe para responder.
      */}
      <Quadro titulo="Do bolso, por categoria" linhas={bolso} />

      <Card title="Por situação">
        <dl className="estrato memoria-do-calculo">
          {situacoes.map((situacao) => <div key={situacao.situacao}>
            <dt>{SITUACAO_DO_LANCAMENTO_LABELS[situacao.situacao]}</dt>
            <dd>{formatar(situacao.valor)}<small> · {situacao.quantidade}</small></dd>
          </div>)}
        </dl>
      </Card>
    </>}

    {linha.some(({ pago }) => pago > 0) && <Card title="Do bolso, seis meses">
      <AreaChart
        valores={linha.map(({ doBolso }) => doBolso / 100)}
        rotulos={linha.map(({ competencia }) => competencia.slice(5))}
        label="Do bolso por mês"
        formatar={(valor) => formatar(Math.round(valor * 100))}
      />
    </Card>}

    <Card title={`Ano de ${ano}`}>
      <dl className="estrato">
        <div><dt>Pago no ministério</dt><dd>{formatar(doAno.pago)}</dd></div>
        <div><dt>Recebido de volta</dt><dd>{formatar(doAno.recebido)}</dd></div>
        <div><dt>Do bolso</dt><dd>{formatar(doAno.doBolso)}</dd></div>
      </dl>
      {/*
        Somas separadas de propósito: juntá-las diria que o pastor ganhou o que
        ele adiantou.
      */}
      <dl className="estrato memoria-do-calculo">
        <div><dt>Líquido da folha</dt><dd>{formatar(doAno.liquidoDaFolha)}</dd></div>
        <div><dt>Outras bases informativas</dt><dd>{formatar(doAno.basesInformativas)}</dd></div>
        <div><dt>LETRA usado</dt><dd>{formatar(doAno.letra.usadoEmLivros + doAno.letra.usadoEmOutros)}</dd></div>
        <div><dt>LETRA disponível</dt><dd>{formatar(doAno.letra.saldoTotal)}</dd></div>
      </dl>
    </Card>
  </>
}

function Quadro({ titulo, linhas }: { titulo: string; linhas: LinhaDoRelatorio[] }) {
  if (!linhas.length) return null
  return <Card title={titulo}>
    <dl className="lista-fatias">
      {linhas.map((linha) => <div key={linha.chave}>
        <dt>{linha.nome}</dt>
        <dd>{formatar(linha.valor)}<small>{linha.percentual.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%</small></dd>
      </div>)}
    </dl>
  </Card>
}
