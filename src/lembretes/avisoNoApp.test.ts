import { afterEach, describe, expect, it } from 'vitest'
import { avisadosNesteAparelho, avisosQueVenceram, chaveDoAviso, marcarAvisados } from './avisoNoApp'
import type { LembreteEntity } from './types'

const FUSO = 'America/Belem'
// 14/09/2026 às 10:00 em Belém.
const AGORA = new Date('2026-09-14T13:00:00Z')
const ABERTO_DESDE = new Date('2026-09-14T12:50:00Z')

function lembrete(parcial: Partial<LembreteEntity>): LembreteEntity {
  return {
    id: 'l1', titulo: 'Enviar o itinerário aos irmãos', observacao: '', listaId: null, data: '2026-09-14', hora: '10:00', fuso: FUSO,
    prioridade: 'normal', sinalizado: false, repeticao: null, notificar: true, relacionado: {}, estado: 'aberto', concluidoEm: null,
    ocorrencias: {}, createdAt: '', updatedAt: '', ...parcial,
  }
}

describe('aviso dentro do aplicativo', () => {
  afterEach(() => localStorage.clear())

  it('avisa o que venceu com o aplicativo aberto; não o que venceu antes, o futuro, o concluído nem o sem aviso', () => {
    const avisos = avisosQueVenceram([
      lembrete({ id: 'agora' }),
      lembrete({ id: 'antes-de-abrir', hora: '09:40' }),
      lembrete({ id: 'futuro', hora: '10:30' }),
      lembrete({ id: 'concluido', estado: 'concluido' }),
      lembrete({ id: 'sem-aviso', notificar: false }),
    ], ABERTO_DESDE, AGORA, FUSO, new Set())
    expect(avisos.map(({ lembreteId, titulo }) => [lembreteId, titulo])).toEqual([['agora', 'Enviar o itinerário aos irmãos']])
  })

  it('uma vez por ocorrência: marcado, não volta; mudar o horário avisa de novo', () => {
    const lista = [lembrete({})]
    const [primeiro] = avisosQueVenceram(lista, ABERTO_DESDE, AGORA, FUSO, new Set())
    marcarAvisados('conta', [primeiro!.chave])
    expect(avisosQueVenceram(lista, ABERTO_DESDE, AGORA, FUSO, avisadosNesteAparelho('conta'))).toEqual([])
    expect(avisosQueVenceram([lembrete({ hora: '09:55' })], ABERTO_DESDE, AGORA, FUSO, avisadosNesteAparelho('conta'))).toHaveLength(1)
    expect(avisadosNesteAparelho('outra-conta').size).toBe(0)
  })

  it('série: avisa só a ocorrência de hoje, com o título alterado dela, e nunca a ocorrência já concluída', () => {
    const serie = lembrete({ id: 'relatorio', titulo: 'Fazer o relatório mensal', data: '2026-08-14', repeticao: { frequencia: 'mensal', intervalo: 1, diaDoMes: 14 }, ocorrencias: { '2026-09-14': { alteracao: { titulo: 'Relatório de setembro' } } } })
    const [aviso] = avisosQueVenceram([serie], ABERTO_DESDE, AGORA, FUSO, new Set())
    expect(aviso).toMatchObject({ ocorrencia: '2026-09-14', titulo: 'Relatório de setembro' })
    expect(aviso!.chave).toBe(chaveDoAviso({ lembreteId: 'relatorio', ocorrencia: '2026-09-14', instante: new Date('2026-09-14T13:00:00Z') }))
    const concluida = { ...serie, ocorrencias: { '2026-09-14': { estado: 'concluida' as const } } }
    expect(avisosQueVenceram([concluida], ABERTO_DESDE, AGORA, FUSO, new Set())).toEqual([])
  })

  it('calcular o aviso não altera o lembrete', () => {
    const original = lembrete({})
    const copia = structuredClone(original)
    avisosQueVenceram([original], ABERTO_DESDE, AGORA, FUSO, new Set())
    expect(original).toEqual(copia)
  })
})
