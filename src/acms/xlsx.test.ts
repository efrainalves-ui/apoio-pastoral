import { describe, expect, it } from 'vitest'
import { parseAcmsFile } from './parser'
import { ArquivoNaoReconhecidoError, readXlsx } from './xlsx'

/**
 * Um `.xlsx` fictício, montado aqui dentro.
 *
 * Um `.xlsx` é um ZIP com XML. Este construtor grava as entradas **sem
 * compactação** — método 0 do ZIP —, que é o suficiente para provar a leitura
 * sem depender de compressor. Nenhuma planilha real entra em teste, no
 * repositório ou na documentação: as igrejas abaixo não existem.
 */
function crc32(dados: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of dados) {
    crc ^= byte
    for (let volta = 0; volta < 8; volta += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  return (crc ^ 0xffffffff) >>> 0
}

function zipSemCompactacao(arquivos: Array<{ nome: string; conteudo: string }>): ArrayBuffer {
  const codificador = new TextEncoder()
  const partes: Uint8Array[] = []
  const central: Uint8Array[] = []
  let deslocamento = 0

  for (const { nome, conteudo } of arquivos) {
    const nomeBytes = codificador.encode(nome)
    const dados = codificador.encode(conteudo)
    const soma = crc32(dados)

    const local = new Uint8Array(30 + nomeBytes.length)
    const visaoLocal = new DataView(local.buffer)
    visaoLocal.setUint32(0, 0x04034b50, true)
    visaoLocal.setUint16(4, 20, true)
    visaoLocal.setUint16(8, 0, true)
    visaoLocal.setUint32(14, soma, true)
    visaoLocal.setUint32(18, dados.length, true)
    visaoLocal.setUint32(22, dados.length, true)
    visaoLocal.setUint16(26, nomeBytes.length, true)
    local.set(nomeBytes, 30)

    const entrada = new Uint8Array(46 + nomeBytes.length)
    const visaoEntrada = new DataView(entrada.buffer)
    visaoEntrada.setUint32(0, 0x02014b50, true)
    visaoEntrada.setUint16(4, 20, true)
    visaoEntrada.setUint16(6, 20, true)
    visaoEntrada.setUint16(10, 0, true)
    visaoEntrada.setUint32(16, soma, true)
    visaoEntrada.setUint32(20, dados.length, true)
    visaoEntrada.setUint32(24, dados.length, true)
    visaoEntrada.setUint16(28, nomeBytes.length, true)
    visaoEntrada.setUint32(42, deslocamento, true)
    entrada.set(nomeBytes, 46)

    partes.push(local, dados)
    central.push(entrada)
    deslocamento += local.length + dados.length
  }

  const tamanhoCentral = central.reduce((total, item) => total + item.length, 0)
  const fim = new Uint8Array(22)
  const visaoFim = new DataView(fim.buffer)
  visaoFim.setUint32(0, 0x06054b50, true)
  visaoFim.setUint16(8, arquivos.length, true)
  visaoFim.setUint16(10, arquivos.length, true)
  visaoFim.setUint32(12, tamanhoCentral, true)
  visaoFim.setUint32(16, deslocamento, true)

  const total = [...partes, ...central, fim].reduce((soma, item) => soma + item.length, 0)
  const saida = new Uint8Array(total)
  let posicao = 0
  for (const parte of [...partes, ...central, fim]) { saida.set(parte, posicao); posicao += parte.length }
  return saida.buffer
}

const workbook = `<?xml version="1.0" encoding="UTF-8"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheets><sheet name="Relatorio Ficticio" sheetId="1"/></sheets></workbook>`

const sharedStrings = `<?xml version="1.0" encoding="UTF-8"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="9" uniqueCount="9">
<si><t>Igreja</t></si><si><t>Escola Sabatina</t></si><si><t>Presença</t></si><si><t>Pequenos Grupos</t></si>
<si><t>Estudos bíblicos</t></si><si><t>Ponto estratégico 1</t></si>
<si><t>Central Fictícia</t></si><si><t>Grupo Fictício do Norte</t></si><si><t>Total</t></si></sst>`

const sheet = `<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>
<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="D1" t="s"><v>3</v></c><c r="E1" t="s"><v>4</v></c><c r="F1" t="s"><v>5</v></c></row>
<row r="2"><c r="A2" t="s"><v>6</v></c><c r="B2"><v>120</v></c><c r="C2"><v>95</v></c><c r="D2"><v>4</v></c><c r="E2"><v>18</v></c><c r="F2"><v>10</v></c></row>
<row r="3"><c r="A3" t="s"><v>7</v></c><c r="B3"><v>40</v></c><c r="C3"><v>31</v></c><c r="D3"><v>2</v></c><c r="E3"><v>6</v></c><c r="F3"><v>4</v></c></row>
<row r="4"><c r="A4" t="s"><v>8</v></c><c r="B4"><v>160</v></c><c r="C4"><v>126</v></c><c r="D4"><v>6</v></c><c r="E4"><v>24</v></c><c r="F4"><v>14</v></c></row>
</sheetData></worksheet>`

const planilhaFicticia = () => zipSemCompactacao([
  { nome: 'xl/workbook.xml', conteudo: workbook },
  { nome: 'xl/sharedStrings.xml', conteudo: sharedStrings },
  { nome: 'xl/worksheets/sheet1.xml', conteudo: sheet },
])

describe('leitor de .xlsx dentro do aparelho', () => {
  it('abre a planilha e devolve as células como texto', async () => {
    const abas = await readXlsx(planilhaFicticia())

    expect(abas).toHaveLength(1)
    expect(abas[0]?.nome).toBe('Relatorio Ficticio')
    expect(abas[0]?.linhas[0]).toEqual(['Igreja', 'Escola Sabatina', 'Presença', 'Pequenos Grupos', 'Estudos bíblicos', 'Ponto estratégico 1'])
    expect(abas[0]?.linhas[1]).toEqual(['Central Fictícia', '120', '95', '4', '18', '10'])
  })

  it('lê o relatório ACMS de ponta a ponta, do arquivo à prévia', async () => {
    const previa = await parseAcmsFile(planilhaFicticia())

    expect(previa.rows.map(({ churchName }) => churchName)).toEqual(['Central Fictícia', 'Grupo Fictício do Norte'])
    expect(previa.rows[0]?.indicators).toMatchObject({ sabbathSchool: 120, attendance: 95, smallGroups: 4, bibleStudies: 18 })
    expect(previa.rows[0]?.strategicPoints).toEqual([{ label: 'Ponto estratégico 1', value: 10 }])
  })

  it('recusa um arquivo que não é uma planilha', async () => {
    const qualquerCoisa = new TextEncoder().encode('isto não é um zip').buffer

    await expect(readXlsx(qualquerCoisa)).rejects.toBeInstanceOf(ArquivoNaoReconhecidoError)
    await expect(parseAcmsFile(qualquerCoisa)).rejects.toThrow(/não é uma planilha/u)
  })

  it('recusa um zip sem nenhuma aba', async () => {
    const semAba = zipSemCompactacao([{ nome: 'xl/workbook.xml', conteudo: workbook }])

    await expect(readXlsx(semAba)).rejects.toThrow(/nenhuma aba legível/u)
  })
})
