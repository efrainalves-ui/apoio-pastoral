/**
 * A regra de "sem nomes", separada da interface.
 *
 * Vive em um arquivo sem React porque quem mais precisa dela são os geradores
 * de documento — pauta, ata, relatório, itinerário, campanha —, que são código
 * puro e devem continuar assim para poderem ser conferidos em teste, linha a
 * linha, sem montar tela nenhuma.
 */

/** Como uma pessoa aparece quando o documento sai sem nomes. */
export const NOME_OMITIDO = 'nome não incluído'

/**
 * Resolve o nome de uma pessoa respeitando a escolha do pastor. Passar isto
 * aos geradores de documento é o que mantém a regra em um lugar só, em vez de
 * cada tela lembrar (ou esquecer) de esconder o nome.
 */
export function personNameResolver(includeNames: boolean, nome: (id: string) => string): (id: string) => string {
  return (id: string) => (includeNames ? nome(id) : id ? NOME_OMITIDO : 'a confirmar')
}

/**
 * Texto livre em documento sem nomes confirmados.
 *
 * "Sem nomes" não é só esconder o campo Nome. Um título de assunto, uma
 * proposta, uma oração inicial, uma reflexão, um aprendizado de campanha, um
 * endereço, uma lista de convidados e uma observação são todos escritos à mão
 * pelo pastor, e o aplicativo não tem como saber quais palavras ali são nomes
 * de pessoas. A regra anterior escondia o campo Nome e deixava tudo isso sair:
 * a ata anunciava "sem nomes" e trazia, na íntegra, quem orou, quem foi
 * convidado e o que se decidiu sobre quem.
 *
 * Aqui todo campo livre passa por esta função. Sem a confirmação, sai a marca
 * — e não o silêncio: o documento diz que havia um texto ali, para ninguém
 * achar que o campo estava vazio.
 */
export const TEXTO_OMITIDO = 'texto não incluído'

export function freeText(includeNames: boolean, texto: string | null | undefined): string {
  const valor = (texto ?? '').trim()
  if (!valor) return ''
  return includeNames ? valor : TEXTO_OMITIDO
}

/** A mesma regra para uma lista de textos livres — convidados, itens de pauta. */
export function freeList(includeNames: boolean, itens: readonly string[] | undefined): string[] {
  const validos = (itens ?? []).map((item) => item.trim()).filter(Boolean)
  if (!validos.length) return []
  return includeNames ? validos : validos.map(() => TEXTO_OMITIDO)
}

/**
 * Um rótulo que veio digitado à mão no lugar de um identificador de pessoa.
 *
 * A ata da comissão guarda `presidentLabel`, que é o nome do pastor escrito
 * por ele. Sem esta passagem, a assinatura da ata trazia o nome dele por
 * inteiro em um documento gerado justamente sem nomes.
 */
export function personLabel(includeNames: boolean, rotulo: string | undefined, alternativa: string): string {
  const valor = (rotulo ?? '').trim()
  if (!valor) return alternativa
  return includeNames ? valor : NOME_OMITIDO
}
