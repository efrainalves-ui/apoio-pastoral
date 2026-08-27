import { describe, expect, it } from 'vitest'
import { technicalEvent } from './safeLogger'

describe('telemetria técnica', () => {
  it('produz somente código fechado e metadados allowlisted', () => {
    expect(technicalEvent('sync.completed', { count: 2, status: 'ok' })).toMatchObject({
      code: 'sync.completed',
      metadata: { count: 2, status: 'ok' },
    })
  })
})
