import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { QuestionSnapshot } from '../care/types'
import { AnswerField } from './AnswerField'

afterEach(cleanup)

function pergunta(partes: Partial<QuestionSnapshot>): QuestionSnapshot {
  return { code: 'FIC-01', version: 1, category: 'Comunhão', text: 'Pergunta fictícia', scope: 'individual', responseType: 'text', options: [], sensitivity: 'pastoral', ...partes }
}

describe('campo de resposta da entrevista', () => {
  // O pastor precisa ver onde escrever, não só uma caixa de seleção.
  it('dá caixa de escrita para pergunta de texto', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<AnswerField question={pergunta({ text: 'O que você mais gosta de fazer na igreja?' })} value="" onChange={onChange} />)

    const caixa = screen.getByRole('textbox')
    expect(caixa.tagName).toBe('TEXTAREA')
    await user.type(caixa, 'C')
    expect(onChange).toHaveBeenCalledWith('C')
  })

  it('dá campo aberto e a unidade para pergunta de tempo', () => {
    render(<AnswerField question={pergunta({ responseType: 'number', unit: 'minutos' })} value="" onChange={vi.fn()} />)

    expect(screen.getByRole('spinbutton')).toBeInTheDocument()
    expect(screen.getByText('minutos')).toBeInTheDocument()
  })

  // "Em quantos dias dos últimos 7" se responde tocando no número.
  it('dá os números de 0 a 7 para pergunta de dias', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<AnswerField question={pergunta({ responseType: 'number', unit: 'dias', scaleMax: 7 })} value="" onChange={onChange} />)

    const botoes = screen.getAllByRole('button')
    expect(botoes.map((botao) => botao.textContent)).toEqual(['0', '1', '2', '3', '4', '5', '6', '7'])
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '3' }))
    expect(onChange).toHaveBeenCalledWith('3')
  })

  it('mostra sim e não como botões, e desmarca ao tocar de novo', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<AnswerField question={pergunta({ responseType: 'choice', options: ['Sim', 'Não', 'Prefere não responder'] })} value="Sim" onChange={onChange} />)

    expect(screen.getByRole('button', { name: 'Sim' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Prefere não responder' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Sim' }))
    expect(onChange).toHaveBeenCalledWith('')
  })

  it('deixa marcar várias opções sem o pastor digitar vírgulas', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<AnswerField question={pergunta({ responseType: 'multiple', options: ['Louvor', 'Estudo'] })} value="Louvor" onChange={onChange} />)

    expect(screen.getByRole('button', { name: 'Louvor' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: 'Estudo' }))
    expect(onChange).toHaveBeenCalledWith('Louvor, Estudo')
  })
})
