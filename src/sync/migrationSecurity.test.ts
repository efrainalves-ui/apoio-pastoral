import { describe, expect, it } from 'vitest'
import migrationSql from '../../supabase/migrations/0001_marco_zero_up.sql?raw'

describe('migration de homologação', () => {
  it('isola envelopes por proprietário e dispositivo ativo', () => {
    expect(migrationSql).toContain('d.owner_id = auth.uid()')
    expect(migrationSql).toContain("d.status = 'active'")
    expect(migrationSql).not.toMatch(/grant delete on public\.devices/iu)
    expect(migrationSql).toContain('encrypted_operations_active_device_insert')
  })
})
