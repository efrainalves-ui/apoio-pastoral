import { describe, expect, it } from 'vitest'
import { allowanceBalance, allowanceBalances, inMonth, mileageByChurch, monthsWithRecords, workMonthSummary } from './core'
import type { MileageEntity, WorkAllowanceEntity, WorkExpenseEntity } from './types'

const auxilio = (id: string, category: WorkAllowanceEntity['category'], amount: number, date = '2026-09-05'): WorkAllowanceEntity => ({
  id, category, description: `Auxílio fictício ${id}`, amount, date, churchId: null, notes: '',
  createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z',
})

const despesa = (
  id: string,
  category: WorkExpenseEntity['category'],
  amount: number,
  allowanceCategory: WorkExpenseEntity['allowanceCategory'],
  date = '2026-09-10',
): WorkExpenseEntity => ({
  id, category, description: `Despesa fictícia ${id}`, amount, date, allowanceCategory,
  churchId: null, visitId: null, agendaEventId: null, notes: '',
  createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z',
})

const deslocamento = (id: string, churchId: string | null, kilometers: number, amount: number | null = null, date = '2026-09-12'): MileageEntity => ({
  id, date, churchId, reason: '', agendaEventId: null, kilometers, amount, notes: '',
  createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z',
})

describe('saldo dos auxílios do ministério', () => {
  it('sobra quando a despesa cabe no auxílio', () => {
    const saldo = allowanceBalance('fuel', [auxilio('a1', 'fuel', 600)], [despesa('d1', 'fuel', 450, 'fuel')])

    expect(saldo).toMatchObject({ received: 600, spent: 450, balance: 150, overspent: 0, fromPocket: false })
  })

  it('aponta quanto saiu do bolso quando a despesa passa do auxílio', () => {
    // É a pergunta que dá nome ao módulo: o pastor precisa ver o número, não
    // fazer a conta de cabeça no fim do mês.
    const saldo = allowanceBalance('fuel', [auxilio('a1', 'fuel', 400)], [despesa('d1', 'fuel', 520, 'fuel')])

    expect(saldo).toMatchObject({ received: 400, spent: 520, balance: 0, overspent: 120, fromPocket: true })
  })

  it('só lista as categorias que tiveram movimento', () => {
    const linhas = allowanceBalances([auxilio('a1', 'fuel', 300)], [despesa('d1', 'phone', 80, 'phone')])

    expect(linhas.map(({ category }) => category)).toEqual(['fuel', 'phone'])
  })

  it('despesa sem auxílio apontado não consome auxílio nenhum', () => {
    const linhas = allowanceBalances([auxilio('a1', 'fuel', 300)], [despesa('d1', 'food', 90, null)])

    expect(linhas).toHaveLength(1)
    expect(linhas[0]).toMatchObject({ category: 'fuel', spent: 0, balance: 300 })
  })
})

describe('resumo do mês no trabalho', () => {
  it('soma o que passou de cada auxílio e o que não tinha auxílio nenhum', () => {
    const resumo = workMonthSummary(
      [auxilio('a1', 'fuel', 400), auxilio('a2', 'phone', 100)],
      [
        despesa('d1', 'fuel', 520, 'fuel'),   // 120 do bolso
        despesa('d2', 'phone', 60, 'phone'),  // cabe no auxílio
        despesa('d3', 'food', 75, null),      // 75 do bolso, sem auxílio
      ],
      [deslocamento('k1', 'igreja-ficticia', 42, 30)],
    )

    expect(resumo.received).toBe(500)
    expect(resumo.spent).toBe(655)
    expect(resumo.fromPocket).toBe(195)
    expect(resumo.balance).toBe(40)
    expect(resumo.kilometers).toBe(42)
    expect(resumo.mileageAmount).toBe(30)
  })

  it('sem movimento nenhum, tudo é zero e nada sai do bolso', () => {
    expect(workMonthSummary([], [], [])).toMatchObject({ received: 0, spent: 0, balance: 0, fromPocket: 0, kilometers: 0 })
  })
})

describe('quilometragem', () => {
  it('soma por igreja, da maior para a menor', () => {
    const linhas = mileageByChurch([
      deslocamento('k1', 'igreja-a', 30, 20),
      deslocamento('k2', 'igreja-b', 80, null),
      deslocamento('k3', 'igreja-a', 25, 15),
    ])

    expect(linhas.map(({ churchId, kilometers, trips }) => ({ churchId, kilometers, trips })))
      .toEqual([{ churchId: 'igreja-b', kilometers: 80, trips: 1 }, { churchId: 'igreja-a', kilometers: 55, trips: 2 }])
    expect(linhas[1]?.amount).toBe(35)
  })

  it('deslocamento sem igreja aparece agrupado à parte', () => {
    const linhas = mileageByChurch([deslocamento('k1', null, 12)])

    expect(linhas).toEqual([{ churchId: null, kilometers: 12, amount: 0, trips: 1 }])
  })
})

describe('filtro por mês', () => {
  it('separa o mês pedido e lista os meses com registro', () => {
    const auxilios = [auxilio('a1', 'fuel', 100, '2026-09-02'), auxilio('a2', 'fuel', 100, '2026-08-30')]

    expect(inMonth(auxilios, '2026-09').map(({ id }) => id)).toEqual(['a1'])
    expect(monthsWithRecords(auxilios, [], [])).toEqual(['2026-09', '2026-08'])
  })
})
