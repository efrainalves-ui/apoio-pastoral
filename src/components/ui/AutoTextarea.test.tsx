import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AutoTextarea } from './AutoTextarea'

afterEach(cleanup)

/**
 * O jsdom não calcula layout: `scrollHeight` é sempre zero. Estes testes
 * controlam esse valor para medir a decisão do componente — que altura ele
 * escolhe e quando decide rolar por dentro —, que é a regra de verdade.
 */
function comAlturaDeConteudo(altura: number) {
  Object.defineProperty(HTMLTextAreaElement.prototype, 'scrollHeight', { configurable: true, get: () => altura })
}

beforeEach(() => { comAlturaDeConteudo(0) })

describe('caixa de texto que cresce com o conteúdo', () => {
  it('não encolhe abaixo do mínimo pedido', () => {
    comAlturaDeConteudo(10)
    render(<AutoTextarea minRows={3} maxRows={20} value="uma linha" onChange={() => undefined} aria-label="conteúdo" />)

    // 3 linhas de 26px.
    expect(screen.getByLabelText('conteúdo').style.height).toBe('78px')
  })

  it('cresce até caber o texto', () => {
    comAlturaDeConteudo(400)
    render(<AutoTextarea minRows={3} maxRows={20} value="muito texto" onChange={() => undefined} aria-label="conteúdo" />)

    expect(screen.getByLabelText('conteúdo').style.height).toBe('400px')
    expect(screen.getByLabelText('conteúdo').style.overflowY).toBe('hidden')
  })

  it('para no teto e passa a rolar por dentro', () => {
    // Sem teto, a caixa empurraria o botão de salvar para fora da tela: o texto
    // ficaria visível e não haveria como guardá-lo.
    comAlturaDeConteudo(5000)
    render(<AutoTextarea minRows={3} maxRows={20} value="um sermão inteiro" onChange={() => undefined} aria-label="conteúdo" />)

    // 20 linhas de 26px.
    expect(screen.getByLabelText('conteúdo').style.height).toBe('520px')
    expect(screen.getByLabelText('conteúdo').style.overflowY).toBe('auto')
  })

  it('volta a encolher quando o texto diminui', () => {
    // Medir sem zerar a altura antes faria a caixa só crescer, para sempre.
    comAlturaDeConteudo(400)
    const { rerender } = render(<AutoTextarea minRows={3} maxRows={20} value="muito texto" onChange={() => undefined} aria-label="conteúdo" />)
    expect(screen.getByLabelText('conteúdo').style.height).toBe('400px')

    comAlturaDeConteudo(90)
    rerender(<AutoTextarea minRows={3} maxRows={20} value="pouco" onChange={() => undefined} aria-label="conteúdo" />)

    expect(screen.getByLabelText('conteúdo').style.height).toBe('90px')
  })

  it('continua sendo um campo de formulário comum', () => {
    const digitou = vi.fn()
    render(<AutoTextarea value="a" onChange={digitou} aria-label="conteúdo" name="sermao" />)

    expect(screen.getByLabelText('conteúdo')).toHaveAttribute('name', 'sermao')
    expect(screen.getByLabelText('conteúdo')).toHaveClass('field__input')
  })
})
