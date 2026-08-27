import { describe, expect, it } from 'vitest'
import { normalizePdfChurchName, parseDistrictListText } from './parsers'

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
  })
})
