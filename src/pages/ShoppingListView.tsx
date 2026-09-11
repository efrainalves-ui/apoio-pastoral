import { useReloadOnSync } from '../sync/useReloadOnSync'
/* eslint-disable @typescript-eslint/no-misused-promises */
import { Check, Plus, ReceiptText, Trash2 } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { currency } from '../family-budget/core'
import { FamilyBudgetService } from '../family-budget/service'
import { ShoppingListService } from '../shopping/service'
import { frequentItems, itemTotal, shoppingTotals, SHOPPING_UNIT_LABELS, type ShoppingItemData, type ShoppingItemEntity, type ShoppingUnit } from '../shopping/types'
import { localDateKey } from '../shared/dates'

const service = new ShoppingListService()
const budget = new FamilyBudgetService()
const carimbo = () => new Date().toISOString()
const hoje = () => localDateKey()

const vazio = (): ShoppingItemData => ({ name: '', quantity: 1, unit: 'un', unitPrice: 0, confirmed: false, notes: '', createdAt: carimbo(), updatedAt: carimbo() })

/**
 * Lista de compras: offline, com o valor digitado no mercado.
 *
 * O total acompanha item a item porque essa é a pergunta do corredor do
 * supermercado — "quanto já deu?" —, e ela não pode depender de rede, de
 * sincronização nem de um botão de calcular.
 */
export function ShoppingListView({ accountId, masterKey, onDone, onFail }: {
  accountId: string
  masterKey: CryptoKey | null
  onDone: (mensagem: string) => void
  onFail: (motivo: unknown) => void
}) {
  const [itens, setItens] = useState<ShoppingItemEntity[]>([])
  const [draft, setDraft] = useState<ShoppingItemData | null>(null)
  const [editId, setEditId] = useState('')
  const [carregando, setCarregando] = useState(true)

  const carregar = useCallback(async () => {
    if (!accountId || !masterKey) return
    setCarregando(true)
    try { setItens(await service.items(accountId, masterKey)) } catch (motivo) { onFail(motivo) } finally { setCarregando(false) }
  }, [accountId, masterKey, onFail])
  useReloadOnSync(carregar)

  const totais = useMemo(() => shoppingTotals(itens), [itens])
  const frequentes = useMemo(() => frequentItems(itens).filter((nome) => !itens.some((item) => item.name === nome && !item.confirmed)), [itens])

  async function salvar() {
    if (!masterKey || !draft) return
    try { await service.save(accountId, masterKey, draft, editId || undefined); setDraft(null); setEditId(''); await carregar(); onDone('Item salvo.') } catch (motivo) { onFail(motivo) }
  }

  async function alternar(item: ShoppingItemEntity) {
    if (!masterKey) return
    const { id, ...dados } = item
    try { await service.save(accountId, masterKey, { ...dados, confirmed: !item.confirmed }, id); await carregar() } catch (motivo) { onFail(motivo) }
  }

  async function definirPreco(item: ShoppingItemEntity, unitPrice: number) {
    if (!masterKey) return
    const { id, ...dados } = item
    try { await service.save(accountId, masterKey, { ...dados, unitPrice }, id); await carregar() } catch (motivo) { onFail(motivo) }
  }

  async function apagar(item: ShoppingItemEntity) {
    if (!masterKey || !window.confirm(`Apagar ${item.name} da lista?`)) return
    try { await service.remove(accountId, masterKey, item.id); await carregar(); onDone('Item apagado.') } catch (motivo) { onFail(motivo) }
  }

  async function lancarDespesa() {
    if (!masterKey) return
    if (!window.confirm('Lançar as compras confirmadas como uma despesa pessoal?')) return
    try {
      const resultado = await service.toPersonalExpense(accountId, masterKey, hoje(), (data) => budget.saveExpense(accountId, masterKey, data))
      await service.clearConfirmed(accountId, masterKey)
      await carregar()
      onDone(`Despesa de ${currency(resultado.total)} lançada e itens confirmados retirados da lista.`)
    } catch (motivo) { onFail(motivo) }
  }

  if (carregando) return <div className="app-loading" role="status">Abrindo a lista…</div>

  return <>
    <section className="budget-metrics" aria-label="Total da lista de compras">
      <div><span>No carrinho</span><strong>{currency(totais.confirmed)}</strong></div>
      <div><span>Lista inteira</span><strong>{currency(totais.planned)}</strong></div>
      <div><span>Itens confirmados</span><strong>{totais.confirmedItems} de {totais.items}</strong></div>
      <div><span>Sem valor informado</span><strong>{totais.missingPrice}</strong></div>
    </section>

    <div className="page-actions"><Button icon={<Plus />} onClick={() => { setEditId(''); setDraft(vazio()) }}>Novo item</Button></div>

    {frequentes.length > 0 && <Card title="Itens frequentes">
      <div className="chip-row">{frequentes.map((nome) => <Button key={nome} variant="quiet" onClick={() => { setEditId(''); setDraft({ ...vazio(), name: nome }) }}>{nome}</Button>)}</div>
    </Card>}

    {draft && <Card title={editId ? 'Editar item' : 'Novo item'}>
      <div className="form-grid">
        <label className="field"><span className="field__label">Item</span><input className="field__input" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
        <label className="field"><span className="field__label">Quantidade</span><input className="field__input" type="number" min="0" step="0.01" value={draft.quantity || ''} onChange={(event) => setDraft({ ...draft, quantity: Number(event.target.value) })} /></label>
        <label className="field"><span className="field__label">Unidade</span><select className="field__input" value={draft.unit} onChange={(event) => setDraft({ ...draft, unit: event.target.value as ShoppingUnit })}>{Object.entries(SHOPPING_UNIT_LABELS).map(([valor, rotulo]) => <option key={valor} value={valor}>{rotulo}</option>)}</select></label>
        <label className="field"><span className="field__label">Valor no mercado</span><input className="field__input" type="number" min="0" step="0.01" value={draft.unitPrice || ''} onChange={(event) => setDraft({ ...draft, unitPrice: Number(event.target.value) })} /></label>
      </div>
      <div className="form-actions"><Button onClick={salvar}>Salvar item</Button><Button variant="secondary" onClick={() => setDraft(null)}>Cancelar</Button></div>
    </Card>}

    <Card title="Lista">
      {itens.length === 0
        ? <p className="card-copy">A lista está vazia. Acrescente o primeiro item.</p>
        : <div className="entity-list">{itens.map((item) => <div className={`entity-row ${item.confirmed ? 'entity-row--done' : ''}`} key={item.id}>
            <Button variant={item.confirmed ? 'primary' : 'secondary'} icon={<Check />} aria-label={item.confirmed ? `Desmarcar ${item.name}` : `Confirmar ${item.name}`} onClick={() => alternar(item)} />
            <span><strong>{item.name}</strong><small>{item.quantity} {SHOPPING_UNIT_LABELS[item.unit]}</small></span>
            <label className="field field--inline"><span className="field__label">Valor</span>
              <input className="field__input" type="number" min="0" step="0.01" value={item.unitPrice || ''} aria-label={`Valor de ${item.name}`} onChange={(event) => void definirPreco(item, Number(event.target.value))} />
            </label>
            <strong>{currency(itemTotal(item))}</strong>
            <Button variant="danger" icon={<Trash2 />} aria-label={`Apagar ${item.name}`} onClick={() => apagar(item)} />
          </div>)}</div>}
    </Card>

    <Card title="Depois da compra">
      <p className="card-copy">Os itens confirmados podem virar uma despesa do orçamento pessoal. Isso nunca acontece sozinho: você confere o total e decide.</p>
      <Button icon={<ReceiptText />} disabled={totais.confirmedItems === 0 || totais.confirmed <= 0} onClick={lancarDespesa}>
        Lançar {currency(totais.confirmed)} como despesa pessoal
      </Button>
    </Card>
  </>
}
