import { describe, expect, it } from 'vitest'
import { AREA_PDF_DOCUMENT, AREA_USES_PDF, GOAL_AREAS } from './areas'

describe('o relatório do ACMS é chamado pelo nome que ele tem lá', () => {
  it('toda área que pede PDF diz qual documento e onde achá-lo', () => {
    // "Escolher PDF de Financeiro" não existe no ACMS. Quem está com o sistema
    // aberto procura por "Comparativo de Entrada" — dizer o nome certo e o
    // caminho transforma tentativa e erro em dois cliques.
    for (const area of GOAL_AREAS.filter((item) => AREA_USES_PDF[item])) {
      const documento = AREA_PDF_DOCUMENT[area]
      expect(documento, `${area} pede PDF e não diz qual`).toBeDefined()
      expect(documento?.nome.trim().length).toBeGreaterThan(0)
      expect(documento?.caminho).toMatch(/ACMS/u)
    }
  })

  it('área que não pede PDF não anuncia documento nenhum', () => {
    for (const area of GOAL_AREAS.filter((item) => !AREA_USES_PDF[item])) {
      expect(AREA_PDF_DOCUMENT[area]).toBeUndefined()
    }
  })
})
