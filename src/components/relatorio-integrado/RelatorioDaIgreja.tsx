import { ArrowLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { CAMPANHAS_NO_RELATORIO } from '../../integrated-report/campanhas'
import { CATALOGO_DO_RELATORIO } from '../../integrated-report/catalogo'
import { PEQUENOS_GRUPOS, UNIDADES_DE_ACAO } from '../../integrated-report/ligacoes'
import {
  AREAS_DO_RELATORIO, camposSemInformacao, comparacaoDoPeriodo, comparar, estudosDoPeriodo, INDICADORES_NUMERICOS, leituraDaIgreja,
  possiveisErros, possivelErroNoValor, rotuloCurto, trimestreAnterior,
} from '../../integrated-report/painel'
import { valorGuardado } from '../../integrated-report/service'
import { rotuloDoTrimestre, type RelatorioIntegradoEntity } from '../../integrated-report/types'
import { Button } from '../ui/Button'
import { textoDoValor } from './EnvioDoRelatorio'
import { formatarNumero, MarcaDePossivelErro, Variacao } from './Graficos'

const ALUNOS = 'escola-sabatina--numero-de-alunos-da-escola-sabatina'
const RESUMO: ReadonlyArray<{ id: string; rotulo: string }> = [
  { id: PEQUENOS_GRUPOS, rotulo: 'Pequenos Grupos' },
  { id: UNIDADES_DE_ACAO, rotulo: 'Unidades de Ação' },
  { id: ALUNOS, rotulo: 'Alunos da Escola Sabatina' },
  { id: CAMPANHAS_NO_RELATORIO, rotulo: 'Campanhas' },
]

interface Props {
  relatorios: readonly RelatorioIntegradoEntity[]
  churchId: string
  nome: string
  ano: number
  trimestre: number | null
  acoes: ReactNode
  aoVoltar: () => void
}

/**
 * O relatório de uma igreja, para abrir durante a visita e mostrar a ela o que
 * ela mesma informou: o trimestre, o que avançou, o que diminuiu e o que ficou
 * sem resposta.
 */
export function RelatorioDaIgreja({ relatorios, churchId, nome, ano, trimestre, acoes, aoVoltar }: Props) {
  const doAno = relatorios.filter((relatorio) => relatorio.churchId === churchId && relatorio.trimestre.startsWith(`${ano}-`))
  const numero = trimestre ?? Math.max(0, ...doAno.map((relatorio) => Number(relatorio.trimestre.slice(5))))
  const cabecalho = <header className="ri-igreja__topo">
    <div><p className="eyebrow">Relatório da igreja</p><h2 className="card__title">{nome}</h2>{numero > 0 && <p className="ri-igreja__periodo">{rotuloDoTrimestre(`${ano}-${numero}`)}</p>}</div>
    <Button variant="quiet" icon={<ArrowLeft size={16} />} onClick={aoVoltar}>Voltar ao distrito</Button>
  </header>

  if (numero === 0) return <section className="card ri-igreja">{cabecalho}<p className="ri-vazio">Sem relatório em {ano}</p></section>

  const periodo = { ano, trimestre: numero }
  const chave = `${ano}-${numero}`
  const relatorio = doAno.find((item) => item.trimestre === chave)
  const antes = trimestreAnterior(ano, numero)
  const comparacoes = INDICADORES_NUMERICOS
    .map((indicador) => ({ indicador, comparacao: comparacaoDoPeriodo(relatorios, [churchId], indicador.id, periodo) }))
  const avancaram = comparacoes.filter(({ comparacao }) => comparacao.tendencia === 'alta').sort((a, b) => b.comparacao.diferenca! - a.comparacao.diferenca!)
  const diminuiram = comparacoes.filter(({ comparacao }) => comparacao.tendencia === 'queda').sort((a, b) => a.comparacao.diferenca! - b.comparacao.diferenca!)
  const erros = possiveisErros(relatorios, [churchId], periodo)
  const semInformacao = camposSemInformacao(relatorio)

  const movimento = (lista: typeof avancaram, vazio: string) => lista.length === 0
    ? <p className="ri-vazio">{vazio}</p>
    : <ul className="ri-movimentos">{lista.map(({ indicador, comparacao }) => <li key={indicador.id}>
        <span title={indicador.rotulo}>{rotuloCurto(indicador)}</span>
        <span className="ri-movimentos__numeros">{formatarNumero(comparacao.anterior!)} → {formatarNumero(comparacao.atual!)}</span>
        <Variacao comparacao={comparacao} />
      </li>)}</ul>

  return <section className="card ri-igreja" aria-label={`Relatório de ${nome}`}>
    {cabecalho}
    {!relatorio && <p className="ri-igreja__aviso">Sem relatório neste trimestre</p>}

    <div className="ri-igreja__resumo">
      <div className="ri-mini ri-mini--estudos">
        <small>Estudos bíblicos</small>
        <strong>{(() => { const valor = estudosDoPeriodo(relatorios, [churchId], periodo); return valor === null ? '—' : formatarNumero(valor) })()}</strong>
        <Variacao comparacao={comparar(estudosDoPeriodo(relatorios, [churchId], antes), estudosDoPeriodo(relatorios, [churchId], periodo))} />
      </div>
      {RESUMO.map(({ id, rotulo }) => {
        const leitura = leituraDaIgreja(relatorios, churchId, id, periodo)
        const erro = possivelErroNoValor(relatorios, churchId, id, chave)
        return <div className="ri-mini" key={id}>
          <small>{rotulo}</small>
          <strong>{leitura.numero === null ? '—' : formatarNumero(leitura.numero)}{erro && <MarcaDePossivelErro erro={erro} igreja={nome} />}</strong>
          <Variacao comparacao={comparacaoDoPeriodo(relatorios, [churchId], id, periodo)} />
        </div>
      })}
    </div>

    <div className="ri-igreja__colunas">
      <section><h3 className="ri-igreja__titulo ri-igreja__titulo--alta">Indicadores que avançaram</h3>{movimento(avancaram, 'Nenhum indicador avançou')}</section>
      <section><h3 className="ri-igreja__titulo ri-igreja__titulo--queda">Indicadores que diminuíram</h3>{movimento(diminuiram, 'Nenhum indicador diminuiu')}</section>
    </div>

    {erros.length > 0 && <section>
      <h3 className="ri-igreja__titulo">Possíveis erros de digitação</h3>
      <ul className="ri-movimentos">{erros.map((erro) => {
        const indicador = CATALOGO_DO_RELATORIO.find(({ id }) => id === erro.indicadorId)
        return <li key={erro.indicadorId}>
          <span title={indicador?.rotulo}>{indicador ? rotuloCurto(indicador) : erro.indicadorId}</span>
          <span className="ri-movimentos__numeros">{formatarNumero(erro.anterior.numero)} → {formatarNumero(erro.atual)}</span>
          <small className="ri-nota-erro">* Possível erro de digitação.</small>
        </li>
      })}</ul>
    </section>}

    <section><h3 className="ri-igreja__titulo">Ações de cadastro</h3>{acoes}</section>

    {relatorio && <section>
      <h3 className="ri-igreja__titulo">Todos os dados respondidos</h3>
      {AREAS_DO_RELATORIO.map((secao) => {
        const itens = CATALOGO_DO_RELATORIO.filter((indicador) => indicador.secao === secao && valorGuardado(relatorio, indicador.id))
        if (!itens.length) return null
        return <details className="ri-dobra" key={secao}>
          <summary><span><strong>{secao}</strong><small>{itens.length} {itens.length === 1 ? 'resposta' : 'respostas'}</small></span></summary>
          <ul className="ri-valores">{itens.map((indicador) => {
            const erro = possivelErroNoValor(relatorios, churchId, indicador.id, chave)
            return <li key={indicador.id}>
              <span title={indicador.rotulo}>{rotuloCurto(indicador)}</span>
              <strong>{textoDoValor(valorGuardado(relatorio, indicador.id)!)}{erro && <MarcaDePossivelErro erro={erro} igreja={nome} />}</strong>
            </li>
          })}</ul>
        </details>
      })}
      {semInformacao.length > 0 && <details className="ri-dobra">
        <summary><span><strong>Campos sem informação</strong><small>{semInformacao.length} {semInformacao.length === 1 ? 'pergunta' : 'perguntas'}</small></span></summary>
        <ul className="ri-valores ri-valores--vazios">{semInformacao.map((indicador) => <li key={indicador.id}><span title={indicador.rotulo}>{rotuloCurto(indicador)}</span><strong>—</strong></li>)}</ul>
      </details>}
    </section>}
  </section>
}
