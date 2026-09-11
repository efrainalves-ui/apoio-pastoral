import { describe, expect, it } from 'vitest'
import { lerOAntigo, type RegistrosAntigos } from './adaptador'
import { emCentavos } from './dinheiro'
import { aindaLegados, planoDeMigracao, unir } from './migracao'

/* Registros fictícios. Nenhum lançamento real do pastor entra em teste. */
const registros: RegistrosAntigos = {
  incomes: [{
    id: 'entrada-1', category: 'salary', description: 'Salário fictício', amount: 5600,
    date: '2026-08-05', notes: '', createdAt: '2026-08-05T00:00:00.000Z', updatedAt: '2026-08-05T00:00:00.000Z',
  }],
  expenses: [{
    id: 'saida-1', category: 'food', description: 'Mercado fictício', amount: 320.5,
    date: '2026-08-10', status: 'paid', fixed: false, installment: false, installmentsTotal: 0,
    installmentNumber: 0, recurrenceId: null, notes: '',
    createdAt: '2026-08-10T00:00:00.000Z', updatedAt: '2026-08-10T00:00:00.000Z',
  }],
  bills: [{
    id: 'conta-1', name: 'Energia fictícia', category: 'utilities', amount: 180,
    dueDate: '2026-08-15', status: 'pending', recurring: true, notes: '',
    createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z',
  }],
} as unknown as RegistrosAntigos

describe('plano de migração', () => {
  it('leva tudo que existe, no formato novo', () => {
    const plano = planoDeMigracao(registros, new Set())
    expect(plano.total).toBe(3)
    expect(plano.jaMigrados).toBe(0)
    expect(plano.paraGravar).toHaveLength(3)
    expect(plano.paraGravar.find(({ id }) => id === 'entrada-1')).toMatchObject({
      natureza: 'entrada', valor: emCentavos(5600), situacao: 'recebida',
    })
  })

  /*
    O identificador é o mesmo do registro antigo. Rodar de novo reescreve o
    mesmo lançamento em vez de criar um segundo, e uma migração interrompida no
    meio não deixa rastro duplicado.
  */
  it('o que já migrou não volta a ser gravado', () => {
    const plano = planoDeMigracao(registros, new Set(['entrada-1', 'conta-1']))
    expect(plano.paraGravar.map(({ id }) => id)).toEqual(['saida-1'])
    expect(plano.jaMigrados).toBe(2)
    expect(plano.total).toBe(3)
  })

  it('rodar com tudo migrado não grava nada', () => {
    const plano = planoDeMigracao(registros, new Set(['entrada-1', 'saida-1', 'conta-1']))
    expect(plano.paraGravar).toEqual([])
    expect(plano.jaMigrados).toBe(3)
  })

  it('o lançamento gravado não carrega a marca de legado', () => {
    const [primeiro] = planoDeMigracao(registros, new Set()).paraGravar
    expect(primeiro).not.toHaveProperty('legado')
  })
})

describe('leitura depois da migração', () => {
  /*
    Sem tirar o migrado da leitura antiga, cada lançamento apareceria duas vezes
    e o mês fecharia com o dobro do que aconteceu.
  */
  it('o migrado some do caminho antigo', () => {
    const legados = lerOAntigo(registros)
    expect(aindaLegados(legados, new Set(['entrada-1'])).map(({ id }) => id)).toEqual(['saida-1', 'conta-1'])
  })

  it('nada migrado, nada muda', () => {
    expect(aindaLegados(lerOAntigo(registros), new Set())).toHaveLength(3)
  })
})

describe('juntar os dois formatos', () => {
  it('o formato novo vence quando o identificador existe nos dois', () => {
    const legados = lerOAntigo(registros)
    const novo = { ...planoDeMigracao(registros, new Set()).paraGravar[0]!, descricao: 'Editado depois de migrar' }
    const juntos = unir([novo], legados)
    expect(juntos).toHaveLength(3)
    expect(juntos.find(({ id }) => id === novo.id)).toMatchObject({ descricao: 'Editado depois de migrar' })
  })

  it('sem nada migrado, tudo vem do lado antigo', () => {
    expect(unir([], lerOAntigo(registros))).toHaveLength(3)
  })
})
