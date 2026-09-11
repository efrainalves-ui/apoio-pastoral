import { describe, expect, it } from 'vitest'
import { ehUuid, idFixo } from './identificadores'

describe('identificadores fixos', () => {
  /*
    O serviço converte `record_id` para `uuid`. Um identificador fabricado como
    `work-config-<conta>` não passa, e a conversão que falha derruba o lote
    inteiro: um registro malformado bastava para nada mais sair do aparelho.
  */
  it('o identificador derivado é um UUID de verdade', async () => {
    expect(ehUuid(await idFixo('work-config', 'conta-ficticia'))).toBe(true)
  })

  it('o mesmo nome e a mesma conta dão sempre o mesmo identificador', async () => {
    const primeiro = await idFixo('work-config', 'conta-ficticia')
    const segundo = await idFixo('work-config', 'conta-ficticia')
    expect(primeiro).toBe(segundo)
  })

  /* Previsível não pode virar colidente: contas e nomes diferentes se separam. */
  it('contas diferentes e nomes diferentes não colidem', async () => {
    const config = await idFixo('work-config', 'conta-a')
    expect(config).not.toBe(await idFixo('work-config', 'conta-b'))
    expect(config).not.toBe(await idFixo('pessoal-migracao', 'conta-a'))
  })

  it('reconhece o que o serviço recusaria', () => {
    expect(ehUuid('work-config-conta-ficticia')).toBe(false)
    expect(ehUuid('pessoal-migracao-abc')).toBe(false)
    expect(ehUuid('')).toBe(false)
    expect(ehUuid(crypto.randomUUID())).toBe(true)
  })
})
