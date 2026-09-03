/**
 * Leitor mínimo de `.xlsx`, dentro do aparelho.
 *
 * Um `.xlsx` é um ZIP com XML dentro. O navegador já traz o que é preciso para
 * abrir os dois — `DecompressionStream` e `DOMParser` —, então ler a planilha
 * não custa uma dependência nova. E não é preciosismo: uma biblioteca de
 * planilha é código grande, com histórico de problemas de segurança, para
 * rodar em cima de um arquivo que o pastor recebeu por e-mail.
 *
 * O arquivo é lido em memória e nada dele é guardado: o que sobra da
 * importação são os números extraídos, e só depois de o pastor confirmar.
 */

const ASSINATURA_DIRETORIO_CENTRAL = 0x02014b50
const ASSINATURA_FIM_DO_DIRETORIO = 0x06054b50

interface EntradaZip { nome: string; metodo: number; tamanhoComprimido: number; deslocamentoLocal: number }

/** Erro de formato, com texto que serve para mostrar na tela. */
export class ArquivoNaoReconhecidoError extends Error {
  constructor(message: string) { super(message); this.name = 'ArquivoNaoReconhecidoError' }
}

function lerDiretorioCentral(dados: DataView): EntradaZip[] {
  // O fim do diretório central fica no rabo do arquivo, depois de um comentário
  // de tamanho variável. Procurar de trás para frente é o caminho previsto.
  let fim = -1
  for (let posicao = dados.byteLength - 22; posicao >= 0; posicao -= 1) {
    if (dados.getUint32(posicao, true) === ASSINATURA_FIM_DO_DIRETORIO) { fim = posicao; break }
  }
  if (fim < 0) throw new ArquivoNaoReconhecidoError('Este arquivo não é uma planilha .xlsx válida.')

  const total = dados.getUint16(fim + 10, true)
  let posicao = dados.getUint32(fim + 16, true)
  const entradas: EntradaZip[] = []
  for (let indice = 0; indice < total; indice += 1) {
    if (dados.getUint32(posicao, true) !== ASSINATURA_DIRETORIO_CENTRAL) break
    const metodo = dados.getUint16(posicao + 10, true)
    const tamanhoComprimido = dados.getUint32(posicao + 20, true)
    const tamanhoNome = dados.getUint16(posicao + 28, true)
    const tamanhoExtra = dados.getUint16(posicao + 30, true)
    const tamanhoComentario = dados.getUint16(posicao + 32, true)
    const deslocamentoLocal = dados.getUint32(posicao + 42, true)
    const nome = new TextDecoder().decode(new Uint8Array(dados.buffer, dados.byteOffset + posicao + 46, tamanhoNome))
    entradas.push({ nome, metodo, tamanhoComprimido, deslocamentoLocal })
    posicao += 46 + tamanhoNome + tamanhoExtra + tamanhoComentario
  }
  return entradas
}

async function inflar(bytes: Uint8Array, metodo: number): Promise<string> {
  if (metodo === 0) return new TextDecoder().decode(bytes)
  if (metodo !== 8) throw new ArquivoNaoReconhecidoError('Esta planilha usa uma compactação que o aplicativo não abre.')
  const fluxo = new Blob([bytes as unknown as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Response(fluxo).text()
}

/** Descompacta as partes XML de que a leitura precisa. */
export async function readXlsxParts(arquivo: ArrayBuffer): Promise<Map<string, string>> {
  const dados = new DataView(arquivo)
  const bytes = new Uint8Array(arquivo)
  const partes = new Map<string, string>()
  for (const entrada of lerDiretorioCentral(dados)) {
    if (!entrada.nome.endsWith('.xml')) continue
    const local = entrada.deslocamentoLocal
    const tamanhoNome = dados.getUint16(local + 26, true)
    const tamanhoExtra = dados.getUint16(local + 28, true)
    const inicio = local + 30 + tamanhoNome + tamanhoExtra
    partes.set(entrada.nome, await inflar(bytes.slice(inicio, inicio + entrada.tamanhoComprimido), entrada.metodo))
  }
  if (!partes.size) throw new ArquivoNaoReconhecidoError('Este arquivo não é uma planilha .xlsx válida.')
  return partes
}

/** Coluna `A`, `B`, `AA`… vira índice zero. */
export function columnIndex(referencia: string): number {
  const letras = referencia.replace(/\d+/gu, '').toUpperCase()
  let indice = 0
  for (const letra of letras) indice = indice * 26 + (letra.charCodeAt(0) - 64)
  return indice - 1
}

function textoDaCelula(celula: Element, compartilhadas: string[]): string {
  const tipo = celula.getAttribute('t')
  if (tipo === 'inlineStr') return (celula.querySelector('is')?.textContent ?? '').trim()
  const valor = celula.querySelector('v')?.textContent ?? ''
  if (tipo === 's') return (compartilhadas[Number(valor)] ?? '').trim()
  return valor.trim()
}

export interface PlanilhaLida { nome: string; linhas: string[][] }

/**
 * Abre a planilha e devolve as abas como matriz de texto.
 *
 * Sem conversão de tipo, sem fórmula, sem formatação: o que interessa aqui é
 * o texto de cada célula, e quem decide o que é número é o leitor do relatório.
 */
export async function readXlsx(arquivo: ArrayBuffer): Promise<PlanilhaLida[]> {
  const partes = await readXlsxParts(arquivo)
  const parser = new DOMParser()

  const compartilhadas: string[] = []
  const sharedStrings = partes.get('xl/sharedStrings.xml')
  if (sharedStrings) {
    const documento = parser.parseFromString(sharedStrings, 'application/xml')
    for (const item of [...documento.getElementsByTagName('si')]) compartilhadas.push(item.textContent ?? '')
  }

  const nomes = new Map<string, string>()
  const workbook = partes.get('xl/workbook.xml')
  if (workbook) {
    const documento = parser.parseFromString(workbook, 'application/xml')
    ;[...documento.getElementsByTagName('sheet')].forEach((aba, indice) => {
      nomes.set(`xl/worksheets/sheet${indice + 1}.xml`, aba.getAttribute('name') ?? `Planilha ${indice + 1}`)
    })
  }

  const planilhas: PlanilhaLida[] = []
  for (const [caminho, conteudo] of [...partes.entries()].filter(([nome]) => nome.startsWith('xl/worksheets/sheet')).sort()) {
    const documento = parser.parseFromString(conteudo, 'application/xml')
    const linhas: string[][] = []
    for (const linha of [...documento.getElementsByTagName('row')]) {
      const celulas: string[] = []
      for (const celula of [...linha.getElementsByTagName('c')]) {
        const referencia = celula.getAttribute('r') ?? ''
        const indice = referencia ? columnIndex(referencia) : celulas.length
        while (celulas.length < indice) celulas.push('')
        celulas[indice] = textoDaCelula(celula, compartilhadas)
      }
      linhas.push(celulas)
    }
    planilhas.push({ nome: nomes.get(caminho) ?? caminho, linhas })
  }
  if (!planilhas.length) throw new ArquivoNaoReconhecidoError('A planilha não tem nenhuma aba legível.')
  return planilhas
}
