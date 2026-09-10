import { CheckCircle2, Circle, Lock, Pencil, Repeat, Trash2 } from 'lucide-react'
import { useDeferredValue, useMemo, useState } from 'react'
import { eLegado } from '../../family-budget/adaptador'
import { nomeCompleto } from '../../family-budget/catalogo'
import { formatar } from '../../family-budget/dinheiro'
import { nomeDoIntegrante, situacaoVisivel, type Integrante, type Lancamento, type SituacaoDeSaida } from '../../family-budget/lancamento'
import { normalizePersonName } from '../../people/validation'

export const FILTROS_DE_SAIDA = ['todas', 'pendentes', 'pagas', 'atrasadas', 'fixas', 'variaveis', 'parceladas'] as const
export type FiltroDeSaida = (typeof FILTROS_DE_SAIDA)[number]
const FILTRO_LABELS: Record<FiltroDeSaida, string> = {
  todas: 'Todas', pendentes: 'Pendentes', pagas: 'Pagas', atrasadas: 'Atrasadas',
  fixas: 'Fixas', variaveis: 'Variáveis', parceladas: 'Parceladas',
}

export const FILTROS_DE_ENTRADA = ['todas', 'previstas', 'recebidas'] as const
export type FiltroDeEntrada = (typeof FILTROS_DE_ENTRADA)[number]
const FILTRO_ENTRADA_LABELS: Record<FiltroDeEntrada, string> = {
  todas: 'Todas', previstas: 'Previstas', recebidas: 'Recebidas',
}

const diaCurto = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short' })
/* Meio-dia evita o dia a menos: "2026-09-20" sozinho é meia-noite em UTC. */
function dia(chave: string): string {
  const data = new Date(`${chave}T12:00:00`)
  return Number.isNaN(data.getTime()) ? chave : diaCurto.format(data).replace(/\sde\s/gu, ' ').replace(/\.(?=\s|$)/gu, '')
}

function passa(lancamento: Lancamento, filtro: string, hoje: string): boolean {
  const visivel = situacaoVisivel(lancamento.situacao as SituacaoDeSaida, lancamento.vencimento, hoje)
  switch (filtro) {
    case 'todas': return true
    case 'pendentes': return lancamento.situacao === 'pendente'
    case 'pagas': return lancamento.situacao === 'paga'
    case 'atrasadas': return visivel === 'atrasada'
    case 'fixas': return lancamento.tipo === 'fixa'
    case 'variaveis': return lancamento.tipo === 'variavel'
    case 'parceladas': return Boolean(lancamento.parcelamento)
    case 'previstas': return lancamento.situacao === 'prevista'
    case 'recebidas': return lancamento.situacao === 'recebida'
    default: return true
  }
}

interface ListaDeLancamentosProps {
  lancamentos: Lancamento[]
  integrantes: Integrante[]
  natureza: 'entrada' | 'saida'
  hoje: string
  busca: string
  onBusca: (termo: string) => void
  onAlternarSituacao: (lancamento: Lancamento) => void
  onEditar: (lancamento: Lancamento) => void
  onApagar: (lancamento: Lancamento) => void
}

/**
 * A lista de lançamentos do mês, com os recortes que o pastor pergunta.
 *
 * "Atrasada" não é um valor gravado: é pendente com vencimento no passado. Por
 * isso o filtro a calcula na hora — um estado que envelhece sozinho precisaria
 * de alguém para atualizá-lo todo dia, e ninguém abre o aplicativo todo dia.
 */
export function ListaDeLancamentos({
  lancamentos, integrantes, natureza, hoje, busca, onBusca,
  onAlternarSituacao, onEditar, onApagar,
}: ListaDeLancamentosProps) {
  const [filtro, setFiltro] = useState<string>('todas')
  const buscaAdiada = useDeferredValue(busca)
  const entrada = natureza === 'entrada'
  const filtros: readonly string[] = entrada ? FILTROS_DE_ENTRADA : FILTROS_DE_SAIDA
  const rotulos: Record<string, string> = entrada ? FILTRO_ENTRADA_LABELS : FILTRO_LABELS

  const visiveis = useMemo(() => {
    const termo = normalizePersonName(buscaAdiada)
    return lancamentos
      .filter((item) => passa(item, filtro, hoje))
      .filter((item) => !termo || normalizePersonName(`${item.descricao} ${nomeCompleto(item.subcategoria)}`).includes(termo))
      .sort((esquerda, direita) => (direita.vencimento || direita.data).localeCompare(esquerda.vencimento || esquerda.data))
  }, [lancamentos, filtro, buscaAdiada, hoje])

  return <>
    <div className="visitacao-busca">
      <input
        type="search"
        className="field__input"
        value={busca}
        onChange={(evento) => onBusca(evento.target.value)}
        placeholder={entrada ? 'Buscar entrada' : 'Buscar saída'}
        aria-label={entrada ? 'Buscar entrada' : 'Buscar saída'}
      />
    </div>

    <div className="tira-filtros" role="group" aria-label="Filtrar lançamentos">
      {filtros.map((valor) => <button
        key={valor}
        type="button"
        className={`chip-filtro ${filtro === valor ? 'chip-filtro--ativo' : ''}`}
        aria-pressed={filtro === valor}
        onClick={() => setFiltro(valor)}
      >{rotulos[valor]}</button>)}
    </div>

    {!visiveis.length && <div className="empty-state">
      <Circle />
      <strong>{lancamentos.length ? 'Nada neste filtro' : entrada ? 'Nenhuma entrada neste mês' : 'Nenhuma saída neste mês'}</strong>
      <span>{lancamentos.length ? 'Ajuste o filtro ou a busca.' : 'O que você registrar aparece aqui.'}</span>
    </div>}

    <div className="lista-lancamentos">
      {visiveis.map((lancamento) => {
        const visivel = situacaoVisivel(lancamento.situacao as SituacaoDeSaida, lancamento.vencimento, hoje)
        const concluido = lancamento.situacao === 'paga' || lancamento.situacao === 'recebida'
        const legado = eLegado(lancamento)
        return <article className={`linha-lancamento ${concluido ? 'linha-lancamento--feito' : ''}`} key={lancamento.id}>
          <button
            type="button"
            className="linha-lancamento__marca"
            aria-label={`${concluido ? 'Desmarcar' : 'Marcar'} ${lancamento.descricao}`}
            onClick={() => onAlternarSituacao(lancamento)}
            disabled={legado}
          >{concluido ? <CheckCircle2 /> : <Circle />}</button>

          <span className="linha-lancamento__corpo">
            <strong>{lancamento.descricao}</strong>
            <small>
              {nomeCompleto(lancamento.subcategoria)} · {dia(lancamento.vencimento || lancamento.data)}
              {lancamento.parcelamento ? ` · ${lancamento.parcelamento.numero} de ${lancamento.parcelamento.total}` : ''}
              {lancamento.integranteId ? ` · ${nomeDoIntegrante(integrantes, lancamento.integranteId)}` : ''}
            </small>
          </span>

          <span className="linha-lancamento__valor">
            <strong className={entrada ? 'valor-entrada' : ''}>{formatar(lancamento.valor)}</strong>
            {visivel === 'atrasada' && !entrada && <small className="selo-atencao selo-atencao--atrasada">Atrasada</small>}
            {lancamento.serieId && <Repeat className="linha-lancamento__repete" aria-label="Se repete" />}
          </span>

          <span className="linha-lancamento__acoes">
            {legado
              ? <span className="icon-button" title="Registro anterior à reconstrução: aparece nas somas, mas ainda não é editável aqui"><Lock aria-hidden="true" /></span>
              : <>
                <button type="button" className="icon-button" aria-label={`Editar ${lancamento.descricao}`} onClick={() => onEditar(lancamento)}><Pencil /></button>
                <button type="button" className="icon-button danger-icon" aria-label={`Excluir ${lancamento.descricao}`} onClick={() => onApagar(lancamento)}><Trash2 /></button>
              </>}
          </span>
        </article>
      })}
    </div>
  </>
}
