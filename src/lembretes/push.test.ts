import { describe, expect, it } from 'vitest'
import { chaveDaOcorrencia, ocorrenciasParaAvisar } from './push'
import type { LembreteEntity } from './types'

const FUSO = 'America/Belem'
const agora = new Date('2026-09-14T13:00:00Z') // 10:00 em Belém

function lembrete(parcial: Partial<LembreteEntity>): LembreteEntity {
  return {
    id: 'l1', titulo: 'Enviar o itinerário aos irmãos', observacao: '', listaId: null, data: '2026-09-20', hora: '09:00', fuso: FUSO,
    prioridade: 'normal', sinalizado: false, repeticao: null, notificar: true, relacionado: {}, estado: 'aberto', concluidoEm: null,
    ocorrencias: {}, createdAt: '', updatedAt: '', ...parcial,
  }
}

describe('ocorrências que recebem aviso', () => {
  it('só com notificação ligada, data, horário, em aberto e no futuro', () => {
    const lista = ocorrenciasParaAvisar([
      lembrete({ id: 'a' }),
      lembrete({ id: 'sem-aviso', notificar: false }),
      lembrete({ id: 'sem-hora', hora: '' }),
      lembrete({ id: 'passado', data: '2026-09-14', hora: '08:00' }),
      lembrete({ id: 'concluido', estado: 'concluido' }),
    ], agora, FUSO)
    expect(lista.map(({ lembreteId, instante }) => [lembreteId, instante.toISOString()])).toEqual([['a', '2026-09-20T12:00:00.000Z']])
  })

  it('série mensal: ocorrências abertas dos próximos 35 dias, sem as concluídas e com a alteração de uma só', () => {
    const lista = ocorrenciasParaAvisar([lembrete({
      id: 'itinerario', data: '2026-08-20', repeticao: { frequencia: 'mensal', intervalo: 1, diaDoMes: 20 },
      ocorrencias: { '2026-08-20': { estado: 'concluida' }, '2026-09-20': { alteracao: { hora: '07:30' } } },
    })], new Date('2026-09-14T13:00:00Z'), FUSO)
    expect(lista.map(({ ocorrencia, instante }) => [ocorrencia, instante.toISOString()])).toEqual([
      ['2026-09-20', '2026-09-20T10:30:00.000Z'],
    ])
  })
})

describe('chave opaca', () => {
  it('igual para a mesma ocorrência em qualquer aparelho, diferente quando o horário muda, sem o título', async () => {
    const chave = await crypto.subtle.importKey('raw', new Uint8Array(32).fill(7), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    const base = { lembreteId: 'l1', ocorrencia: '2026-09-20', instante: new Date('2026-09-20T12:00:00Z') }
    const primeira = await chaveDaOcorrencia(chave, base)
    expect(primeira).toMatch(/^[0-9a-f]{64}$/u)
    expect(await chaveDaOcorrencia(chave, { ...base })).toBe(primeira)
    expect(await chaveDaOcorrencia(chave, { ...base, instante: new Date('2026-09-20T13:00:00Z') })).not.toBe(primeira)
    expect(primeira).not.toContain('itinerario')
  })
})
