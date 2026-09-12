import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ListaDeCompras } from './ListaDeCompras'
import type { Compra, CompraData } from '../../family-budget/compras'

afterEach(cleanup)

function compraDeTeste(): Compra {
  return {
    id: 'compra-1',
    mes: '2026-09',
    nome: 'Compra do mês',
    limite: 20_000,
    lancamentoId: null,
    finalizadaEm: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    itens: [{
      id: 'item-1',
      nome: 'Arroz branco',
      categoria: 'Básicos da despensa',
      quantidade: 0,
      unidade: 'kg',
      valorUnitario: 0,
      comprado: false,
      observacao: '',
    }],
  }
}

/**
 * Gravar é cifrar, escrever e recarregar: demora. No corredor do mercado
 * ninguém espera — digita-se o preço e logo a quantidade. Enquanto a primeira
 * mudança não voltava, a segunda era montada em cima da compra antiga e
 * apagava a primeira: o preço voltava a zero e o carrinho somava nada.
 *
 * Aqui o pai não devolve nada — é o pior caso, a gravação lenta — e a segunda
 * mudança precisa sair com as duas coisas.
 */
describe('lista de compras com a gravação ainda em voo', () => {
  it('a segunda mudança não apaga a primeira', () => {
    const salvos: CompraData[] = []
    const onSalvar = vi.fn((dados: CompraData) => { salvos.push(dados) })

    render(<ListaDeCompras
      mes="2026-09"
      compra={compraDeTeste()}
      anterior={null}
      onSalvar={onSalvar}
      onFinalizar={() => undefined}
    />)

    const preco = screen.getByLabelText('Preço de Arroz branco')
    fireEvent.change(preco, { target: { value: '25,00' } })
    fireEvent.blur(preco)

    fireEvent.change(screen.getByLabelText('Quantidade de Arroz branco'), { target: { value: '2' } })

    expect(salvos).toHaveLength(2)
    expect(salvos[1]!.itens[0]!.valorUnitario).toBe(2500)
    expect(salvos[1]!.itens[0]!.quantidade).toBe(2)
  })

  it('marcar depois de digitar leva o preço e a quantidade junto', () => {
    const salvos: CompraData[] = []
    render(<ListaDeCompras
      mes="2026-09"
      compra={compraDeTeste()}
      anterior={null}
      onSalvar={(dados) => { salvos.push(dados) }}
      onFinalizar={() => undefined}
    />)

    const preco = screen.getByLabelText('Preço de Arroz branco')
    fireEvent.change(preco, { target: { value: '25,00' } })
    fireEvent.blur(preco)
    fireEvent.change(screen.getByLabelText('Quantidade de Arroz branco'), { target: { value: '2' } })
    fireEvent.click(screen.getByLabelText('Marcar Arroz branco'))

    const ultimo = salvos.at(-1)!.itens[0]!
    expect(ultimo.valorUnitario).toBe(2500)
    expect(ultimo.quantidade).toBe(2)
    expect(ultimo.comprado).toBe(true)
  })

  it('o carrinho já soma antes de a gravação voltar', () => {
    render(<ListaDeCompras
      mes="2026-09"
      compra={compraDeTeste()}
      anterior={null}
      onSalvar={() => undefined}
      onFinalizar={() => undefined}
    />)

    const preco = screen.getByLabelText('Preço de Arroz branco')
    fireEvent.change(preco, { target: { value: '25,00' } })
    fireEvent.blur(preco)
    fireEvent.change(screen.getByLabelText('Quantidade de Arroz branco'), { target: { value: '2' } })
    fireEvent.click(screen.getByLabelText('Marcar Arroz branco'))

    expect(screen.getByLabelText('Orçamento da compra')).toHaveTextContent('50,00')
  })

  it('o que o pai devolve volta a mandar quando alcança', () => {
    const salvos: CompraData[] = []
    const { rerender } = render(<ListaDeCompras
      mes="2026-09"
      compra={compraDeTeste()}
      anterior={null}
      onSalvar={(dados) => { salvos.push(dados) }}
      onFinalizar={() => undefined}
    />)

    const preco = screen.getByLabelText('Preço de Arroz branco')
    fireEvent.change(preco, { target: { value: '25,00' } })
    fireEvent.blur(preco)

    // O pai alcançou: gravou e recarregou com o preço dentro.
    const gravada = compraDeTeste()
    gravada.itens[0]!.valorUnitario = 2500
    gravada.updatedAt = '2026-09-02T00:00:00.000Z'
    rerender(<ListaDeCompras
      mes="2026-09"
      compra={gravada}
      anterior={null}
      onSalvar={(dados) => { salvos.push(dados) }}
      onFinalizar={() => undefined}
    />)

    // Daqui em diante manda o que o pai tem — inclusive o que veio de fora.
    const deOutroAparelho = compraDeTeste()
    deOutroAparelho.itens[0]!.valorUnitario = 2500
    deOutroAparelho.limite = 50_000
    rerender(<ListaDeCompras
      mes="2026-09"
      compra={deOutroAparelho}
      anterior={null}
      onSalvar={(dados) => { salvos.push(dados) }}
      onFinalizar={() => undefined}
    />)

    fireEvent.change(screen.getByLabelText('Quantidade de Arroz branco'), { target: { value: '2' } })
    expect(salvos.at(-1)!.limite).toBe(50_000)
    expect(salvos.at(-1)!.itens[0]!.valorUnitario).toBe(2500)
  })
})

/**
 * O botão é a única porta de volta para o que ficou na lista antiga. Ele só
 * existe quando há o que trazer — senão vira enfeite numa tela que já é densa.
 */
describe('o caminho de volta da lista antiga', () => {
  it('não aparece quando não há nada para trazer', () => {
    render(<ListaDeCompras
      mes="2026-09"
      compra={compraDeTeste()}
      anterior={null}
      onSalvar={() => undefined}
      onFinalizar={() => undefined}
      antigos={0}
      onTrazerAntigos={() => undefined}
    />)

    expect(screen.queryByRole('button', { name: /lista antiga/ })).toBeNull()
  })

  it('diz quantos são e chama quem sabe trazer', () => {
    const trazer = vi.fn()
    render(<ListaDeCompras
      mes="2026-09"
      compra={compraDeTeste()}
      anterior={null}
      onSalvar={() => undefined}
      onFinalizar={() => undefined}
      antigos={7}
      onTrazerAntigos={trazer}
    />)

    fireEvent.click(screen.getByRole('button', { name: 'Trazer 7 itens da lista antiga' }))
    expect(trazer).toHaveBeenCalledOnce()
  })

  it('aparece também quando ainda não há compra do mês', () => {
    render(<ListaDeCompras
      mes="2026-09"
      compra={null}
      anterior={null}
      onSalvar={() => undefined}
      onFinalizar={() => undefined}
      antigos={1}
      onTrazerAntigos={() => undefined}
    />)

    expect(screen.getByRole('button', { name: 'Trazer 1 item da lista antiga' })).toBeTruthy()
  })
})
