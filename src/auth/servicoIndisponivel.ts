/**
 * "O serviço não respondeu" e "a senha está errada" são coisas diferentes, e
 * confundi-las custa caro.
 *
 * A entrada colapsava todo erro do serviço em "E-mail ou senha inválidos". Sem
 * rede, o pastor lia que a própria senha estava errada: digitava de novo,
 * duvidava do que sabia e, no limite, ia buscar a chave de recuperação — que
 * existe para perda de acesso, não para falta de sinal. Uma mensagem errada não
 * é só um texto ruim: ela manda a pessoa para o caminho errado.
 */
export class ServicoIndisponivelError extends Error {
  constructor(message = 'Não foi possível falar com o serviço agora.') {
    super(message)
    this.name = 'ServicoIndisponivelError'
  }
}

/**
 * A falha veio da rede, e não de uma resposta do serviço?
 *
 * A pergunta importa porque as duas levam a decisões opostas: sem rede, o
 * envelope local abre o cofre normalmente; com o serviço respondendo que a
 * credencial não serve, não abre. Na dúvida, esta função responde `false` — é
 * melhor pedir a senha de novo do que abrir o cofre por engano.
 */
export function pareceFalhaDeRede(reason: unknown): boolean {
  // Pelo nome, e não só por `instanceof`: um módulo recarregado — em teste, ou
  // por carregamento sob demanda — cria uma segunda classe com o mesmo nome, e
  // `instanceof` responde `false` para o mesmo erro. Reconhecer pelo nome
  // atravessa isso.
  if (reason instanceof Error && reason.name === 'ServicoIndisponivelError') return true
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  const nome = reason instanceof Error ? reason.name : ''
  const texto = reason instanceof Error ? reason.message : typeof reason === 'string' ? reason : ''
  // `AuthRetryableFetchError` é o que o cliente do Supabase levanta quando o
  // `fetch` não chega ao destino; `TypeError: Failed to fetch` é o que o próprio
  // navegador levanta antes disso.
  if (/AuthRetryableFetchError|AuthUnknownError|TypeError|NetworkError/u.test(nome)) return true
  return /failed to fetch|networkerror|load failed|network request failed|fetch failed|timeout|conex(ã|a)o/iu.test(texto)
}
