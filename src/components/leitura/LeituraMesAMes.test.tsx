import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReadingBookData, ReadingEntity, ReadingSessionData } from '../../reading/types'
import { LeituraMesAMes } from './LeituraMesAMes'

/* O registro do pastor: um livro, oitenta páginas e uma hora e meia, tudo em setembro. */
const LIVRO: ReadingEntity<ReadingBookData> = {
  id: 'unico', title: 'Livro Fictício de Setembro', author: 'Autora Fictícia', category: 'devotional', status: 'completed',
  totalPages: 80, pagesRead: 80, startDate: '2026-09-01', completedDate: '2026-09-16', notes: '', createdAt: '', updatedAt: '',
}
const SESSAO: ReadingEntity<ReadingSessionData> = {
  id: 's1', bookId: 'unico', date: '2026-09-16', pages: 80, minutes: 90, notes: '', createdAt: '2026-09-16T10:00:00Z', updatedAt: '',
}

afterEach(cleanup)

function abrirSetembro() {
  return screen.getByRole('button', { name: /setembro/ })
}

describe('leitura mês a mês', () => {
  it('o mês com leitura aparece com cada número junto do seu rótulo, e os vazios ficam recolhidos', () => {
    render(<LeituraMesAMes livros={[LIVRO]} sessoes={[SESSAO]} ano="2026" mesSelecionado="2026-09" onEscolherMes={() => undefined} />)

    expect(abrirSetembro()).toHaveAccessibleName('setembro 1 livro · 80 páginas · 1h 30min')
    // Os outros onze meses não ocupam uma linha cada: ficam como marcas curtas.
    expect(screen.queryByRole('button', { name: /janeiro/ })).not.toBeInTheDocument()
    expect(screen.getByText('Sem leitura')).toBeInTheDocument()
    expect(screen.getByText('jan')).toBeInTheDocument()
  })

  it('clicar no mês abre os livros e as leituras daquele mês, e escolhe o mês', async () => {
    const escolhido = vi.fn()
    const user = userEvent.setup()
    render(<LeituraMesAMes livros={[LIVRO]} sessoes={[SESSAO]} ano="2026" mesSelecionado="2026-01" onEscolherMes={escolhido} />)

    expect(abrirSetembro()).toHaveAttribute('aria-expanded', 'false')
    await user.click(abrirSetembro())

    expect(escolhido).toHaveBeenCalledWith('2026-09')
    expect(abrirSetembro()).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Livro Fictício de Setembro · concluído')).toBeInTheDocument()
    expect(screen.getByText('16/09/2026')).toBeInTheDocument()
    expect(screen.getByText('80 páginas · 1h 30min')).toBeInTheDocument()
  })

  it('mostrar todos os meses traz os doze; o mês sem leitura diz que não tem', async () => {
    const user = userEvent.setup()
    render(<LeituraMesAMes livros={[LIVRO]} sessoes={[SESSAO]} ano="2026" mesSelecionado="2026-09" onEscolherMes={() => undefined} />)

    await user.click(screen.getByRole('button', { name: 'Mostrar todos os meses' }))
    expect(screen.getByRole('button', { name: 'janeiro Sem leitura registrada' })).toBeInTheDocument()
    expect(screen.queryByText('Sem leitura')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'janeiro Sem leitura registrada' }))
    expect(screen.getByText('Nenhuma leitura registrada neste mês.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Mostrar só os meses com leitura' }))
    expect(screen.queryByRole('button', { name: /janeiro/ })).not.toBeInTheDocument()
  })

  it('um ano sem nenhuma leitura não mostra tabela vazia', () => {
    render(<LeituraMesAMes livros={[]} sessoes={[]} ano="2025" mesSelecionado="2025-03" onEscolherMes={() => undefined} />)
    expect(screen.getByText('Nenhuma leitura registrada em 2025')).toBeInTheDocument()
  })
})
