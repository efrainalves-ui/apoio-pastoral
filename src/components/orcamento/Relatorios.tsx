import { useCallback, useMemo, useState } from 'react'
import { formatar, type Centavos } from '../../family-budget/dinheiro'
import type { Cartao, Conta, Integrante, Lancamento, Transferencia } from '../../family-budget/lancamento'
import { nomeDoIntegrante } from '../../family-budget/lancamento'
import type { Aporte, Meta } from '../../family-budget/metas'
import {
  fluxoFuturo, limitesDoPeriodo, noPeriodo, patrimonio, PERIODO_LABELS, PERIODOS,
  relatorioDeDividas, relatorioDeEntradas, relatorioDeMetas, relatorioDeSaidas, relatorioFamiliar,
  type LinhaDeRelatorio, type Periodo,
} from '../../family-budget/relatorios'
import { planejadoVersusRealizado } from '../../family-budget/calculos'

interface RelatoriosProps {
  mes: string
  hoje: string
  lancamentos: Lancamento[]
  transferencias: Transferencia[]
  contas: Conta[]
  cartoes: Cartao[]
  integrantes: Integrante[]
  metas: Meta[]
  aportes: Aporte[]
  planejado: Record<string, Centavos>
}

/**
 * Os relatórios.
 *
 * Todos saem das mesmas funções que a Visão Geral usa. Um relatório que soma
 * por conta própria diverge do painel, e o pastor fica sem saber em qual dos
 * dois acreditar — que é pior do que não ter relatório nenhum.
 */
export function Relatorios({
  mes, hoje, lancamentos, transferencias, contas, cartoes, integrantes, metas, aportes, planejado,
}: RelatoriosProps) {
  const [periodo, setPeriodo] = useState<Periodo>('mes')
  const [de, setDe] = useState(mes)
  const [ate, setAte] = useState(mes)

  const limites = useMemo(() => limitesDoPeriodo(periodo, mes, { de, ate }), [periodo, mes, de, ate])
  const noRecorte = useMemo(() => noPeriodo(lancamentos, limites), [lancamentos, limites])
  const nome = useCallback((id: string | null) => nomeDoIntegrante(integrantes, id), [integrantes])

  const entradas = useMemo(() => relatorioDeEntradas(noRecorte, nome), [noRecorte, nome])
  const saidas = useMemo(() => relatorioDeSaidas(noRecorte, nome, contas, cartoes), [noRecorte, nome, contas, cartoes])
  const dividas = useMemo(() => relatorioDeDividas(noRecorte, mes), [noRecorte, mes])
  const orcamento = useMemo(() => planejadoVersusRealizado(noRecorte, planejado), [noRecorte, planejado])
  const metasResumo = useMemo(() => relatorioDeMetas(metas, aportes), [metas, aportes])
  const bens = useMemo(() => patrimonio(contas, lancamentos, transferencias, dividas), [contas, lancamentos, transferencias, dividas])
  const futuro = useMemo(() => fluxoFuturo(lancamentos, hoje), [lancamentos, hoje])
  const familiar = useMemo(() => relatorioFamiliar(noRecorte, aportes, dividas), [noRecorte, aportes, dividas])

  const vazio = !noRecorte.length

  return <div className="painel-financeiro">
    <div className="tira-filtros" role="group" aria-label="Período do relatório">
      {PERIODOS.map((opcao) => <button
        key={opcao}
        type="button"
        aria-pressed={periodo === opcao}
        className={`chip-filtro ${periodo === opcao ? 'chip-filtro--ativo' : ''}`}
        onClick={() => setPeriodo(opcao)}
      >{PERIODO_LABELS[opcao]}</button>)}
    </div>

    {periodo === 'personalizado' && <div className="form-grid">
      <label className="field" htmlFor="relatorio-de">
        <span className="field__label">De</span>
        <input id="relatorio-de" className="field__input" type="month" value={de} onChange={(evento) => setDe(evento.target.value)} />
      </label>
      <label className="field" htmlFor="relatorio-ate">
        <span className="field__label">Até</span>
        <input id="relatorio-ate" className="field__input" type="month" value={ate} onChange={(evento) => setAte(evento.target.value)} />
      </label>
    </div>}

    {vazio && <div className="empty-state">
      <strong>Nada registrado neste período</strong>
      <span>Escolha outro período ou registre entradas e saídas.</span>
    </div>}

    {!vazio && <>
      <section className="faixa" aria-label="Resumo familiar">
        <h2 className="rotulo-secao">Resumo familiar</h2>
        <dl className="estrato">
          <div><dt>Renda</dt><dd className="valor-entrada">{formatar(familiar.renda)}</dd></div>
          <div><dt>Despesas</dt><dd>{formatar(familiar.despesas)}</dd></div>
          <div><dt>Economia</dt><dd className={familiar.economia < 0 ? 'valor-negativo' : ''}>{formatar(familiar.economia)}</dd></div>
          <div><dt>Taxa de economia</dt><dd>{familiar.taxaDeEconomia.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%</dd></div>
          <div><dt>Guardado em metas</dt><dd>{formatar(familiar.guardadoEmMetas)}</dd></div>
          <div><dt>Renda comprometida</dt><dd className={familiar.comprometimentoComDividas > 30 ? 'valor-atencao' : ''}>{familiar.comprometimentoComDividas.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%</dd></div>
        </dl>
      </section>

      <Quadro titulo="Entradas por integrante" linhas={entradas.porIntegrante} />
      <Quadro titulo="Entradas por categoria" linhas={entradas.porCategoria} />
      <Quadro titulo="Saídas por categoria" linhas={saidas.porCategoria} />
      <Quadro titulo="Saídas por subcategoria" linhas={saidas.porSubcategoria.slice(0, 12)} />
      <Quadro titulo="Quem pagou" linhas={saidas.porIntegrante} />
      <Quadro titulo="Forma de pagamento" linhas={saidas.porFormaDePagamento} />
      {Boolean(saidas.porConta.length) && <Quadro titulo="Por conta" linhas={saidas.porConta} />}
      {Boolean(saidas.porCartao.length) && <Quadro titulo="Por cartão" linhas={saidas.porCartao} />}

      <section className="faixa" aria-label="Fixas e variáveis">
        <h2 className="rotulo-secao">Fixas e variáveis</h2>
        <dl className="estrato">
          <div><dt>Fixas</dt><dd>{formatar(saidas.fixas)}</dd></div>
          <div><dt>Variáveis</dt><dd>{formatar(saidas.variaveis)}</dd></div>
          <div><dt>Pagas</dt><dd>{formatar(saidas.pagas)}</dd></div>
          <div><dt>Pendentes</dt><dd className="valor-atencao">{formatar(saidas.pendentes)}</dd></div>
        </dl>
      </section>

      {Boolean(orcamento.length) && <section className="faixa" aria-label="Planejado e realizado">
        <h2 className="rotulo-secao">Planejado e realizado</h2>
        <div className="tabela-orcamento">
          {orcamento.map((linha) => <div key={linha.categoria} className={linha.percentual > 100 ? 'estourou' : ''}>
            <span className="tabela-orcamento__nome">{linha.nome}</span>
            <span className="tabela-orcamento__barra" aria-hidden="true"><span style={{ width: `${Math.min(100, linha.percentual)}%` }} /></span>
            <span className="tabela-orcamento__valores">
              {formatar(linha.realizado)}<small>de {formatar(linha.planejado)}</small>
            </span>
          </div>)}
        </div>
      </section>}

      {dividas.parcelasRestantes > 0 && <section className="faixa" aria-label="Dívidas e parcelas">
        <h2 className="rotulo-secao">Dívidas e parcelas</h2>
        <dl className="estrato">
          <div><dt>Saldo devedor</dt><dd>{formatar(dividas.saldo)}</dd></div>
          <div><dt>Sai por mês</dt><dd>{formatar(dividas.mensal)}</dd></div>
          <div><dt>Parcelas restantes</dt><dd>{dividas.parcelasRestantes}</dd></div>
          <div><dt>Última parcela</dt><dd>{dividas.ultimaParcela ?? '—'}</dd></div>
        </dl>
        {Boolean(saidas.parceladas.length) && <Quadro titulo="Compras parceladas" linhas={saidas.parceladas} />}
      </section>}

      {Boolean(metasResumo.linhas.length) && <section className="faixa" aria-label="Metas">
        <h2 className="rotulo-secao">Metas</h2>
        <dl className="estrato">
          <div><dt>Objetivo total</dt><dd>{formatar(metasResumo.total)}</dd></div>
          <div><dt>Já guardado</dt><dd className="valor-entrada">{formatar(metasResumo.guardado)}</dd></div>
          <div><dt>Falta</dt><dd>{formatar(metasResumo.falta)}</dd></div>
        </dl>
        <Quadro titulo="Por meta" linhas={metasResumo.linhas} />
      </section>}

      <section className="faixa" aria-label="Patrimônio">
        <h2 className="rotulo-secao">Patrimônio</h2>
        <dl className="estrato">
          <div><dt>Ativos</dt><dd className="valor-entrada">{formatar(bens.ativos)}</dd></div>
          <div><dt>Passivos</dt><dd>{formatar(bens.passivos)}</dd></div>
          <div><dt>Patrimônio líquido</dt><dd className={bens.liquido < 0 ? 'valor-negativo' : ''}>{formatar(bens.liquido)}</dd></div>
        </dl>
        {Boolean(bens.porConta.length) && <Quadro titulo="Saldo por conta" linhas={bens.porConta} />}
      </section>

      <section className="faixa" aria-label="Fluxo de caixa futuro">
        <h2 className="rotulo-secao">Próximos {futuro.dias} dias</h2>
        <dl className="estrato">
          <div><dt>Entradas previstas</dt><dd className="valor-entrada">{formatar(futuro.entradasPrevistas)}</dd></div>
          <div><dt>Saídas previstas</dt><dd>{formatar(futuro.saidasPrevistas)}</dd></div>
          <div><dt>Saldo projetado</dt><dd className={futuro.saldoProjetado < 0 ? 'valor-negativo' : ''}>{formatar(futuro.saldoProjetado)}</dd></div>
        </dl>
      </section>
    </>}
  </div>
}

function Quadro({ titulo, linhas }: { titulo: string; linhas: LinhaDeRelatorio[] }) {
  if (!linhas.length) return null
  return <section className="faixa" aria-label={titulo}>
    <h3 className="rotulo-secao">{titulo}</h3>
    <dl className="lista-fatias">
      {linhas.map((linha) => <div key={linha.chave}>
        <dt>{linha.nome}</dt>
        <dd>{formatar(linha.valor)}<small>{linha.percentual.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%</small></dd>
      </div>)}
    </dl>
  </section>
}
