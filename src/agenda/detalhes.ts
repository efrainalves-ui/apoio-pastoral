import type { ChurchEntity } from '../district/types'
import {
  AGENDA_CATEGORY_LABELS, CATEGORIAS_PESSOAIS, NIVEL_INSTITUCIONAL_LABELS, TIPO_DE_COMISSAO_LABELS, isEncontroCategory,
  type AgendaCategory, type AgendaEventData, type AgendaEventInput, type CeremonyDetails, type DetalhesDaCeia,
  type DetalhesDaComissao, type DetalhesDaDedicacao, type DetalhesDoCasamento,
  type DetalhesDoEncontro, type DetalhesDoPessoal,
} from './types'
import { usaPrioridadeEscolhida } from './prioridade'

/** Os detalhes que só existem em um tipo de compromisso. */
const DETALHES_POR_CATEGORIA = ['encontro', 'comissao', 'ceia', 'casamento', 'dedicacao', 'pessoal'] as const
type CampoDeDetalhe = (typeof DETALHES_POR_CATEGORIA)[number]

function detalheDaCategoria(category: AgendaCategory): CampoDeDetalhe | null {
  if (isEncontroCategory(category)) return 'encontro'
  if (category === 'committee') return 'comissao'
  if (category === 'communion') return 'ceia'
  if (category === 'wedding') return 'casamento'
  if (category === 'child_dedication') return 'dedicacao'
  if (category === 'personal') return 'pessoal'
  return null
}

/** Quem pergunta "Observações". Nos demais tipos o campo não aparece. */
export function usaObservacoes(category: AgendaCategory): boolean {
  return isEncontroCategory(category)
}

/** Visita e estudo bíblico têm uma pessoa ou família, e não um título digitado. */
export function usaPessoaOuFamilia(category: AgendaCategory): boolean {
  return category === 'visit' || category === 'bible_study'
}

export const encontroVazio = (category: AgendaCategory): DetalhesDoEncontro => ({
  formato: null, alcance: null, publico: null, publicoOutro: '', departamento: '',
  ...(category === 'council' ? { tipoConcilio: null } : {}),
})
export const comissaoVazia = (): DetalhesDaComissao => ({ tipo: null, outraNome: '', meetingId: null, processId: null, pautas: [] })
export const ceiaVazia = (): DetalhesDaCeia => ({ responsaveis: [], materiaisCompletos: null, precisaProvidenciar: null, materiais: [] })
export const casamentoVazio = (): DetalhesDoCasamento => ({ noivo: '', noiva: '', cursoDeNoivos: null, passouPelaComissao: null, dataCivil: '', dataReligiosa: '' })
export const dedicacaoVazia = (): DetalhesDaDedicacao => ({ crianca: '', responsaveis: [] })
export const pessoalVazio = (): DetalhesDoPessoal => ({ categoria: '', subcategoria: '', outro: '', oQue: '', onde: '', como: null, comoOutro: '' })

/**
 * Trocar o tipo apaga o que só fazia sentido no tipo anterior.
 *
 * Esconder não é apagar: um casamento que vira reunião não pode levar os nomes
 * dos noivos escondidos para o registro. O que é comum a todos — data, início,
 * fim, igreja — atravessa.
 */
export function detalhesAoTrocarCategoria(input: AgendaEventInput, category: AgendaCategory): AgendaEventInput {
  const alvo = detalheDaCategoria(category)
  const limpo: AgendaEventInput = { ...input, category }
  for (const campo of DETALHES_POR_CATEGORIA) if (campo !== alvo) limpo[campo] = null
  if (alvo === 'encontro' && !limpo.encontro) limpo.encontro = encontroVazio(category)
  if (alvo === 'encontro' && limpo.encontro) {
    limpo.encontro = category === 'council'
      ? { ...encontroSemAlcance(limpo.encontro), tipoConcilio: limpo.encontro.tipoConcilio ?? null }
      : (({ tipoConcilio: _tipo, ...resto }) => { void _tipo; return resto })(limpo.encontro)
  }
  if (alvo === 'comissao' && !limpo.comissao) limpo.comissao = comissaoVazia()
  if (alvo === 'ceia' && !limpo.ceia) limpo.ceia = ceiaVazia()
  if (alvo === 'casamento' && !limpo.casamento) limpo.casamento = casamentoVazio()
  if (alvo === 'dedicacao' && !limpo.dedicacao) limpo.dedicacao = dedicacaoVazia()
  if (alvo === 'pessoal' && !limpo.pessoal) limpo.pessoal = pessoalVazio()
  if (!usaPessoaOuFamilia(category)) { limpo.pessoaId = null; limpo.familiaId = null }
  if (category !== 'visit') { limpo.finalidade = null; limpo.finalidadeOutra = '' }
  if (category !== 'bible_study') limpo.instrutor = null
  if (category !== 'wedding' && limpo.papelNoCasamento === 'cerimonia') { limpo.casamentoId = null; limpo.papelNoCasamento = null }
  if (!usaObservacoes(category)) limpo.notes = ''
  if (category !== 'preaching') { limpo.escolhaDeIgreja = null; limpo.churchIds = [] }
  if (!usaPrioridadeEscolhida(category) && limpo.prioridadeEstrategica !== undefined) limpo.prioridadeEstrategica = null
  return limpo
}

/**
 * A dedicação gravada antes deste modelo: criança e pais escolhidos da lista de
 * membros. Abre com os mesmos nomes; os identificadores antigos continuam em
 * `ceremonyDetails`, intocados.
 */
export function dedicacaoDoLegado(
  cerimonia: Pick<CeremonyDetails, 'childPersonId' | 'parentPersonIds'> | null | undefined,
  nomeDe: (personId: string) => string,
): DetalhesDaDedicacao {
  return {
    crianca: cerimonia?.childPersonId ? nomeDe(cerimonia.childPersonId) : '',
    responsaveis: (cerimonia?.parentPersonIds ?? []).map((personId) => ({ personId, nome: nomeDe(personId) })),
  }
}

/** Encontro: mudar o formato ou o alcance apaga o que dependia da escolha anterior. */
export function encontroComFormato(encontro: DetalhesDoEncontro, formato: DetalhesDoEncontro['formato']): { encontro: DetalhesDoEncontro; limparLocal: boolean } {
  return { encontro: { ...encontro, formato }, limparLocal: formato === 'online' }
}

export function encontroComAlcance(encontro: DetalhesDoEncontro, alcance: DetalhesDoEncontro['alcance']): { encontro: DetalhesDoEncontro; limparIgreja: boolean } {
  return {
    encontro: {
      ...encontro, alcance,
      publico: alcance === 'distrital' ? encontro.publico : null,
      publicoOutro: alcance === 'distrital' ? encontro.publicoOutro : '',
      departamento: alcance === 'departamento' ? encontro.departamento : '',
      departamentoOutro: alcance === 'departamento' ? encontro.departamentoOutro ?? '' : '',
      nivelInstitucional: alcance === 'institucional' ? encontro.nivelInstitucional ?? null : null,
      instituicao: alcance === 'institucional' ? encontro.instituicao ?? '' : '',
    },
    limparIgreja: alcance !== 'igreja',
  }
}

/** Reunião, Treinamento e Evento perguntam o alcance. Concílio não: o tipo — Concílio ou PGP — já diz o que é. */
export function usaAlcance(category: AgendaCategory): boolean {
  return isEncontroCategory(category) && category !== 'council'
}

/** O encontro sem nada do alcance: é como o Concílio é gravado, mesmo quando um registro antigo trazia um. */
export function encontroSemAlcance(encontro: DetalhesDoEncontro): DetalhesDoEncontro {
  const { nivelInstitucional: _nivel, instituicao: _instituicao, departamentoOutro: _outro, ...resto } = encontro
  void _nivel; void _instituicao; void _outro
  return { ...resto, alcance: null, publico: null, publicoOutro: '', departamento: '' }
}

/**
 * "Reunião · Associação", "Treinamento · Departamento de Música", "Evento · Distrito".
 *
 * Só para Reunião, Treinamento e Evento com alcance escolhido; nos demais, o
 * título e o selo da categoria já dizem tudo.
 */
export function resumoDoAlcance(event: Pick<AgendaEventData, 'category' | 'churchId' | 'encontro'>, churches: readonly ChurchEntity[]): string | null {
  const encontro = event.encontro
  if (!usaAlcance(event.category) || !encontro?.alcance) return null
  const tipo = AGENDA_CATEGORY_LABELS[event.category]
  if (encontro.alcance === 'institucional') {
    const nivel = encontro.nivelInstitucional ? NIVEL_INSTITUCIONAL_LABELS[encontro.nivelInstitucional] : 'Associação/Missão/União'
    const nome = encontro.instituicao?.trim()
    return nome ? `${tipo} · ${nivel} · ${nome}` : `${tipo} · ${nivel}`
  }
  if (encontro.alcance === 'distrital') return `${tipo} · Distrito`
  if (encontro.alcance === 'igreja') return `${tipo} · ${churches.find(({ id }) => id === event.churchId)?.name ?? 'Igreja local'}`
  const departamento = encontro.departamento === 'Outro' ? encontro.departamentoOutro?.trim() : encontro.departamento.trim()
  return departamento ? `${tipo} · Departamento de ${departamento}` : `${tipo} · Departamento`
}

export function encontroComPublico(encontro: DetalhesDoEncontro, publico: DetalhesDoEncontro['publico']): DetalhesDoEncontro {
  return { ...encontro, publico, publicoOutro: publico === 'outro' ? encontro.publicoOutro : '' }
}

/**
 * As igrejas de um compromisso.
 *
 * Os antigos só têm `churchId`; os novos, quando a pregação é em várias igrejas
 * ou no distrito todo, trazem a lista. Quem pergunta "esta igreja teve
 * pregação?" deve perguntar aqui, e não olhar só o primeiro campo.
 */
export function igrejasDoCompromisso(event: Pick<AgendaEventData, 'churchId' | 'churchIds'>): string[] {
  const lista = event.churchIds?.length ? event.churchIds : event.churchId ? [event.churchId] : []
  return [...new Set(lista)]
}

/** Texto das igrejas para mostrar: "Todas as igrejas do distrito", nomes, ou o lugar escrito. */
export function textoDasIgrejas(event: Pick<AgendaEventData, 'churchId' | 'churchIds' | 'escolhaDeIgreja' | 'location'>, churches: readonly ChurchEntity[]): string {
  if (event.escolhaDeIgreja === 'todas') return 'Todas as igrejas do distrito'
  const nomes = igrejasDoCompromisso(event).map((id) => churches.find((church) => church.id === id)?.name).filter(Boolean)
  if (nomes.length) return nomes.join(', ')
  return event.location.trim()
}

/** Pregação: aplica a escolha de igreja e mantém `churchId` coerente para quem lê só ele. */
export function aplicarEscolhaDeIgreja(
  input: AgendaEventInput,
  escolha: AgendaEventInput['escolhaDeIgreja'],
  churches: readonly ChurchEntity[],
): AgendaEventInput {
  if (escolha === 'todas') {
    const ids = churches.filter(({ status }) => status !== 'archived').map(({ id }) => id)
    return { ...input, escolhaDeIgreja: 'todas', churchIds: ids, churchId: ids[0] ?? null, location: '' }
  }
  if (escolha === 'outra') return { ...input, escolhaDeIgreja: 'outra', churchIds: [], churchId: null }
  if (escolha === 'varias') return { ...input, escolhaDeIgreja: 'varias', churchIds: input.churchIds ?? [], churchId: input.churchIds?.[0] ?? null, location: '' }
  if (escolha === 'uma') return { ...input, escolhaDeIgreja: 'uma', churchIds: input.churchId ? [input.churchId] : [], location: '' }
  return { ...input, escolhaDeIgreja: null }
}

interface ContextoDeTitulo {
  churches: readonly ChurchEntity[]
  pessoaNome?: string | undefined
  familiaNome?: string | undefined
}

/**
 * O texto que a agenda mostra, gerado quando perguntar seria à toa.
 *
 * Visita e estudo bíblico não pedem título: "Visita — Maria Souza" diz mais na
 * lista do que um campo que o pastor teria de preencher.
 */
export function tituloGerado(input: AgendaEventInput, contexto: ContextoDeTitulo): string {
  const rotulo = AGENDA_CATEGORY_LABELS[input.category]
  const quem = contexto.pessoaNome?.trim() || contexto.familiaNome?.trim()
  if (usaPessoaOuFamilia(input.category)) return quem ? `${rotulo} — ${quem}` : rotulo
  if (input.category === 'committee' && input.comissao?.tipo) {
    return input.comissao.tipo === 'outra' && input.comissao.outraNome.trim() ? input.comissao.outraNome.trim() : TIPO_DE_COMISSAO_LABELS[input.comissao.tipo]
  }
  if (input.category === 'council' && input.encontro?.tipoConcilio === 'pgp') return 'PGP'
  if (input.category === 'wedding' && input.casamento && (input.casamento.noivo.trim() || input.casamento.noiva.trim())) {
    return `Casamento — ${[input.casamento.noivo.trim(), input.casamento.noiva.trim()].filter(Boolean).join(' e ')}`
  }
  if (input.category === 'child_dedication' && input.dedicacao?.crianca.trim()) return `Dedicação — ${input.dedicacao.crianca.trim()}`
  if (input.category === 'personal' && input.pessoal?.oQue.trim()) return input.pessoal.oQue.trim()
  const lugar = input.category === 'preaching' ? textoDasIgrejas(input, contexto.churches) : contexto.churches.find(({ id }) => id === input.churchId)?.name ?? input.location.trim()
  return lugar ? `${rotulo} · ${lugar}` : rotulo
}

/** Quem pede título digitado. Os demais geram o seu. */
export function pedeTitulo(category: AgendaCategory): boolean {
  return category === 'meeting' || category === 'training' || category === 'event' || category === 'other'
}

/**
 * O título que vai ser gravado.
 *
 * Um registro antigo que já tem título digitado continua com ele: gerar por cima
 * apagaria o que o pastor escreveu.
 */
export function tituloParaGravar(input: AgendaEventInput, contexto: ContextoDeTitulo, tituloOriginal = ''): string {
  if (pedeTitulo(input.category)) return input.title.trim()
  const gerado = tituloGerado(input, contexto)
  const original = tituloOriginal.trim()
  const rotulo = AGENDA_CATEGORY_LABELS[input.category]
  const eraGerado = !original || original === rotulo || original.startsWith(`${rotulo} · `) || original.startsWith(`${rotulo} — `)
  return eraGerado ? gerado : original
}

const vazio = (texto: string | undefined | null) => !texto?.trim()

/**
 * O que precisa estar preenchido em cada tipo.
 *
 * Validação única para a tela e para o serviço: a tela desabilita o que o
 * serviço recusaria, e o serviço recusa o que chegar sem passar pela tela.
 */
export function validarDetalhes(input: AgendaEventInput): void {
  if (isEncontroCategory(input.category)) validarEncontro(input)
  if (input.category === 'visit' && input.finalidade === 'other' && vazio(input.finalidadeOutra)) throw new Error('Descreva a finalidade da visita.')
  if (input.category === 'bible_study' && input.instrutor && !input.instrutor.personId && vazio(input.instrutor.nome)) throw new Error('Informe o nome do instrutor.')
  if (input.category === 'preaching') {
    const escolha = input.escolhaDeIgreja
    if (escolha === 'uma' && !input.churchId) throw new Error('Escolha a igreja da pregação.')
    if (escolha === 'varias' && (input.churchIds?.length ?? 0) < 2) throw new Error('Escolha ao menos duas igrejas.')
    if (escolha === 'outra' && vazio(input.location)) throw new Error('Informe o nome da igreja.')
    if (escolha === 'todas' && !(input.churchIds?.length)) throw new Error('O distrito ainda não tem igrejas cadastradas.')
  }
  if (input.category === 'committee' && input.comissao) {
    if (!input.comissao.tipo) throw new Error('Informe qual comissão.')
    if (input.comissao.tipo === 'outra' && vazio(input.comissao.outraNome)) throw new Error('Informe o nome da comissão.')
  }
  if (input.category === 'wedding' && input.casamento && !input.casamentoId) {
    if (vazio(input.casamento.noivo) || vazio(input.casamento.noiva)) throw new Error('Informe o nome do noivo e da noiva.')
  }
  if (input.category === 'child_dedication' && input.dedicacao) {
    if (vazio(input.dedicacao.crianca)) throw new Error('Informe o nome da criança.')
    if (input.dedicacao.responsaveis.some((item) => !item.personId && vazio(item.nome))) throw new Error('Escreva o nome do responsável que não é membro.')
  }
  if (input.category === 'communion' && input.ceia) {
    if (input.ceia.precisaProvidenciar && !input.ceia.materiais.length) throw new Error('Marque o que precisa ser providenciado.')
    if (input.ceia.materiais.some((item) => item.item === 'outro' && vazio(item.outro))) throw new Error('Descreva o outro material.')
    if (input.ceia.materiais.some((item) => item.quantidade !== null && (!Number.isFinite(item.quantidade) || item.quantidade < 0))) throw new Error('Quantidade de material inválida.')
  }
  if (input.category === 'personal' && input.pessoal) {
    if (vazio(input.pessoal.categoria)) throw new Error('Escolha a categoria.')
    const categoria = CATEGORIAS_PESSOAIS.find(({ id }) => id === input.pessoal!.categoria)
    const pedeOutro = input.pessoal.categoria === 'outro' || input.pessoal.subcategoria === 'Outro'
    if (categoria?.subcategorias.length && vazio(input.pessoal.subcategoria)) throw new Error('Escolha a subcategoria.')
    if (pedeOutro && vazio(input.pessoal.outro)) throw new Error('Descreva a categoria.')
    if (vazio(input.pessoal.oQue)) throw new Error('Informe o que precisa ser feito.')
    if (input.pessoal.como === 'outra' && vazio(input.pessoal.comoOutro)) throw new Error('Descreva como será.')
  }
}

/** Reunião, Treinamento, Evento e Concílio: uma regra só, para as quatro não divergirem. */
export function validarEncontro(input: AgendaEventInput): void {
  const encontro = input.encontro
  if (!encontro) return
  if (input.category === 'council' && !encontro.tipoConcilio) throw new Error('Escolha o tipo: Concílio ou PGP.')
  if (!encontro.formato) throw new Error('Escolha o formato: presencial ou online.')
  if (encontro.formato === 'presencial' && vazio(input.location)) throw new Error('Informe o local.')
  if (!usaAlcance(input.category)) return
  if (!encontro.alcance) throw new Error('Escolha o alcance: Associação/Missão/União, distrital, igreja local ou departamento.')
  if (encontro.alcance === 'institucional' && !encontro.nivelInstitucional) throw new Error('Escolha: Associação, Missão ou União.')
  if (encontro.alcance === 'distrital' && !encontro.publico) throw new Error('Escolha o público da reunião.')
  if (encontro.alcance === 'distrital' && encontro.publico === 'outro' && vazio(encontro.publicoOutro)) throw new Error('Descreva o público.')
  if (encontro.alcance === 'igreja' && !input.churchId) throw new Error('Escolha a igreja.')
  if (encontro.alcance === 'departamento' && vazio(encontro.departamento)) throw new Error('Escolha o departamento.')
  if (encontro.alcance === 'departamento' && encontro.departamento === 'Outro' && vazio(encontro.departamentoOutro)) throw new Error('Informe o departamento.')
}

/**
 * Registro antigo lido como o modelo de hoje, sem perder nada.
 *
 * PGP virou subtipo de Concílio. Um compromisso gravado como `pgp` — deste
 * aparelho ou chegando de outro ainda não atualizado — abre como Concílio do
 * tipo PGP. Os demais campos seguem como estavam.
 */
export function normalizarLegado<T extends Pick<AgendaEventData, 'category'> & Partial<AgendaEventData>>(data: T): T {
  if (data.category !== 'pgp') return data
  const encontro = data.encontro ?? { formato: null, alcance: null, publico: null, publicoOutro: '', departamento: '' }
  return { ...data, category: 'council', encontro: { ...encontro, tipoConcilio: 'pgp' } }
}
