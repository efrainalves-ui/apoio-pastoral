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
 *   - descrição curta, que diga o que a pessoa encontra do outro lado;
 *   - endereço sem parâmetro, com uma exceção: `resourcekey`, que o Google
 *     exige em pastas antigas do Drive e sem a qual o acervo simplesmente não
 *     abre para quem nunca entrou nele.
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
    id: 'cursos-biblicos',
    title: 'Cursos bíblicos em PDF',
    description: 'Acervo de cursos bíblicos prontos para imprimir ou enviar ao interessado.',
    category: 'estudo',
    url: 'https://drive.google.com/drive/folders/1i1Vlodgome0w5POupIwJ2pzhNvjQO4t5',
  },
  {
    id: 'pra-ser-feliz',
    title: 'Pra Ser Feliz',
    description: 'Material da série, para uso em pequenos grupos e visitas.',
    category: 'estudo',
    url: 'https://drive.google.com/drive/folders/1w_yWI0Gr7-NAsrCAVRtMw4jGWR9e2_39',
  },
  {
    id: 'livros-logos',
    title: 'Livros — Logos',
    description: 'Biblioteca de apoio ao estudo e ao preparo do sermão.',
    category: 'estudo',
    url: 'https://drive.google.com/drive/folders/1S6uNZnr64mroMs3rJZGy0Hs7Db6wyAX-',
  },
  {
    id: 'projeto-live',
    title: 'Projeto Live — Viva a vida ao vivo',
    description: 'Material do projeto, para programação e divulgação.',
    category: 'estudo',
    url: 'https://drive.google.com/drive/folders/1EihsUyPu4zOrjCFUiiJO75RnuFGnYj8v',
  },
  {
    id: 'livros-1',
    title: 'Livros 1',
    description: 'Primeira parte do acervo de livros.',
    category: 'estudo',
    url: 'https://drive.google.com/drive/folders/0BwTeMlwOGyxGTzZOWEFGOHpQc3M?resourcekey=0-vjc--HWFpJtuItNqlWocSw',
  },
  {
    id: 'livros-2',
    title: 'Livros 2',
    description: 'Segunda parte do acervo de livros.',
    category: 'estudo',
    url: 'https://drive.google.com/drive/folders/1-Ax5-YG16e7Xy7gbyjWHUKMGR8GKL9nb',
  },
  {
    id: 'biblioteca-ministerial',
    title: 'Livros e treinamentos',
    description: 'Biblioteca ministerial por tema: comentários, teologia, biografias e material de treinamento.',
    category: 'estudo',
    url: 'https://1drv.ms/f/c/7193f87a532d5955/IgBVWS1TeviTIIBx7fsCAAAAAeBULwoe9uQOPRidZIaq7cc',
  },
  {
    id: 'ferramentas-biblicas',
    title: 'Ferramentas bíblicas',
    description: 'Recursos de consulta e apoio ao estudo da Bíblia.',
    category: 'ferramenta',
    url: 'https://drive.google.com/drive/folders/1jVTIW2EzHsOpuBQLPmXh_AWJDP1NeORp',
  },
  {
    id: 'esperanca-mais',
    title: 'Novo Tempo',
    description: 'Programação, séries e material de apoio para evangelismo.',
    category: 'ferramenta',
    url: 'https://novotempo.com',
  },
] as const
