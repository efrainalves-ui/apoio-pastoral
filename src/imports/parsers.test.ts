import { describe, expect, it } from 'vitest'
import { AMOSTRA_NAO_RECONHECIDA, normalizePdfChurchName, parseDistrictListText } from './parsers'

describe('leitura de lista fictícia do distrito', () => {
  it('reduz o nome longo da igreja trazido pelo PDF', () => {
    expect(normalizePdfChurchName('Arapiranga - Curuçá I - Anpa')).toBe('Arapiranga')
    expect(normalizePdfChurchName('Bairro Rodoviário - Curuçá I - Anpa')).toBe('Bairro Rodoviário')
    expect(normalizePdfChurchName('São João do Abade I - Curuçá I - Anpa')).toBe('São João do Abade I')
  })

  it('encontra distrito, igrejas e aniversários sem inventar dados ausentes', () => {
    const preview = parseDistrictListText('DISTRITO: Distrito Aurora Fictício\nIGREJA: Comunidade Esperança Fictícia\nPessoa Exemplo Fictícia | 12/05/1990\nPessoa Sem Data Fictícia')
    expect(preview.districtName).toBe('Distrito Aurora Fictício')
    expect(preview.rows).toEqual([{ churchName: 'Comunidade Esperança Fictícia', name: 'Pessoa Exemplo Fictícia', birthDate: '1990-05-12', needsReview: false }])
    expect(preview.unparsedLines).toContain('Pessoa Sem Data Fictícia')
    expect(preview.unparsedCount).toBe(preview.unparsedLines.length)
  })

  it('a contagem de não reconhecidas é o total, não o tamanho da amostra', () => {
    // O limite existia antes da contagem: a lista era cortada em 30 e o seu
    // tamanho ia para a tela como se fosse o total. Um arquivo com muito mais
    // linhas perdidas anunciava exatamente 30, e quem lia concluía que eram só
    // cabeçalhos — enquanto pessoas do distrito ficavam de fora em silêncio.
    const perdidas = AMOSTRA_NAO_RECONHECIDA * 3
    const linhas = Array.from({ length: perdidas }, (_, indice) => `Linha Fictícia Sem Data ${indice}`)
    const preview = parseDistrictListText(['IGREJA: Comunidade Esperança Fictícia', 'Pessoa Exemplo Fictícia | 12/05/1990', ...linhas].join('\n'))

    expect(preview.unparsedCount).toBe(perdidas)
    expect(preview.unparsedLines).toHaveLength(AMOSTRA_NAO_RECONHECIDA)
    expect(preview.unparsedCount).toBeGreaterThan(preview.unparsedLines.length)
    // A amostra precisa ser das linhas de verdade, e na ordem em que apareceram.
    expect(preview.unparsedLines[0]).toBe('Linha Fictícia Sem Data 0')
  })
})
