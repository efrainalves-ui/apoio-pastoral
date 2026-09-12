/**
 * Um PDF de mentira, montado à mão, para o teste exercitar o leitor de verdade.
 *
 * Guardar um PDF real do distrito no repositório está fora de questão: ele traz
 * números de igrejas existentes. E um texto simulado não provaria nada, porque
 * o que quebra no caminho é justamente a extração — coordenadas, agrupamento de
 * linha, acentos. Então o teste gera um PDF válido, com o mesmo desenho de
 * colunas do relatório, e nomes e números inventados.
 *
 * Sem compressão de propósito: o arquivo é pequeno e assim dá para ler o que
 * ele contém abrindo em qualquer editor.
 */

export interface CelulaDoPdf { texto: string; x: number; y: number }

function paraWinAnsi(texto: string): Buffer {
  const escapado = texto.replace(/([\\()])/gu, '\\$1')
  return Buffer.from(escapado, 'latin1')
}

function fluxoDaPagina(celulas: readonly CelulaDoPdf[]): Buffer {
  const partes = celulas.map((celula) =>
    Buffer.concat([
      Buffer.from(`BT /F1 9 Tf 1 0 0 1 ${celula.x} ${celula.y} Tm (`, 'latin1'),
      paraWinAnsi(celula.texto),
      Buffer.from(') Tj ET\n', 'latin1'),
    ]))
  return Buffer.concat(partes)
}

/** Monta o PDF com uma página por lista de células. */
export function montarPdf(paginas: ReadonlyArray<readonly CelulaDoPdf[]>): Buffer {
  const objetos: Buffer[] = []
  const idDaPagina = (indice: number) => 3 + indice * 2
  const idDoFluxo = (indice: number) => 4 + indice * 2

  objetos.push(Buffer.from('<< /Type /Catalog /Pages 2 0 R >>', 'latin1'))
  const filhos = paginas.map((_, indice) => `${idDaPagina(indice)} 0 R`).join(' ')
  objetos.push(Buffer.from(`<< /Type /Pages /Kids [${filhos}] /Count ${paginas.length} /MediaBox [0 0 595 842] >>`, 'latin1'))

  paginas.forEach((celulas, indice) => {
    const fluxo = fluxoDaPagina(celulas)
    objetos.push(Buffer.from(
      `<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 ${3 + paginas.length * 2} 0 R >> >> /Contents ${idDoFluxo(indice)} 0 R >>`,
      'latin1'))
    objetos.push(Buffer.concat([
      Buffer.from(`<< /Length ${fluxo.length} >>\nstream\n`, 'latin1'),
      fluxo,
      Buffer.from('\nendstream', 'latin1'),
    ]))
  })

  objetos.push(Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>', 'latin1'))

  const pedacos: Buffer[] = [Buffer.from('%PDF-1.4\n', 'latin1')]
  const posicoes: number[] = []
  let deslocamento = '%PDF-1.4\n'.length

  objetos.forEach((corpo, indice) => {
    posicoes.push(deslocamento)
    const bloco = Buffer.concat([
      Buffer.from(`${indice + 1} 0 obj\n`, 'latin1'),
      corpo,
      Buffer.from('\nendobj\n', 'latin1'),
    ])
    pedacos.push(bloco)
    deslocamento += bloco.length
  })

  const total = objetos.length + 1
  const linhas = [`xref\n0 ${total}\n`, '0000000000 65535 f \n']
  for (const posicao of posicoes) linhas.push(`${String(posicao).padStart(10, '0')} 00000 n \n`)
  const tabela = Buffer.from(linhas.join(''), 'latin1')
  pedacos.push(tabela)
  pedacos.push(Buffer.from(`trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${deslocamento}\n%%EOF\n`, 'latin1'))

  return Buffer.concat(pedacos)
}

const CLASSES = ['Bebês', 'Iniciantes', 'Infantis', 'Primários', 'Pré-Adolescentes', 'Adolescentes', 'Jovens', 'Adultos', 'Classes Bíblicas', 'Filiais', 'Total']

interface DadosDaIgreja { nome: string; pequenosGrupos: string; campanhas: string; alunos: readonly string[] }

/** Reproduz o desenho do relatório: três páginas por igreja, cabeçalho repetido. */
export function relatorioIntegradoFicticio(trimestre: number, igrejas: readonly DadosDaIgreja[]): Buffer {
  const paginas: CelulaDoPdf[][] = []

  const escrever = (linhas: ReadonlyArray<readonly string[]>, numero: number) => {
    const celulas: CelulaDoPdf[] = []
    let y = 800
    for (const linha of linhas) {
      linha.forEach((texto, coluna) => celulas.push({ texto, x: coluna === 0 ? 20 : 300 + coluna * 24, y }))
      y -= 16
    }
    celulas.push({ texto: `PAGE: ${numero} of ${igrejas.length * 3}`, x: 460, y: 40 })
    paginas.push(celulas)
  }

  const distrito = 'Distrito Fictício do Relatório - Anpa'
  const titulo = 'RELATORIO INTEGRADO'
  const periodo = `${trimestre} Trimestre-2026`

  igrejas.forEach((igreja, indice) => {
    escrever([
      [distrito], [titulo], [periodo], [`${igreja.nome} - Anpa`],
      ['Escola Sabatina'],
      ['É realizada a Classe de Professores?', 'Sim'],
      ['Número de Pequenos Grupos da igreja.', igreja.pequenosGrupos],
      CLASSES,
      ['Número de alunos da Escola Sabatina.', ...igreja.alunos],
      ['Número de pessoas levadas ao batismo por influência da Unidade de ação/PG', '0', '0', '0', '0', '0', '1', '0', '1', '1', '1', '4'],
    ], indice * 3 + 1)

    escrever([
      [distrito], [titulo], [periodo],
      ['Secretaria'],
      ['Segundo Sábado', 'Sétimo Sábado'],
      ['Número de presentes na Escola Sabatina (todos os presentes inclusive os não batizados).', '20', '32'],
    ], indice * 3 + 2)

    escrever([
      [distrito], [titulo], [periodo],
      ['Evangelismo'],
      ['Número de Campanhas evangelísticas em geral.', igreja.campanhas],
      ['Número de Classes Bíblicas em funcionamento.', '-'],
    ], indice * 3 + 3)
  })

  return montarPdf(paginas)
}
