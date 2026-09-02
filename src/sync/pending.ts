import { db, type ApoioDatabase } from '../db/database'

/**
 * Quantas alterações desta conta ainda esperam para subir. Só o número: nada do
 * conteúdo pastoral sai da fila cifrada para chegar até a tela.
 */
export async function countPendingChanges(accountId: string, database: ApoioDatabase = db): Promise<number> {
  return database.outbox
    .where('accountId').equals(accountId)
    .filter(({ status }) => status !== 'sending')
    .count()
}

/** Frase curta para o pastor, sem detalhe técnico. */
export function pendingLabel(total: number): string {
  if (total <= 0) return 'Tudo enviado'
  return total === 1 ? '1 alteração aguardando envio' : `${total} alterações aguardando envio`
}
