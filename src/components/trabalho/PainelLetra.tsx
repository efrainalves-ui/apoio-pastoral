import { Plus, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { formatar, type Centavos } from '../../family-budget/dinheiro'
import type { ConfiguracaoDoTrabalhoData } from '../../work-budget/configuracao'
import {
  avaliarCompra, elegibilidadeDoItem, saldoDoAno,
  type AquisicaoLetra, type AquisicaoLetraData, type ItemDoCatalogoLetra, type OrcamentoLetraData,
} from '../../work-budget/letra'
import { vigenteEm } from '../../work-budget/parametros'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { CampoDeValor, dataDeHoje, formatarData } from './campos'
import { MemoriaDoCalculo } from './LancamentosDoTrabalho'

interface PainelLetraProps {
  ano: string
  hoje: string
  orcamento: (OrcamentoLetraData & { id: string }) | null
  itens: ItemDoCatalogoLetra[]
  aquisicoes: AquisicaoLetra[]
  configuracao: ConfiguracaoDoTrabalhoData | null
  onSalvarOrcamento: (dados: OrcamentoLetraData) => void
  onSalvarItem: (dados: Omit<ItemDoCatalogoLetra, 'id'>, id?: string) => void
  onSalvarAquisicao: (dados: AquisicaoLetraData) => void
  onApagar: (id: string) => void
}

/**
 * O LETRA.
 *
 * Três limites atuam ao mesmo tempo, e é a combinação deles que confunde: o
 * orçamento do ano, a reserva que só pode virar livro, e o limite de cada item
 * com seu intervalo de renovação. Um item pode caber no orçamento e ainda assim
 * estar bloqueado porque foi comprado ano passado — por isso o intervalo
 * aparece ao lado de cada item, e não escondido no cadastro.
 */
export function PainelLetra({
  ano, hoje, orcamento, itens, aquisicoes, configuracao,
  onSalvarOrcamento, onSalvarItem, onSalvarAquisicao, onApagar,
}: PainelLetraProps) {
  const [total, setTotal] = useState<Centavos>(orcamento?.total ?? 0)
  const [reserva, setReserva] = useState<Centavos>(orcamento?.reservaDeLivros ?? 0)
  const [novoItem, setNovoItem] = useState<Omit<ItemDoCatalogoLetra, 'id'> | null>(null)
  const [compra, setCompra] = useState<{ itemId: string; valor: Centavos; data: string; descricao: string } | null>(null)

  const saldo = useMemo(
    () => saldoDoAno(orcamento ?? { total: 0, reservaDeLivros: 0 }, aquisicoes, itens, ano),
    [orcamento, aquisicoes, itens, ano],
  )

  const contexto = useMemo(() => ({
    fpe: configuracao ? vigenteEm(configuracao.fpe, hoje)?.valor ?? null : null,
    percentualDeAudit: configuracao ? vigenteEm(configuracao.percentualDeAudit, hoje)?.valor ?? null : null,
    valorDaDespesa: 0, valorFixoLocal: 0, outraBase: 0,
  }), [configuracao, hoje])

  const itemDaCompra = itens.find(({ id }) => id === compra?.itemId) ?? null
  const avaliacao = compra && itemDaCompra
    ? avaliarCompra(itemDaCompra, compra.valor, { data: compra.data, aquisicoes, saldo, contexto })
    : null

  return <>
    <section className="budget-metrics" aria-label={`Saldo do LETRA em ${ano}`}>
      <div><span>Orçamento do ano</span><strong>{formatar(saldo.total)}</strong></div>
      <div><span>Reserva de livros</span><strong>{formatar(saldo.reservaDeLivros)}</strong></div>
      <div><span>Saldo de livros</span><strong>{formatar(saldo.saldoDeLivros)}</strong></div>
      <div><span>Saldo dos demais</span><strong>{formatar(saldo.saldoDeOutros)}</strong></div>
      <div><span>Saldo total</span><strong>{formatar(saldo.saldoTotal)}</strong></div>
    </section>

    {saldo.estourado && <div className="alert alert--warning" role="status">O ano passou do orçamento em {formatar(-saldo.saldoTotal)}.</div>}

    <Card title={`Orçamento de ${ano}`}>
      <div className="form-grid">
        <CampoDeValor id="letra-total" label="Total do ano" valor={total} onChange={setTotal} />
        <CampoDeValor id="letra-reserva" label="Reserva de livros" valor={reserva} onChange={setReserva} />
      </div>
      <div className="form-actions">
        <Button onClick={() => onSalvarOrcamento({
          ano, total, reservaDeLivros: reserva,
          referencia: orcamento?.referencia ?? '', createdAt: '', updatedAt: '',
        })}>Salvar orçamento</Button>
      </div>
    </Card>

    <Card title="Itens">
      <div className="page-actions">
        <Button icon={<Plus />} onClick={() => setNovoItem({
          nome: '', grupo: '', limite: null, limitePercentual: null, limiteBase: null,
          intervaloEmMeses: null, ehLivro: false, referencia: '', observacao: '',
        })}>Novo item</Button>
      </div>
      {novoItem && <div className="form-grid">
        <label className="field" htmlFor="letra-item-nome"><span className="field__label">Nome</span>
          <input id="letra-item-nome" className="field__input" value={novoItem.nome} onChange={(evento) => setNovoItem({ ...novoItem, nome: evento.target.value })} />
        </label>
        <CampoDeValor id="letra-item-limite" label="Limite" valor={novoItem.limite ?? 0} onChange={(limite) => setNovoItem({ ...novoItem, limite: limite || null })} />
        <label className="field" htmlFor="letra-item-intervalo"><span className="field__label">Intervalo em meses</span>
          <input id="letra-item-intervalo" className="field__input" type="number" min="0" value={novoItem.intervaloEmMeses ?? ''} onChange={(evento) => setNovoItem({ ...novoItem, intervaloEmMeses: evento.target.value === '' ? null : Number(evento.target.value) })} />
        </label>
        <label className="field field--checkbox" htmlFor="letra-item-livro">
          <input id="letra-item-livro" type="checkbox" checked={novoItem.ehLivro} onChange={(evento) => setNovoItem({ ...novoItem, ehLivro: evento.target.checked })} />
          <span className="field__label">Conta como livro</span>
        </label>
      </div>}
      {novoItem && <div className="form-actions">
        <Button onClick={() => { onSalvarItem(novoItem); setNovoItem(null) }}>Salvar item</Button>
        <Button variant="quiet" onClick={() => setNovoItem(null)}>Cancelar</Button>
      </div>}
      {itens.length === 0
        ? <p className="card-copy">Nenhum item cadastrado.</p>
        : <div className="entity-list">{itens.map((item) => {
          const elegibilidade = elegibilidadeDoItem(item, aquisicoes, hoje)
          return <div className="entity-row entity-row--texto" key={item.id}>
            <span>
              <strong>{item.nome}</strong>
              <small>
                {item.limite === null ? 'Sem limite' : `Limite ${formatar(item.limite)}`}
                {item.intervaloEmMeses === null ? '' : ` · ${item.intervaloEmMeses} meses`}
                {item.ehLivro ? ' · Livro' : ''}
              </small>
            </span>
            {elegibilidade.elegivel
              ? <span className="status-pill status-pill--success">Disponível</span>
              : <span className="status-pill status-pill--muted">Libera em {formatarData(elegibilidade.liberaEm)}</span>}
            <Button variant="quiet" onClick={() => setCompra({ itemId: item.id, valor: 0, data: dataDeHoje(), descricao: '' })}>Registrar</Button>
          </div>
        })}</div>}
    </Card>

    {compra && <Card title="Nova aquisição">
      <div className="form-grid">
        <label className="field" htmlFor="letra-compra-item"><span className="field__label">Item</span>
          <select id="letra-compra-item" className="field__input" value={compra.itemId} onChange={(evento) => setCompra({ ...compra, itemId: evento.target.value })}>
            <option value="">Escolher</option>
            {itens.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}
          </select>
        </label>
        <label className="field" htmlFor="letra-compra-descricao"><span className="field__label">Descrição</span>
          <input id="letra-compra-descricao" className="field__input" value={compra.descricao} onChange={(evento) => setCompra({ ...compra, descricao: evento.target.value })} />
        </label>
        <CampoDeValor id="letra-compra-valor" label="Valor" valor={compra.valor} onChange={(valor) => setCompra({ ...compra, valor })} />
        <label className="field" htmlFor="letra-compra-data"><span className="field__label">Data</span>
          <input id="letra-compra-data" className="field__input" type="date" value={compra.data} onChange={(evento) => setCompra({ ...compra, data: evento.target.value })} />
        </label>
      </div>
      {avaliacao && <>
        <dl className="estrato">
          <div><dt>Coberto</dt><dd>{formatar(avaliacao.coberto)}</dd></div>
          <div><dt>Do bolso</dt><dd>{formatar(avaliacao.parcelaPessoal)}</dd></div>
        </dl>
        {avaliacao.impedimentos.map((impedimento) => <div className="alert alert--warning" role="status" key={impedimento}>{impedimento}</div>)}
        <MemoriaDoCalculo memoria={avaliacao.memoria} />
      </>}
      <div className="form-actions">
        <Button
          disabled={!avaliacao || !compra.valor}
          onClick={() => {
            if (!avaliacao) return
            onSalvarAquisicao({
              itemId: compra.itemId, descricao: compra.descricao, data: compra.data,
              valor: compra.valor, coberto: avaliacao.coberto, parcelaPessoal: avaliacao.parcelaPessoal,
              memoria: avaliacao.memoria, observacao: '', createdAt: '', updatedAt: '',
            })
            setCompra(null)
          }}
        >Salvar aquisição</Button>
        <Button variant="quiet" onClick={() => setCompra(null)}>Cancelar</Button>
      </div>
    </Card>}

    <Card title="Aquisições">
      {aquisicoes.length === 0
        ? <p className="card-copy">Nenhuma aquisição registrada.</p>
        : <div className="entity-list">{[...aquisicoes].sort((esquerda, direita) => direita.data.localeCompare(esquerda.data)).map((aquisicao) => <div className="entity-row entity-row--texto" key={aquisicao.id}>
          <span>
            <strong>{aquisicao.descricao || itens.find(({ id }) => id === aquisicao.itemId)?.nome || aquisicao.itemId}</strong>
            <small>{formatarData(aquisicao.data)} · Pago {formatar(aquisicao.valor)} · Do bolso {formatar(aquisicao.parcelaPessoal)}</small>
          </span>
          <strong>{formatar(aquisicao.coberto)}</strong>
          <Button variant="danger" icon={<Trash2 />} aria-label={`Apagar aquisição ${aquisicao.descricao || aquisicao.itemId}`} onClick={() => onApagar(aquisicao.id)} />
        </div>)}</div>}
    </Card>
  </>
}
