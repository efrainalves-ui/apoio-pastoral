import { Plus, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { formatar } from '../../family-budget/dinheiro'
import { CATALOGO_DO_TRABALHO, nomeCompleto } from '../../work-budget/catalogo'
import type { ConfiguracaoDoTrabalhoData } from '../../work-budget/configuracao'
import {
  SITUACAO_DO_LANCAMENTO_LABELS, SITUACOES_DO_LANCAMENTO, calcularPrevisto,
  diferencaDoRecebimento, parcelaPessoal, resumoDoTrabalho,
  type LancamentoDoTrabalho, type LancamentoDoTrabalhoData, type SituacaoDoLancamento,
} from '../../work-budget/lancamento'
import { subsistenciaBasica, vigenteEm, type MemoriaDeCalculo } from '../../work-budget/parametros'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { CampoDeValor, formatarData } from './campos'

interface LancamentosDoTrabalhoProps {
  lancamentos: LancamentoDoTrabalho[]
  configuracao: ConfiguracaoDoTrabalhoData | null
  rascunho: LancamentoDoTrabalhoData | null
  editandoId: string
  onRascunho: (valor: LancamentoDoTrabalhoData | null) => void
  onSalvar: () => void
  onEditar: (lancamento: LancamentoDoTrabalho) => void
  onApagar: (id: string) => void
  onNovo: () => void
  onLevarAoPessoal: (lancamento: LancamentoDoTrabalho) => void
  viagens: Array<{ id: string; destino: string }>
}

/**
 * Os lançamentos do mês.
 *
 * O previsto é calculado a partir da regra configurada e da data do gasto — não
 * da data de hoje. Um lançamento de março usa os parâmetros de março, e é por
 * isso que reabrir um lançamento antigo mostra o mesmo número de sempre.
 */
export function LancamentosDoTrabalho({
  lancamentos, configuracao, rascunho, editandoId,
  onRascunho, onSalvar, onEditar, onApagar, onNovo, onLevarAoPessoal, viagens,
}: LancamentosDoTrabalhoProps) {
  const [memoriaAberta, setMemoriaAberta] = useState('')
  const resumo = useMemo(() => resumoDoTrabalho(lancamentos), [lancamentos])

  const contextoDaData = (data: string) => {
    const fpe = configuracao ? vigenteEm(configuracao.fpe, data)?.valor ?? null : null
    const audit = configuracao ? vigenteEm(configuracao.percentualDeAudit, data)?.valor ?? null : null
    return { fpe, percentualDeAudit: audit, valorFixoLocal: 0, outraBase: 0 }
  }

  /*
    O recálculo é sempre pedido, nunca automático: um valor antigo que muda
    sozinho é um valor em que ninguém confia.
  */
  function recalcular() {
    if (!rascunho || !configuracao) return
    const regra = configuracao.regrasPorItem[rascunho.subcategoriaId]
    if (!regra) return
    const memoria = calcularPrevisto(rascunho, {
      percentual: regra.responsabilidade === 'reembolso_integral' ? 100 : regra.percentual,
      base: 'VALOR_DA_DESPESA',
      teto: regra.teto,
      tetoPercentual: regra.tetoPercentual,
      tetoBase: regra.tetoBase,
      referencia: regra.referencia,
    }, contextoDaData(rascunho.data))
    onRascunho({ ...rascunho, previsto: memoria.valor, memoria })
  }

  const campo = <T extends keyof LancamentoDoTrabalhoData>(chave: T, novo: LancamentoDoTrabalhoData[T]) =>
    rascunho && onRascunho({ ...rascunho, [chave]: novo })

  return <>
    <section className="budget-metrics" aria-label="Resumo dos lançamentos do mês">
      <div><span>Pago</span><strong>{formatar(resumo.pago)}</strong></div>
      <div><span>Previsto</span><strong>{formatar(resumo.previsto)}</strong></div>
      <div><span>A receber</span><strong>{formatar(resumo.aReceber)}</strong></div>
      <div><span>Recebido</span><strong>{formatar(resumo.recebido)}</strong></div>
      <div><span>Do bolso</span><strong>{formatar(resumo.doBolso)}</strong></div>
      <div><span>Pendentes</span><strong>{resumo.pendentes}</strong></div>
    </section>

    <div className="page-actions"><Button icon={<Plus />} onClick={onNovo}>Novo lançamento</Button></div>

    {rascunho && <Card title={editandoId ? 'Editar lançamento' : 'Novo lançamento'}>
      <div className="form-grid">
        <label className="field" htmlFor="lancamento-categoria"><span className="field__label">Categoria</span>
          <select id="lancamento-categoria" className="field__input" value={rascunho.subcategoriaId} onChange={(evento) => campo('subcategoriaId', evento.target.value)}>
            <option value="">Escolher</option>
            {CATALOGO_DO_TRABALHO.map((familia) => <optgroup key={familia.id} label={familia.nome}>
              {familia.subcategorias.map((subcategoria) => <option key={subcategoria.id} value={subcategoria.id}>{subcategoria.nome}</option>)}
            </optgroup>)}
          </select>
        </label>
        <label className="field" htmlFor="lancamento-descricao"><span className="field__label">Descrição</span>
          <input id="lancamento-descricao" className="field__input" value={rascunho.descricao} onChange={(evento) => campo('descricao', evento.target.value)} />
        </label>
        <label className="field" htmlFor="lancamento-data"><span className="field__label">Data</span>
          <input id="lancamento-data" className="field__input" type="date" value={rascunho.data} onChange={(evento) => onRascunho({ ...rascunho, data: evento.target.value, competencia: evento.target.value.slice(0, 7) })} />
        </label>
        <CampoDeValor id="lancamento-pago" label="Valor pago" valor={rascunho.valorPago} onChange={(valorPago) => campo('valorPago', valorPago)} />
        <CampoDeValor id="lancamento-base" label="Base elegível" valor={rascunho.baseElegivel} onChange={(baseElegivel) => campo('baseElegivel', baseElegivel)} />
        <CampoDeValor id="lancamento-previsto" label="Previsto" valor={rascunho.previsto} onChange={(previsto) => campo('previsto', previsto)} />
        <label className="field" htmlFor="lancamento-situacao"><span className="field__label">Situação</span>
          <select id="lancamento-situacao" className="field__input" value={rascunho.situacao} onChange={(evento) => campo('situacao', evento.target.value as SituacaoDoLancamento)}>
            {SITUACOES_DO_LANCAMENTO.map((opcao) => <option key={opcao} value={opcao}>{SITUACAO_DO_LANCAMENTO_LABELS[opcao]}</option>)}
          </select>
        </label>
        <CampoDeValor id="lancamento-solicitado" label="Solicitado" valor={rascunho.solicitado ?? 0} onChange={(solicitado) => campo('solicitado', solicitado || null)} />
        <CampoDeValor id="lancamento-aprovado" label="Aprovado" valor={rascunho.aprovado ?? 0} onChange={(aprovado) => campo('aprovado', aprovado || null)} />
        <CampoDeValor id="lancamento-recebido" label="Recebido" valor={rascunho.recebido ?? 0} onChange={(recebido) => campo('recebido', recebido || null)} />
        <label className="field" htmlFor="lancamento-recebimento"><span className="field__label">Data do recebimento</span>
          <input id="lancamento-recebimento" className="field__input" type="date" value={rascunho.dataDoRecebimento} onChange={(evento) => campo('dataDoRecebimento', evento.target.value)} />
        </label>
        {/* Agrupar a despesa sob a viagem é o que faz o relatório dela dizer algo. */}
        {Boolean(viagens.length) && <label className="field" htmlFor="lancamento-viagem"><span className="field__label">Viagem ou mudança</span>
          <select id="lancamento-viagem" className="field__input" value={rascunho.viagemId ?? ''} onChange={(evento) => campo('viagemId', evento.target.value || null)}>
            <option value="">Nenhuma</option>
            {viagens.map((viagem) => <option key={viagem.id} value={viagem.id}>{viagem.destino}</option>)}
          </select>
        </label>}
        <label className="field" htmlFor="lancamento-documento"><span className="field__label">Documento</span>
          <input id="lancamento-documento" className="field__input" value={rascunho.documento} onChange={(evento) => campo('documento', evento.target.value)} />
        </label>
        <label className="field" htmlFor="lancamento-forma"><span className="field__label">Forma de recebimento</span>
          <input id="lancamento-forma" className="field__input" value={rascunho.formaDeRecebimento} onChange={(evento) => campo('formaDeRecebimento', evento.target.value)} />
        </label>
      </div>
      {rascunho.memoria && <MemoriaDoCalculo memoria={rascunho.memoria} />}
      <div className="form-actions">
        <Button onClick={onSalvar}>Salvar lançamento</Button>
        <Button
          variant="secondary"
          disabled={!configuracao?.regrasPorItem[rascunho.subcategoriaId]}
          onClick={recalcular}
        >Calcular previsto</Button>
        <Button variant="quiet" onClick={() => onRascunho(null)}>Cancelar</Button>
      </div>
    </Card>}

    <Card title="Lançamentos do mês">
      {lancamentos.length === 0
        ? <p className="card-copy">Nenhum lançamento neste mês.</p>
        : <div className="entity-list">{lancamentos.map((lancamento) => {
          const diferenca = diferencaDoRecebimento(lancamento)
          return <div className="entity-row entity-row--texto" key={lancamento.id}>
            <span>
              <strong>{lancamento.descricao || nomeCompleto(lancamento.subcategoriaId)}</strong>
              <small>
                {nomeCompleto(lancamento.subcategoriaId)} · {formatarData(lancamento.data)}
                {lancamento.recebido === null
                  ? (lancamento.previsto > 0 ? ` · Previsto ${formatar(lancamento.previsto)}` : '')
                  : ` · Recebido ${formatar(lancamento.recebido)}`}
                {' · '}Do bolso {formatar(parcelaPessoal(lancamento))}
              </small>
            </span>
            {/*
              O destaque é o que foi pago, porque é o único número que não muda
              ao longo do ciclo. Mostrar o previsto aqui daria R$ 0,00 num
              lançamento de centenas de reais enquanto ninguém pediu o cálculo.
            */}
            <strong>{formatar(lancamento.valorPago)}</strong>
            <span className={`status-pill ${situacaoPill(lancamento.situacao)}`}>{SITUACAO_DO_LANCAMENTO_LABELS[lancamento.situacao]}</span>
            {diferenca !== null && diferenca !== 0 && <span className="status-pill status-pill--warning">{formatar(diferenca)}</span>}
            {lancamento.memoria && <Button variant="quiet" aria-expanded={memoriaAberta === lancamento.id} onClick={() => setMemoriaAberta(memoriaAberta === lancamento.id ? '' : lancamento.id)}>Memória</Button>}
            {parcelaPessoal(lancamento) > 0 && <Button variant="quiet" onClick={() => onLevarAoPessoal(lancamento)}>{lancamento.lancamentoPessoalId ? 'Atualizar no pessoal' : 'Levar ao pessoal'}</Button>}
            <Button variant="quiet" onClick={() => onEditar(lancamento)}>Editar</Button>
            <Button variant="danger" icon={<Trash2 />} aria-label={`Apagar lançamento ${lancamento.descricao || nomeCompleto(lancamento.subcategoriaId)}`} onClick={() => onApagar(lancamento.id)} />
          </div>
        })}</div>}
      {lancamentos.map((lancamento) => memoriaAberta === lancamento.id && lancamento.memoria
        ? <MemoriaDoCalculo key={`memoria-${lancamento.id}`} memoria={lancamento.memoria} />
        : null)}
    </Card>
  </>
}

function situacaoPill(situacao: SituacaoDoLancamento): string {
  if (situacao === 'recebido') return 'status-pill--success'
  if (situacao === 'negado') return 'status-pill--danger'
  if (situacao === 'previsto') return 'status-pill--muted'
  return 'status-pill--warning'
}

/**
 * O que a regra usou.
 *
 * Sem isso, o pastor abre um lançamento antigo e vê um número que não bate com
 * nenhum parâmetro atual — e passa a conferir tudo à mão de novo.
 */
export function MemoriaDoCalculo({ memoria }: { memoria: MemoriaDeCalculo }) {
  const subsistencia = subsistenciaBasica(memoria.fpeUtilizado, memoria.percentualDeAuditUtilizado)
  return <dl className="estrato memoria-do-calculo">
    <div><dt>FPE usado</dt><dd>{memoria.fpeUtilizado === null ? '—' : formatar(memoria.fpeUtilizado)}</dd></div>
    <div><dt>Percentual de Audit</dt><dd>{memoria.percentualDeAuditUtilizado === null ? '—' : `${memoria.percentualDeAuditUtilizado}%`}</dd></div>
    <div><dt>Subsistência</dt><dd>{subsistencia === null ? '—' : formatar(subsistencia)}</dd></div>
    <div><dt>Base</dt><dd>{memoria.valorDaBase === null ? '—' : formatar(memoria.valorDaBase)}</dd></div>
    <div><dt>Percentual</dt><dd>{memoria.percentualAplicado === null ? '—' : `${memoria.percentualAplicado}%`}</dd></div>
    <div><dt>Teto</dt><dd>{memoria.tetoAplicado === null ? '—' : formatar(memoria.tetoAplicado)}</dd></div>
    <div><dt>Resultado</dt><dd>{formatar(memoria.valor)}</dd></div>
    {Boolean(memoria.referencia) && <div><dt>Documento</dt><dd>{memoria.referencia}</dd></div>}
    {Boolean(memoria.pendencia) && <div><dt>Pendência</dt><dd className="valor-pendente">{memoria.pendencia}</dd></div>}
  </dl>
}
