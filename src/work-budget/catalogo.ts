import type { BaseDeCalculo } from './parametros'

/**
 * O catálogo do Trabalho.
 *
 * Uma categoria aqui descreve **o que** é o gasto, e nunca quanto ele vale nem
 * quanto é reembolsado. Percentual, teto e base são configuração, porque mudam
 * de Campo para Campo e de ano para ano; a lista de categorias é a mesma em
 * qualquer lugar.
 *
 * `regraPadrao` é só o formato sugerido — se o item costuma ter teto por
 * percentual do FPE, a tela já abre esse campo. O valor continua em branco até
 * alguém informá-lo.
 */

export interface SubcategoriaDoTrabalho {
  id: string
  nome: string
  /** Formato de regra que este item costuma ter, para a tela abrir o campo certo. */
  regraPadrao: 'sem_reembolso' | 'percentual_da_despesa' | 'teto_absoluto' | 'percentual_de_base' | 'faixa'
  /** Base sugerida quando a regra é percentual de base. */
  baseSugerida: BaseDeCalculo | null
  /** Itens com a mesma chave dividem um teto só. */
  limiteConjunto: string
  /** Costuma vir descontado ou pago direto pela instituição. */
  costumaVirPelaFolha: boolean
}

export interface FamiliaDoTrabalho {
  id: string
  nome: string
  subcategorias: SubcategoriaDoTrabalho[]
}

const item = (
  id: string, nome: string,
  overrides: Partial<Omit<SubcategoriaDoTrabalho, 'id' | 'nome'>> = {},
): SubcategoriaDoTrabalho => ({
  id, nome, regraPadrao: 'sem_reembolso', baseSugerida: null,
  limiteConjunto: '', costumaVirPelaFolha: false, ...overrides,
})

export const CATALOGO_DO_TRABALHO: FamiliaDoTrabalho[] = [
  {
    id: 'subsistencia', nome: 'Subsistência',
    subcategorias: [
      item('subsistencia_basica', 'Subsistência básica', { regraPadrao: 'percentual_de_base', baseSugerida: 'FPE_INTEGRAL', costumaVirPelaFolha: true }),
      item('adicionais', 'Adicionais e complementos', { costumaVirPelaFolha: true }),
      item('quota_pais', 'Quota-pais', { regraPadrao: 'percentual_de_base', baseSugerida: 'SUBSISTENCIA_BASICA', costumaVirPelaFolha: true }),
      item('decimo_terceiro', 'Décimo terceiro', { costumaVirPelaFolha: true }),
      item('ferias', 'Férias', { costumaVirPelaFolha: true }),
    ],
  },
  {
    id: 'moradia', nome: 'Moradia',
    subcategorias: [
      item('aluguel', 'Aluguel', { regraPadrao: 'teto_absoluto' }),
      item('condominio', 'Condomínio', { regraPadrao: 'teto_absoluto' }),
      item('iptu', 'IPTU e taxas'),
      item('energia', 'Energia elétrica', { regraPadrao: 'percentual_da_despesa' }),
      item('agua', 'Água e esgoto', { regraPadrao: 'percentual_da_despesa' }),
      item('gas', 'Gás'),
      item('climatizacao', 'Climatização', { regraPadrao: 'faixa', baseSugerida: 'FPE_INTEGRAL' }),
      item('manutencao_casa', 'Manutenção da casa pastoral'),
      item('mobiliario', 'Mobiliário da casa pastoral'),
    ],
  },
  {
    id: 'comunicacao', nome: 'Comunicação',
    subcategorias: [
      item('internet', 'Internet', { regraPadrao: 'teto_absoluto', limiteConjunto: 'comunicacao' }),
      item('telefone', 'Telefone', { regraPadrao: 'teto_absoluto', limiteConjunto: 'comunicacao' }),
      item('aparelho', 'Aparelho celular', { regraPadrao: 'teto_absoluto' }),
      item('software', 'Assinaturas e software'),
    ],
  },
  {
    id: 'veiculo', nome: 'Veículo',
    subcategorias: [
      item('combustivel', 'Combustível', { regraPadrao: 'percentual_da_despesa' }),
      item('quilometragem', 'Quilometragem rodada', { regraPadrao: 'percentual_de_base', baseSugerida: 'VALOR_FIXO_LOCAL' }),
      item('manutencao_veiculo', 'Manutenção e revisão'),
      item('pneus', 'Pneus'),
      item('seguro', 'Seguro'),
      item('ipva', 'IPVA e licenciamento'),
      item('pedagio', 'Pedágio e estacionamento'),
      item('aquisicao_veiculo', 'Aquisição e financiamento'),
    ],
  },
  {
    id: 'viagens', nome: 'Viagens e diárias',
    subcategorias: [
      item('diaria', 'Diária', { regraPadrao: 'percentual_de_base', baseSugerida: 'VALOR_FIXO_LOCAL' }),
      item('hospedagem', 'Hospedagem', { regraPadrao: 'teto_absoluto' }),
      item('alimentacao_viagem', 'Alimentação em viagem', { regraPadrao: 'teto_absoluto' }),
      item('passagem', 'Passagens'),
      item('transporte_local', 'Transporte no destino'),
      item('inscricao', 'Inscrição em evento'),
    ],
  },
  {
    id: 'mudanca', nome: 'Mudança',
    subcategorias: [
      item('transporte_mudanca', 'Transporte da mudança'),
      item('embalagem', 'Embalagem e carregadores'),
      item('hospedagem_mudanca', 'Hospedagem durante a mudança'),
      item('instalacao', 'Instalação na nova moradia'),
      item('perdas', 'Perdas e avarias'),
    ],
  },
  {
    id: 'saude', nome: 'Saúde',
    subcategorias: [
      item('plano', 'Plano de saúde', { costumaVirPelaFolha: true }),
      item('consulta', 'Consultas', { regraPadrao: 'percentual_da_despesa' }),
      item('exame', 'Exames', { regraPadrao: 'percentual_da_despesa' }),
      item('medicamento', 'Medicamentos', { regraPadrao: 'percentual_da_despesa' }),
      item('odontologia', 'Odontologia', { regraPadrao: 'percentual_da_despesa' }),
      item('oftalmologia', 'Óculos e lentes', { regraPadrao: 'teto_absoluto' }),
      item('internacao', 'Internação e cirurgia'),
    ],
  },
  {
    id: 'educacao', nome: 'Educação e família',
    subcategorias: [
      item('mensalidade_filhos', 'Mensalidade dos filhos', { regraPadrao: 'percentual_da_despesa' }),
      item('material_escolar', 'Material escolar'),
      item('educacao_do_obreiro', 'Estudo do obreiro', { regraPadrao: 'percentual_da_despesa' }),
      item('educacao_conjuge', 'Estudo do cônjuge', { regraPadrao: 'percentual_da_despesa' }),
      item('creche', 'Creche'),
    ],
  },
  {
    id: 'letra', nome: 'LETRA',
    subcategorias: [
      item('livros', 'Livros'),
      item('equipamento', 'Equipamentos'),
      item('mobiliario_gabinete', 'Mobiliário do gabinete'),
      item('assinaturas', 'Assinaturas e periódicos'),
    ],
  },
  {
    id: 'ministerio', nome: 'Ministério',
    subcategorias: [
      item('material_evangelismo', 'Material de evangelismo'),
      item('eventos', 'Eventos e programações'),
      item('alimentacao_ministerio', 'Alimentação em atividade'),
      item('ajuda_a_membros', 'Ajuda a membros'),
      item('outros_ministerio', 'Outras despesas do ministério'),
    ],
  },
  {
    id: 'outros', nome: 'Outros',
    subcategorias: [
      item('previdencia', 'Previdência', { costumaVirPelaFolha: true }),
      item('emprestimo', 'Empréstimo institucional', { costumaVirPelaFolha: true }),
      item('descontos', 'Descontos diversos', { costumaVirPelaFolha: true }),
      item('outros_gerais', 'Outros'),
    ],
  },
]

const INDICE = new Map(
  CATALOGO_DO_TRABALHO.flatMap((familia) =>
    familia.subcategorias.map((subcategoria) => [subcategoria.id, { familia, subcategoria }] as const)),
)

export function acharSubcategoria(id: string): { familia: FamiliaDoTrabalho; subcategoria: SubcategoriaDoTrabalho } | null {
  return INDICE.get(id) ?? null
}

/** O nome que aparece na tela: "Moradia · Energia elétrica". */
export function nomeCompleto(id: string): string {
  const achado = INDICE.get(id)
  return achado ? `${achado.familia.nome} · ${achado.subcategoria.nome}` : id
}

export function nomeDaFamilia(id: string): string {
  return CATALOGO_DO_TRABALHO.find((familia) => familia.id === id)?.nome ?? id
}

/** As subcategorias que dividem um mesmo teto. */
export function itensDoLimiteConjunto(chave: string): SubcategoriaDoTrabalho[] {
  if (!chave) return []
  return CATALOGO_DO_TRABALHO.flatMap((familia) =>
    familia.subcategorias.filter((subcategoria) => subcategoria.limiteConjunto === chave))
}
