import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  anoDaCampanha, campanhasEmAndamento, campanhasSemData, hojeLocal, mesesDaCampanha, periodoCurto, proximasCampanhas, situacaoDaCampanha, textoDoPeriodo, totaisPorSituacao,
} from './periodo'
import type { EvangelismCampaignEntity } from './types'

type Campanha = Pick<EvangelismCampaignEntity, 'startDate' | 'endDate' | 'status' | 'name'> & Partial<Pick<EvangelismCampaignEntity, 'origemRelatorio'>>
const campanha = (partes: Partial<Campanha>): Campanha => ({ name: 'Campanha Fictícia', startDate: '', endDate: '', status: 'planning', ...partes })

// O dia de hoje é sempre passado aos cálculos; aqui ele é simulado.
const HOJE = '2026-09-15'
const PRIMAVERA = campanha({ name: 'Primavera Fictícia', startDate: '2026-09-11', endDate: '2026-09-20' })
const COLHEITA = campanha({ name: 'Colheita Fictícia', startDate: '2026-09-13', endDate: '2026-09-19', status: 'happening' })
const FUTURA = campanha({ name: 'Futura Fictícia', startDate: '2026-10-04', endDate: '2026-10-10' })
const ENCERRADA = campanha({ name: 'Encerrada Fictícia', startDate: '2026-04-01', endDate: '2026-04-05', status: 'preparing' })
const SEM_DATA = campanha({ name: 'Sem Data Fictícia', status: 'completed', origemRelatorio: { relatorioId: 'r', churchId: 'c', trimestre: '2026-1', indice: 1 } })

describe('situação da campanha pelo período', () => {
  it('campanha com início e fim: próxima antes, em andamento nos dois extremos, encerrada depois', () => {
    expect(situacaoDaCampanha(PRIMAVERA, '2026-09-10')).toBe('proxima')
    expect(situacaoDaCampanha(PRIMAVERA, '2026-09-11')).toBe('em_andamento')
    expect(situacaoDaCampanha(PRIMAVERA, HOJE)).toBe('em_andamento')
    expect(situacaoDaCampanha(PRIMAVERA, '2026-09-20')).toBe('em_andamento')
    expect(situacaoDaCampanha(PRIMAVERA, '2026-09-21')).toBe('encerrada')
  })

  it('etapas de organização não decidem nada; só a conclusão ou o cancelamento confirmados valem acima das datas', () => {
    for (const status of ['planning', 'preparing', 'happening'] as const) expect(situacaoDaCampanha({ ...PRIMAVERA, status }, HOJE)).toBe('em_andamento')
    expect(situacaoDaCampanha({ ...FUTURA, status: 'happening' }, HOJE)).toBe('proxima')
    expect(situacaoDaCampanha(ENCERRADA, HOJE)).toBe('encerrada')
    expect(situacaoDaCampanha({ ...PRIMAVERA, status: 'completed' }, HOJE)).toBe('concluida')
    expect(situacaoDaCampanha({ ...PRIMAVERA, status: 'cancelled' }, HOJE)).toBe('cancelada')
  })

  it('totais contam cada campanha pela mesma regra dos cartões e do filtro', () => {
    const todas = [PRIMAVERA, COLHEITA, FUTURA, ENCERRADA, SEM_DATA, { ...ENCERRADA, status: 'completed' as const }]
    const totais = totaisPorSituacao(todas, HOJE)
    expect(totais).toEqual({ em_andamento: 2, proxima: 1, encerrada: 1, concluida: 1, cancelada: 0, sem_data: 1 })
    for (const [situacao, total] of Object.entries(totais)) expect(todas.filter((item) => situacaoDaCampanha(item, HOJE) === situacao)).toHaveLength(total)
  })

  it('campanha futura e campanha sem data', () => {
    expect(situacaoDaCampanha(FUTURA, HOJE)).toBe('proxima')
    expect(situacaoDaCampanha(SEM_DATA, HOJE)).toBe('sem_data')
  })

  it('sem término, termina no dia em que começou — e nunca em 31 de dezembro', () => {
    const umDia = campanha({ startDate: '2026-09-15' })
    expect(situacaoDaCampanha(umDia, HOJE)).toBe('em_andamento')
    expect(situacaoDaCampanha(umDia, '2026-09-16')).toBe('encerrada')
    expect(mesesDaCampanha(umDia, 2026)).toEqual([9])
  })
})

describe('em andamento e próximos eventos', () => {
  const todas = [FUTURA, SEM_DATA, ENCERRADA, PRIMAVERA, COLHEITA, campanha({ name: 'Mais Distante', startDate: '2026-11-01', endDate: '2026-11-02' })]

  it('Primavera e Colheita estão em andamento, e não entre os próximos', () => {
    expect(campanhasEmAndamento(todas, HOJE).map(({ name }) => name)).toEqual(['Colheita Fictícia', 'Primavera Fictícia'])
    expect(proximasCampanhas(todas, HOJE).map(({ name }) => name)).toEqual(['Futura Fictícia', 'Mais Distante'])
  })

  it('sem data fica numa lista própria', () => {
    expect(campanhasSemData(todas).map(({ name }) => name)).toEqual(['Sem Data Fictícia'])
  })
})

describe('datas na tela', () => {
  it('período curto', () => {
    expect(periodoCurto('2026-09-11', '2026-09-20')).toBe('11–20 de set.')
    expect(periodoCurto('2026-09-13', '2026-09-19')).toBe('13–19 de set.')
    expect(periodoCurto('2026-09-28', '2026-10-03')).toBe('28 de set.–3 de out.')
    expect(periodoCurto('2026-12-28', '2027-01-02')).toBe('28 de dez. de 2026–2 de jan. de 2027')
    expect(periodoCurto('2026-09-13', '2026-09-13')).toBe('13 de set.')
  })

  it('só com trimestre: data não informada, sem inventar dia', () => {
    expect(textoDoPeriodo(SEM_DATA)).toBe('Data não informada · 1º trimestre de 2026')
    expect(textoDoPeriodo(campanha({}))).toBe('Data não informada')
    expect(anoDaCampanha(SEM_DATA)).toBe(2026)
    expect(mesesDaCampanha(SEM_DATA, 2026)).toEqual([])
  })

  it('campanha inteira em setembro fica só em setembro; a que atravessa o mês aparece nos dois', () => {
    expect(mesesDaCampanha(PRIMAVERA, 2026)).toEqual([9])
    expect(mesesDaCampanha(campanha({ startDate: '2026-09-28', endDate: '2026-10-03' }), 2026)).toEqual([9, 10])
    expect(mesesDaCampanha(campanha({ startDate: '2026-12-28', endDate: '2027-01-02' }), 2027)).toEqual([1])
  })
})

describe('fuso horário e virada do dia', () => {
  afterEach(() => { vi.unstubAllEnvs() })

  it('às 23h30 de 15/09 em Brasília ainda é dia 15, embora em UTC já seja 16', () => {
    vi.stubEnv('TZ', 'America/Sao_Paulo')
    const quaseMeiaNoite = new Date('2026-09-16T02:30:00Z')
    expect(hojeLocal(quaseMeiaNoite)).toBe('2026-09-15')
    expect(situacaoDaCampanha(campanha({ startDate: '2026-09-16', endDate: '2026-09-18' }), hojeLocal(quaseMeiaNoite))).toBe('proxima')
    expect(situacaoDaCampanha(campanha({ startDate: '2026-09-10', endDate: '2026-09-15' }), hojeLocal(quaseMeiaNoite))).toBe('em_andamento')
  })

  it('à meia-noite local o dia vira, e a situação acompanha', () => {
    vi.stubEnv('TZ', 'America/Sao_Paulo')
    const meiaNoite = new Date('2026-09-16T03:00:00Z')
    expect(hojeLocal(meiaNoite)).toBe('2026-09-16')
    expect(situacaoDaCampanha(campanha({ startDate: '2026-09-16', endDate: '2026-09-18' }), hojeLocal(meiaNoite))).toBe('em_andamento')
    expect(situacaoDaCampanha(campanha({ startDate: '2026-09-10', endDate: '2026-09-15' }), hojeLocal(meiaNoite))).toBe('encerrada')
  })

  it('em outro fuso, o mesmo instante é outro dia', () => {
    vi.stubEnv('TZ', 'Asia/Tokyo')
    expect(hojeLocal(new Date('2026-09-15T16:00:00Z'))).toBe('2026-09-16')
  })
})
