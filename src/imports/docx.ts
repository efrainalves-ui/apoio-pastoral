/**
 * Leitura local de .docx, sem dependência nova e sem enviar o arquivo a lugar
 * nenhum. Um .docx é um ZIP; aqui só se procura `word/document.xml`, descomprime
 * com a API do próprio navegador e reduz o XML a texto.
 */

const ASSINATURA_FIM_DIRETORIO = 0x06054b50
const ASSINATURA_ENTRADA_DIRETORIO = 0x02014b50
const ASSINATURA_CABECALHO_LOCAL = 0x04034b50
const DOCUMENTO = 'word/document.xml'

export const DOCX_MAX_BYTES = 8 * 1024 * 1024

export class DocxFormatError extends Error {}

export function validateDocxFile(file: Pick<File, 'name' | 'size'>): void {
  if (!/\.docx$/iu.test(file.name)) throw new DocxFormatError('Envie um arquivo do Word terminado em .docx.')
  if (file.size > DOCX_MAX_BYTES) throw new DocxFormatError('O arquivo é grande demais. Envie uma lista de até 8 MB.')
  if (file.size === 0) throw new DocxFormatError('O arquivo está vazio.')
}

function acharFimDoDiretorio(view: DataView): number {
  // O fim do diretório central fica no rodapé do arquivo, depois de um
  // comentário de tamanho variável — por isso a busca de trás para frente.
  const minimo = Math.max(0, view.byteLength - 66_000)
  for (let posicao = view.byteLength - 22; posicao >= minimo; posicao -= 1) {
    if (view.getUint32(posicao, true) === ASSINATURA_FIM_DIRETORIO) return posicao
  }
  throw new DocxFormatError('Não foi possível ler o arquivo do Word. Salve novamente como .docx e tente outra vez.')
}

interface EntradaZip { metodo: number; tamanhoComprimido: number; deslocamentoLocal: number }

function acharDocumento(bytes: Uint8Array, view: DataView): EntradaZip {
  const fim = acharFimDoDiretorio(view)
  const total = view.getUint16(fim + 10, true)
  let posicao = view.getUint32(fim + 16, true)
  const decodificador = new TextDecoder()

  for (let indice = 0; indice < total; indice += 1) {
    if (view.getUint32(posicao, true) !== ASSINATURA_ENTRADA_DIRETORIO) break
    const tamanhoNome = view.getUint16(posicao + 28, true)
    const nome = decodificador.decode(bytes.subarray(posicao + 46, posicao + 46 + tamanhoNome))
    if (nome === DOCUMENTO) {
      return {
        metodo: view.getUint16(posicao + 10, true),
        tamanhoComprimido: view.getUint32(posicao + 20, true),
        deslocamentoLocal: view.getUint32(posicao + 42, true),
      }
    }
    posicao += 46 + tamanhoNome + view.getUint16(posicao + 30, true) + view.getUint16(posicao + 32, true)
  }
  throw new DocxFormatError('Este arquivo não parece um documento do Word.')
}

async function descomprimir(dados: Uint8Array, metodo: number): Promise<Uint8Array> {
  if (metodo === 0) return dados
  if (metodo !== 8) throw new DocxFormatError('Não foi possível ler o arquivo do Word. Salve novamente como .docx.')
  const fluxo = new Blob([dados as unknown as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(fluxo).arrayBuffer())
}

/** Reduz o XML do Word a texto: um parágrafo por linha. */
export function docxXmlToText(xml: string): string {
  return xml
    .replace(/<w:tab\b[^>]*\/>/gu, '\t')
    .replace(/<w:br\b[^>]*\/>/gu, '\n')
    .replace(/<\/w:p>/gu, '\n')
    .replace(/<[^>]+>/gu, '')
    .replace(/&lt;/gu, '<').replace(/&gt;/gu, '>').replace(/&quot;/gu, '"').replace(/&apos;/gu, "'").replace(/&amp;/gu, '&')
    .replace(/\r/gu, '')
    .split('\n').map((linha) => linha.trim()).join('\n')
}

export async function extractDocxText(bytes: ArrayBuffer): Promise<string> {
  const dados = new Uint8Array(bytes)
  const view = new DataView(bytes)
  const entrada = acharDocumento(dados, view)

  if (view.getUint32(entrada.deslocamentoLocal, true) !== ASSINATURA_CABECALHO_LOCAL) {
    throw new DocxFormatError('Não foi possível ler o arquivo do Word. Salve novamente como .docx.')
  }
  const inicio = entrada.deslocamentoLocal + 30
    + view.getUint16(entrada.deslocamentoLocal + 26, true)
    + view.getUint16(entrada.deslocamentoLocal + 28, true)

  const conteudo = await descomprimir(dados.subarray(inicio, inicio + entrada.tamanhoComprimido), entrada.metodo)
  return docxXmlToText(new TextDecoder().decode(conteudo))
}
