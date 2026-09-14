import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import type { Comparacao, Situacao } from '../../integrated-report/painel'
import { ROTULO_DA_SITUACAO } from '../../integrated-report/painel'

const numero = new Intl.NumberFormat('pt-BR')
export const formatarNumero = (valor: number) => numero.format(valor)
const formatarPercentual = (valor: number) => valor.toLocaleString('pt-BR', { maximumFractionDigits: 1 })

/** Diferença e porcentagem, com a direção em forma e em cor. */
export function Variacao({ comparacao }: { comparacao: Comparacao }) {
  if (comparacao.tendencia === 'sem_base' || comparacao.diferenca === null) return <span className="ri-variacao ri-variacao--sem_base">Sem comparação</span>
  const sinal = comparacao.diferenca > 0 ? '+' : comparacao.diferenca < 0 ? '−' : ''
  const Icone = comparacao.tendencia === 'alta' ? ArrowUpRight : comparacao.tendencia === 'queda' ? ArrowDownRight : Minus
  const nome = comparacao.tendencia === 'alta' ? 'Aumento' : comparacao.tendencia === 'queda' ? 'Redução' : 'Estável'
  return <span className={`ri-variacao ri-variacao--${comparacao.tendencia}`} title={nome}>
    <Icone aria-hidden="true" size={14} />
    <span className="sr-only">{nome}: </span>
    {sinal}{formatarNumero(Math.abs(comparacao.diferenca))}
    {comparacao.percentual !== null && ` (${sinal}${formatarPercentual(Math.abs(comparacao.percentual))}%)`}
  </span>
}

export function SituacaoDoValor({ situacao }: { situacao: Situacao }) {
  return <span className={`ri-situacao ri-situacao--${situacao}`}>{ROTULO_DA_SITUACAO[situacao]}</span>
}

export interface PontoDaBarra { rotulo: string; numero: number | null; nota?: string; ativo?: boolean }

/** Os quatro trimestres lado a lado. Trimestre sem número vira coluna tracejada, nunca zero. */
export function BarrasTrimestrais({ pontos, label }: { pontos: readonly PontoDaBarra[]; label: string }) {
  const teto = Math.max(1, ...pontos.map(({ numero: valor }) => valor ?? 0))
  return <ol className="ri-barras" aria-label={label}>
    {pontos.map((ponto) => <li key={ponto.rotulo} className={ponto.ativo ? 'ri-barras__item ri-barras__item--ativo' : 'ri-barras__item'}>
      <strong className="ri-barras__valor">{ponto.numero === null ? '—' : formatarNumero(ponto.numero)}</strong>
      <span className={ponto.numero === null ? 'ri-barras__coluna ri-barras__coluna--vazia' : 'ri-barras__coluna'} aria-hidden="true">
        {ponto.numero !== null && <span className="ri-barras__preenchimento" style={{ height: `${Math.max(2, (ponto.numero / teto) * 100)}%` }} />}
      </span>
      <span className="ri-barras__rotulo">{ponto.rotulo}</span>
      {ponto.nota && <small className="ri-barras__nota">{ponto.nota}</small>}
    </li>)}
  </ol>
}

export interface LinhaDaBarra { chave: string; rotulo: string; numero: number | null; situacao: Situacao }

/** Igrejas comparadas no mesmo indicador; quem não informou aparece com o motivo, e não com zero. */
export function BarrasPorIgreja({ linhas, label }: { linhas: readonly LinhaDaBarra[]; label: string }) {
  const teto = Math.max(1, ...linhas.map(({ numero: valor }) => valor ?? 0))
  const ordenadas = [...linhas].sort((a, b) => (b.numero ?? -1) - (a.numero ?? -1) || a.rotulo.localeCompare(b.rotulo, 'pt-BR'))
  return <ul className="ri-hbarras" aria-label={label}>
    {ordenadas.map((linha) => <li key={linha.chave}>
      <span className="ri-hbarras__nome">{linha.rotulo}</span>
      <span className="ri-hbarras__trilho" aria-hidden="true">
        {linha.numero !== null && <span className="ri-hbarras__preenchimento" style={{ width: `${Math.max(1.5, (linha.numero / teto) * 100)}%` }} />}
      </span>
      <span className="ri-hbarras__valor">
        {linha.numero !== null && linha.situacao === 'informado' ? formatarNumero(linha.numero) : <SituacaoDoValor situacao={linha.situacao} />}
      </span>
    </li>)}
  </ul>
}
