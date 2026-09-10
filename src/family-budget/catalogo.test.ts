import { describe, expect, it } from 'vitest'
import {
  acharSubcategoria, buscarSubcategorias, CATEGORIAS_DE_ENTRADA, CATEGORIAS_DE_SAIDA,
  categoriasDe, nomeCompleto, type CategoriaFinanceira,
} from './catalogo'

const nomes = (grupos: CategoriaFinanceira[], codigo: string) =>
  grupos.find((grupo) => grupo.codigo === codigo)?.subcategorias.map(({ nome }) => nome) ?? []

const todosOsNomes = (grupos: CategoriaFinanceira[]) => grupos.flatMap((grupo) => grupo.subcategorias.map(({ nome }) => nome))

describe('catálogo de entradas', () => {
  it('Renda extra tem exatamente três opções', () => {
    expect(nomes(CATEGORIAS_DE_ENTRADA, 'renda-extra')).toEqual(['Revenda', 'Renda de negócio próprio', 'Renda extra'])
  })

  /*
    Estas quatro foram retiradas de propósito. Reescrevê-las mais tarde para
    "completar" a lista mudaria o que o pastor vê e a comparação com os meses
    anteriores — por isso ficam guardadas aqui como ausências.
  */
  it('Benefícios não tem pensão alimentícia, benefício governamental, auxílio familiar nem bolsa', () => {
    const beneficios = nomes(CATEGORIAS_DE_ENTRADA, 'beneficios')
    expect(beneficios).toEqual(['Aposentadoria', 'Pensão', 'Benefício previdenciário', 'Outro benefício'])
    for (const proibido of ['Pensão alimentícia', 'Benefício governamental', 'Auxílio familiar', 'Bolsa de estudos']) {
      expect(beneficios).not.toContain(proibido)
    }
  })

  it('cobre as sete famílias de entrada', () => {
    expect(CATEGORIAS_DE_ENTRADA.map(({ codigo }) => codigo)).toEqual([
      'remuneracao', 'renda-extra', 'beneficios', 'patrimonio', 'investimentos', 'eventuais', 'outras-entradas',
    ])
  })
})

describe('catálogo de saídas', () => {
  it('delivery e lanches são lazer, não alimentação', () => {
    expect(nomes(CATEGORIAS_DE_SAIDA, 'alimentacao')).not.toContain('Delivery')
    expect(nomes(CATEGORIAS_DE_SAIDA, 'alimentacao')).not.toContain('Lanches')
    expect(nomes(CATEGORIAS_DE_SAIDA, 'lazer')).toContain('Delivery')
    expect(nomes(CATEGORIAS_DE_SAIDA, 'lazer')).toContain('Lanches')
  })

  it('cinema e shows não existem em lugar nenhum', () => {
    const todas = todosOsNomes(CATEGORIAS_DE_SAIDA)
    expect(todas).not.toContain('Cinema')
    expect(todas).not.toContain('Shows')
  })

  it('plano de saúde e plano odontológico ficam fora de Saúde', () => {
    const saude = nomes(CATEGORIAS_DE_SAIDA, 'saude')
    expect(saude).not.toContain('Plano de saúde')
    expect(saude).not.toContain('Plano odontológico')
    expect(saude).toContain('Consulta odontológica')
  })

  it('cartão de crédito e formas de pagamento não são categoria', () => {
    const todas = todosOsNomes([...CATEGORIAS_DE_SAIDA, ...CATEGORIAS_DE_ENTRADA])
    for (const proibido of ['Cartão de crédito', 'Cartão', 'Pix', 'Pago', 'Débito automático', 'Boleto']) {
      expect(todas).not.toContain(proibido)
    }
  })

  it('cobre as dezessete famílias de saída', () => {
    expect(CATEGORIAS_DE_SAIDA.map(({ codigo }) => codigo)).toEqual([
      'moradia', 'alimentacao', 'transporte', 'saude', 'educacao', 'filhos', 'vestuario', 'assinaturas',
      'lazer', 'viagens', 'generosidade', 'dividas', 'taxas', 'pet', 'presentes', 'imprevistos', 'outros',
    ])
  })
})

describe('códigos', () => {
  it('são estáveis, sem acento e sem espaço', () => {
    expect(acharSubcategoria('moradia.energia-eletrica')?.subcategoria.nome).toBe('Energia elétrica')
    expect(acharSubcategoria('alimentacao.acougue-proteinas')?.subcategoria.nome).toBe('Açougue/proteínas')
    expect(acharSubcategoria('remuneracao.13-salario')?.subcategoria.nome).toBe('13º salário')
  })

  it('não se repetem dentro da mesma natureza', () => {
    for (const grupos of [CATEGORIAS_DE_ENTRADA, CATEGORIAS_DE_SAIDA]) {
      const codigos = grupos.flatMap((grupo) => grupo.subcategorias.map(({ codigo }) => codigo))
      expect(new Set(codigos).size).toBe(codigos.length)
    }
  })

  it('mostram categoria e subcategoria juntas', () => {
    expect(nomeCompleto('alimentacao.supermercado')).toBe('Alimentação · Supermercado')
    expect(nomeCompleto('nao-existe.nada')).toBe('')
  })
})

describe('busca', () => {
  it('acha sem depender do acento', () => {
    const achados = buscarSubcategorias('saida', 'agua')
    expect(achados.map(({ subcategoria }) => subcategoria.nome)).toContain('Água')
    expect(achados.map(({ subcategoria }) => subcategoria.nome)).toContain('Água mineral')
  })

  it('não vaza saída na busca de entrada', () => {
    expect(buscarSubcategorias('entrada', 'supermercado')).toHaveLength(0)
    expect(categoriasDe('entrada')).toBe(CATEGORIAS_DE_ENTRADA)
    expect(categoriasDe('saida')).toBe(CATEGORIAS_DE_SAIDA)
  })

  it('termo vazio não devolve o catálogo inteiro', () => {
    expect(buscarSubcategorias('saida', '   ')).toHaveLength(0)
  })
})
