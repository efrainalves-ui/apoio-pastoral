import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ChurchEntity } from '../../district/types'
import type { PersonEntity } from '../../people/types'
import { FidelidadePorIgreja } from './FidelidadePorIgreja'

const IGREJAS = [
  { id: 'central', name: 'Igreja Central Fictícia', status: 'active' },
  { id: 'longa', name: 'Igreja Fictícia do Bairro Nossa Senhora das Graças de Cima', status: 'active' },
] as ChurchEntity[]

const pessoa = (id: string, churchId: string, categoria: 'tither' | 'non_tither', incomeStatus: PersonEntity['incomeStatus'] = 'unknown') =>
  ({ id, name: `Pessoa Fictícia ${id}`, birthDate: null, currentChurchId: churchId, incomeStatus, fidelity: { category: categoria } }) as unknown as PersonEntity

afterEach(cleanup)

describe('fidelidade por igreja', () => {
  const PESSOAS = [
    pessoa('a', 'central', 'tither'),
    pessoa('b', 'central', 'non_tither', 'has_income'),
    pessoa('c', 'central', 'non_tither'),
    pessoa('d', 'longa', 'tither'),
  ]

  it('mostra o total do distrito antes das igrejas, e cada igreja com os três estados', () => {
    render(<FidelidadePorIgreja igrejas={IGREJAS} pessoas={PESSOAS} igrejaSelecionada="" onEscolherIgreja={() => undefined} />)

    const distrito = document.querySelector('.fidelidade-resumo')!
    expect(within(distrito as HTMLElement).getByText('Fiéis').nextSibling).toHaveTextContent('2')
    expect(within(distrito as HTMLElement).getByText('Em acompanhamento').nextSibling).toHaveTextContent('1')
    expect(within(distrito as HTMLElement).getByText('A avaliar').nextSibling).toHaveTextContent('1')

    // A igreja traz nome, os três números e seus rótulos.
    const central = screen.getByRole('button', { name: /Igreja Central Fictícia/ })
    expect(central).toHaveAccessibleName('Igreja Central Fictícia 1 Fiéis 1 Em acompanhamento 1 A avaliar')
  })

  it('o nome comprido aparece inteiro, e a igreja sem pendência mostra zero', () => {
    render(<FidelidadePorIgreja igrejas={IGREJAS} pessoas={PESSOAS} igrejaSelecionada="" onEscolherIgreja={() => undefined} />)
    const longa = screen.getByRole('button', { name: /Nossa Senhora das Graças de Cima/ })
    expect(within(longa).getByText('Igreja Fictícia do Bairro Nossa Senhora das Graças de Cima')).toBeInTheDocument()
    expect(longa).toHaveAccessibleName(/1 Fiéis 0 Em acompanhamento 0 A avaliar/)
  })

  it('clicar na igreja escolhe, e clicar de novo volta para todas', async () => {
    const escolher = vi.fn()
    const user = userEvent.setup()
    const { rerender } = render(<FidelidadePorIgreja igrejas={IGREJAS} pessoas={PESSOAS} igrejaSelecionada="" onEscolherIgreja={escolher} />)

    const central = screen.getByRole('button', { name: /Igreja Central Fictícia/ })
    expect(central).toHaveAttribute('aria-pressed', 'false')
    await user.click(central)
    expect(escolher).toHaveBeenCalledWith('central')

    rerender(<FidelidadePorIgreja igrejas={IGREJAS} pessoas={PESSOAS} igrejaSelecionada="central" onEscolherIgreja={escolher} />)
    expect(screen.getByRole('button', { name: /Igreja Central Fictícia/ })).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: /Igreja Central Fictícia/ }))
    expect(escolher).toHaveBeenLastCalledWith('')
  })

  it('dá para chegar às igrejas pelo teclado', async () => {
    const user = userEvent.setup()
    render(<FidelidadePorIgreja igrejas={IGREJAS} pessoas={PESSOAS} igrejaSelecionada="" onEscolherIgreja={() => undefined} />)
    await user.tab()
    expect(screen.getByRole('button', { name: /Igreja Central Fictícia/ })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: /Nossa Senhora das Graças de Cima/ })).toHaveFocus()
  })
})
