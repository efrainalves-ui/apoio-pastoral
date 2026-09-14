import { afterEach, describe, expect, it } from 'vitest'
import { consumirDestino, destinoPermitido, esquecerDestino, guardarDestino } from './destino'

const CHAVE_OPACA = 'a'.repeat(64)

describe('destino depois de entrar', () => {
  afterEach(() => sessionStorage.clear())

  it('guarda o caminho do aviso e devolve uma vez só', () => {
    guardarDestino(`/app/lembretes/aviso/${CHAVE_OPACA}`)
    expect(consumirDestino()).toBe(`/app/lembretes/aviso/${CHAVE_OPACA}`)
    expect(consumirDestino()).toBeNull()
  })

  it('só caminhos dos Lembretes, sem consulta, sem outro domínio e sem dados', () => {
    expect(destinoPermitido('/app/lembretes/bloco/hoje')).toBe(true)
    for (const recusado of ['/app/pessoas/1', 'https://exemplo.invalid/app/lembretes', '//exemplo.invalid/app/lembretes', '/app/lembretes/../pessoas', '/app/lembretes/novo?titulo=Visitar%20Maria', '/app/lembretes/aviso/x y']) {
      expect(destinoPermitido(recusado)).toBe(false)
      guardarDestino(recusado)
      expect(sessionStorage.length).toBe(0)
    }
  })

  it('vence em 15 minutos e some ao sair', () => {
    guardarDestino('/app/lembretes/bloco/hoje', 0)
    expect(consumirDestino(16 * 60_000)).toBeNull()
    guardarDestino('/app/lembretes/bloco/hoje')
    esquecerDestino()
    expect(consumirDestino()).toBeNull()
  })

  it('valor adulterado na sessão não vira navegação', () => {
    sessionStorage.setItem('apoio-pastoral:destino-apos-entrar', JSON.stringify({ caminho: '/app/configuracoes', ate: Date.now() + 1000 }))
    expect(consumirDestino()).toBeNull()
  })
})
