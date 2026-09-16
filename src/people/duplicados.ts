import type { PersonEntity } from './types'
import { normalizePersonName } from './validation'

/** Partes que não distinguem ninguém: "Maria de Souza" e "Maria Souza" são o mesmo nome. */
const LIGACOES = new Set(['DE', 'DA', 'DO', 'DAS', 'DOS', 'E'])

const partesDoNome = (nome: string) => normalizePersonName(nome).split(' ').filter((parte) => parte && !LIGACOES.has(parte))

/**
 * Quantas letras é preciso mudar para transformar um nome no outro.
 *
 * É isto que pega o cadastro duplicado por engano de digitação — "Nascimento" e
 * "Nacimento", "Marcia" e "Marcai" —, que a comparação por palavras inteiras não
 * vê, porque para ela são duas palavras diferentes e ponto.
 */
export function distanciaDeEdicao(esquerda: string, direita: string): number {
  if (esquerda === direita) return 0
  let anterior = Array.from({ length: direita.length + 1 }, (_, indice) => indice)
  for (let linha = 1; linha <= esquerda.length; linha += 1) {
    const atual = [linha]
    for (let coluna = 1; coluna <= direita.length; coluna += 1) {
      const custo = esquerda[linha - 1] === direita[coluna - 1] ? 0 : 1
      atual[coluna] = Math.min(
        (atual[coluna - 1] ?? 0) + 1,
        (anterior[coluna] ?? 0) + 1,
        (anterior[coluna - 1] ?? 0) + custo,
      )
    }
    anterior = atual
  }
  return anterior[direita.length] ?? 0
}

/** A fração das palavras do nome mais curto que aparece também no outro. */
export function proximidadeDeNomes(esquerda: string, direita: string): number {
  const daEsquerda = new Set(partesDoNome(esquerda))
  const daDireita = new Set(partesDoNome(direita))
  const comuns = [...daEsquerda].filter((parte) => daDireita.has(parte)).length
  const menor = Math.min(daEsquerda.size, daDireita.size)
  return menor ? comuns / menor : 0
}

/** Datas de nascimento só brigam quando as duas existem e são diferentes. */
function nascimentoCompativel(esquerda: PersonEntity, direita: PersonEntity): boolean {
  if (!esquerda.birthDate || !direita.birthDate) return true
  return esquerda.birthDate === direita.birthDate
}

export interface CadastroParecido {
  pessoa: PersonEntity
  /** Por que ele apareceu: ajuda o pastor a decidir, e o teste a explicar a falha. */
  motivo: 'nome_quase_igual' | 'mesmas_palavras'
}

/**
 * Cadastros que podem ser a mesma pessoa — para o pastor decidir, nunca para unir sozinho.
 *
 * Uma letra trocada no nome cria um segundo registro, e só um deles recebe a
 * leitura de fidelidade: a mesma pessoa aparece duas vezes, uma como dizimista e
 * outra como não dizimista. Aqui só entra quem está na mesma igreja e não tem
 * data de nascimento conflitante — nome parecido, sozinho, não basta nem para
 * sugerir: "Maria Silva" e "Maria Souza" são duas pessoas na mesma igreja, e
 * tratá-las como uma seria perder gente de vista.
 */
export function cadastrosParecidos(pessoa: PersonEntity, todas: readonly PersonEntity[]): CadastroParecido[] {
  const nome = normalizePersonName(pessoa.name)
  const palavras = partesDoNome(pessoa.name)
  if (palavras.length < 2) return []

  const jaDisseQueNao = new Set(pessoa.naoSaoAMesmaPessoa ?? [])
  return todas
    .filter((outra) => outra.id !== pessoa.id
      && outra.currentChurchId === pessoa.currentChurchId
      && nascimentoCompativel(pessoa, outra)
      // O que o pastor já decidiu não volta a perguntar, nem pelo outro lado.
      && !jaDisseQueNao.has(outra.id)
      && !(outra.naoSaoAMesmaPessoa ?? []).includes(pessoa.id)
      // Quem já está no mesmo grupo não é "possível duplicado": já é a mesma pessoa.
      && !(pessoa.linkedGroupId && outra.linkedGroupId === pessoa.linkedGroupId))
    .map((outra) => {
      const nomeDaOutra = normalizePersonName(outra.name)
      const distancia = distanciaDeEdicao(nome, nomeDaOutra)
      // Até duas letras de diferença num nome longo é engano de digitação.
      if (nome.length >= 8 && distancia > 0 && distancia <= 2) return { pessoa: outra, motivo: 'nome_quase_igual' as const }
      // Ou as mesmas palavras, em outra ordem ou com um sobrenome a mais.
      if (proximidadeDeNomes(pessoa.name, outra.name) >= 0.85 && partesDoNome(outra.name).length >= 2) {
        return { pessoa: outra, motivo: 'mesmas_palavras' as const }
      }
      return null
    })
    .filter((achado): achado is CadastroParecido => achado !== null)
    .sort((esquerda, direita) => esquerda.pessoa.name.localeCompare(direita.pessoa.name, 'pt-BR'))
}
