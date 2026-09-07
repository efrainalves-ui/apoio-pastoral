import { describe, expect, it } from 'vitest'
import { ehClasseInfantil } from './classesInfantis'

describe('quais unidades são de crianças', () => {
  it('reconhece as classes abaixo dos oito anos, com e sem acento', () => {
    for (const nome of ['ROL/JARDIM', 'PRIMÁRIOS', 'Primarios', 'Rol do Berço', 'Jardim da Infância']) {
      expect(ehClasseInfantil(nome), nome).toBe(true)
    }
  })

  it('juvenis para cima não são classe de crianças', () => {
    // A partir daí quem visita a unidade sem ser membro entra como interessado:
    // é a pessoa que o distrito quer acompanhar.
    for (const nome of ['JUVENIS', 'Maranata Class/Jovens', 'Atos 11:26', 'Libertos', 'Semeador', 'Rocha Eterna']) {
      expect(ehClasseInfantil(nome), nome).toBe(false)
    }
  })
})
