/**
 * O relatório "Classes ES" do ACMS: as unidades de uma igreja e quem está em
 * cada uma.
 *
 * O ACMS numera as unidades para ordená-las na página — "8 - Maranata
 * Class/Jovens". O número é do relatório, não da unidade: guardá-lo faria a
 * mesma unidade mudar de nome quando outra fosse criada antes dela.
 *
 * O relatório sai de uma igreja por vez, e é assim que ele é enviado.
 */
export interface UnidadeDaEscolaSabatina {
  nome: string
  membros: string[]
}

export interface ClassesDaEscolaSabatina {
  /** A igreja escrita no cabeçalho, para conferir com a escolhida na tela. */
  igreja: string
  unidades: UnidadeDaEscolaSabatina[]
}

const CABECALHO = /relat[óo]rio de classes es\s+(.+)$/iu
const LINHA = /^(.+?)\s+(\d+)\s+-\s+(.+)$/u
const RODAPES = [
  /^\d{2}\/\d{2}\/\d{4}\s/u,
  /^tipo:/iu,
  /^membros\s+unidade$/iu,
  /^total de membros/iu,
  /^associa[çc][ãa]o/iu,
]

function limparIgreja(valor: string): string {
  return valor.replace(/\s*-?\s*(sede\s+)?anpa\s*$/iu, '').trim()
}

export function parseClassesDaEscolaSabatina(texto: string): ClassesDaEscolaSabatina {
  const linhas = texto.split('\n').map((linha) => linha.trim()).filter(Boolean)
  const igreja = limparIgreja(linhas.map((linha) => CABECALHO.exec(linha)?.[1]).find(Boolean) ?? '')

  const porUnidade = new Map<string, Set<string>>()
  for (const linha of linhas) {
    if (RODAPES.some((padrao) => padrao.test(linha))) continue
    const achado = LINHA.exec(linha)
    if (!achado) continue
    const nome = achado[1]!.trim()
    const unidade = achado[3]!.trim()
    if (!nome || !unidade) continue
    const membros = porUnidade.get(unidade) ?? new Set<string>()
    // O mesmo nome aparece duas vezes no relatório real; contá-lo duas vezes
    // inflaria a unidade sem que ninguém entendesse por quê.
    membros.add(nome)
    porUnidade.set(unidade, membros)
  }

  return {
    igreja,
    unidades: [...porUnidade].map(([nome, membros]) => ({ nome, membros: [...membros] })),
  }
}

export function ehRelatorioDeClasses(texto: string): boolean {
  return texto.split('\n').some((linha) => CABECALHO.test(linha.trim()))
}
