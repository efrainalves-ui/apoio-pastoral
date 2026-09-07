import type { QuestionSnapshot } from './types'

/**
 * Uma pergunta que só faz sentido depois de outra.
 *
 * "Quanto tempo dedicou ao estudo hoje?" depois de "Não" em "Você estudou a
 * Bíblia hoje?" não é uma pergunta difícil: é uma pergunta que não existe. Pedir
 * que o pastor a pule na frente da pessoa visitada é pedir que ele conserte, em
 * voz alta, um erro do formulário.
 */
export function perguntaVisivel(
  pergunta: QuestionSnapshot,
  respostaDe: (code: string) => string,
): boolean {
  const condicao = pergunta.dependsOn
  if (!condicao) return true
  const resposta = respostaDe(condicao.code).trim()
  // Enquanto a pergunta de cima não for respondida, a de baixo não aparece: ela
  // ainda não tem sentido, e mostrá-la vazia sugeriria que já tem.
  if (!resposta) return false
  return condicao.answers.includes(resposta)
}
