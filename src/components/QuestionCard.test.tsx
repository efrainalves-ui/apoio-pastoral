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

const perguntaDeEscolha: QuestionSnapshot = {
  code: 'REL-04', version: 1, category: 'Relacionamento', text: 'Você participa de um Pequeno Grupo?',
  scope: 'individual', responseType: 'choice', options: ['Sim', 'Não', 'Gostaria'], sensitivity: 'pastoral',
}

const duasPessoas = [
  { id: 'pessoa-1', label: 'Pessoa Fictícia Um' },
  { id: 'pessoa-2', label: 'Pessoa Fictícia Dois' },
]

describe('mesma resposta para todos', () => {
  it('grava a resposta para cada pessoa, e não uma resposta coletiva', async () => {
    // O atalho é de digitação, não de armazenamento: quem lê depois precisa
    // continuar sabendo o que cada pessoa respondeu.
    const user = userEvent.setup()
    const responder = vi.fn()
    render(<QuestionCard question={perguntaDeEscolha} targets={duasPessoas} sameForAll valueFor={() => ''} registered={false} onAnswer={responder} onToggleRegistered={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Sim' }))

    expect(responder).toHaveBeenCalledTimes(2)
    expect(responder).toHaveBeenCalledWith('pessoa-1', 'Sim')
    expect(responder).toHaveBeenCalledWith('pessoa-2', 'Sim')
  })

  it('mostra um campo só, em vez de um por pessoa', () => {
    // É isso que encurta a tela: catorze opções repetidas por pessoa, em vinte
    // perguntas, é o tipo de trabalho que faz alguém desistir de responder.
    render(<QuestionCard question={perguntaDeEscolha} targets={duasPessoas} sameForAll valueFor={() => ''} registered={false} onAnswer={vi.fn()} onToggleRegistered={vi.fn()} />)

    expect(screen.getByText('Todos os presentes')).toBeInTheDocument()
    expect(screen.queryByText('Pessoa Fictícia Um')).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Sim' })).toHaveLength(1)
  })

  it('desmarcado, volta a perguntar um a um', async () => {
    const user = userEvent.setup()
    const responder = vi.fn()
    render(<QuestionCard question={perguntaDeEscolha} targets={duasPessoas} valueFor={() => ''} registered={false} onAnswer={responder} onToggleRegistered={vi.fn()} />)

    expect(screen.getByText('Pessoa Fictícia Um')).toBeInTheDocument()
    expect(screen.getByText('Pessoa Fictícia Dois')).toBeInTheDocument()

    await user.click(screen.getAllByRole('button', { name: 'Sim' })[0]!)

    expect(responder).toHaveBeenCalledTimes(1)
    expect(responder).toHaveBeenCalledWith('pessoa-1', 'Sim')
  })

  it('com uma pessoa só, o atalho não muda nada', () => {
    // Não há o que juntar, e um rótulo "Todos os presentes" para uma pessoa
    // seria só ruído.
    render(<QuestionCard question={perguntaDeEscolha} targets={[duasPessoas[0]!]} sameForAll valueFor={() => ''} registered={false} onAnswer={vi.fn()} onToggleRegistered={vi.fn()} />)

    expect(screen.queryByText('Todos os presentes')).not.toBeInTheDocument()
  })
})
