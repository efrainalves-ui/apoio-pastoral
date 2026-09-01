import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { QuestionSnapshot } from '../care/types'
import { QuestionCard, questionNumber } from './QuestionCard'

afterEach(cleanup)

const pergunta: QuestionSnapshot = {
  code: 'COM-03', version: 1, category: 'Comunhão',
  text: 'Em quantos dias dos últimos 7 dias você estudou a Bíblia?',
  scope: 'individual', responseType: 'number', options: [], sensitivity: 'pastoral', unit: 'dias', scaleMax: 7,
}

const alvo = [{ id: 'pessoa-ficticia', label: 'Pessoa Fictícia' }]

describe('cartão de pergunta da entrevista', () => {
  it('mostra número curto e área, sem código interno nem escopo', () => {
    render(<QuestionCard question={pergunta} targets={alvo} valueFor={() => ''} registered={false} onAnswer={vi.fn()} onToggleRegistered={vi.fn()} />)

    expect(screen.getByText('3. Comunhão')).toBeInTheDocument()
    expect(screen.queryByText(/COM-03/u)).not.toBeInTheDocument()
    expect(screen.queryByText(/individual/iu)).not.toBeInTheDocument()
  })

  it('não repete aviso de pergunta pulada em cada linha', () => {
    render(<QuestionCard question={pergunta} targets={alvo} valueFor={() => ''} registered={false} onAnswer={vi.fn()} onToggleRegistered={vi.fn()} />)

    expect(screen.queryByText(/pergunta pulada/iu)).not.toBeInTheDocument()
  })

  // Registrar sem resposta continua possível, mas não é como se responde.
  it('oferece registrar sem resposta como ação discreta, e some ao responder', () => {
    const { rerender } = render(<QuestionCard question={pergunta} targets={alvo} valueFor={() => ''} registered={false} onAnswer={vi.fn()} onToggleRegistered={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Registrar como perguntada sem resposta' })).toBeInTheDocument()

    rerender(<QuestionCard question={pergunta} targets={alvo} valueFor={() => '3'} registered onAnswer={vi.fn()} onToggleRegistered={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /Registrar como perguntada/u })).not.toBeInTheDocument()
  })

  it('responder avisa quem chamou, para a pergunta entrar sozinha', async () => {
    const user = userEvent.setup()
    const onAnswer = vi.fn()
    render(<QuestionCard question={pergunta} targets={alvo} valueFor={() => ''} registered={false} onAnswer={onAnswer} onToggleRegistered={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: '5' }))

    expect(onAnswer).toHaveBeenCalledWith('pessoa-ficticia', '5')
  })

  it('usa o número curto do código', () => {
    expect(questionNumber('COM-03')).toBe('3')
    expect(questionNumber('FAM-01')).toBe('1')
  })
})
