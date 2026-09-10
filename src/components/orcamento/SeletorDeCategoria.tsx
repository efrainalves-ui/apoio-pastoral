import { ChevronLeft, ChevronRight, Search, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import {
  buscarSubcategorias, categoriasDe, nomeCompleto,
  type CategoriaFinanceira, type NaturezaDoLancamento,
} from '../../family-budget/catalogo'

/**
 * A escolha da categoria, em duas etapas.
 *
 * Duzentas e cinquenta subcategorias não cabem num `select`: no celular ele
 * vira uma lista que ocupa a tela inteira e obriga a rolar às cegas até achar
 * "Açougue". Aqui se escolhe primeiro a família — dezessete opções, todas
 * visíveis — e depois o item dentro dela. Quem já sabe o nome digita e pula as
 * duas etapas.
 */

interface SeletorDeCategoriaProps {
  natureza: NaturezaDoLancamento
  valor: string
  onEscolher: (codigo: string) => void
  rotulo?: string
}

export function SeletorDeCategoria({ natureza, valor, onEscolher, rotulo = 'Categoria' }: SeletorDeCategoriaProps) {
  const [aberto, setAberto] = useState(false)
  const [familia, setFamilia] = useState<CategoriaFinanceira | null>(null)
  const [busca, setBusca] = useState('')

  const encontrados = useMemo(() => buscarSubcategorias(natureza, busca), [natureza, busca])
  const familias = categoriasDe(natureza)
  const escolhido = valor ? nomeCompleto(valor) : ''

  function fechar() {
    setAberto(false)
    setFamilia(null)
    setBusca('')
  }

  function escolher(codigo: string) {
    onEscolher(codigo)
    fechar()
  }

  return <>
    <label className="field" htmlFor="abrir-categoria">
      <span className="field__label">{rotulo} *</span>
      {/*
        O nome vem do `aria-label`: sem ele, o rótulo que envolve o botão
        engorda o nome acessível com o texto da categoria escolhida, e quem usa
        leitor de tela ouve o valor no lugar da ação.
      */}
      <button
        id="abrir-categoria"
        type="button"
        aria-label={escolhido ? `Categoria: ${escolhido}. Trocar` : 'Escolher categoria'}
        className={`escolha-categoria ${escolhido ? '' : 'escolha-categoria--vazia'}`}
        onClick={() => setAberto(true)}
      >
        <span>{escolhido || 'Escolher categoria'}</span>
        <ChevronRight aria-hidden="true" />
      </button>
    </label>

    {aberto && <div className="folha" role="dialog" aria-modal="true" aria-label={familia ? familia.nome : 'Escolha uma categoria'}>
      <div className="folha__fundo" onClick={fechar} />
      <div className="folha__corpo">
        <header className="folha__topo">
          {familia
            ? <button type="button" className="botao-itinerario" aria-label="Voltar às categorias" onClick={() => setFamilia(null)}><ChevronLeft aria-hidden="true" /></button>
            : <span className="folha__espaco" />}
          <strong>{familia ? familia.nome : 'Escolha uma categoria'}</strong>
          <button type="button" className="botao-itinerario" aria-label="Fechar" onClick={fechar}><X aria-hidden="true" /></button>
        </header>

        {!familia && <div className="visitacao-busca folha__busca">
          <Search aria-hidden="true" />
          <input
            type="search"
            className="field__input"
            value={busca}
            onChange={(event) => setBusca(event.target.value)}
            placeholder="Buscar categoria"
            aria-label="Buscar categoria"
            autoFocus
          />
        </div>}

        <div className="folha__lista">
          {busca.trim() && !familia && (encontrados.length
            ? encontrados.map(({ categoria, subcategoria }) => <button
              key={subcategoria.codigo}
              type="button"
              className={`folha__item ${valor === subcategoria.codigo ? 'folha__item--escolhido' : ''}`}
              onClick={() => escolher(subcategoria.codigo)}
            ><strong>{subcategoria.nome}</strong><small>{categoria.nome}</small></button>)
            : <p className="folha__vazio">Nada encontrado com esse nome.</p>)}

          {!busca.trim() && !familia && familias.map((grupo) => <button
            key={grupo.codigo}
            type="button"
            className="folha__item"
            onClick={() => setFamilia(grupo)}
          >
            <strong>{grupo.nome}</strong>
            <small>{grupo.subcategorias.length} opções</small>
            <ChevronRight aria-hidden="true" />
          </button>)}

          {familia?.subcategorias.map((subcategoria) => <button
            key={subcategoria.codigo}
            type="button"
            className={`folha__item ${valor === subcategoria.codigo ? 'folha__item--escolhido' : ''}`}
            onClick={() => escolher(subcategoria.codigo)}
          ><strong>{subcategoria.nome}</strong></button>)}
        </div>
      </div>
    </div>}
  </>
}
