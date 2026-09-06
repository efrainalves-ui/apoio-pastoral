import { describe, expect, it } from 'vitest'
import { LINK_CATEGORIES, LINK_CATEGORY_LABELS, USEFUL_LINKS } from './catalog'

describe('links úteis, versionados no aplicativo', () => {
  it('tem link, e todos com identificador próprio', () => {
    expect(USEFUL_LINKS.length).toBeGreaterThan(0)
    const identificadores = USEFUL_LINKS.map(({ id }) => id)
    expect(new Set(identificadores).size).toBe(identificadores.length)
  })

  it('todo endereço é https', () => {
    // Sem exceção: um link `http` num aplicativo que abre em celular é um
    // convite a interceptação, e não há nada aqui que justifique isso.
    for (const link of USEFUL_LINKS) {
      expect(link.url, `${link.title} precisa ser https`).toMatch(/^https:\/\//u)
    }
  })

  it('cada link tem título, descrição curta e categoria conhecida', () => {
    for (const link of USEFUL_LINKS) {
      expect(link.title.trim().length, `${link.id} sem título`).toBeGreaterThan(0)
      expect(link.description.trim().length, `${link.id} sem descrição`).toBeGreaterThan(0)
      expect(link.description.length, `${link.id} com descrição longa demais`).toBeLessThanOrEqual(120)
      expect(LINK_CATEGORIES, `${link.id} com categoria desconhecida`).toContain(link.category)
    }
  })

  it('toda categoria usada tem rótulo', () => {
    for (const categoria of LINK_CATEGORIES) {
      expect(LINK_CATEGORY_LABELS[categoria]?.trim().length).toBeGreaterThan(0)
    }
  })

  it('nenhum link carrega dado do distrito no endereço', () => {
    // A lista é a mesma para todos os pastores. Um parâmetro de consulta aqui
    // seria dado de um distrito viajando para fora do aparelho.
    //
    // A única exceção é `resourcekey`: o Google passou a exigi-la em pastas
    // antigas do Drive, e sem ela o acervo não abre para quem nunca entrou
    // nele. Ela é parte do endereço da pasta, não informação de ninguém.
    for (const link of USEFUL_LINKS) {
      const [, consulta = ''] = link.url.split('?')
      expect(link.url, `${link.id} não pode levar âncora`).not.toMatch(/#/u)
      for (const parametro of consulta ? consulta.split('&') : []) {
        expect(parametro, `${link.id} não pode levar parâmetro`).toMatch(/^resourcekey=/u)
      }
    }
  })
})
