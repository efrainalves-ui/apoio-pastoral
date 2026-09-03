import { currentDeviceId } from '../auth/device'
import { fetchRemoteDevices, revokeAllRemoteDevices } from '../auth/supabase'
import { SyncService, syncConfirmed } from '../sync/service'
import { createSyncTransport } from '../sync/transport'
import type { CloseDistrictRemote } from './closeDistrict'

/**
 * As dependências remotas do encerramento, montadas com a chave de assinatura
 * que só existe com o cofre aberto.
 *
 * A sincronização entra aqui porque encerrar o distrito não pode terminar
 * antes de as lápides subirem: sem isso, o distrito some deste aparelho e
 * continua inteiro nos outros, que seguem sincronizando o que o pastor mandou
 * encerrar. `syncConfirmed` é o mesmo critério da tela de sincronização —
 * offline, rodada incompleta ou expurgo pendente não contam como enviado.
 */
export function closeDistrictRemote(accountId: string, syncKey: CryptoKey): CloseDistrictRemote {
  return {
    listDevices: fetchRemoteDevices,
    revokeAll: revokeAllRemoteDevices,
    synchronize: async () => {
      const transport = createSyncTransport()
      // Sem transporte não há o que enviar: a etapa não fica pendente para
      // sempre em uma instalação que nunca sincronizou.
      if (transport.name === 'disabled') return null
      try {
        const resumo = await new SyncService(transport).synchronize(accountId, currentDeviceId(accountId), syncKey)
        return syncConfirmed(resumo)
      } catch {
        return false
      }
    },
  }
}
