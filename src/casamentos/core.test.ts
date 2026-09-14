import { describe, expect, it } from 'vitest'
import {
  ORIENTACOES_AOS_NOIVOS, casamentoVazio, cursoComResposta, etapaSugerida, idDoCasamentoDoCompromisso, itensDaPreparacao,
  normalizarCasamento, pedidoComPoucaAntecedencia, pendencias, possiveisDuplicados, respostaDoCurso, situacaoGeral,
  textoDaRecomendacao, tituloDaCerimonia, validarCasamento,
} from './core'
import { PERGUNTAS_DA_ENTREVISTA, type CasamentoData, type NoivoDoCasamento } from './types'

const noivo = (nome: string, personId: string | null = null): NoivoDoCasamento => ({ personId, nome, igrejaId: null, igrejaNome: '' })
const casamento = (mudancas: Partial<CasamentoData> = {}): CasamentoData => ({ ...casamentoVazio('casamentos'), noiva: noivo('Ana Fictícia'), noivo: noivo('Bruno Fictício'), ...mudancas })

describe('duplicados', () => {
  const existentes = [
    { id: 'c1', ...casamento() },
    { id: 'c2', ...casamento({ noiva: noivo('Carla Fictícia', 'p-carla'), noivo: noivo('Davi Fictício') }) },
  ]

  it('acha pelos dois nomes, sem ligar para acento e maiúscula', () => {
    expect(possiveisDuplicados({ noiva: noivo('ana ficticia'), noivo: noivo('BRUNO  FICTÍCIO') }, existentes).map(({ id }) => id)).toEqual(['c1'])
  })

  it('acha pelo mesmo cadastro de pessoa, mesmo com nome diferente', () => {
    expect(possiveisDuplicados({ noiva: noivo('Carla', 'p-carla'), noivo: noivo('Outro') }, existentes).map(({ id }) => id)).toEqual(['c2'])
  })

  it('um nome só igual não basta, e o próprio registro não conta', () => {
    expect(possiveisDuplicados({ noiva: noivo('Ana Fictícia'), noivo: noivo('Outro Fictício') }, existentes)).toEqual([])
    expect(possiveisDuplicados(casamento(), existentes, 'c1')).toEqual([])
  })
})

describe('curso de noivos e a quinta pergunta', () => {
  const curso = casamentoVazio('casamentos').curso

  it('sem registro do curso a resposta é Pendente', () => {
    expect(respostaDoCurso(curso)).toBeNull()
  })

  it('responder Sim conclui o curso e guarda a data; a resposta passa a ser Sim', () => {
    const concluido = cursoComResposta(curso, 'sim', '2026-10-01')
    expect(concluido).toMatchObject({ situacao: 'concluido', dataConclusao: '2026-10-01' })
    expect(respostaDoCurso(concluido)).toBe('sim')
  })

  it('responder Não desfaz a conclusão sem inventar que nunca começou', () => {
    const concluido = { ...curso, situacao: 'concluido' as const, dataConclusao: '2026-10-01' }
    expect(cursoComResposta(concluido, 'nao', '2026-10-02')).toMatchObject({ situacao: 'em_andamento', dataConclusao: '' })
    expect(cursoComResposta({ ...curso, situacao: 'em_andamento' }, 'nao', '2026-10-02').situacao).toBe('em_andamento')
    expect(respostaDoCurso({ ...curso, situacao: 'nao_iniciado' })).toBe('nao')
  })

  it('a entrevista tem as cinco perguntas, sem campo de comentários', () => {
    expect(PERGUNTAS_DA_ENTREVISTA.map(({ titulo }) => titulo)).toEqual([
      'Vestuário e apresentação pessoal', 'Princípios da Igreja', 'Recepção e princípios de saúde', 'Ornamentação da igreja', 'Curso de noivos',
    ])
  })
})

describe('antecedência', () => {
  it('menos de três meses entre o pedido e a data só avisa', () => {
    expect(pedidoComPoucaAntecedencia(casamento({ dataSolicitacao: '2026-09-14', dataPretendida: '2026-11-30' }))).toBe(true)
    expect(pedidoComPoucaAntecedencia(casamento({ dataSolicitacao: '2026-09-14', dataPretendida: '2026-12-14' }))).toBe(false)
  })

  it('sem data de pedido usa o primeiro contato; sem data nenhuma não avisa', () => {
    expect(pedidoComPoucaAntecedencia(casamento({ primeiroContato: '2026-09-14', cerimonia: { data: '2026-10-01', inicio: '', fim: '', igrejaId: null, local: '' } }))).toBe(true)
    expect(pedidoComPoucaAntecedencia(casamento())).toBe(false)
  })
})

describe('checklist, pendências e etapa', () => {
  it('itens com lugar próprio são lidos de lá; carta sem necessidade não se aplica', () => {
    const itens = itensDaPreparacao(casamento({
      entrevistas: [{ id: 'e1', data: '2026-09-20', realizadaPor: 'Pastor Fictício', respostas: { vestuario: 'sim', principios: null, recepcao: null, ornamentacao: null }, cursoNaData: null, visitaId: null, registradaEm: '' }],
      comissao: { ...casamentoVazio('casamentos').comissao, precisaCarta: false },
    }))
    expect(itens).toHaveLength(12)
    expect(itens.find(({ id }) => id === 'entrevista')).toMatchObject({ situacao: 'concluido', data: '2026-09-20', derivado: true })
    expect(itens.find(({ id }) => id === 'carta')?.situacao).toBe('nao_se_aplica')
    expect(itens.find(({ id }) => id === 'programa')).toMatchObject({ situacao: 'pendente', derivado: false })
  })

  it('cancelado ou realizado não mostra pendências', () => {
    expect(pendencias(casamento())).toContain('Entrevista pastoral realizada')
    expect(pendencias(casamento({ etapa: 'cancelado' }))).toEqual([])
  })

  it('a sugestão de etapa não muda a etapa gravada, e uma data sozinha não avança', () => {
    const comData = casamento({ dataPretendida: '2027-01-10', cerimonia: { data: '2027-01-10', inicio: '16:00', fim: '17:00', igrejaId: null, local: '' } })
    expect(etapaSugerida(comData, true)).toBe('aguardando_entrevista')
    expect(comData.etapa).toBe('primeiro_contato')
    expect(etapaSugerida(casamento({ etapa: 'cancelado' }), true)).toBe('cancelado')
  })

  it('situação geral', () => {
    expect(situacaoGeral(casamento(), false)).toBe('Com pendências')
    expect(situacaoGeral(casamento(), true)).toBe('Casamento agendado')
    expect(situacaoGeral(casamento({ etapa: 'realizado' }), true)).toBe('Realizado')
  })
})

describe('textos', () => {
  it('recomendação só com situação recomendada, igreja e data', () => {
    const recomendada = casamento({ comissao: { ...casamentoVazio('casamentos').comissao, situacao: 'recomendada', data: '2026-10-05' } })
    expect(textoDaRecomendacao(recomendada, 'Igreja Central Fictícia')).toBe('Recomendação feita pela Comissão da Igreja de Igreja Central Fictícia, em 05/10/2026.')
    expect(textoDaRecomendacao(recomendada, undefined)).toBeNull()
    expect(textoDaRecomendacao(casamento(), 'Igreja Central Fictícia')).toBeNull()
  })

  it('título gerado e validação do nome', () => {
    expect(tituloDaCerimonia(casamento())).toBe('Casamento de Ana Fictícia e Bruno Fictício')
    expect(() => validarCasamento({ noiva: noivo(' '), noivo: noivo('') })).toThrow('nome')
    expect(() => validarCasamento({ noiva: noivo('Ana'), noivo: noivo('') })).not.toThrow()
  })

  it('orientações: as catorze combinadas, sem taxas, votos ou marca de confidencial', () => {
    expect(ORIENTACOES_AOS_NOIVOS).toHaveLength(14)
    const tudo = ORIENTACOES_AOS_NOIVOS.join(' ').toLocaleLowerCase('pt-BR')
    for (const proibido of ['taxa', 'confidencial', 'divórcio', 'comentários']) expect(tudo).not.toContain(proibido)
  })
})

describe('registro antigo e identificador derivado', () => {
  it('normaliza campos ausentes sem trocar os presentes', () => {
    const antigo = normalizarCasamento({ noiva: noivo('Ana Fictícia'), etapa: 'agendado' })
    expect(antigo.etapa).toBe('agendado')
    expect(antigo.curso.situacao).toBeNull()
    expect(antigo.localPretendido).toBe('')
  })

  it('o mesmo compromisso sempre dá o mesmo identificador, no formato aceito', async () => {
    const a = await idDoCasamentoDoCompromisso('evento-1')
    expect(await idDoCasamentoDoCompromisso('evento-1')).toBe(a)
    expect(await idDoCasamentoDoCompromisso('evento-2')).not.toBe(a)
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })
})
