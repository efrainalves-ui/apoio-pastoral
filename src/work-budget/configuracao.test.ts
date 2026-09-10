import { describe, expect, it } from 'vitest'
import { configuracaoVazia, quotaPais, regraDeItemVazia } from './configuracao'
import { subsistenciaBasica, vigenteEm } from './parametros'

describe('configuração vazia', () => {
  /*
    Nada de valores plantados no código. Um aplicativo que já vem com o FPE de
    alguém preenchido mostra o número errado para todo mundo — e o pastor não
    tem como saber que aquele número não é o dele.
  */
  it('não traz FPE nem Percentual de Audit', () => {
    const config = configuracaoVazia()
    expect(config.fpe).toEqual([])
    expect(config.percentualDeAudit).toEqual([])
    expect(subsistenciaBasica(
      vigenteEm(config.fpe, '2026-09-01')?.valor ?? null,
      vigenteEm(config.percentualDeAudit, '2026-09-01')?.valor ?? null,
    )).toBeNull()
  })

  it('a regra de item começa por conta do pastor, sem reembolso presumido', () => {
    expect(regraDeItemVazia()).toMatchObject({ responsabilidade: 'do_pastor', percentual: null, teto: null })
  })
})

describe('quota-pais', () => {
  const filho = { dataDeNascimento: '2017-05-10', dependente: true, temBolsaInstitucional: false }

  /*
    A virada é no mês seguinte ao nono aniversário, não no dia. Maio de 2026 é o
    mês em que a criança faz nove: ainda vale o percentual menor. Junho já é o
    maior.
  */
  it('vira no mês seguinte ao nono aniversário', () => {
    expect(quotaPais(filho, '2026-04').percentual).toBe(3)
    expect(quotaPais(filho, '2026-05').percentual).toBe(3)
    expect(quotaPais(filho, '2026-06').percentual).toBe(5)
  })

  it('termina no mês do décimo oitavo aniversário', () => {
    expect(quotaPais(filho, '2035-05').elegivel).toBe(true)
    expect(quotaPais(filho, '2035-06').elegivel).toBe(false)
  })

  /*
    Bolsa de instituição adventista reduz o percentual: o benefício já veio por
    outro caminho, e concedê-lo inteiro seria pagar duas vezes pela mesma coisa.
  */
  it('bolsa institucional reduz o percentual e diz por quê', () => {
    const comBolsa = { ...filho, temBolsaInstitucional: true }
    expect(quotaPais(comBolsa, '2026-04').percentual).toBe(1)
    expect(quotaPais(comBolsa, '2026-06').percentual).toBe(3)
    expect(quotaPais(comBolsa, '2026-06').motivo).toContain('bolsa')
  })

  it('sem data de nascimento não arbitra percentual', () => {
    expect(quotaPais({ ...filho, dataDeNascimento: '' }, '2026-06')).toMatchObject({ percentual: null, elegivel: false })
  })

  it('quem não é dependente não entra', () => {
    expect(quotaPais({ ...filho, dependente: false }, '2026-06').elegivel).toBe(false)
  })

  it('antes de nascer não há quota', () => {
    expect(quotaPais(filho, '2016-01').elegivel).toBe(false)
  })
})
