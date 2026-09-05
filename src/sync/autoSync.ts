/**
 * Quando vale a pena sincronizar sozinho.
 *
 * A sincronização era só manual, e isso custou caro na prática: o distrito
 * inteiro foi importado num aparelho, o outro abriu e não havia nada — porque
 * ninguém tinha apertado um botão. Depender de memória humana para não perder
 * trabalho é desenho ruim, e o preço aparece justamente quando a pessoa está
 * ocupada com outra coisa.
 *
 * A regra vive aqui, fora do componente, porque decisão de quando agir é o tipo
 * de coisa que precisa de teste — e testar um relógio dentro de um botão é
 * muito mais difícil do que testar uma função que responde sim ou não.
 */
export interface AutoSyncCheck {
  /** Há rede agora? */
  online: boolean
  /** Uma rodada está em andamento? */
  emCurso: boolean
  /** Alterações locais ainda não enviadas. */
  pendentes: number
  /** Instante da última rodada iniciada, ou `null` se nenhuma ainda. */
  ultimaRodada: number | null
  agora: number
}

/** Espera depois de uma alteração, para não sincronizar a cada tecla digitada. */
export const ESPERA_APOS_ALTERACAO_MS = 5_000
/** De quanto em quanto tempo vale conferir se chegou coisa de outro aparelho. */
export const INTERVALO_OCIOSO_MS = 5 * 60_000

/**
 * Sem rede não se tenta — a fila fica guardada e sobe depois. Com rodada em
 * andamento também não: duas ao mesmo tempo disputariam o mesmo cursor.
 *
 * Com alteração pendente, espera-se um pouco: quem está digitando uma visita
 * gera várias alterações seguidas, e sincronizar a cada uma seria desperdício.
 * Sem nada pendente, ainda assim se confere de tempos em tempos, porque receber
 * o que veio de outro aparelho é metade do serviço.
 */
export function deveSincronizarAgora({ online, emCurso, pendentes, ultimaRodada, agora }: AutoSyncCheck): boolean {
  if (!online || emCurso) return false
  if (ultimaRodada === null) return true
  const desdeAUltima = agora - ultimaRodada
  if (pendentes > 0) return desdeAUltima >= ESPERA_APOS_ALTERACAO_MS
  return desdeAUltima >= INTERVALO_OCIOSO_MS
}
