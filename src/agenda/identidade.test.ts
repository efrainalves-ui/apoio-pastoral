import { describe, expect, it } from 'vitest'
import { CATEGORIAS_VISUAIS, SUPERFICIES, categoriaCanonica, contraste, identidadeDoCompromisso, misturar } from './identidade'
import { AGENDA_CATEGORIES } from './types'

const ESPERADO: Record<string, [string, 'forte' | 'moderado']> = {
  Pregação: ['#F97316', 'forte'], Comissão: ['#7C3AED', 'forte'], Batismo: ['#2563EB', 'forte'], 'Ceia do Senhor': ['#BE123C', 'forte'],
  'Dedicação de criança': ['#0891B2', 'forte'], Concílio: ['#4F46E5', 'forte'], Pessoal: ['#C026D3', 'forte'],
  Visita: ['#0F766E', 'moderado'], Reunião: ['#64748B', 'moderado'], 'Estudo Bíblico': ['#15803D', 'moderado'], Casamento: ['#DB2777', 'moderado'],
  Treinamento: ['#B45309', 'moderado'], Evento: ['#65A30D', 'moderado'], Outro: ['#6B7280', 'moderado'],
}

describe('identidade das categorias', () => {
  it('as 14 categorias têm exatamente a cor e o destaque aprovados', () => {
    expect(CATEGORIAS_VISUAIS).toHaveLength(14)
    expect(Object.fromEntries(CATEGORIAS_VISUAIS.map(({ rotulo, cor, destaque }) => [rotulo, [cor, destaque]]))).toEqual(ESPERADO)
  })

  it('cada categoria tem ícone próprio: nada de letra, e Comissão, Casamento e Concílio não se confundem', () => {
    const icones = CATEGORIAS_VISUAIS.map(({ Icone }) => Icone)
    expect(new Set(icones).size).toBe(14)
  })

  it('as principais têm fundo mais forte: 16–20% no claro; as demais, 8–12%', () => {
    for (const item of CATEGORIAS_VISUAIS) {
      const faixa = item.destaque === 'forte' ? [0.16, 0.2] : [0.08, 0.12]
      expect(item.intensidadeDoFundo.claro, item.rotulo).toBeGreaterThanOrEqual(faixa[0]!)
      expect(item.intensidadeDoFundo.claro, item.rotulo).toBeLessThanOrEqual(faixa[1]!)
    }
    const forte = CATEGORIAS_VISUAIS.find(({ destaque }) => destaque === 'forte')!
    const moderado = CATEGORIAS_VISUAIS.find(({ destaque }) => destaque === 'moderado')!
    expect(forte.intensidadeDoFundo.escuro).toBeGreaterThan(moderado.intensidadeDoFundo.escuro)
  })

  it('o fundo usa só uma tonalidade da cor, e a faixa do tema claro é a cor viva', () => {
    for (const item of CATEGORIAS_VISUAIS) {
      expect(item.tons.claro.faixa).toBe(item.cor)
      expect(item.tons.claro.fundo).toBe(misturar(item.cor, SUPERFICIES.claro.papel, item.intensidadeDoFundo.claro))
    }
  })

  it('claro e escuro: título, nome da categoria e ícone legíveis sobre o fundo', () => {
    for (const item of CATEGORIAS_VISUAIS) {
      for (const tema of ['claro', 'escuro'] as const) {
        const tons = item.tons[tema]
        expect(contraste(SUPERFICIES[tema].tinta, tons.fundo), `${item.rotulo} ${tema}: título`).toBeGreaterThanOrEqual(4.5)
        expect(contraste(tons.texto, tons.fundo), `${item.rotulo} ${tema}: nome`).toBeGreaterThanOrEqual(4.5)
        expect(contraste(tons.icone, tons.fundo), `${item.rotulo} ${tema}: ícone`).toBeGreaterThanOrEqual(3)
      }
      expect(contraste(item.tons.escuro.faixa, SUPERFICIES.escuro.papel), `${item.rotulo}: faixa no escuro`).toBeGreaterThanOrEqual(3)
    }
  })
})

describe('registros antigos e grafias diferentes', () => {
  it('todas as categorias gravadas no aplicativo têm identidade', () => {
    for (const categoria of AGENDA_CATEGORIES) expect(identidadeDoCompromisso(categoria).cor, categoria).toMatch(/^#[0-9A-F]{6}$/)
  })

  it('PGP antigo é Concílio; Viagem antiga mantém o nome, com a cor de Outro', () => {
    expect(identidadeDoCompromisso('pgp').rotulo).toBe('Concílio')
    expect(identidadeDoCompromisso('travel')).toMatchObject({ rotulo: 'Viagem', cor: '#6B7280' })
  })

  it('grafias em português, com ou sem acento, chegam à categoria certa; o desconhecido vira Outro', () => {
    expect(categoriaCanonica('Santa Ceia')).toBe('communion')
    expect(categoriaCanonica('CEIA DO SENHOR')).toBe('communion')
    expect(categoriaCanonica('Pregação')).toBe('preaching')
    expect(categoriaCanonica('estudo-biblico')).toBe('bible_study')
    expect(categoriaCanonica('dedicação de criança')).toBe('child_dedication')
    expect(categoriaCanonica('Concílio')).toBe('council')
    expect(categoriaCanonica('algo-que-nao-existe')).toBe('other')
    expect(categoriaCanonica(undefined)).toBe('other')
  })
})
