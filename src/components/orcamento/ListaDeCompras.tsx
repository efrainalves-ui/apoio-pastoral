import { Check, CheckCircle2, Circle, Copy, ListPlus, Plus, ShoppingCart, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import {
  CATALOGO_DE_COMPRAS, CATEGORIAS_DO_CATALOGO, listaPadrao, podeRegistrar,
  repetirCompra, subtotal, totaisDaCompra, UNIDADES,
  type Compra, type CompraData, type ItemDaCompra, type Unidade,
} from '../../family-budget/compras'
import { formatar, lerValor } from '../../family-budget/dinheiro'
import { normalizePersonName } from '../../people/validation'
import { Button } from '../ui/Button'

interface ListaDeComprasProps {
  mes: string
  compra: Compra | null
  anterior: Compra | null
  onSalvar: (dados: CompraData, id?: string) => void
  onFinalizar: (compra: Compra) => void
  /** Quantos itens ficaram na lista de compras antiga, esperando por uma tela. */
  antigos?: number
  onTrazerAntigos?: () => void
}

/**
 * A lista de compras da casa.
 *
 * O carrinho soma enquanto se anda pelo mercado: o item marcado entra no
 * total, e o limite mostra quanto ainda dá para gastar. É a conta que se faz
 * de cabeça no corredor, e fazer de cabeça é como se estoura.
 */
export function ListaDeCompras({ mes, compra, anterior, onSalvar, onFinalizar, antigos = 0, onTrazerAntigos }: ListaDeComprasProps) {
  const [busca, setBusca] = useState('')
  const [novoItem, setNovoItem] = useState('')
  const [enviado, setEnviado] = useState<Compra | null>(null)

  /*
    Cada mudança sai daqui, é cifrada, gravada e só então volta pelo pai. No
    corredor do mercado ninguém espera por isso: digita-se o preço e logo a
    quantidade. A segunda mudança era montada em cima da compra antiga, ainda
    sem a primeira — e o preço voltava a zero.

    Aqui fica o que já foi mandado, e é dele que a próxima mudança parte. Some
    sozinho quando o pai alcança, ou quando a compra do mês é outra.
  */
  const alcancado = !compra || !enviado || enviado.id !== compra.id || mesmaLista(enviado, compra)
  if (alcancado && enviado) setEnviado(null)
  const atual = alcancado ? compra : enviado

  const daListaAntiga = antigos > 0 && onTrazerAntigos
    ? <div className="form-actions">
        <Button variant="secondary" icon={<ListPlus size={17} />} onClick={onTrazerAntigos}>
          Trazer {antigos} {antigos === 1 ? 'item' : 'itens'} da lista antiga
        </Button>
      </div>
    : null

  if (!atual) return <>
    {daListaAntiga}
    <PrimeiroUso mes={mes} anterior={anterior} onCriar={onSalvar} />
  </>

  const totais = totaisDaCompra(atual)
  const finalizada = Boolean(atual.finalizadaEm)

  function salvar(proxima: Compra) {
    setEnviado(proxima)
    const { id, ...dados } = proxima
    onSalvar(dados, id)
  }

  function mudar(itemId: string, mudanca: Partial<ItemDaCompra>) {
    if (!atual) return
    salvar({ ...atual, itens: atual.itens.map((item) => item.id === itemId ? { ...item, ...mudanca } : item) })
  }

  function remover(itemId: string) {
    if (!atual) return
    salvar({ ...atual, itens: atual.itens.filter((item) => item.id !== itemId) })
  }

  function acrescentar() {
    if (!atual || !novoItem.trim()) return
    const doCatalogo = CATALOGO_DE_COMPRAS.find(({ nome }) => normalizePersonName(nome) === normalizePersonName(novoItem))
    salvar({
      ...atual,
      itens: [...atual.itens, {
        id: crypto.randomUUID(),
        nome: novoItem.trim(),
        categoria: doCatalogo?.categoria ?? 'Outros',
        quantidade: 1,
        unidade: doCatalogo?.unidade ?? 'unidade',
        valorUnitario: 0,
        comprado: false,
        observacao: '',
      }],
    })
    setNovoItem('')
  }

  function mudarLimite(texto: string) {
    if (!atual) return
    salvar({ ...atual, limite: lerValor(texto) ?? 0 })
  }

  const termo = normalizePersonName(busca)
  const porCategoria = CATEGORIAS_DO_CATALOGO
    .concat('Outros')
    .map((categoria) => ({
      categoria,
      itens: atual.itens.filter((item) => item.categoria === categoria && (!termo || normalizePersonName(item.nome).includes(termo))),
    }))
    .filter(({ itens }) => itens.length > 0)

  return <div className="painel-financeiro">
    {daListaAntiga}
    <section className="cartao-saldo" aria-label="Orçamento da compra">
      <p className="cartao-saldo__rotulo">No carrinho</p>
      <p className="cartao-saldo__num">{formatar(totais.noCarrinho)}</p>
      <dl className="cartao-saldo__linhas">
        <div><dt>Lista inteira</dt><dd>{formatar(totais.listaInteira)}</dd></div>
        <div><dt>Marcados</dt><dd>{totais.marcados} de {totais.itens}</dd></div>
        {totais.disponivel !== null && <div>
          <dt>{totais.passouDoLimite ? 'Passou' : 'Ainda disponível'}</dt>
          <dd className={totais.passouDoLimite ? 'valor-negativo' : 'valor-entrada'}>{formatar(Math.abs(totais.disponivel))}</dd>
        </div>}
      </dl>
    </section>

    {!finalizada && <div className="form-grid">
      <label className="field" htmlFor="compra-limite">
        <span className="field__label">Limite da compra</span>
        <input
          id="compra-limite"
          className="field__input"
          inputMode="decimal"
          defaultValue={atual.limite ? String(atual.limite / 100).replace('.', ',') : ''}
          onBlur={(evento) => mudarLimite(evento.target.value)}
          placeholder="Sem limite"
        />
      </label>
      <label className="field" htmlFor="compra-novo-item">
        <span className="field__label">Acrescentar item</span>
        <span className="acrescentar-item">
          <input
            id="compra-novo-item"
            className="field__input"
            value={novoItem}
            onChange={(evento) => setNovoItem(evento.target.value)}
            onKeyDown={(evento) => { if (evento.key === 'Enter') { evento.preventDefault(); acrescentar() } }}
            placeholder="Nome do item"
          />
          <button type="button" className="botao-novo" onClick={acrescentar}><Plus aria-hidden="true" /></button>
        </span>
      </label>
    </div>}

    <div className="visitacao-busca">
      <input
        type="search"
        className="field__input"
        value={busca}
        onChange={(evento) => setBusca(evento.target.value)}
        placeholder="Buscar item"
        aria-label="Buscar item"
      />
    </div>

    {finalizada && <div className="alert alert--success" role="status">
      Compra finalizada e registrada em Alimentação · Supermercado.
    </div>}

    {porCategoria.map(({ categoria, itens }) => <section className="prateleira" key={categoria} aria-label={categoria}>
      <h3 className="rotulo-secao">{categoria}</h3>
      {itens.map((item) => <article className={`item-compra ${item.comprado ? 'item-compra--pego' : ''}`} key={item.id}>
        <button
          type="button"
          className="linha-lancamento__marca"
          aria-label={`${item.comprado ? 'Desmarcar' : 'Marcar'} ${item.nome}`}
          onClick={() => mudar(item.id, { comprado: !item.comprado })}
          disabled={finalizada}
        >{item.comprado ? <CheckCircle2 /> : <Circle />}</button>

        <span className="item-compra__nome">{item.nome}</span>

        <input
          className="field__input item-compra__quantidade"
          type="number"
          min="0"
          step="0.5"
          value={item.quantidade || ''}
          onChange={(evento) => mudar(item.id, { quantidade: Number(evento.target.value) || 0 })}
          aria-label={`Quantidade de ${item.nome}`}
          disabled={finalizada}
        />

        <select
          className="field__input item-compra__unidade"
          value={item.unidade}
          onChange={(evento) => mudar(item.id, { unidade: evento.target.value as Unidade })}
          aria-label={`Unidade de ${item.nome}`}
          disabled={finalizada}
        >{UNIDADES.map((unidade) => <option key={unidade} value={unidade}>{unidade}</option>)}</select>

        <input
          className="field__input item-compra__preco"
          inputMode="decimal"
          defaultValue={item.valorUnitario ? String(item.valorUnitario / 100).replace('.', ',') : ''}
          onBlur={(evento) => mudar(item.id, { valorUnitario: lerValor(evento.target.value) ?? 0 })}
          placeholder="0,00"
          aria-label={`Preço de ${item.nome}`}
          disabled={finalizada}
        />

        <span className="item-compra__subtotal">{formatar(subtotal(item))}</span>

        {!finalizada && <button type="button" className="icon-button danger-icon" aria-label={`Remover ${item.nome}`} onClick={() => remover(item.id)}><Trash2 /></button>}
      </article>)}
    </section>)}

    {!atual.itens.length && <div className="empty-state">
      <ShoppingCart />
      <strong>A lista está vazia</strong>
      <span>Acrescente o primeiro item acima.</span>
    </div>}

    {/*
      Uma compra vira uma saída só. E finalizar duas vezes não pode dobrar o
      valor: a compra guarda o lançamento que criou e o botão desaparece.
    */}
    {!finalizada && <div className="form-actions">
      <Button
        onClick={() => onFinalizar(atual)}
        disabled={!podeRegistrar(atual)}
        icon={<Check size={17} />}
      >Finalizar compra</Button>
    </div>}
  </div>
}

/** O pai alcançou o que mandamos? Só o que se edita aqui conta. */
function mesmaLista(enviado: Compra, chegou: Compra): boolean {
  return enviado.limite === chegou.limite
    && enviado.finalizadaEm === chegou.finalizadaEm
    && enviado.itens.length === chegou.itens.length
    && enviado.itens.every((item, posicao) => {
      const outro = chegou.itens[posicao]
      return Boolean(outro) && item.id === outro!.id && item.quantidade === outro!.quantidade
        && item.unidade === outro!.unidade && item.valorUnitario === outro!.valorUnitario
        && item.comprado === outro!.comprado && item.nome === outro!.nome
    })
}

function PrimeiroUso({ mes, anterior, onCriar }: { mes: string; anterior: Compra | null; onCriar: (dados: CompraData) => void }) {
  const [escolhidas, setEscolhidas] = useState<Set<string>>(new Set(CATEGORIAS_DO_CATALOGO))
  const doCatalogo = useMemo(() => CATALOGO_DE_COMPRAS.filter(({ categoria }) => escolhidas.has(categoria)), [escolhidas])

  return <div className="painel-financeiro">
    <section className="faixa" aria-label="Montar a lista">
      <h2 className="rotulo-secao">Monte sua lista</h2>
      {/*
        Lista que começa vazia é lista que nunca é usada: ninguém digita
        setenta itens antes da primeira ida ao mercado. O catálogo vem pronto e
        a família desmarca o que não usa, uma vez só.
      */}
      <div className="tira-filtros" role="group" aria-label="Prateleiras do catálogo">
        {CATEGORIAS_DO_CATALOGO.map((categoria) => <button
          key={categoria}
          type="button"
          aria-pressed={escolhidas.has(categoria)}
          className={`chip-filtro ${escolhidas.has(categoria) ? 'chip-filtro--ativo' : ''}`}
          onClick={() => setEscolhidas((atual) => {
            const proximo = new Set(atual)
            if (proximo.has(categoria)) proximo.delete(categoria); else proximo.add(categoria)
            return proximo
          })}
        >{categoria}</button>)}
      </div>
      <p className="field__hint">{doCatalogo.length} itens nas prateleiras escolhidas.</p>
    </section>

    <div className="form-actions">
      <Button onClick={() => onCriar(listaPadrao(mes, doCatalogo))} icon={<ListPlus size={17} />}>Usar minha lista padrão</Button>
      {anterior && <button type="button" className="button button--secondary" onClick={() => onCriar(repetirCompra(anterior, mes))}>
        <Copy size={17} aria-hidden="true" />Usar lista do mês passado
      </button>}
      <button type="button" className="button button--secondary" onClick={() => onCriar({ ...listaPadrao(mes, []), nome: 'Compra do mês' })}>
        Criar lista vazia
      </button>
    </div>
  </div>
}
