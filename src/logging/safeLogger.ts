type EventCode =
  | 'app.started'
  | 'auth.succeeded'
  | 'auth.failed'
  | 'vault.locked'
  | 'sync.started'
  | 'sync.completed'
  | 'sync.failed'

type SafeMetadata = Readonly<Record<'count' | 'durationMs' | 'status' | 'environment', number | string | undefined>>

export interface TechnicalEvent {
  code: EventCode
  at: string
  metadata?: Partial<SafeMetadata>
}

/** Não aceita mensagens livres: somente códigos e metadados técnicos allowlisted. */
export function technicalEvent(code: EventCode, metadata?: Partial<SafeMetadata>): TechnicalEvent {
  return { code, at: new Date().toISOString(), ...(metadata ? { metadata } : {}) }
}
