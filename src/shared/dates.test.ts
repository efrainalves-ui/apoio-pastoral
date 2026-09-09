import { describe, expect, it } from 'vitest'
import { localDateKey, localDateTimeKey } from './dates'

describe('datas locais', () => {
  it('mantém a noite no mesmo dia civil local', () => {
    const night = new Date(2026, 8, 9, 22, 30)
    expect(localDateKey(night)).toBe('2026-09-09')
    expect(localDateTimeKey(night)).toBe('2026-09-09T22:30')
  })
})
