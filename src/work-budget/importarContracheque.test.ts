import { describe, expect, it } from 'vitest'
import { emCentavos } from '../family-budget/dinheiro'
import { totaisDoContracheque } from './contracheque'
import { competenciaDoTexto, conferirComODeclarado, interpretarContracheque } from './importarContracheque'

/*
  Contracheque fictício, escrito para o teste. Nenhum documento real de nenhum
  obreiro entra no repositório — nem como fixture, nem como exemplo.
*/
const FICTICIO = `
DEMONSTRATIVO DE PAGAMENTO
Competência: SETEMBRO/2026

PROVENTOS
0001 SUBSISTENCIA BASICA 5.600,00
0015 AUXILIO COMBUSTIVEL 400,00
0032 QUOTA PAIS 5,00 280,00

DESCONTOS
0101 PREVIDENCIA 11,00 616,00
0120 EMPRESTIMO 150,00

TOTAL DE PROVENTOS 6.280,00
TOTAL DE DESCONTOS 766,00
LIQUIDO A RECEBER 5.514,00

OUTRAS BASES INFORMATIVAS
0900 BASE DA PREVIDENCIA 5.600,00
`

describe('leitura do contracheque', () => {
  const leitura = interpretarContracheque(FICTICIO)

  it('encontra as rubricas e não confunde total com rubrica', () => {
    expect(leitura.rubricas.map(({ codigo }) => codigo)).toEqual(['0001', '0015', '0032', '0101', '0120', '0900'])
  })

  /*
    Somar as linhas de total junto das rubricas dobraria o contracheque — e é um
    erro que passa despercebido porque o número "parece certo": ele é, de fato,
    a soma das linhas que já estão ali.
  */
  it('os totais declarados ficam à parte das rubricas', () => {
    expect(leitura.totaisDeclarados.map(({ valor }) => valor)).toEqual([
      emCentavos(6280), emCentavos(766), emCentavos(5514),
    ])
  })

  it('o título da seção decide o tipo das linhas seguintes', () => {
    const porCodigo = new Map(leitura.rubricas.map((rubrica) => [rubrica.codigo, rubrica.tipo]))
    expect(porCodigo.get('0001')).toBe('provento')
    expect(porCodigo.get('0101')).toBe('desconto')
    expect(porCodigo.get('0900')).toBe('informativa')
  })

  /*
    O contracheque traz a referência antes do valor — percentual, dias. Tomar o
    primeiro número da linha traria a referência no lugar do dinheiro.
  */
  it('o valor é o último da linha, não a referência', () => {
    const quota = leitura.rubricas.find(({ codigo }) => codigo === '0032')
    expect(quota?.valor).toBe(emCentavos(280))
    const previdencia = leitura.rubricas.find(({ codigo }) => codigo === '0101')
    expect(previdencia?.valor).toBe(emCentavos(616))
  })

  it('separa código e descrição', () => {
    expect(leitura.rubricas[0]).toMatchObject({ codigo: '0001', descricao: 'SUBSISTENCIA BASICA' })
  })

  it('guarda a linha de origem para a conferência', () => {
    expect(leitura.rubricas[0]?.origem).toContain('5.600,00')
  })

  /*
    A base informativa é lida como informativa e, por isso, fica fora do líquido
    — a mesma regra que vale para a entrada manual.
  */
  it('a base informativa não entra no líquido', () => {
    const totais = totaisDoContracheque(leitura.rubricas)
    expect(totais.proventos).toBe(emCentavos(6280))
    expect(totais.descontos).toBe(emCentavos(766))
    expect(totais.liquido).toBe(emCentavos(5514))
    expect(totais.basesInformativas).toBe(emCentavos(5600))
  })
})

describe('competência', () => {
  it('lê o mês escrito por extenso', () => {
    expect(competenciaDoTexto('Competência: SETEMBRO/2026')).toBe('2026-09')
    expect(competenciaDoTexto('Referente a março de 2026')).toBe('2026-03')
  })

  it('lê o mês em número', () => {
    expect(competenciaDoTexto('COMPETENCIA 08/2026')).toBe('2026-08')
  })

  /*
    Nulo é melhor do que o mês de hoje: um contracheque de agosto importado em
    setembro entraria no mês errado e dobraria a renda de um enquanto zerava a
    do outro.
  */
  it('não inventa competência quando o documento não diz', () => {
    expect(competenciaDoTexto('DEMONSTRATIVO DE PAGAMENTO')).toBeNull()
  })
})

describe('conferência contra o declarado', () => {
  it('sem divergência quando as somas batem', () => {
    const leitura = interpretarContracheque(FICTICIO)
    expect(conferirComODeclarado(leitura.rubricas, leitura.totaisDeclarados)).toEqual([])
  })

  /*
    Divergência não acusa a instituição nem a leitura: diz que alguém precisa
    olhar. É exatamente o que uma importação sem conferência deixaria passar.
  */
  it('aponta quando a soma não bate com o total do papel', () => {
    const leitura = interpretarContracheque(FICTICIO)
    const semUma = leitura.rubricas.filter(({ codigo }) => codigo !== '0015')
    const achados = conferirComODeclarado(semUma, leitura.totaisDeclarados)
    expect(achados.length).toBeGreaterThan(0)
    expect(achados.join(' ')).toContain('PROVENTOS')
  })
})

describe('texto que não é contracheque', () => {
  it('não inventa rubrica onde não há valor', () => {
    expect(interpretarContracheque('Uma folha qualquer\nsem número nenhum').rubricas).toEqual([])
  })

  it('linha com valor mas sem descrição fica de fora, e é listada', () => {
    const leitura = interpretarContracheque('PROVENTOS\n0001 5.600,00\n')
    expect(leitura.rubricas).toEqual([])
    expect(leitura.ignoradas).toHaveLength(1)
  })

  it('texto vazio não quebra', () => {
    expect(interpretarContracheque('')).toMatchObject({ rubricas: [], competencia: null, totaisDeclarados: [] })
  })
})
