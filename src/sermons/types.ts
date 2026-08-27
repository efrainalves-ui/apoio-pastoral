export type SermonStatus = 'draft' | 'ready' | 'archived'
export const SERMON_STATUS_LABELS: Record<SermonStatus, string> = { draft: 'Rascunho', ready: 'Pronto', archived: 'Arquivado' }
export interface SermonData { title: string; theme: string; mainText: string; complementaryTexts: string; objective: string; introduction: string; content: string; conclusion: string; appeal: string; notes: string; tags: string[]; status: SermonStatus; createdAt: string; updatedAt: string }
export interface SermonEntity extends SermonData { id: string }
export type SermonInput = Omit<SermonData, 'createdAt' | 'updatedAt'>
export interface SermonSnapshot { id: string; title: string; theme: string; mainText: string }
