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

  it('diz em que unidade responder a pergunta numérica', () => {
    render(<AnswerField question={pergunta({ responseType: 'number', unit: 'minutos' })} value="" onChange={vi.fn()} />)

    expect(screen.getByRole('spinbutton')).toBeInTheDocument()
    expect(screen.getByText('Responda em minutos.')).toBeInTheDocument()
  })

  it('mostra as opções da pergunta de escolha, com a opção de pular', () => {
    render(<AnswerField question={pergunta({ responseType: 'choice', options: ['Sim', 'Não'] })} value="" onChange={vi.fn()} />)

    expect(screen.getByRole('option', { name: 'Pular pergunta' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Sim' })).toBeInTheDocument()
  })

  it('deixa marcar várias opções sem o pastor digitar vírgulas', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<AnswerField question={pergunta({ responseType: 'multiple', options: ['Louvor', 'Estudo'] })} value="Louvor" onChange={onChange} />)

    expect(screen.getByRole('checkbox', { name: 'Louvor' })).toBeChecked()
    await user.click(screen.getByRole('checkbox', { name: 'Estudo' }))
    expect(onChange).toHaveBeenCalledWith('Louvor, Estudo')
  })
})
