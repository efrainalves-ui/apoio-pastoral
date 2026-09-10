import { AlertTriangle, TrendingDown, TrendingUp } from 'lucide-react'
import { useMemo } from 'react'
import {
  fixasEVariaveis, paraOndeFoi, planejadoVersusRealizado, rendaPorIntegrante,
  resumoDoMes, taxaDeEconomia, vencimentos,
} from '../../family-budget/calculos'
import { formatar, percentual, somar, type Centavos } from '../../family-budget/dinheiro'
import { alertasDoOrcamento, compararMeses, evolucao, insightsDoMes, ultimosMeses } from '../../family-budget/insights'
import { nomeDoIntegrante, type Integrante, type Lancamento } from '../../family-budget/lancamento'
import { AreaChart } from '../ui/AreaChart'
import { ProgressRing } from '../ui/ProgressRing'

const diaCurto = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short' })
function dia(chave: string): string {
  const data = new Date(`${chave}T12:00:00`)
  return Number.isNaN(data.getTime()) ? chave : diaCurto.format(data).replace(/\sde\s/gu, ' ').replace(/\.(?=\s|$)/gu, '')
}

/* Uma cor por fatia, na mesma família do resto do aplicativo. */
const CORES = ['#2c6c5a', '#4f9ad8', '#e5a53f', '#b57ac4', '#e0785f', '#64c07a', '#35b8c4', '#9aa8a1']

interface VisaoGeralProps {
  mes: string
  doMes: Lancamento[]
  doMesAnterior: Lancamento[]
  todos: Lancamento[]
  integrantes: Integrante[]
  planejado: Record<string, Centavos>
  hoje: string
}

/**
 * O painel do mês.
 *
 * Ele responde três perguntas na ordem em que se faz: quanto sobrou, quanto
 * ainda tem dono, e para onde foi. Saldo e livre não são a mesma coisa — quem
 * olha só o saldo gasta dinheiro que já está comprometido, e é isso que faz a
 * conta não fechar no fim do mês.
 */
export function VisaoGeral({ mes, doMes, doMesAnterior, todos, integrantes, planejado, hoje }: VisaoGeralProps) {
  const resumo = useMemo(() => resumoDoMes(doMes), [doMes])
  const fatias = useMemo(() => paraOndeFoi(doMes), [doMes])
  const tipos = useMemo(() => fixasEVariaveis(doMes), [doMes])
  const renda = useMemo(() => rendaPorIntegrante(doMes), [doMes])
  const aVencer = useMemo(() => vencimentos(doMes, hoje), [doMes, hoje])
  const orcamento = useMemo(() => planejadoVersusRealizado(doMes, planejado), [doMes, planejado])
  const comparacao = useMemo(() => compararMeses(doMes, doMesAnterior), [doMes, doMesAnterior])
  const avisos = useMemo(() => alertasDoOrcamento(doMes, planejado), [doMes, planejado])
  const frases = useMemo(() => insightsDoMes(doMes, doMesAnterior), [doMes, doMesAnterior])
  const linha = useMemo(() => evolucao(todos, ultimosMeses(mes, 6)), [todos, mes])

  const totalPlanejado = somar(Object.values(planejado))
  const usado = percentual(resumo.pago, totalPlanejado)
  const atrasadas = aVencer.filter(({ situacao }) => situacao === 'atrasada')

  return <div className="painel-financeiro">
    <section className="cartao-saldo" aria-label="Saldo do mês">
      <p className="cartao-saldo__rotulo">Saldo do mês</p>
      <p className="cartao-saldo__num">{formatar(resumo.saldo)}</p>
      <dl className="cartao-saldo__linhas">
        <div><dt>Entradas</dt><dd className="valor-entrada">{formatar(resumo.recebido)}</dd></div>
        <div><dt>Saídas</dt><dd>{formatar(resumo.pago)}</dd></div>
      </dl>
      {/*
        Comprometido e livre existem porque saldo sozinho engana: o que já tem
        dono não está disponível, por mais que apareça na conta.
      */}
      <dl className="cartao-saldo__linhas cartao-saldo__linhas--destaque">
        <div><dt>Ainda comprometido</dt><dd className="valor-atencao">{formatar(resumo.comprometido)}</dd></div>
        <div><dt>Livre para gastar</dt><dd className={resumo.livre < 0 ? 'valor-negativo' : 'valor-entrada'}>{formatar(resumo.livre)}</dd></div>
      </dl>
    </section>

    {Boolean(atrasadas.length) && <section className="aviso-atraso" aria-label="Contas vencidas">
      <AlertTriangle aria-hidden="true" />
      <div>
        <strong>{atrasadas.length === 1 ? '1 conta vencida' : `${atrasadas.length} contas vencidas`}</strong>
        <ul>{atrasadas.slice(0, 3).map(({ lancamento, dias }) => <li key={lancamento.id}>
          {lancamento.descricao} · {formatar(lancamento.valor)} · {Math.abs(dias)} {Math.abs(dias) === 1 ? 'dia' : 'dias'}
        </li>)}</ul>
      </div>
    </section>}

    {totalPlanejado > 0 && <section className="faixa" aria-label="Orçamento utilizado">
      <h2 className="rotulo-secao">Orçamento utilizado</h2>
      <div className="orcamento-usado">
        <ProgressRing percent={usado} label="Orçamento utilizado" size={78} tone={usado > 100 ? 'atencao' : 'ok'}>
          {Math.round(usado)}%
        </ProgressRing>
        <p>{formatar(resumo.pago)} de {formatar(totalPlanejado)}</p>
      </div>
    </section>}

    {renda.size > 0 && <section className="faixa" aria-label="Renda familiar">
      <h2 className="rotulo-secao">Renda familiar</h2>
      <p className="manchete__num">{formatar(resumo.recebido)}</p>
      <dl className="lista-renda">
        {[...renda.entries()]
          .sort(([, esquerda], [, direita]) => direita - esquerda)
          .map(([id, valor]) => <div key={id ?? 'familia'}>
            <dt>{nomeDoIntegrante(integrantes, id)}</dt>
            <dd>{formatar(valor)}</dd>
          </div>)}
      </dl>
    </section>}

    {Boolean(fatias.length) && <section className="faixa" aria-label="Para onde o dinheiro foi">
      <h2 className="rotulo-secao">Para onde o dinheiro foi</h2>
      <div className="barra-fatias" role="img" aria-label={fatias.map((fatia) => `${fatia.nome}: ${fatia.percentual}%`).join(', ')}>
        {fatias.map((fatia, indice) => <span
          key={fatia.categoria}
          style={{ width: `${fatia.percentual}%`, background: CORES[indice % CORES.length] }}
        />)}
      </div>
      <dl className="lista-fatias">
        {fatias.map((fatia, indice) => <div key={fatia.categoria}>
          <dt><span className="ponto-fatia" style={{ background: CORES[indice % CORES.length] }} aria-hidden="true" />{fatia.nome}</dt>
          <dd>{formatar(fatia.valor)}<small>{fatia.percentual.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%</small></dd>
        </div>)}
      </dl>
    </section>}

    {(tipos.fixas > 0 || tipos.variaveis > 0) && <section className="faixa" aria-label="Fixas e variáveis">
      <h2 className="rotulo-secao">Fixas e variáveis</h2>
      <dl className="estrato">
        <div><dt>Fixas</dt><dd>{formatar(tipos.fixas)}</dd></div>
        <div><dt>Variáveis</dt><dd>{formatar(tipos.variaveis)}</dd></div>
        <div><dt>Peso das fixas</dt><dd>{tipos.percentualFixas.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%</dd></div>
      </dl>
    </section>}

    {Boolean(orcamento.length) && totalPlanejado > 0 && <section className="faixa" aria-label="Planejado e realizado">
      <h2 className="rotulo-secao">Planejado e realizado</h2>
      <div className="tabela-orcamento">
        {orcamento.map((linhaDoOrcamento) => <div key={linhaDoOrcamento.categoria} className={linhaDoOrcamento.percentual > 100 ? 'estourou' : ''}>
          <span className="tabela-orcamento__nome">{linhaDoOrcamento.nome}</span>
          <span className="tabela-orcamento__barra" aria-hidden="true">
            <span style={{ width: `${Math.min(100, linhaDoOrcamento.percentual)}%` }} />
          </span>
          <span className="tabela-orcamento__valores">
            {formatar(linhaDoOrcamento.realizado)}<small>de {formatar(linhaDoOrcamento.planejado)}</small>
          </span>
        </div>)}
      </div>
    </section>}

    {Boolean(aVencer.length) && <section className="faixa" aria-label="Próximos vencimentos">
      <h2 className="rotulo-secao">Próximos vencimentos</h2>
      <dl className="lista-vencimentos">
        {aVencer.slice(0, 5).map(({ lancamento, dias, situacao }) => <div key={lancamento.id} className={situacao === 'atrasada' ? 'vencido' : ''}>
          <dt>{dias === 0 ? 'Hoje' : dia(lancamento.vencimento)}</dt>
          <dd>{lancamento.descricao}<strong>{formatar(lancamento.valor)}</strong></dd>
        </div>)}
      </dl>
    </section>}

    {linha.some(({ entradas, saidas }) => entradas > 0 || saidas > 0) && <section className="faixa" aria-label="Evolução financeira">
      <h2 className="rotulo-secao">Evolução em 6 meses</h2>
      <AreaChart
        valores={linha.map(({ economia }) => economia / 100)}
        rotulos={linha.map(({ mes: rotulo }) => rotulo.slice(5))}
        label="Economia por mês"
        formatar={(valor) => formatar(Math.round(valor * 100))}
      />
    </section>}

    {(comparacao.entradas.variacao !== null || comparacao.saidas.variacao !== null) && <section className="faixa" aria-label="Este mês e o anterior">
      <h2 className="rotulo-secao">Este mês e o anterior</h2>
      <dl className="estrato">
        <div><dt>Entradas</dt><dd>{sinal(comparacao.entradas.variacao)}</dd></div>
        <div><dt>Saídas</dt><dd>{sinal(comparacao.saidas.variacao)}</dd></div>
        <div><dt>Taxa de economia</dt><dd>{taxaDeEconomia(resumo).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%</dd></div>
      </dl>
    </section>}

    {Boolean(avisos.length) && <section className="faixa" aria-label="Alertas do orçamento">
      <h2 className="rotulo-secao">Alertas</h2>
      <ul className="lista-avisos">
        {avisos.map((aviso) => <li key={aviso.chave} className={aviso.grave ? 'grave' : ''}>{aviso.texto}</li>)}
      </ul>
    </section>}

    {Boolean(frases.length) && <section className="faixa" aria-label="Insights do mês">
      <h2 className="rotulo-secao">Insights do mês</h2>
      <ul className="lista-insights">
        {frases.map((insight) => <li key={insight.chave}>
          {insight.direcao === 'subiu' ? <TrendingUp aria-hidden="true" /> : <TrendingDown aria-hidden="true" />}
          {insight.texto}
        </li>)}
      </ul>
    </section>}
  </div>
}

function sinal(variacao: number | null): string {
  if (variacao === null) return '—'
  const sinalizado = variacao > 0 ? '+' : ''
  return `${sinalizado}${variacao.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
}
