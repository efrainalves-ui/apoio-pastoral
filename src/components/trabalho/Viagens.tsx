import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { formatar, type Centavos } from '../../family-budget/dinheiro'
import { nomeCompleto } from '../../work-budget/catalogo'
import type { LancamentoDoTrabalho } from '../../work-budget/lancamento'
import {
  daViagem, diariasSugeridas, resumoDaViagem, TIPO_DE_VIAGEM_LABELS, TIPOS_DE_VIAGEM,
  viagemVazia, type TipoDeViagem, type Viagem, type ViagemData,
} from '../../work-budget/viagem'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { CampoDeValor, dataDeHoje, formatarData } from './campos'

interface ViagensProps {
  viagens: Viagem[]
  lancamentos: LancamentoDoTrabalho[]
  valorDaDiaria: Centavos | null
  fpe: Centavos | null
  percentualDeAudit: number | null
  onSalvar: (dados: ViagemData, id?: string) => void
  onApagar: (id: string) => void
}

/**
 * Viagens e mudanças.
 *
 * Uma passagem, um hotel e três almoços isolados no mês não dizem nada;
 * agrupados sob "Assembleia em Belém, 10 a 13 de setembro" dizem quanto aquela
 * viagem custou ao pastor.
 *
 * O número de diárias é proposto pelas datas e corrigível: se uma viagem de 10 a
 * 13 são três ou quatro diárias muda de instituição para instituição, e decidir
 * isso no código erraria em silêncio em todo lugar que usa a outra regra.
 */
export function Viagens({
  viagens, lancamentos, valorDaDiaria, fpe, percentualDeAudit, onSalvar, onApagar,
}: ViagensProps) {
  const [rascunho, setRascunho] = useState<ViagemData | null>(null)
  const [editandoId, setEditandoId] = useState('')
  const [aberta, setAberta] = useState('')

  const contexto = { fpe, percentualDeAudit }
  const campo = <T extends keyof ViagemData>(chave: T, novo: ViagemData[T]) =>
    rascunho && setRascunho({ ...rascunho, [chave]: novo })

  /* Mudar as datas reflete na proposta de diárias enquanto o pastor não a corrige. */
  function mudarData(chave: 'saida' | 'retorno', valor: string) {
    if (!rascunho) return
    const datas = { saida: rascunho.saida, retorno: rascunho.retorno, [chave]: valor }
    const sugerido = diariasSugeridas(datas.saida, datas.retorno)
    const aindaNoSugerido = rascunho.diarias === diariasSugeridas(rascunho.saida, rascunho.retorno)
    setRascunho({ ...rascunho, ...datas, diarias: aindaNoSugerido ? sugerido : rascunho.diarias })
  }

  return <>
    <div className="page-actions">
      <Button icon={<Plus />} onClick={() => {
        setEditandoId('')
        setRascunho({ ...viagemVazia('viagem', dataDeHoje()), valorDaDiariaUsado: valorDaDiaria })
      }}>Nova viagem</Button>
      <Button variant="secondary" icon={<Plus />} onClick={() => {
        setEditandoId('')
        setRascunho(viagemVazia('mudanca', dataDeHoje()))
      }}>Nova mudança</Button>
    </div>

    {rascunho && <Card title={editandoId ? 'Editar' : TIPO_DE_VIAGEM_LABELS[rascunho.tipo]}>
      <div className="form-grid">
        <label className="field" htmlFor="viagem-tipo"><span className="field__label">Tipo</span>
          <select id="viagem-tipo" className="field__input" value={rascunho.tipo} onChange={(evento) => campo('tipo', evento.target.value as TipoDeViagem)}>
            {TIPOS_DE_VIAGEM.map((opcao) => <option key={opcao} value={opcao}>{TIPO_DE_VIAGEM_LABELS[opcao]}</option>)}
          </select>
        </label>
        <label className="field" htmlFor="viagem-destino"><span className="field__label">Destino</span>
          <input id="viagem-destino" className="field__input" value={rascunho.destino} onChange={(evento) => campo('destino', evento.target.value)} />
        </label>
        <label className="field" htmlFor="viagem-motivo"><span className="field__label">Motivo</span>
          <input id="viagem-motivo" className="field__input" value={rascunho.motivo} onChange={(evento) => campo('motivo', evento.target.value)} />
        </label>
        <label className="field" htmlFor="viagem-saida"><span className="field__label">Saída</span>
          <input id="viagem-saida" className="field__input" type="date" value={rascunho.saida} onChange={(evento) => mudarData('saida', evento.target.value)} />
        </label>
        <label className="field" htmlFor="viagem-retorno"><span className="field__label">Retorno</span>
          <input id="viagem-retorno" className="field__input" type="date" value={rascunho.retorno} onChange={(evento) => mudarData('retorno', evento.target.value)} />
        </label>
        {rascunho.tipo === 'viagem' && <>
          <label className="field" htmlFor="viagem-diarias"><span className="field__label">Diárias</span>
            <input id="viagem-diarias" className="field__input" type="number" min="0" step="1" value={rascunho.diarias} onChange={(evento) => campo('diarias', Number(evento.target.value))} />
          </label>
          <CampoDeValor
            id="viagem-valor-diaria" label="Valor da diária"
            valor={rascunho.valorDaDiariaUsado ?? 0}
            onChange={(valor) => campo('valorDaDiariaUsado', valor || null)}
          />
        </>}
      </div>
      <div className="form-actions">
        <Button onClick={() => { onSalvar(rascunho, editandoId || undefined); setRascunho(null); setEditandoId('') }}>Salvar</Button>
        <Button variant="quiet" onClick={() => { setRascunho(null); setEditandoId('') }}>Cancelar</Button>
      </div>
    </Card>}

    {viagens.length === 0
      ? <Card title="Viagens e mudanças"><p className="card-copy">Nada registrado.</p></Card>
      : [...viagens].sort((esquerda, direita) => direita.saida.localeCompare(esquerda.saida)).map((viagem) => {
        const despesas = daViagem(lancamentos, viagem.id)
        const resumo = resumoDaViagem(viagem, despesas, contexto)
        return <Card key={viagem.id} title={viagem.destino} eyebrow={TIPO_DE_VIAGEM_LABELS[viagem.tipo]}>
          <dl className="estrato">
            <div><dt>Período</dt><dd>{formatarData(viagem.saida)}{viagem.retorno && viagem.retorno !== viagem.saida ? ` a ${formatarData(viagem.retorno)}` : ''}</dd></div>
            {viagem.tipo === 'viagem' && <div><dt>Diárias</dt><dd>{resumo.previstoDasDiarias === null ? <span className="valor-pendente">{resumo.pendencia ?? '—'}</span> : `${viagem.diarias} · ${formatar(resumo.previstoDasDiarias)}`}</dd></div>}
            <div><dt>Do bolso</dt><dd>{formatar(resumo.doBolso)}</dd></div>
          </dl>
          <dl className="estrato memoria-do-calculo">
            <div><dt>Pago</dt><dd>{formatar(resumo.pago)}</dd></div>
            <div><dt>Previsto das despesas</dt><dd>{formatar(resumo.previstoDasDespesas)}</dd></div>
            <div><dt>Previsto total</dt><dd>{resumo.previstoTotal === null ? <span className="valor-pendente">Falta configurar</span> : formatar(resumo.previstoTotal)}</dd></div>
            <div><dt>Recebido</dt><dd>{formatar(resumo.recebido)}</dd></div>
          </dl>

          <div className="form-actions form-actions--fim">
            <Button variant="quiet" aria-expanded={aberta === viagem.id} onClick={() => setAberta(aberta === viagem.id ? '' : viagem.id)}>
              {resumo.despesas === 1 ? '1 despesa' : `${resumo.despesas} despesas`}
            </Button>
            <Button variant="quiet" onClick={() => { setEditandoId(viagem.id); const { id: _id, ...dados } = viagem; void _id; setRascunho(dados) }}>Editar</Button>
            <Button variant="danger" icon={<Trash2 />} aria-label={`Apagar ${viagem.destino}`} onClick={() => onApagar(viagem.id)} />
          </div>

          {aberta === viagem.id && (despesas.length === 0
            ? <p className="card-copy">Nenhuma despesa ligada. Escolha esta viagem ao registrar um lançamento.</p>
            : <div className="entity-list">{despesas.map((lancamento) => <div className="entity-row entity-row--texto" key={lancamento.id}>
              <span>
                <strong>{lancamento.descricao || nomeCompleto(lancamento.subcategoriaId)}</strong>
                <small>{nomeCompleto(lancamento.subcategoriaId)} · {formatarData(lancamento.data)}</small>
              </span>
              <strong>{formatar(lancamento.valorPago)}</strong>
            </div>)}</div>)}
        </Card>
      })}
  </>
}
