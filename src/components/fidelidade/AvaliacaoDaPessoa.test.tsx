import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CadastroParecido } from '../../people/duplicados'
import type { PersonEntity } from '../../people/types'
import { AvaliacaoDaPessoa } from './AvaliacaoDaPessoa'

const pessoa = (id: string, name: string, extra: Partial<PersonEntity> = {}) =>
  ({ id, name, birthDate: '1970-04-02', currentChurchId: 'central', incomeStatus: 'unknown', fidelity: { category: 'non_tither' }, ...extra }) as unknown as PersonEntity

const ALVO = pessoa('a', 'Ana Paula Nascimento')
const semAvisos: CadastroParecido[] = []

function montar(parecidos: CadastroParecido[] = semAvisos) {
  const escolher = vi.fn(); const vincular = vi.fn(); const separar = vi.fn()
  render(<AvaliacaoDaPessoa pessoa={ALVO} parecidos={parecidos} ocupado={false} onEscolher={escolher} onVincular={vincular} onPessoasDiferentes={separar} />)
  return { escolher, vincular, separar, user: userEvent.setup() }
}

afterEach(cleanup)

describe('avaliação de uma pessoa', () => {
  it('pergunta a situação e oferece as quatro respostas, incluindo a de dizimista', () => {
    montar()
    expect(screen.getByRole('group', { name: 'Qual é a situação desta pessoa?' })).toBeInTheDocument()
    for (const rotulo of ['É dizimista', 'Não dizimista com renda', 'Não dizimista sem renda', 'Avaliar depois']) {
      expect(screen.getByRole('button', { name: `${rotulo}: Ana Paula Nascimento` })).toBeInTheDocument()
    }
  })

  it('cada resposta devolve a escolha correspondente', async () => {
    const { escolher, user } = montar()
    await user.click(screen.getByRole('button', { name: 'É dizimista: Ana Paula Nascimento' }))
    expect(escolher).toHaveBeenLastCalledWith('dizimista')

    await user.click(screen.getByRole('button', { name: 'Não dizimista com renda: Ana Paula Nascimento' }))
    expect(escolher).toHaveBeenLastCalledWith('com_renda')

    await user.click(screen.getByRole('button', { name: 'Não dizimista sem renda: Ana Paula Nascimento' }))
    expect(escolher).toHaveBeenLastCalledWith('sem_renda')

    await user.click(screen.getByRole('button', { name: 'Avaliar depois: Ana Paula Nascimento' }))
    expect(escolher).toHaveBeenLastCalledWith('depois')
  })

  it('sem cadastros parecidos, nenhum aviso aparece', () => {
    montar()
    expect(screen.queryByText('Encontramos possíveis cadastros da mesma pessoa')).not.toBeInTheDocument()
  })

  it('com cadastros parecidos, avisa e deixa vincular, separar ou cancelar — nunca une sozinho', async () => {
    const parecida = pessoa('b', 'Ana Paula Nacimento', { fidelity: { category: 'tither' } as PersonEntity['fidelity'] })
    const { vincular, user } = montar([{ pessoa: parecida, motivo: 'nome_quase_igual' }])

    const aviso = screen.getByRole('group', { name: 'Possíveis cadastros da mesma pessoa' })
    expect(within(aviso).getByText('Encontramos possíveis cadastros da mesma pessoa')).toBeInTheDocument()
    expect(within(aviso).getByText('Ana Paula Nacimento')).toBeInTheDocument()
    // O outro cadastro aparece com a classificação dele, que é justamente a diferença.
    expect(within(aviso).getByText('Dizimista')).toBeInTheDocument()
    // Nada foi vinculado só por existir o aviso.
    expect(vincular).not.toHaveBeenCalled()

    await user.click(within(aviso).getByRole('button', { name: 'É a mesma pessoa — vincular cadastros' }))
    expect(vincular).toHaveBeenCalledWith(['b'])
  })

  it('“São pessoas diferentes” avisa quem decide e fecha o aviso; “Cancelar” só fecha', async () => {
    const parecida = pessoa('b', 'Ana Paula Nacimento')
    const { separar, vincular, user } = montar([{ pessoa: parecida, motivo: 'nome_quase_igual' }])

    await user.click(screen.getByRole('button', { name: 'São pessoas diferentes' }))
    expect(separar).toHaveBeenCalledWith(['b'])
    expect(vincular).not.toHaveBeenCalled()
    expect(screen.queryByText('Encontramos possíveis cadastros da mesma pessoa')).not.toBeInTheDocument()
    // As opções continuam disponíveis depois de resolver o aviso.
    expect(screen.getByRole('button', { name: 'É dizimista: Ana Paula Nascimento' })).toBeInTheDocument()

    cleanup()
    const segunda = montar([{ pessoa: parecida, motivo: 'nome_quase_igual' }])
    await segunda.user.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(segunda.separar).not.toHaveBeenCalled()
    expect(screen.queryByText('Encontramos possíveis cadastros da mesma pessoa')).not.toBeInTheDocument()
  })
})
