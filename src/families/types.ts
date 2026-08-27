export interface FamilyHistoryEntry {
  id: string
  at: string
  event: 'created' | 'details_updated' | 'members_updated'
  summary?: string
}

export interface FamilyData {
  name: string
  primaryChurchId: string
  memberIds: string[]
  address: string
  notes: string
  history: FamilyHistoryEntry[]
  createdAt: string
  updatedAt: string
}

export interface FamilyEntity extends FamilyData { id: string }
export interface FamilyInput { name: string; primaryChurchId: string; memberIds: string[]; address: string; notes: string }

export type VisitParticipantReference =
  | { kind: 'person'; personId: string }
  | { kind: 'guest'; guestName: string }

export const emptyFamilyInput = (): FamilyInput => ({ name: '', primaryChurchId: '', memberIds: [], address: '', notes: '' })
