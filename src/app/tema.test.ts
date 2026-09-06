import { afterEach, describe, expect, it } from 'vitest'
import { aplicarTema, guardarTema, temaGuardado } from './tema'

afterEach(() => { localStorage.clear(); document.documentElement.removeAttribute('data-tema') })

describe('escolha de tema', () => {
  it('sem escolha, segue o aparelho', () => {
    expect(temaGuardado()).toBe('sistema')
    aplicarTema('sistema')
    expect(document.documentElement.hasAttribute('data-tema')).toBe(false)
  })

  it('guarda e aplica a escolha', () => {
    guardarTema('escuro')

    expect(temaGuardado()).toBe('escuro')
    expect(document.documentElement.getAttribute('data-tema')).toBe('escuro')
  })

  it('voltar para o sistema apaga a marca, em vez de fixar o tema do momento', () => {
    // Escrever "claro" ao escolher "seguir o aparelho" prenderia a pessoa ao
    // tema que estava valendo na hora da escolha.
    guardarTema('claro')
    guardarTema('sistema')

    expect(document.documentElement.hasAttribute('data-tema')).toBe(false)
    expect(temaGuardado()).toBe('sistema')
  })

  it('valor estranho no armazenamento não vira tema', () => {
    localStorage.setItem('apoio-pastoral:tema', 'roxo')

    expect(temaGuardado()).toBe('sistema')
  })
})
