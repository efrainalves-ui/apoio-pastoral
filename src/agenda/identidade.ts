import {
  Baby, BookOpen, CalendarCheck2, ClipboardList, Droplets, Ellipsis, GraduationCap, Heart, House, Landmark, Mic, Plane, User, Users, Wine,
  type LucideIcon,
} from 'lucide-react'

/**
 * A identidade visual de cada categoria da Agenda, num lugar só.
 *
 * Dia, Semana, Mês, Lista e a legenda leem daqui: a mesma categoria tem a
 * mesma cor, o mesmo ícone e o mesmo nome em qualquer visualização. Nenhum
 * componente escreve código de cor por conta própria.
 *
 * Os tons do fundo, do texto e do ícone são calculados a partir da cor
 * principal, para o tema claro e para o escuro, sempre com contraste
 * suficiente para leitura. A cor nunca identifica sozinha: vai junto do ícone
 * e do nome.
 */

export const CATEGORIAS_VISUAIS_IDS = [
  'preaching', 'committee', 'baptism', 'communion', 'child_dedication', 'council', 'personal',
  'visit', 'meeting', 'bible_study', 'wedding', 'training', 'event', 'other',
] as const
export type CategoriaVisual = (typeof CATEGORIAS_VISUAIS_IDS)[number]
export type DestaqueDaCategoria = 'forte' | 'moderado'

export interface TonsDaCategoria {
  /** Faixa lateral e amostra da legenda: a cor viva. */
  faixa: string
  /** Fundo suave do compromisso. */
  fundo: string
  /** Nome da categoria, legível sobre o fundo. */
  texto: string
  /** Ícone: a cor viva quando ela se destaca do fundo, senão o tom do texto. */
  icone: string
}

export interface IdentidadeDaCategoria {
  id: CategoriaVisual
  rotulo: string
  cor: string
  destaque: DestaqueDaCategoria
  /** Quanto da cor entra no fundo, de 0 a 1. */
  intensidadeDoFundo: { claro: number; escuro: number }
  Icone: LucideIcon
  tons: { claro: TonsDaCategoria; escuro: TonsDaCategoria }
}

/* As superfícies e o texto dos temas, iguais aos tokens de `index.css`. */
export const SUPERFICIES = {
  claro: { papel: '#FFFEFB', tinta: '#1C2925' },
  escuro: { papel: '#0B1512', tinta: '#EAF2ED' },
} as const

type Rgb = [number, number, number]
const paraRgb = (hex: string): Rgb => { const n = hex.replace('#', ''); return [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16)) as Rgb }
const paraHex = (rgb: Rgb) => `#${rgb.map((valor) => Math.round(Math.min(255, Math.max(0, valor))).toString(16).padStart(2, '0')).join('').toUpperCase()}`

/** Mistura `a` sobre `b`; `peso` é quanto de `a` entra (0 a 1). */
export function misturar(a: string, b: string, peso: number): string {
  const [x, y] = [paraRgb(a), paraRgb(b)]
  return paraHex([0, 1, 2].map((i) => x[i]! * peso + y[i]! * (1 - peso)) as Rgb)
}

function luminancia(hex: string): number {
  const [r, g, b] = paraRgb(hex).map((canal) => { const c = canal / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 })
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
}

/** Razão de contraste WCAG entre duas cores. */
export function contraste(a: string, b: string): number {
  const [claro, escuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x)
  return (claro! + 0.05) / (escuro! + 0.05)
}

/** Aproxima `cor` de `alvo` só o necessário para chegar ao contraste mínimo sobre `fundo`. */
function ajustarAte(cor: string, alvo: string, fundo: string, minimo: number): string {
  for (let passo = 0; passo <= 20; passo += 1) {
    const candidata = misturar(alvo, cor, passo / 20)
    if (contraste(candidata, fundo) >= minimo) return candidata
  }
  return alvo
}

function tonsDoTema(cor: string, tema: 'claro' | 'escuro', intensidade: number): TonsDaCategoria {
  const { papel } = SUPERFICIES[tema]
  const extremo = tema === 'claro' ? SUPERFICIES.claro.tinta : '#FFFFFF'
  const faixa = tema === 'claro' ? cor : ajustarAte(cor, '#FFFFFF', papel, 3)
  const fundo = misturar(cor, papel, intensidade)
  const texto = ajustarAte(tema === 'claro' ? cor : faixa, extremo, fundo, 4.5)
  const icone = contraste(faixa, fundo) >= 3 ? faixa : texto
  return { faixa, fundo, texto, icone }
}

const INTENSIDADE: Record<DestaqueDaCategoria, { claro: number; escuro: number }> = {
  forte: { claro: 0.18, escuro: 0.26 },
  moderado: { claro: 0.1, escuro: 0.15 },
}

function identidade(id: CategoriaVisual, rotulo: string, cor: string, destaque: DestaqueDaCategoria, Icone: LucideIcon): IdentidadeDaCategoria {
  const intensidadeDoFundo = INTENSIDADE[destaque]
  return { id, rotulo, cor, destaque, intensidadeDoFundo, Icone, tons: { claro: tonsDoTema(cor, 'claro', intensidadeDoFundo.claro), escuro: tonsDoTema(cor, 'escuro', intensidadeDoFundo.escuro) } }
}

/** A relação oficial, na ordem da legenda: primeiro as principais. */
export const CATEGORIAS_VISUAIS: readonly IdentidadeDaCategoria[] = [
  identidade('preaching', 'Pregação', '#F97316', 'forte', Mic),
  identidade('committee', 'Comissão', '#7C3AED', 'forte', ClipboardList),
  identidade('baptism', 'Batismo', '#2563EB', 'forte', Droplets),
  identidade('communion', 'Ceia do Senhor', '#BE123C', 'forte', Wine),
  identidade('child_dedication', 'Dedicação de criança', '#0891B2', 'forte', Baby),
  identidade('council', 'Concílio', '#4F46E5', 'forte', Landmark),
  identidade('personal', 'Pessoal', '#C026D3', 'forte', User),
  identidade('visit', 'Visita', '#0F766E', 'moderado', House),
  identidade('meeting', 'Reunião', '#64748B', 'moderado', Users),
  identidade('bible_study', 'Estudo Bíblico', '#15803D', 'moderado', BookOpen),
  identidade('wedding', 'Casamento', '#DB2777', 'moderado', Heart),
  identidade('training', 'Treinamento', '#B45309', 'moderado', GraduationCap),
  identidade('event', 'Evento', '#65A30D', 'moderado', CalendarCheck2),
  identidade('other', 'Outro', '#6B7280', 'moderado', Ellipsis),
]

const POR_ID = new Map(CATEGORIAS_VISUAIS.map((item) => [item.id, item]))

const semAcento = (texto: string) => texto.normalize('NFD').replace(/[̀-ͯ]/gu, '').toLocaleLowerCase('pt-BR').replace(/[-_]+/gu, ' ').replace(/\s+/gu, ' ').trim()

/** Grafias antigas e nomes em português que chegam de registros anteriores. */
const SINONIMOS: Record<string, CategoriaVisual> = {
  pregacao: 'preaching', sermao: 'preaching', comissao: 'committee', 'comissao diretiva': 'committee', batismo: 'baptism',
  ceia: 'communion', 'santa ceia': 'communion', 'ceia do senhor': 'communion', 'lords supper': 'communion',
  dedicacao: 'child_dedication', 'dedicacao de crianca': 'child_dedication', 'child dedication': 'child_dedication',
  concilio: 'council', pgp: 'council', pessoal: 'personal', visita: 'visit', reuniao: 'meeting',
  'estudo biblico': 'bible_study', 'bible study': 'bible_study', estudo: 'bible_study', casamento: 'wedding',
  treinamento: 'training', evento: 'event', outro: 'other', travel: 'other', viagem: 'other',
}

/** A categoria canônica de qualquer grafia gravada; o que não se reconhece vira "Outro". */
export function categoriaCanonica(categoria: string | null | undefined): CategoriaVisual {
  const bruta = (categoria ?? '').trim()
  if (POR_ID.has(bruta as CategoriaVisual)) return bruta as CategoriaVisual
  return SINONIMOS[semAcento(bruta)] ?? 'other'
}

/**
 * A identidade de um compromisso.
 *
 * Viagem saiu dos tipos novos, mas as antigas continuam com o nome delas: usam
 * a cor de "Outro" e um ícone próprio. O registro não é alterado.
 */
export function identidadeDoCompromisso(categoria: string | null | undefined): IdentidadeDaCategoria {
  const canonica = POR_ID.get(categoriaCanonica(categoria))!
  if (semAcento(categoria ?? '') === 'travel' || semAcento(categoria ?? '') === 'viagem') return { ...canonica, rotulo: 'Viagem', Icone: Plane }
  return canonica
}
