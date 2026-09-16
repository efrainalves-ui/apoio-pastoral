import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { generateMasterKey } from '../crypto/vault'
import { ApoioDatabase } from '../db/database'
import { PeopleService } from './service'
import { emptyPersonInput } from './types'

const CONTA = 'conta-ficticia-fidelidade'
const bancos: ApoioDatabase[] = []
afterEach(async () => { await Promise.all(bancos.splice(0).map((banco) => banco.delete())) })

async function abrir() {
  const banco = new ApoioDatabase(`fidelidade-${crypto.randomUUID()}`)
  bancos.push(banco)
  return { servico: new PeopleService(banco), chave: await generateMasterKey() }
}

const entrada = (name: string) => ({ ...emptyPersonInput(), name, currentChurchId: 'igreja-ficticia', birthDate: '1970-04-02' })

describe('confirmar dizimista à mão', () => {
  it('vira leitura de dizimista, com data e origem, sem tocar no resto do cadastro', async () => {
    const { servico, chave } = await abrir()
    const pessoa = await servico.createPerson(CONTA, chave, entrada('Ana Paula Fictícia'))
    expect(pessoa.fidelity).toBeNull()

    const confirmada = await servico.confirmarDizimista(CONTA, chave, pessoa.id, new Date('2026-09-16T12:00:00Z'))

    expect(confirmada.fidelity).toMatchObject({ category: 'tither', precision: 'category_only', source: 'Confirmação manual do pastor', referenceYear: 2026 })
    const registro = confirmada.history.at(-1)
    expect(registro).toMatchObject({ event: 'fidelity_updated', to: 'Dizimista', source: 'Confirmação manual do pastor' })
    expect(registro?.at).toBe('2026-09-16T12:00:00.000Z')
    // Nada mais da pessoa muda: nome, nascimento, igreja e renda ficam como estavam.
    expect(confirmada).toMatchObject({ name: 'Ana Paula Fictícia', birthDate: '1970-04-02', currentChurchId: 'igreja-ficticia', incomeStatus: 'unknown' })
    expect(confirmada.history.filter(({ event }) => event === 'created')).toHaveLength(1)
  })

  it('a leitura anterior desce para o histórico, e confirmar de novo não repete nada', async () => {
    const { servico, chave } = await abrir()
    const pessoa = await servico.createPerson(CONTA, chave, entrada('Bruno Fictício'))
    await servico.updateIncomeStatus(CONTA, chave, pessoa.id, 'has_income')

    const confirmada = await servico.confirmarDizimista(CONTA, chave, pessoa.id, new Date('2026-09-16T12:00:00Z'))
    expect(confirmada.incomeStatus).toBe('has_income')

    const denovo = await servico.confirmarDizimista(CONTA, chave, pessoa.id, new Date('2026-10-01T12:00:00Z'))
    expect(denovo.history.filter(({ event }) => event === 'fidelity_updated')).toHaveLength(1)
    expect(denovo.fidelity?.updatedAt).toBe(confirmada.fidelity?.updatedAt)
  })
})

describe('vincular cadastros da mesma pessoa', () => {
  it('os dois ficam no mesmo grupo, guardam o nome do outro e não perdem histórico', async () => {
    const { servico, chave } = await abrir()
    const certa = await servico.createPerson(CONTA, chave, entrada('Ana Paula Nascimento'))
    const digitada = await servico.createPerson(CONTA, chave, entrada('Ana Paula Nacimento'))
    await servico.confirmarDizimista(CONTA, chave, certa.id, new Date('2026-09-16T12:00:00Z'))

    const vinculados = await servico.vincularCadastros(CONTA, chave, [certa.id, digitada.id], new Date('2026-09-17T12:00:00Z'))

    const grupos = new Set(vinculados.map(({ linkedGroupId }) => linkedGroupId))
    expect(grupos.size).toBe(1)
    expect([...grupos][0]).toBeTruthy()
    expect(vinculados.find(({ id }) => id === certa.id)?.nameVariants).toEqual(['Ana Paula Nacimento'])
    expect(vinculados.find(({ id }) => id === digitada.id)?.nameVariants).toEqual(['Ana Paula Nascimento'])

    // Nada foi apagado, e cada histórico continua inteiro com a linha do vínculo.
    const guardados = await Promise.all([certa.id, digitada.id].map((id) => servico.getPerson(CONTA, chave, id)))
    expect(guardados.every(Boolean)).toBe(true)
    for (const pessoa of guardados) {
      expect(pessoa?.history.some(({ event }) => event === 'created')).toBe(true)
      expect(pessoa?.history.at(-1)).toMatchObject({ event: 'records_linked', source: 'Vínculo confirmado pelo pastor' })
    }
    // A leitura confirmada continua onde estava; o outro cadastro não a copiou.
    expect(guardados.find((pessoa) => pessoa?.id === certa.id)?.fidelity?.category).toBe('tither')
    expect(guardados.find((pessoa) => pessoa?.id === digitada.id)?.fidelity).toBeNull()
  })

  it('vincular um terceiro entra no grupo que já existe, e menos de dois é recusado', async () => {
    const { servico, chave } = await abrir()
    const primeira = await servico.createPerson(CONTA, chave, entrada('Maria Fictícia Souza'))
    const segunda = await servico.createPerson(CONTA, chave, entrada('Maria Fictícia de Souza'))
    const terceira = await servico.createPerson(CONTA, chave, entrada('Maria Ficticia Souza'))

    const [comGrupo] = await servico.vincularCadastros(CONTA, chave, [primeira.id, segunda.id])
    const grupo = comGrupo?.linkedGroupId
    const depois = await servico.vincularCadastros(CONTA, chave, [primeira.id, terceira.id])
    expect(depois.every((pessoa) => pessoa.linkedGroupId === grupo)).toBe(true)
    expect(depois.find(({ id }) => id === terceira.id)?.nameVariants).toContain('Maria Fictícia Souza')

    await expect(servico.vincularCadastros(CONTA, chave, [primeira.id])).rejects.toThrow('pelo menos dois')
  })

  it('marcar como pessoas diferentes fica registrado nos dois cadastros', async () => {
    const { servico, chave } = await abrir()
    const uma = await servico.createPerson(CONTA, chave, entrada('Maria Fictícia Silva'))
    const outra = await servico.createPerson(CONTA, chave, entrada('Maria Fictícia Souza'))

    const marcados = await servico.marcarComoPessoasDiferentes(CONTA, chave, [uma.id, outra.id])
    expect(marcados.find(({ id }) => id === uma.id)?.naoSaoAMesmaPessoa).toEqual([outra.id])
    expect(marcados.find(({ id }) => id === outra.id)?.naoSaoAMesmaPessoa).toEqual([uma.id])
    expect(marcados.every(({ linkedGroupId }) => !linkedGroupId)).toBe(true)
  })
})
