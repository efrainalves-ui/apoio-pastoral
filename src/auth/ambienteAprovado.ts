import { declaredEnvironment, declaredProjectRef } from '../sync/config'

/**
 * A última vez que **este aparelho** confirmou, com o serviço respondendo, que
 * a build e o banco são do mesmo ambiente.
 *
 * A conferência de ambiente existe para uma build de produção nunca falar com o
 * banco de homologação, e o contrário. Ela é feita contra o serviço — o que
 * significa que, sem rede, ela não pode acontecer. Enquanto ela era condição
 * para destravar, ficar sem sinal trancava o cofre de um aparelho que já tinha
 * tudo o que precisava: a conta, o envelope de senha e uma aprovação anterior.
 *
 * Guardar a aprovação não afrouxa a separação entre os ambientes, por dois
 * motivos:
 *
 * 1. Ela é registrada **por identidade de build**: ambiente declarado mais
 *    projeto declarado. Uma build de outro ambiente, ou apontada para outro
 *    projeto, não encontra aprovação nenhuma aqui e continua exigindo o
 *    serviço.
 * 2. Ela só autoriza **abrir o que já está neste aparelho**. Sincronizar
 *    continua conferindo ambiente, versão, sessão e revogação contra o serviço,
 *    toda vez, porque é aí que dado sai e entra.
 */
const CHAVE = 'apoio-pastoral:ambiente-aprovado'

interface AmbienteAprovado {
  environment: string
  projectRef: string
  schemaVersion: number
  checkedAt: string
}

/**
 * Quem esta build é, para efeito de aprovação. Build sem ambiente declarado ou
 * sem projeto declarado não tem identidade — e sem identidade não há aprovação
 * a guardar nem a reconhecer.
 */
function identidadeDaBuild(): { environment: string; projectRef: string } | null {
  const projectRef = declaredProjectRef?.trim().toLowerCase()
  if (!projectRef) return null
  if (declaredEnvironment !== 'homologacao' && declaredEnvironment !== 'producao') return null
  return { environment: declaredEnvironment, projectRef }
}

function lerAprovacao(): AmbienteAprovado | null {
  try {
    const bruto = localStorage.getItem(CHAVE)
    if (!bruto) return null
    const lido: unknown = JSON.parse(bruto)
    if (typeof lido !== 'object' || lido === null) return null
    const { environment, projectRef, schemaVersion, checkedAt } = lido as Partial<AmbienteAprovado>
    if (typeof environment !== 'string' || typeof projectRef !== 'string') return null
    if (typeof schemaVersion !== 'number' || typeof checkedAt !== 'string') return null
    return { environment, projectRef, schemaVersion, checkedAt }
  } catch {
    // Armazenamento indisponível ou conteúdo ilegível: sem aprovação, e o
    // caminho normal — exigir o serviço — continua valendo.
    return null
  }
}

/** Registra que o serviço respondeu e conferiu. Chamado só depois da aprovação. */
export function registrarAmbienteAprovado(schemaVersion: number): void {
  const identidade = identidadeDaBuild()
  if (!identidade) return
  try {
    localStorage.setItem(CHAVE, JSON.stringify({ ...identidade, schemaVersion, checkedAt: new Date().toISOString() } satisfies AmbienteAprovado))
  } catch { /* sem armazenamento, segue exigindo o serviço */ }
}

/**
 * Esta build já foi aprovada contra o serviço neste aparelho?
 *
 * Responde `false` na dúvida — inclusive quando a build não declara ambiente ou
 * projeto. Falhar fechado aqui custa uma tela de erro; falhar aberto custaria a
 * separação entre homologação e produção.
 */
export function ambienteJaAprovado(): boolean {
  const identidade = identidadeDaBuild()
  if (!identidade) return false
  const aprovacao = lerAprovacao()
  if (!aprovacao) return false
  return aprovacao.environment === identidade.environment && aprovacao.projectRef === identidade.projectRef
}

/** Apaga a aprovação. Existe para os testes e para o encerramento de conta. */
export function esquecerAmbienteAprovado(): void {
  try { localStorage.removeItem(CHAVE) } catch { /* nada a fazer */ }
}
