import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import { type ReactNode, useId, useState } from 'react'
import { indicadorPorId } from '../../integrated-report/catalogo'
import { ROTULO_DA_SITUACAO, rotuloCurto, type Comparacao, type PossivelErro, type Situacao, type Tendencia } from '../../integrated-report/painel'
import { rotuloDoTrimestre } from '../../integrated-report/types'

const numero = new Intl.NumberFormat('pt-BR')
export const formatarNumero = (valor: number) => numero.format(valor)
const formatarPercentual = (valor: number) => valor.toLocaleString('pt-BR', { maximumFractionDigits: 1 })

export const NOME_DA_TENDENCIA: Record<Tendencia, string> = { alta: 'Em alta', queda: 'Em queda', estavel: 'Estável', sem_base: 'Sem comparação' }

/** Diferença e porcentagem, com a direção em forma e em cor. */
export function Variacao({ comparacao }: { comparacao: Comparacao }) {
  if (comparacao.tendencia === 'sem_base' || comparacao.diferenca === null) return <span className="ri-variacao ri-variacao--sem_base">Sem comparação</span>
  const sinal = comparacao.diferenca > 0 ? '+' : comparacao.diferenca < 0 ? '−' : ''
  const Icone = comparacao.tendencia === 'alta' ? ArrowUpRight : comparacao.tendencia === 'queda' ? ArrowDownRight : Minus
  return <span className={`ri-variacao ri-variacao--${comparacao.tendencia}`} title={NOME_DA_TENDENCIA[comparacao.tendencia]}>
    <Icone aria-hidden="true" size={14} />
    <span className="sr-only">{NOME_DA_TENDENCIA[comparacao.tendencia]}: </span>
    {sinal}{formatarNumero(Math.abs(comparacao.diferenca))}
    {comparacao.percentual !== null && ` (${sinal}${formatarPercentual(Math.abs(comparacao.percentual))}%)`}
  </span>
}

export function SituacaoDoValor({ situacao }: { situacao: Situacao }) {
  return <span className={`ri-situacao ri-situacao--${situacao}`}>{ROTULO_DA_SITUACAO[situacao]}</span>
}

/**
 * O asterisco discreto de um possível erro de digitação.
 *
 * É só observação: o número ao lado continua valendo exatamente como a igreja
 * informou. Tocar abre a comparação que motivou a marca.
 */
export function MarcaDePossivelErro({ erro, igreja }: { erro: PossivelErro; igreja: string }) {
  const [aberta, setAberta] = useState(false)
  const id = useId()
  const indicador = indicadorPorId(erro.indicadorId)
  return <span className="ri-asterisco">
    <button type="button" className="ri-asterisco__botao" aria-expanded={aberta} aria-controls={id} aria-label="Possível erro de digitação" title="Possível erro de digitação" onClick={() => setAberta(!aberta)}>*</button>
    {aberta && <span className="ri-asterisco__nota" id={id} role="note">
      <span className="ri-asterisco__texto">Possível erro de digitação. O valor foi mantido como informado pela igreja.</span>
      <span className="ri-asterisco__dados">
        <span><small>Igreja</small><strong>{igreja}</strong></span>
        <span><small>Indicador</small><strong>{indicador ? rotuloCurto(indicador) : erro.indicadorId}</strong></span>
        <span><small>Anterior · {rotuloDoTrimestre(erro.anterior.trimestre)}</small><strong>{formatarNumero(erro.anterior.numero)}</strong></span>
        <span><small>Atual · {rotuloDoTrimestre(erro.trimestre)}</small><strong>{formatarNumero(erro.atual)}</strong></span>
      </span>
    </span>}
  </span>
}

export interface PontoDaLinha { rotulo: string; numero: number | null; ativo?: boolean }

/**
 * A evolução nos quatro trimestres.
 *
 * Trimestre sem número interrompe a linha e aparece como traço na base: um
 * trimestre sem resposta não é zero, e ligar os pontos por cima dele inventaria
 * uma trajetória que ninguém informou.
 */
export function GraficoDeLinha({ pontos, label }: { pontos: readonly PontoDaLinha[]; label: string }) {
  const largura = 340; const altura = 170; const margemX = 30; const topo = 26; const base = 34
  const numeros = pontos.map(({ numero: valor }) => valor).filter((valor): valor is number => valor !== null)
  const teto = Math.max(1, ...numeros)
  const passo = pontos.length > 1 ? (largura - margemX * 2) / (pontos.length - 1) : 0
  const x = (indice: number) => margemX + indice * passo
  const y = (valor: number) => topo + (1 - valor / teto) * (altura - topo - base)
  const trechos: string[] = []
  let atual = ''
  pontos.forEach((ponto, indice) => {
    if (ponto.numero === null) { if (atual) trechos.push(atual); atual = ''; return }
    atual += `${atual ? ' L' : 'M'}${x(indice)},${y(ponto.numero)}`
  })
  if (atual) trechos.push(atual)
  const descricao = pontos.map(({ rotulo, numero: valor }) => `${rotulo}: ${valor === null ? 'sem número' : formatarNumero(valor)}`).join(', ')

  return <figure className="ri-linha">
    <svg viewBox={`0 0 ${largura} ${altura}`} role="img" aria-label={`${label}. ${descricao}`}>
      {[0, 0.5, 1].map((fracao) => <line key={fracao} className="ri-linha__grade" x1={margemX - 12} x2={largura - margemX + 12} y1={y(teto * fracao)} y2={y(teto * fracao)} />)}
      {trechos.map((trecho) => <path key={trecho} className="ri-linha__traco" d={trecho} fill="none" />)}
      {pontos.map((ponto, indice) => ponto.numero === null
        ? <g key={ponto.rotulo}><line className="ri-linha__vazio" x1={x(indice) - 8} x2={x(indice) + 8} y1={y(0)} y2={y(0)} /><text className="ri-linha__valor ri-linha__valor--vazio" x={x(indice)} y={y(0) - 8} textAnchor="middle">—</text></g>
        : <g key={ponto.rotulo}>
            <circle className={ponto.ativo ? 'ri-linha__ponto ri-linha__ponto--ativo' : 'ri-linha__ponto'} cx={x(indice)} cy={y(ponto.numero)} r={ponto.ativo ? 5.5 : 4} />
            <text className="ri-linha__valor" x={x(indice)} y={y(ponto.numero) - 11} textAnchor="middle">{formatarNumero(ponto.numero)}</text>
          </g>)}
      {pontos.map((ponto, indice) => <text key={`r-${ponto.rotulo}`} className={ponto.ativo ? 'ri-linha__rotulo ri-linha__rotulo--ativo' : 'ri-linha__rotulo'} x={x(indice)} y={altura - 10} textAnchor="middle">{ponto.rotulo}</text>)}
    </svg>
  </figure>
}

/** O trimestre escolhido lado a lado com o anterior. */
export function ParDeTrimestres({ comparacao, de, para }: { comparacao: Comparacao; de: string | null; para: string | null }) {
  const teto = Math.max(1, comparacao.anterior ?? 0, comparacao.atual ?? 0)
  const barra = (valor: number | null, rotulo: string | null, classe: string) => <div className={`ri-par__linha ${classe}`}>
    <span className="ri-par__rotulo">{rotulo ? rotuloDoTrimestre(rotulo) : '—'}</span>
    <span className="ri-par__trilho" aria-hidden="true">{valor !== null && <span className="ri-par__preenchimento" style={{ width: `${Math.max(2, (valor / teto) * 100)}%` }} />}</span>
    <strong className="ri-par__valor">{valor === null ? '—' : formatarNumero(valor)}</strong>
  </div>
  return <div className="ri-par">
    {barra(comparacao.anterior, de, 'ri-par__linha--anterior')}
    {barra(comparacao.atual, para, 'ri-par__linha--atual')}
    <Variacao comparacao={comparacao} />
  </div>
}

/** Quantos indicadores cresceram, caíram ou ficaram estáveis, numa faixa só. */
export function FaixaDeTendencias({ contagem }: { contagem: Record<Tendencia, number> }) {
  const total = Math.max(1, contagem.alta + contagem.estavel + contagem.queda + contagem.sem_base)
  const ordem: Tendencia[] = ['alta', 'estavel', 'queda', 'sem_base']
  return <div className="ri-tendencias">
    <div className="ri-tendencias__faixa" role="img" aria-label={ordem.map((tendencia) => `${NOME_DA_TENDENCIA[tendencia]}: ${contagem[tendencia]}`).join(', ')}>
      {ordem.filter((tendencia) => contagem[tendencia] > 0).map((tendencia) => <span key={tendencia} className={`ri-tendencias__parte ri-tendencias__parte--${tendencia}`} style={{ flexGrow: contagem[tendencia] / total }} />)}
    </div>
    <ul className="ri-tendencias__legenda">
      {ordem.map((tendencia) => <li key={tendencia}><span className={`ri-ponto ri-ponto--${tendencia}`} aria-hidden="true" />{NOME_DA_TENDENCIA[tendencia]}<strong>{contagem[tendencia]}</strong></li>)}
    </ul>
  </div>
}

export interface LinhaDaBarra { chave: string; rotulo: string; numero: number | null; situacao: Situacao; nota?: ReactNode }

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
        {linha.nota}
      </span>
    </li>)}
  </ul>
}
