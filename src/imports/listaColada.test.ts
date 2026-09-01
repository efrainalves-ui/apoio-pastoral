import { describe, expect, it } from 'vitest'
import { docxXmlToText } from './docx'
import { ImportFormatError, parsePastedMemberList } from './parsers'

const IGREJA = 'Igreja Fictícia Central'

describe('lista de membros colada ou vinda do Word', () => {
  // Quem digita a lista não deve precisar acertar um formato exato.
  it('aceita os formatos que uma pessoa realmente escreve', () => {
    const rows = parsePastedMemberList([
      'Ana Fictícia; 01/02/1990',
      'Bruno Fictício 15/03/1985',
      'Carla Fictícia, 1992-07-20',
      'Daniel Fictício',
      '   ',
    ].join('\n'), IGREJA)

    expect(rows.map(({ name }) => name)).toEqual(['Ana Fictícia', 'Bruno Fictício', 'Carla Fictícia', 'Daniel Fictício'])
    expect(rows.map(({ birthDate }) => birthDate)).toEqual(['1990-02-01', '1985-03-15', '1992-07-20', null])
    expect(rows.every(({ churchName }) => churchName === IGREJA)).toBe(true)
  })

  it('marca para revisão o que veio estranho, em vez de descartar em silêncio', () => {
    const rows = parsePastedMemberList('Ana 2 Fictícia; 01/02/1990', IGREJA)

    expect(rows[0]?.needsReview).toBe(true)
  })

  it('recusa a lista sem igreja escolhida', () => {
    expect(() => parsePastedMemberList('Ana Fictícia', '  ')).toThrow(ImportFormatError)
  })

  it('recusa a lista sem nenhum nome reconhecível', () => {
    expect(() => parsePastedMemberList('---\n123\n', IGREJA)).toThrow(ImportFormatError)
  })
})

describe('texto do Word', () => {
  it('transforma cada parágrafo em uma linha', () => {
    const xml = '<w:body><w:p><w:r><w:t>Ana Fictícia</w:t></w:r><w:tab/><w:r><w:t>01/02/1990</w:t></w:r></w:p><w:p><w:r><w:t>Bruno Fict&amp;cio</w:t></w:r></w:p></w:body>'

    expect(docxXmlToText(xml).split('\n').filter(Boolean)).toEqual(['Ana Fictícia\t01/02/1990', 'Bruno Fict&cio'])
  })
})
