/**
 * Links úteis, versionados no próprio aplicativo.
 *
 * Nesta primeira versão a lista mora aqui, no código: atualizar um link exige
 * publicar o aplicativo de novo. É de propósito. A alternativa — uma área comum
 * que qualquer pastor edita — precisa de conta administradora, moderação e uma
 * conversa sobre quem responde pelo que aparece ali. Nada disso existe ainda, e
 * uma lista editável sem isso é um canal aberto sem dono.
 *
 * Regras desta lista, conferidas em teste:
 *
 *   - todo endereço é `https`, sem exceção;
 *   - nada de link que peça login pessoal do pastor ou que leve a dado de
 *     membro;
 *   - descrição curta, que diga o que a pessoa encontra do outro lado.
 */

export const LINK_CATEGORIES = ['institucional', 'estudo', 'formulario', 'ferramenta'] as const
export type LinkCategory = (typeof LINK_CATEGORIES)[number]

export const LINK_CATEGORY_LABELS: Record<LinkCategory, string> = {
  institucional: 'Institucional',
  estudo: 'Estudo e preparo',
  formulario: 'Formulários',
  ferramenta: 'Ferramentas',
}

export interface UsefulLink {
  id: string
  title: string
  description: string
  category: LinkCategory
  url: string
}

export const USEFUL_LINKS: readonly UsefulLink[] = [
  {
    id: 'portal-adventista',
    title: 'Portal Adventista',
    description: 'Notícias e comunicados oficiais da Igreja Adventista do Sétimo Dia.',
    category: 'institucional',
    url: 'https://www.adventistas.org',
  },
  {
    id: 'manual-da-igreja',
    title: 'Manual da Igreja',
    description: 'Referência de organização, cargos e procedimentos da igreja local.',
    category: 'institucional',
    url: 'https://www.adventist.org/documents/church-manual/',
  },
  {
    id: 'licao-da-escola-sabatina',
    title: 'Lição da Escola Sabatina',
    description: 'Estudo da semana, para preparo pessoal e da classe.',
    category: 'estudo',
    url: 'https://mais.cpb.com.br/licao-adultos/',
  },
  {
    id: 'escritos-de-ellen-white',
    title: 'Escritos de Ellen G. White',
    description: 'Acervo completo, com busca por tema e por livro.',
    category: 'estudo',
    url: 'https://egwwritings.org',
  },
  {
    id: 'biblia-online',
    title: 'Bíblia online',
    description: 'Texto bíblico em várias versões, para consulta e preparo de sermão.',
    category: 'estudo',
    url: 'https://www.bible.com',
  },
  {
    id: 'esperanca-mais',
    title: 'Novo Tempo',
    description: 'Programação, séries e material de apoio para evangelismo.',
    category: 'ferramenta',
    url: 'https://novotempo.com',
  },
] as const
