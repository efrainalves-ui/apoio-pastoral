/**
 * A abreviação do livro bíblico a partir do texto base do sermão.
 *
 * A lista repetia o mesmo ícone de livro em toda linha — cinquenta vezes o
 * mesmo desenho não distingue nada. A sigla do livro ocupa o mesmo espaço e
 * diz de onde a mensagem vem, que é como o pastor reconhece o próprio esboço
 * de relance.
 *
 * Nada disso é gravado: a sigla é lida do campo de texto base que já existe.
 */

const LIVROS: Array<[string, string]> = [
  ['GENESIS', 'GN'], ['EXODO', 'EX'], ['LEVITICO', 'LV'], ['NUMEROS', 'NM'], ['DEUTERONOMIO', 'DT'],
  ['JOSUE', 'JS'], ['JUIZES', 'JZ'], ['RUTE', 'RT'],
  ['1 SAMUEL', '1SM'], ['2 SAMUEL', '2SM'], ['1 REIS', '1RS'], ['2 REIS', '2RS'],
  ['1 CRONICAS', '1CR'], ['2 CRONICAS', '2CR'],
  ['ESDRAS', 'ED'], ['NEEMIAS', 'NE'], ['ESTER', 'ET'], ['JO', 'JÓ'],
  ['SALMOS', 'SL'], ['SALMO', 'SL'], ['PROVERBIOS', 'PV'], ['ECLESIASTES', 'EC'],
  ['CANTICO DOS CANTICOS', 'CT'], ['CANTICOS', 'CT'], ['CANTARES', 'CT'],
  ['ISAIAS', 'IS'], ['JEREMIAS', 'JR'], ['LAMENTACOES', 'LM'], ['EZEQUIEL', 'EZ'], ['DANIEL', 'DN'],
  ['OSEIAS', 'OS'], ['JOEL', 'JL'], ['AMOS', 'AM'], ['OBADIAS', 'OB'], ['JONAS', 'JN'],
  ['MIQUEIAS', 'MQ'], ['NAUM', 'NA'], ['HABACUQUE', 'HC'], ['SOFONIAS', 'SF'],
  ['AGEU', 'AG'], ['ZACARIAS', 'ZC'], ['MALAQUIAS', 'ML'],
  ['MATEUS', 'MT'], ['MARCOS', 'MC'], ['LUCAS', 'LC'], ['JOAO', 'JO'], ['ATOS', 'AT'],
  ['ROMANOS', 'RM'], ['1 CORINTIOS', '1CO'], ['2 CORINTIOS', '2CO'],
  ['GALATAS', 'GL'], ['EFESIOS', 'EF'], ['FILIPENSES', 'FP'], ['COLOSSENSES', 'CL'],
  ['1 TESSALONICENSES', '1TS'], ['2 TESSALONICENSES', '2TS'],
  ['1 TIMOTEO', '1TM'], ['2 TIMOTEO', '2TM'], ['TITO', 'TT'], ['FILEMOM', 'FM'],
  ['HEBREUS', 'HB'], ['TIAGO', 'TG'], ['1 PEDRO', '1PE'], ['2 PEDRO', '2PE'],
  ['1 JOAO', '1JO'], ['2 JOAO', '2JO'], ['3 JOAO', '3JO'], ['JUDAS', 'JD'], ['APOCALIPSE', 'AP'],
]

/* O nome mais comprido primeiro: "1 João" não pode casar com "João". */
const ORDENADOS = [...LIVROS].sort(([esquerda], [direita]) => direita.length - esquerda.length)

function normalizar(texto: string): string {
  return texto
    .normalize('NFD').replace(/[\u0300-\u036f]/gu, '')
    .toLocaleUpperCase('pt-BR')
    // "I Coríntios", "1ª João", "Iº Pedro" e "1. Reis" são a mesma coisa.
    .replace(/^\s*III\b\.?/u, '3').replace(/^\s*II\b\.?/u, '2').replace(/^\s*I\b\.?/u, '1')
    .replace(/^(\d)\s*[ªº°.]/u, '$1')
    .replace(/[^\dA-Z]+/gu, ' ')
    .trim()
}

/** A sigla do livro, ou nulo quando o texto base não nomeia um livro conhecido. */
export function abreviacaoDoLivro(textoBase: string): string | null {
  if (!textoBase.trim()) return null
  const limpo = normalizar(textoBase)
  for (const [nome, sigla] of ORDENADOS) {
    if (limpo === nome || limpo.startsWith(`${nome} `)) return sigla
  }
  return null
}
