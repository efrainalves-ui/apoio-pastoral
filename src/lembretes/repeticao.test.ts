import { describe, expect, it } from 'vitest'
import { ocorrenciaAberta, ocorrenciasEntre, proximaOcorrencia, textoDaRepeticao } from './repeticao'
import { dataNoFuso, horaNoFuso, instanteNoFuso, somarDias } from './tempo'
import type { RegraDeRepeticao } from './types'

const mensal = (diaDoMes: number, extra: Partial<RegraDeRepeticao> = {}): RegraDeRepeticao => ({ frequencia: 'mensal', intervalo: 1, diaDoMes, ...extra })

describe('rotinas mensais reais', () => {
  it('relatório todo dia 5 e itinerário todo dia 20: as próximas ocorrências certas', () => {
    expect(ocorrenciasEntre(mensal(5), '2026-09-05', '2026-09-01', '2027-01-31')).toEqual(['2026-09-05', '2026-10-05', '2026-11-05', '2026-12-05', '2027-01-05'])
    expect(ocorrenciasEntre(mensal(20), '2026-09-20', '2026-09-21', '2026-12-31')).toEqual(['2026-10-20', '2026-11-20', '2026-12-20'])
    expect(textoDaRepeticao(mensal(5), '2026-09-05')).toBe('Todo mês, no dia 5')
  })

  it('dia 31, 30 e 29: mês que não tem o dia usa o último dia válido, sem perder o dia nos meses seguintes', () => {
    expect(ocorrenciasEntre(mensal(31), '2027-01-31', '2027-01-01', '2027-05-31')).toEqual(['2027-01-31', '2027-02-28', '2027-03-31', '2027-04-30', '2027-05-31'])
    expect(ocorrenciasEntre(mensal(30), '2028-01-30', '2028-02-01', '2028-03-31')).toEqual(['2028-02-29', '2028-03-30'])
    expect(ocorrenciasEntre(mensal(29), '2027-01-29', '2027-02-01', '2027-03-31')).toEqual(['2027-02-28', '2027-03-29'])
  })

  it('virada de ano e intervalo de meses', () => {
    expect(ocorrenciasEntre(mensal(5, { intervalo: 2 }), '2026-11-05', '2026-11-01', '2027-05-31')).toEqual(['2026-11-05', '2027-01-05', '2027-03-05', '2027-05-05'])
  })

  it('respeita o fim da série', () => {
    expect(proximaOcorrencia(mensal(5, { ate: '2026-10-31' }), '2026-09-05', '2026-10-06')).toBeNull()
  })
})

describe('outras frequências', () => {
  it('diária e a cada 3 dias, atravessando o mês', () => {
    expect(ocorrenciasEntre({ frequencia: 'diaria', intervalo: 1 }, '2026-09-29', '2026-09-29', '2026-10-02')).toEqual(['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02'])
    expect(proximaOcorrencia({ frequencia: 'diaria', intervalo: 3 }, '2026-09-01', '2026-09-05')).toBe('2026-09-07')
  })

  it('semanal em vários dias e a cada duas semanas', () => {
    const regra: RegraDeRepeticao = { frequencia: 'semanal', intervalo: 1, diasDaSemana: [2, 5] }
    expect(ocorrenciasEntre(regra, '2026-09-15', '2026-09-15', '2026-09-26')).toEqual(['2026-09-15', '2026-09-18', '2026-09-22', '2026-09-25'])
    expect(ocorrenciasEntre({ frequencia: 'semanal', intervalo: 2 }, '2026-09-14', '2026-09-14', '2026-10-13')).toEqual(['2026-09-14', '2026-09-28', '2026-10-12'])
  })

  it('anual em 29 de fevereiro cai no dia 28 dos anos comuns', () => {
    expect(ocorrenciasEntre({ frequencia: 'anual', intervalo: 1 }, '2028-02-29', '2028-01-01', '2030-12-31')).toEqual(['2028-02-29', '2029-02-28', '2030-02-28'])
  })
})

describe('uma ocorrência aberta por vez', () => {
  const serie = { repeticao: mensal(5), data: '2026-09-05', ocorrencias: {} as Record<string, { estado?: 'concluida' | 'pulada' }> }

  it('concluir a ocorrência calcula a próxima, sem tocar nas anteriores e sem duplicar', () => {
    expect(ocorrenciaAberta(serie)).toBe('2026-09-05')
    const depois = { ...serie, ocorrencias: { '2026-09-05': { estado: 'concluida' as const } } }
    expect(ocorrenciaAberta(depois)).toBe('2026-10-05')
    // Concluir de novo a mesma data (dois aparelhos) dá o mesmo resultado.
    expect(ocorrenciaAberta({ ...depois, ocorrencias: { ...depois.ocorrencias, '2026-09-05': { estado: 'concluida' as const } } })).toBe('2026-10-05')
  })

  it('pular uma ocorrência também avança', () => {
    expect(ocorrenciaAberta({ ...serie, ocorrencias: { '2026-09-05': { estado: 'pulada' }, '2026-10-05': { estado: 'concluida' } } })).toBe('2026-11-05')
  })
})

describe('fusos, meia-noite e horário de verão', () => {
  it('Belém: 08:00 do dia 5 é 11:00 UTC, e a data não escorrega', () => {
    const instante = instanteNoFuso('2026-10-05', '08:00', 'America/Belem')
    expect(instante.toISOString()).toBe('2026-10-05T11:00:00.000Z')
    expect(dataNoFuso(instante, 'America/Belem')).toBe('2026-10-05')
    expect(horaNoFuso(instante, 'America/Belem')).toBe('08:00')
  })

  it('perto da meia-noite: 23:30 em Belém já é o dia seguinte em UTC, mas continua o mesmo dia no fuso', () => {
    const instante = instanteNoFuso('2026-12-31', '23:30', 'America/Belem')
    expect(instante.toISOString()).toBe('2027-01-01T02:30:00.000Z')
    expect(dataNoFuso(instante, 'America/Belem')).toBe('2026-12-31')
  })

  it('Nova York: 08:00 antes e depois da mudança de horário continua às 08:00 locais', () => {
    expect(instanteNoFuso('2026-03-07', '08:00', 'America/New_York').toISOString()).toBe('2026-03-07T13:00:00.000Z')
    expect(instanteNoFuso('2026-03-09', '08:00', 'America/New_York').toISOString()).toBe('2026-03-09T12:00:00.000Z')
  })

  it('hora que não existe no início do horário de verão cai no instante seguinte válido', () => {
    const instante = instanteNoFuso('2026-03-08', '02:30', 'America/New_York')
    expect(horaNoFuso(instante, 'America/New_York')).toBe('03:30')
  })

  it('Lisboa e Tóquio: fusos diferentes, mesma hora de parede', () => {
    expect(horaNoFuso(instanteNoFuso('2026-07-01', '09:00', 'Europe/Lisbon'), 'Europe/Lisbon')).toBe('09:00')
    expect(dataNoFuso(instanteNoFuso('2026-07-01', '00:15', 'Asia/Tokyo'), 'Asia/Tokyo')).toBe('2026-07-01')
  })

  it('somar dias atravessa mês e ano', () => {
    expect(somarDias('2026-12-31', 1)).toBe('2027-01-01')
    expect(somarDias('2028-03-01', -1)).toBe('2028-02-29')
  })
})
