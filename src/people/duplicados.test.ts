import { describe, expect, it } from 'vitest'
import { cadastrosParecidos, distanciaDeEdicao, proximidadeDeNomes } from './duplicados'
import type { PersonEntity } from './types'

const pessoa = (id: string, name: string, churchId = 'central', birthDate: string | null = null) =>
  ({ id, name, birthDate, currentChurchId: churchId, incomeStatus: 'unknown', fidelity: null }) as unknown as PersonEntity

describe('possíveis cadastros da mesma pessoa', () => {
  it('uma letra trocada no sobrenome, mesma igreja: entra como possível duplicado', () => {
    const certa = pessoa('a', 'Ana Paula Nascimento')
    const digitada = pessoa('b', 'Ana Paula Nacimento')
    const achados = cadastrosParecidos(certa, [certa, digitada])
    expect(achados.map(({ pessoa: encontrada }) => encontrada.id)).toEqual(['b'])
    expect(achados[0]?.motivo).toBe('nome_quase_igual')
    expect(distanciaDeEdicao('ANA PAULA NASCIMENTO', 'ANA PAULA NACIMENTO')).toBe(1)
  })

  it('as mesmas palavras com um sobrenome a mais também entram', () => {
    const curta = pessoa('a', 'Maria Aparecida Souza')
    const longa = pessoa('b', 'Maria Aparecida de Souza')
    expect(cadastrosParecidos(curta, [curta, longa]).map(({ pessoa: encontrada }) => encontrada.id)).toEqual(['b'])
    expect(proximidadeDeNomes('Maria Aparecida Souza', 'Maria Aparecida de Souza')).toBe(1)
  })

  it('pessoas diferentes com nomes semelhantes não são sugeridas', () => {
    // Duas irmãs na mesma igreja: primeiro nome igual, sobrenome diferente.
    const silva = pessoa('a', 'Maria Silva')
    const souza = pessoa('b', 'Maria Souza')
    expect(cadastrosParecidos(silva, [silva, souza])).toEqual([])

    // Pai e filho, com o mesmo nome e datas de nascimento diferentes.
    const pai = pessoa('pai', 'João Fictício Filho', 'central', '1950-03-02')
    const filho = pessoa('filho', 'João Fictício Filho', 'central', '1980-03-02')
    expect(cadastrosParecidos(pai, [pai, filho])).toEqual([])
  })

  it('igreja diferente não é sugerida, e o primeiro nome sozinho não basta', () => {
    const central = pessoa('a', 'Ana Paula Nascimento', 'central')
    const outra = pessoa('b', 'Ana Paula Nacimento', 'norte')
    expect(cadastrosParecidos(central, [central, outra])).toEqual([])
    // Um nome só não identifica ninguém: não sugere nem é sugerido.
    const soNome = pessoa('c', 'Ana', 'central')
    expect(cadastrosParecidos(soNome, [soNome, central])).toEqual([])
  })

  it('o que o pastor já decidiu não volta a perguntar', () => {
    const certa = pessoa('a', 'Ana Paula Nascimento')
    const digitada = pessoa('b', 'Ana Paula Nacimento')

    // Marcado como pessoas diferentes: some o aviso, dos dois lados.
    const marcada = { ...certa, naoSaoAMesmaPessoa: ['b'] } as PersonEntity
    expect(cadastrosParecidos(marcada, [marcada, digitada])).toEqual([])
    const doOutroLado = { ...digitada, naoSaoAMesmaPessoa: ['a'] } as PersonEntity
    expect(cadastrosParecidos(certa, [certa, doOutroLado])).toEqual([])

    // Já vinculados: não são "possível duplicado", são a mesma pessoa.
    const umaVinculada = { ...certa, linkedGroupId: 'grupo-1' } as PersonEntity
    const outraVinculada = { ...digitada, linkedGroupId: 'grupo-1' } as PersonEntity
    expect(cadastrosParecidos(umaVinculada, [umaVinculada, outraVinculada])).toEqual([])
  })

  it('a data de nascimento só impede quando as duas existem e divergem', () => {
    const comData = pessoa('a', 'Ana Paula Nascimento', 'central', '1970-05-05')
    const semData = pessoa('b', 'Ana Paula Nacimento', 'central', null)
    const mesmaData = pessoa('c', 'Ana Paula Nacimento', 'central', '1970-05-05')
    expect(cadastrosParecidos(comData, [comData, semData]).map(({ pessoa: p }) => p.id)).toEqual(['b'])
    expect(cadastrosParecidos(comData, [comData, mesmaData]).map(({ pessoa: p }) => p.id)).toEqual(['c'])
  })
})
