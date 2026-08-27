import { describe, expect, it } from 'vitest'
import { previewImportedChurchNameCorrections } from './importedChurchRepair'

describe('correção de igrejas importadas', () => {
  it('une nomes longos fictícios sem perder os vínculos de pessoas', () => {
    const churches = [
      { id: 'longa', name: 'Arapiranga - Distrito Fictício - Associação Fictícia', history: [], districtId: 'd', type: 'organized_church' as const, externalCode: '', address: '', worshipSchedules: [], administrativeNotes: '', status: 'active' as const, createdAt: '', updatedAt: '' },
      { id: 'curta', name: 'Arapiranga', history: [], districtId: 'd', type: 'organized_church' as const, externalCode: '', address: '', worshipSchedules: [], administrativeNotes: '', status: 'active' as const, createdAt: '', updatedAt: '' },
    ]
    const people = [{ id: 'pessoa-ficticia', name: 'Pessoa Exemplo Fictícia', birthDate: null, currentChurchId: 'longa' }]
    const preview = previewImportedChurchNameCorrections(churches, people as never)
    expect(preview).toEqual([expect.objectContaining({ from: 'Arapiranga - Distrito Fictício - Associação Fictícia', to: 'Arapiranga', mergeIntoId: 'curta', members: 1 })])
  })

  it('avisa quando uma união poderia repetir uma pessoa', () => {
    const church = (id: string, name: string) => ({ id, name, history: [], districtId: 'd', type: 'organized_church' as const, externalCode: '', address: '', worshipSchedules: [], administrativeNotes: '', status: 'active' as const, createdAt: '', updatedAt: '' })
    const people = [{ id: 'a', name: 'Pessoa Exemplo Fictícia', birthDate: '1990-01-01', currentChurchId: 'longa' }, { id: 'b', name: 'Pessoa Exemplo Fictícia', birthDate: '1990-01-01', currentChurchId: 'curta' }]
    expect(previewImportedChurchNameCorrections([church('longa', 'Central - Distrito Fictício - Associação Fictícia'), church('curta', 'Central')], people as never)[0]?.warning).toContain('mesmo nome')
  })
})
