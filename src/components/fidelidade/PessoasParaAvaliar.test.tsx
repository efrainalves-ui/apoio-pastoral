import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ChurchEntity } from '../../district/types'
import type { PersonEntity } from '../../people/types'
import { PessoasParaAvaliar } from './PessoasParaAvaliar'

const IGREJAS = [
  { id: 'central', name: 'Igreja Central Fictícia', status: 'active' },
  { id: 'longa', name: 'Igreja Fictícia do Bairro Nossa Senhora das Graças de Cima', status: 'active' },
  { id: 'vazia', name: 'Igreja Fictícia Sem Pendência', status: 'active' },
] as ChurchEntity[]

const pessoa = (id: string, name: string, churchId: string, birthDate: string | null = '1990-04-02') =>
  ({ id, name, birthDate, currentChurchId: churchId, incomeStatus: 'unknown', fidelity: { category: 'non_tither' } }) as unknown as PersonEntity

const muitas = Array.from({ length: 30 }, (_, indice) => pessoa(`p${indice}`, `Pessoa Fictícia ${String(indice).padStart(2, '0')}`, 'central'))

afterEach(cleanup)

describe('pessoas para avaliar', () => {
  it('mostra quantas pessoas correspondem, com nome, igreja, idade e classificação separados', () => {
    const longa = pessoa('longa', 'Maria Aparecida Fictícia dos Santos Nascimento Silva', 'longa')
    render(<PessoasParaAvaliar pessoas={[longa]} igrejas={IGREJAS} igrejaSelecionada="" onEscolherIgreja={() => undefined} onAvaliar={() => undefined} />)

    expect(screen.getByText('1 pessoa')).toBeInTheDocument()
    const linha = screen.getByRole('listitem')
    // Cada informação em seu próprio elemento: nada de textos grudados.
    expect(within(linha).getByText('Maria Aparecida Fictícia dos Santos Nascimento Silva')).toBeInTheDocument()
    expect(within(linha).getByText('Igreja Fictícia do Bairro Nossa Senhora das Graças de Cima')).toBeInTheDocument()
    expect(within(linha).getByText('36 anos')).toBeInTheDocument()
    expect(within(linha).getByText('Não dizimista')).toBeInTheDocument()
    expect(within(linha).getByRole('button', { name: 'Avaliar Maria Aparecida Fictícia dos Santos Nascimento Silva' })).toBeInTheDocument()
  })

  it('quem tem 67 anos ou mais aparece como não dizimista com renda; sem data, a idade não é inventada', () => {
    const idosa = pessoa('idosa', 'Pessoa Fictícia Idosa', 'central', '1950-01-10')
    const semData = pessoa('sem', 'Pessoa Fictícia Sem Data', 'central', null)
    render(<PessoasParaAvaliar pessoas={[idosa, semData]} igrejas={IGREJAS} igrejaSelecionada="" onEscolherIgreja={() => undefined} onAvaliar={() => undefined} />)

    expect(screen.getByText('Não dizimista com renda')).toBeInTheDocument()
    expect(screen.getByText('Idade não informada')).toBeInTheDocument()
  })

  it('a busca por nome recorta a lista e a contagem acompanha', async () => {
    const user = userEvent.setup()
    render(<PessoasParaAvaliar pessoas={[pessoa('a', 'Ana Fictícia', 'central'), pessoa('b', 'Bruno Fictício', 'central')]} igrejas={IGREJAS} igrejaSelecionada="" onEscolherIgreja={() => undefined} onAvaliar={() => undefined} />)

    expect(screen.getByText('2 pessoas')).toBeInTheDocument()
    await user.type(screen.getByRole('searchbox', { name: 'Buscar pessoa' }), 'ana')
    expect(screen.getByText('1 pessoa')).toBeInTheDocument()
    expect(screen.queryByText('Bruno Fictício')).not.toBeInTheDocument()

    await user.clear(screen.getByRole('searchbox', { name: 'Buscar pessoa' }))
    await user.type(screen.getByRole('searchbox', { name: 'Buscar pessoa' }), 'ninguém')
    expect(screen.getByText('Nenhuma pessoa com esse nome')).toBeInTheDocument()
  })

  it('o filtro por igreja avisa quem escolheu, e igreja sem pendência fica explícita', async () => {
    const escolher = vi.fn()
    const user = userEvent.setup()
    const { rerender } = render(<PessoasParaAvaliar pessoas={[pessoa('a', 'Ana Fictícia', 'central')]} igrejas={IGREJAS} igrejaSelecionada="" onEscolherIgreja={escolher} onAvaliar={() => undefined} />)

    await user.selectOptions(screen.getByLabelText('Igreja'), 'Igreja Fictícia Sem Pendência')
    expect(escolher).toHaveBeenCalledWith('vazia')

    rerender(<PessoasParaAvaliar pessoas={[pessoa('a', 'Ana Fictícia', 'central')]} igrejas={IGREJAS} igrejaSelecionada="vazia" onEscolherIgreja={escolher} onAvaliar={() => undefined} />)
    expect(screen.getByText('0 pessoas')).toBeInTheDocument()
    expect(screen.getByText('Nenhuma pessoa pendente de avaliação')).toBeInTheDocument()
  })

  it('pagina de 25 em 25, mantém o filtro ao virar a página e volta à primeira quando a busca muda', async () => {
    const user = userEvent.setup()
    render(<PessoasParaAvaliar pessoas={muitas} igrejas={IGREJAS} igrejaSelecionada="" onEscolherIgreja={() => undefined} onAvaliar={() => undefined} />)

    expect(screen.getByText('30 pessoas')).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(25)
    expect(screen.getByText('Página 1 de 2')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Próxima' }))
    expect(screen.getAllByRole('listitem')).toHaveLength(5)
    expect(screen.getByText('Pessoa Fictícia 29')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Próxima' })).toBeDisabled()

    // Buscar na segunda página não deixa o pastor numa página que não existe mais.
    await user.type(screen.getByRole('searchbox', { name: 'Buscar pessoa' }), 'Pessoa Fictícia 0')
    expect(screen.getByText('10 pessoas')).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Páginas da lista' })).not.toBeInTheDocument()
  })

  it('avaliar devolve a pessoa escolhida', async () => {
    const avaliar = vi.fn()
    const user = userEvent.setup()
    const alvo = pessoa('a', 'Ana Fictícia', 'central')
    render(<PessoasParaAvaliar pessoas={[alvo]} igrejas={IGREJAS} igrejaSelecionada="" onEscolherIgreja={() => undefined} onAvaliar={avaliar} />)

    await user.click(screen.getByRole('button', { name: 'Avaliar Ana Fictícia' }))
    expect(avaliar).toHaveBeenCalledWith(alvo)
  })
})
