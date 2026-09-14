import { describe, expect, it } from 'vitest'
import type { ChurchEntity } from '../district/types'
import {
  aplicarEscolhaDeIgreja, ceiaVazia, detalhesAoTrocarCategoria, encontroComAlcance, encontroComFormato,
  encontroComPublico, encontroVazio, igrejasDoCompromisso, normalizarLegado, pedeTitulo, textoDasIgrejas,
  tituloGerado, tituloParaGravar, usaObservacoes, validarDetalhes,
} from './detalhes'
import { NEW_EVENT_CATEGORIES, categoryDefaults, type AgendaEventInput } from './types'

const igreja = (id: string, name: string, status: ChurchEntity['status'] = 'active'): ChurchEntity => ({
  id, districtId: 'distrito', name, type: 'organized_church', externalCode: '', address: '',
  worshipSchedules: [], administrativeNotes: '', status, history: [], createdAt: '', updatedAt: '',
})
const IGREJAS = [igreja('a', 'Central Fictícia'), igreja('b', 'Norte Fictícia'), igreja('c', 'Sul Fictícia'), igreja('x', 'Arquivada Fictícia', 'archived')]

function base(overrides: Partial<AgendaEventInput> = {}): AgendaEventInput {
  return {
    title: '', category: 'visit', churchId: null, location: '', address: '', visitTarget: 'none',
    sermonId: null, sermonSnapshot: null, ceremonyDetails: null, startAt: '2026-10-10T09:00', endAt: '2026-10-10T10:00',
    allDay: false, reminderMinutes: null, notes: '', includeInItinerary: true, mondayException: false, ...overrides,
  }
}

describe('o que se cria hoje', () => {
  it('não oferece Viagem nem PGP como tipo novo', () => {
    expect(NEW_EVENT_CATEGORIES).not.toContain('travel')
    expect(NEW_EVENT_CATEGORIES).not.toContain('pgp')
    expect(NEW_EVENT_CATEGORIES).toContain('council')
  })

  it('nenhum tipo nasce "o dia todo", nem o Concílio', () => {
    for (const category of NEW_EVENT_CATEGORIES) expect(categoryDefaults(category).allDay, category).toBe(false)
  })

  it('Observações só em Reunião, Treinamento, Evento e Concílio', () => {
    expect(NEW_EVENT_CATEGORIES.filter(usaObservacoes)).toEqual(['meeting', 'training', 'event', 'council'])
  })

  it('visita e estudo bíblico não pedem título', () => {
    expect(pedeTitulo('visit')).toBe(false)
    expect(pedeTitulo('bible_study')).toBe(false)
    expect(pedeTitulo('meeting')).toBe(true)
  })
})

/* Esconder não é apagar: trocar o tipo leva embora o que só valia no anterior. */
describe('trocar o tipo limpa o que não se aplica mais', () => {
  it('casamento que vira reunião não leva os noivos', () => {
    const casamento = base({ category: 'wedding', casamento: { noivo: 'Noivo Fictício', noiva: 'Noiva Fictícia', cursoDeNoivos: true, passouPelaComissao: null, dataCivil: '', dataReligiosa: '' } })
    const reuniao = detalhesAoTrocarCategoria(casamento, 'meeting')
    expect(reuniao.casamento).toBeNull()
    expect(reuniao.encontro).toEqual(encontroVazio('meeting'))
  })

  it('reunião que vira pregação perde as observações; pregação não as usa', () => {
    const reuniao = base({ category: 'meeting', notes: 'Algo fictício' })
    expect(detalhesAoTrocarCategoria(reuniao, 'preaching').notes).toBe('')
  })

  it('visita que vira reunião perde a pessoa', () => {
    const visita = base({ pessoaId: 'p1', familiaId: 'f1' })
    const reuniao = detalhesAoTrocarCategoria(visita, 'meeting')
    expect(reuniao.pessoaId).toBeNull()
    expect(reuniao.familiaId).toBeNull()
  })

  it('só o Concílio carrega o tipo Concílio ou PGP', () => {
    const concilio = detalhesAoTrocarCategoria(base(), 'council')
    expect(concilio.encontro?.tipoConcilio).toBeNull()
    const reuniao = detalhesAoTrocarCategoria({ ...concilio, encontro: { ...concilio.encontro!, tipoConcilio: 'pgp' } }, 'meeting')
    expect(reuniao.encontro).not.toHaveProperty('tipoConcilio')
  })
})

describe('reunião, treinamento, evento e concílio: a mesma regra', () => {
  const encontro = (overrides = {}) => ({ ...encontroVazio('meeting'), ...overrides })

  it('online não pede local, e escolher online apaga o local', () => {
    expect(encontroComFormato(encontro(), 'online').limparLocal).toBe(true)
    expect(encontroComFormato(encontro(), 'presencial').limparLocal).toBe(false)
    expect(() => validarDetalhes(base({ category: 'meeting', encontro: encontro({ formato: 'online', alcance: 'departamento', departamento: 'Música' }) }))).not.toThrow()
  })

  it('presencial exige local', () => {
    expect(() => validarDetalhes(base({ category: 'meeting', encontro: encontro({ formato: 'presencial', alcance: 'departamento', departamento: 'Música' }) }))).toThrow('local')
  })

  it('alcance é obrigatório', () => {
    expect(() => validarDetalhes(base({ category: 'training', encontro: encontro({ formato: 'online' }) }))).toThrow('alcance')
  })

  it('distrital pede o público, e "outro público" pede o texto', () => {
    const distrital = encontro({ formato: 'online', alcance: 'distrital' })
    expect(() => validarDetalhes(base({ category: 'event', encontro: distrital }))).toThrow('público')
    expect(() => validarDetalhes(base({ category: 'event', encontro: { ...distrital, publico: 'outro' } }))).toThrow('Descreva')
    expect(() => validarDetalhes(base({ category: 'event', encontro: { ...distrital, publico: 'pastores_anciaos' } }))).not.toThrow()
  })

  it('igreja local pede a igreja', () => {
    const local = encontro({ formato: 'online', alcance: 'igreja' })
    expect(() => validarDetalhes(base({ category: 'meeting', encontro: local }))).toThrow('igreja')
    expect(() => validarDetalhes(base({ category: 'meeting', churchId: 'a', encontro: local }))).not.toThrow()
  })

  it('mudar o alcance apaga o público, o texto e o departamento que não valem mais', () => {
    const cheio = encontro({ alcance: 'distrital', publico: 'outro', publicoOutro: 'Fictício', departamento: 'Música' })
    const igrejaLocal = encontroComAlcance(cheio, 'igreja')
    expect(igrejaLocal.encontro).toMatchObject({ publico: null, publicoOutro: '', departamento: '' })
    expect(igrejaLocal.limparIgreja).toBe(false)
    expect(encontroComAlcance(cheio, 'departamento').limparIgreja).toBe(true)
  })

  it('trocar o público apaga o texto de "outro público"', () => {
    expect(encontroComPublico(encontro({ publico: 'outro', publicoOutro: 'Fictício' }), 'administrativo').publicoOutro).toBe('')
  })

  it('Concílio exige o tipo', () => {
    const concilio = { ...encontroVazio('council'), formato: 'online' as const, alcance: 'departamento' as const, departamento: 'Música' }
    expect(() => validarDetalhes(base({ category: 'council', encontro: concilio }))).toThrow('Concílio ou PGP')
    expect(() => validarDetalhes(base({ category: 'council', encontro: { ...concilio, tipoConcilio: 'pgp' } }))).not.toThrow()
  })
})

describe('a igreja da pregação', () => {
  it('uma igreja', () => {
    const uma = aplicarEscolhaDeIgreja(base({ category: 'preaching', churchId: 'a' }), 'uma', IGREJAS)
    expect(igrejasDoCompromisso(uma)).toEqual(['a'])
    expect(() => validarDetalhes({ ...uma, churchId: null })).toThrow('igreja')
  })

  it('todas as igrejas: vincula as ativas do distrito', () => {
    const todas = aplicarEscolhaDeIgreja(base({ category: 'preaching' }), 'todas', IGREJAS)
    expect(todas.churchIds).toEqual(['a', 'b', 'c'])
    expect(todas.churchId).toBe('a')
    expect(textoDasIgrejas(todas, IGREJAS)).toBe('Todas as igrejas do distrito')
  })

  it('duas ou mais: exige ao menos duas', () => {
    const varias = aplicarEscolhaDeIgreja(base({ category: 'preaching', churchIds: ['a'] }), 'varias', IGREJAS)
    expect(() => validarDetalhes(varias)).toThrow('duas')
    const duas = { ...varias, churchIds: ['a', 'c'] }
    expect(() => validarDetalhes(duas)).not.toThrow()
    expect(textoDasIgrejas(duas, IGREJAS)).toBe('Central Fictícia, Sul Fictícia')
  })

  it('outra igreja: pede o nome e não vincula igreja do distrito', () => {
    const outra = aplicarEscolhaDeIgreja(base({ category: 'preaching', churchId: 'a', churchIds: ['a'] }), 'outra', IGREJAS)
    expect(outra.churchId).toBeNull()
    expect(outra.churchIds).toEqual([])
    expect(() => validarDetalhes(outra)).toThrow('nome')
    expect(textoDasIgrejas({ ...outra, location: 'Igreja Vizinha Fictícia' }, IGREJAS)).toBe('Igreja Vizinha Fictícia')
  })

  it('compromisso antigo, só com churchId, continua respondendo', () => {
    expect(igrejasDoCompromisso({ churchId: 'b' })).toEqual(['b'])
  })
})

describe('títulos gerados', () => {
  it('visita e estudo bíblico levam o nome de quem', () => {
    expect(tituloGerado(base({ category: 'visit' }), { churches: IGREJAS, pessoaNome: 'Maria Fictícia' })).toBe('Visita — Maria Fictícia')
    expect(tituloGerado(base({ category: 'bible_study' }), { churches: IGREJAS, familiaNome: 'Família Fictícia' })).toBe('Estudo Bíblico — Família Fictícia')
    expect(tituloGerado(base({ category: 'visit' }), { churches: IGREJAS })).toBe('Visita')
  })

  it('comissão leva o nome da comissão', () => {
    expect(tituloGerado(base({ category: 'committee', comissao: { tipo: 'diretiva', outraNome: '' } }), { churches: IGREJAS })).toBe('Comissão Diretiva')
    expect(tituloGerado(base({ category: 'committee', comissao: { tipo: 'outra', outraNome: 'Comissão de Obras Fictícia' } }), { churches: IGREJAS })).toBe('Comissão de Obras Fictícia')
  })

  it('reunião mantém o título digitado', () => {
    expect(tituloParaGravar(base({ category: 'meeting', title: '  Reunião fictícia  ' }), { churches: IGREJAS })).toBe('Reunião fictícia')
  })

  it('não apaga o título que o pastor escreveu num compromisso antigo', () => {
    const antigo = base({ category: 'visit', title: 'Visita ao irmão fictício' })
    expect(tituloParaGravar(antigo, { churches: IGREJAS, pessoaNome: 'Maria Fictícia' }, 'Visita ao irmão fictício')).toBe('Visita ao irmão fictício')
  })
})

describe('cerimônias e pessoal', () => {
  it('comissão exige qual, e "outra" exige o nome', () => {
    expect(() => validarDetalhes(base({ category: 'committee', comissao: { tipo: null, outraNome: '' } }))).toThrow('qual comissão')
    expect(() => validarDetalhes(base({ category: 'committee', comissao: { tipo: 'outra', outraNome: ' ' } }))).toThrow('nome da comissão')
  })

  it('casamento exige noivo e noiva, em texto livre', () => {
    const casamento = { noivo: 'Noivo Fictício', noiva: '', cursoDeNoivos: null, passouPelaComissao: null, dataCivil: '', dataReligiosa: '' }
    expect(() => validarDetalhes(base({ category: 'wedding', casamento }))).toThrow('noiva')
    expect(() => validarDetalhes(base({ category: 'wedding', casamento: { ...casamento, noiva: 'Noiva Fictícia' } }))).not.toThrow()
  })

  it('dedicação: criança em texto livre; responsável não membro precisa de nome', () => {
    expect(() => validarDetalhes(base({ category: 'child_dedication', dedicacao: { crianca: '', responsaveis: [] } }))).toThrow('criança')
    expect(() => validarDetalhes(base({ category: 'child_dedication', dedicacao: { crianca: 'Criança Fictícia', responsaveis: [{ personId: null, nome: '' }] } }))).toThrow('não é membro')
    expect(() => validarDetalhes(base({ category: 'child_dedication', dedicacao: { crianca: 'Criança Fictícia', responsaveis: [{ personId: 'p1', nome: 'Mãe Fictícia' }, { personId: null, nome: 'Pai Fictício' }] } }))).not.toThrow()
  })

  it('Ceia do Senhor: providenciar pede itens; "outro" pede descrição; quantidade válida', () => {
    const ceia = ceiaVazia()
    expect(() => validarDetalhes(base({ category: 'communion', ceia: { ...ceia, precisaProvidenciar: true } }))).toThrow('providenciado')
    expect(() => validarDetalhes(base({ category: 'communion', ceia: { ...ceia, precisaProvidenciar: true, materiais: [{ item: 'outro', quantidade: null, outro: '' }] } }))).toThrow('outro material')
    expect(() => validarDetalhes(base({ category: 'communion', ceia: { ...ceia, precisaProvidenciar: true, materiais: [{ item: 'pao', quantidade: -1, outro: '' }] } }))).toThrow('Quantidade')
    expect(() => validarDetalhes(base({ category: 'communion', ceia: { ...ceia, precisaProvidenciar: true, materiais: [{ item: 'pao', quantidade: 2, outro: '' }, { item: 'vinho', quantidade: null, outro: '' }] } }))).not.toThrow()
  })

  it('pessoal: categoria, subcategoria, o que fazer e "outra" forma pedem texto', () => {
    const pessoal = { categoria: 'saude', subcategoria: '', outro: '', oQue: '', onde: '', como: null, comoOutro: '' }
    expect(() => validarDetalhes(base({ category: 'personal', pessoal }))).toThrow('subcategoria')
    expect(() => validarDetalhes(base({ category: 'personal', pessoal: { ...pessoal, subcategoria: 'Outro' } }))).toThrow('Descreva a categoria')
    expect(() => validarDetalhes(base({ category: 'personal', pessoal: { ...pessoal, subcategoria: 'Dentista' } }))).toThrow('o que precisa')
    expect(() => validarDetalhes(base({ category: 'personal', pessoal: { ...pessoal, subcategoria: 'Dentista', oQue: 'Limpeza', como: 'outra' } }))).toThrow('como será')
    expect(() => validarDetalhes(base({ category: 'personal', pessoal: { ...pessoal, categoria: 'casa', oQue: 'Consertar pia', como: 'presencial' } }))).not.toThrow()
  })
})

describe('finalidade, instrutor e departamento "Outro"', () => {
  it('visita com finalidade "Outra" pede a descrição; outro tipo limpa a finalidade', () => {
    expect(() => validarDetalhes(base({ category: 'visit', finalidade: 'other', finalidadeOutra: '' }))).toThrow('finalidade')
    expect(() => validarDetalhes(base({ category: 'visit', finalidade: 'other', finalidadeOutra: 'Oração fictícia' }))).not.toThrow()
    const reuniao = detalhesAoTrocarCategoria(base({ finalidade: 'illness' }), 'meeting')
    expect(reuniao.finalidade).toBeNull()
  })

  it('instrutor aceita pessoa cadastrada ou nome escrito, e sai quando o tipo muda', () => {
    expect(() => validarDetalhes(base({ category: 'bible_study', instrutor: { personId: null, nome: ' ' } }))).toThrow('instrutor')
    expect(() => validarDetalhes(base({ category: 'bible_study', instrutor: { personId: null, nome: 'Instrutor Fictício' } }))).not.toThrow()
    expect(() => validarDetalhes(base({ category: 'bible_study', instrutor: { personId: 'p1', nome: 'Instrutora Fictícia' } }))).not.toThrow()
    expect(detalhesAoTrocarCategoria(base({ category: 'bible_study', instrutor: { personId: 'p1', nome: 'X' } }), 'visit').instrutor).toBeNull()
  })

  it('departamento "Outro" pede o nome, e mudar o alcance apaga', () => {
    const encontro = { ...encontroVazio('meeting'), formato: 'online' as const, alcance: 'departamento' as const, departamento: 'Outro', departamentoOutro: '' }
    expect(() => validarDetalhes(base({ category: 'meeting', encontro }))).toThrow('departamento')
    expect(() => validarDetalhes(base({ category: 'meeting', encontro: { ...encontro, departamentoOutro: 'Capelania Fictícia' } }))).not.toThrow()
    expect(encontroComAlcance({ ...encontro, departamentoOutro: 'Capelania Fictícia' }, 'distrital').encontro.departamentoOutro).toBe('')
  })
})

describe('registro antigo', () => {
  it('PGP antigo abre como Concílio do tipo PGP, sem perder os outros campos', () => {
    const antigo = { ...base({ category: 'pgp', title: 'PGP Fictício', location: 'Sede fictícia', notes: 'Nota fictícia' }), createdAt: 'x', updatedAt: 'y' }
    const lido = normalizarLegado(antigo)
    expect(lido.category).toBe('council')
    expect(lido.encontro?.tipoConcilio).toBe('pgp')
    expect(lido).toMatchObject({ title: 'PGP Fictício', location: 'Sede fictícia', notes: 'Nota fictícia', createdAt: 'x' })
  })

  it('o que não é PGP passa intacto', () => {
    const viagem = base({ category: 'travel', title: 'Viagem antiga fictícia' })
    expect(normalizarLegado(viagem)).toBe(viagem)
  })
})
