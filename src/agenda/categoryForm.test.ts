import { describe, expect, it } from 'vitest'
import { AGENDA_CATEGORIES } from './types'
import { categoryForm, defaultTitleFor, resolveTitle } from './categoryForm'

describe('o que cada categoria pergunta', () => {
  it('cobre todas as categorias da agenda', () => {
    expect(AGENDA_CATEGORIES.filter((category) => !categoryForm(category))).toEqual([])
  })

  // Uma pregação acontece numa igreja, e o endereço já está no cadastro dela.
  it('não pede local nem endereço quando a igreja responde por isso', () => {
    const pregacao = categoryForm('preaching')

    expect(pregacao.church).toBe('required')
    expect(pregacao.place).toBe(false)
    expect(pregacao.sermon).toBe(true)
    expect(pregacao.title).toBe('generated')
  })

  it('pede título onde ele é a informação principal', () => {
    expect(categoryForm('meeting').title).toBe('required')
    expect(categoryForm('travel').title).toBe('required')
    expect(categoryForm('visit').title).toBe('optional')
    expect(categoryForm('personal').church).toBe('none')
  })

  it('gera o título de quem não precisa digitar um', () => {
    expect(defaultTitleFor('preaching', 'Igreja Fictícia Central')).toBe('Pregação · Igreja Fictícia Central')
    expect(defaultTitleFor('visit')).toBe('Visita')
  })

  it('respeita o que o pastor digitou quando ele digita', () => {
    expect(resolveTitle('preaching', '  Culto de aniversário ', 'Igreja Fictícia')).toBe('Culto de aniversário')
    expect(resolveTitle('preaching', '   ', 'Igreja Fictícia')).toBe('Pregação · Igreja Fictícia')
    expect(resolveTitle('meeting', '  ', 'Igreja Fictícia')).toBe('')
  })
})
