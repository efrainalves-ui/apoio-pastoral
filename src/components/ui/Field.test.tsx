import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Field } from './Field'

const abrir = vi.fn()

beforeEach(() => {
  abrir.mockClear()
  // `showPicker` não existe no jsdom: aqui ele só registra que foi chamado.
  Object.defineProperty(HTMLInputElement.prototype, 'showPicker', { value: abrir, configurable: true, writable: true })
})
afterEach(cleanup)

describe('campo com calendário', () => {
  it('a data ganha um botão de calendário com nome próprio, e o clique no campo também abre', async () => {
    const user = userEvent.setup()
    render(<Field label="Data de término" name="agenda-end-date" type="date" value="2026-09-16" onChange={() => undefined} />)

    const botao = screen.getByRole('button', { name: 'Abrir calendário de Data de término' })
    await user.click(botao)
    expect(abrir).toHaveBeenCalledTimes(1)

    await user.click(screen.getByLabelText('Data de término'))
    expect(abrir).toHaveBeenCalledTimes(2)
    expect(screen.getByLabelText('Data de término')).toHaveValue('2026-09-16')
  })

  /*
    O campo continua sendo o de data do navegador, com o botão ao lado.

    Quem digita, digita nele: a máscara e o formato do teclado são do
    navegador, e o jsdom não os reproduz — por isso aqui se prova o contrato
    (é `type="date"`, aceita valor e avisa a mudança), e o preenchimento pelo
    teclado é conferido no teste de ponta a ponta, em navegador de verdade.
  */
  it('a data continua podendo ser digitada, e o botão não fica no caminho', () => {
    const mudancas: string[] = []
    render(<Field label="Data" name="agenda-date" type="date" defaultValue="" onChange={(evento) => mudancas.push(evento.target.value)} />)

    const campo = screen.getByLabelText('Data')
    expect(campo).toHaveAttribute('type', 'date')
    expect(campo).not.toBeDisabled()
    expect(campo).not.toHaveAttribute('readonly')
    fireEvent.change(campo, { target: { value: '2026-09-16' } })
    expect(mudancas.at(-1)).toBe('2026-09-16')
    expect(campo).toHaveValue('2026-09-16')
  })

  it('os outros campos continuam sem botão, inclusive hora e campo desabilitado', () => {
    render(<>
      <Field label="Início" name="agenda-start" type="time" value="09:00" onChange={() => undefined} />
      <Field label="Título" name="agenda-title" value="" onChange={() => undefined} />
      <Field label="Data travada" name="travada" type="date" value="2026-09-16" readOnly />
    </>)
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })
})
