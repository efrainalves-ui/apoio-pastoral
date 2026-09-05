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
  /**
   * O que provocou a pergunta.
   *
   * `retorno` é o aplicativo voltando para a frente, a internet voltando, a
   * aba recebendo foco — momentos em que há alguém olhando para a tela agora.
   * `tick` é o relógio de fundo, sem ninguém pedindo nada.
   */
  motivo: 'tick' | 'retorno'
}

/** Espera depois de uma alteração, para não sincronizar a cada tecla digitada. */
export const ESPERA_APOS_ALTERACAO_MS = 5_000
/** De quanto em quanto tempo o relógio de fundo confere, sem ninguém pedindo. */
export const INTERVALO_OCIOSO_MS = 60_000
/**
 * Guarda mínima quando o aplicativo volta para a frente.
 *
 * Aqui não se está economizando espera, e sim evitando que foco, visibilidade e
 * retorno da rede — que chegam quase juntos — disparem três rodadas seguidas.
 */
export const GUARDA_NO_RETORNO_MS = 3_000

/**
 * Sem rede não se tenta — a fila fica guardada e sobe depois. Com rodada em
 * andamento também não: duas ao mesmo tempo disputariam o mesmo cursor.
 *
 * Com alteração pendente, espera-se um pouco: quem está digitando uma visita
 * gera várias alterações seguidas, e sincronizar a cada uma seria desperdício.
 * Sem nada pendente, ainda assim se confere de tempos em tempos, porque receber
 * o que veio de outro aparelho é metade do serviço.
 */
export function deveSincronizarAgora({ online, emCurso, pendentes, ultimaRodada, agora, motivo }: AutoSyncCheck): boolean {
  if (!online || emCurso) return false
  if (ultimaRodada === null) return true
  const desdeAUltima = agora - ultimaRodada
  // Voltar para o aplicativo é o instante em que alguém está olhando: fazê-lo
  // esperar o relógio de fundo era o que sobrava do problema antigo — o
  // compromisso criado no computador só aparecia no celular depois de apertar
  // o botão, ainda que a sincronização já fosse automática.
  if (motivo === 'retorno') return desdeAUltima >= GUARDA_NO_RETORNO_MS
  if (pendentes > 0) return desdeAUltima >= ESPERA_APOS_ALTERACAO_MS
  return desdeAUltima >= INTERVALO_OCIOSO_MS
}
