/**
 * O catálogo de categorias e subcategorias das finanças pessoais.
 *
 * A lista é ditada, item por item, e tem exclusões que parecem arbitrárias e
 * não são: delivery e lanches ficam em Lazer, e não em Alimentação, porque
 * quem quer saber quanto a casa gasta para comer precisa que o mercado não se
 * misture com o que se pede por aplicativo. Plano de saúde fica fora de Saúde,
 * cinema e shows ficam fora de Lazer, e Renda extra tem exatamente três
 * opções. Os testes guardam cada uma dessas ausências, porque a tentação de
 * "completar" a lista mais tarde é grande e destruiria a comparação.
 */

export interface Subcategoria {
  codigo: string
  nome: string
}

export interface CategoriaFinanceira {
  codigo: string
  nome: string
  subcategorias: Subcategoria[]
}

/** "Energia elétrica" vira "energia-eletrica": estável, sem acento, sem espaço. */
function codigo(grupo: string, nome: string): string {
  const limpo = nome
    .normalize('NFD').replace(/[\u0300-\u036f]/gu, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-|-$/gu, '')
  return `${grupo}.${limpo}`
}

function categoria(codigoDaCategoria: string, nome: string, subcategorias: string[]): CategoriaFinanceira {
  return {
    codigo: codigoDaCategoria,
    nome,
    subcategorias: subcategorias.map((item) => ({ codigo: codigo(codigoDaCategoria, item), nome: item })),
  }
}

export const CATEGORIAS_DE_ENTRADA: CategoriaFinanceira[] = [
  categoria('remuneracao', 'Salário e remuneração', [
    'Salário', 'Adiantamento salarial', '13º salário', 'Férias', 'Hora extra', 'Gratificação',
    'Bônus', 'Comissão', 'Participação nos lucros', 'Adicional', 'Outra remuneração',
  ]),
  // Exatamente três. Não acrescentar.
  categoria('renda-extra', 'Renda extra', ['Revenda', 'Renda de negócio próprio', 'Renda extra']),
  // Sem pensão alimentícia, benefício governamental, auxílio familiar ou bolsa de estudos.
  categoria('beneficios', 'Benefícios', ['Aposentadoria', 'Pensão', 'Benefício previdenciário', 'Outro benefício']),
  categoria('patrimonio', 'Patrimônio', [
    'Aluguel recebido', 'Venda de imóvel', 'Venda de veículo', 'Venda de bem pessoal', 'Royalties', 'Outra renda patrimonial',
  ]),
  categoria('investimentos', 'Investimentos', [
    'Dividendos', 'Juros recebidos', 'Rendimentos', 'Renda de investimentos', 'Resgate com rendimento', 'Outra receita de investimento',
  ]),
  categoria('eventuais', 'Entradas eventuais', [
    'Presente recebido', 'Doação recebida', 'Cashback', 'Reembolso pessoal', 'Estorno',
    'Restituição do Imposto de Renda', 'Indenização', 'Prêmio', 'Herança', 'Outra entrada extraordinária',
  ]),
  categoria('outras-entradas', 'Outras entradas', ['Outra renda fixa', 'Outra renda variável', 'Outra entrada']),
]

export const CATEGORIAS_DE_SAIDA: CategoriaFinanceira[] = [
  categoria('moradia', 'Moradia', [
    'Aluguel', 'Prestação/financiamento da casa', 'Condomínio', 'Água', 'Energia elétrica', 'Gás',
    'Internet residencial', 'IPTU', 'Seguro residencial', 'Segurança/monitoramento', 'Manutenção da casa',
    'Reforma', 'Móveis', 'Eletrodomésticos', 'Utensílios domésticos', 'Jardinagem', 'Diarista',
    'Serviços domésticos', 'Dedetização', 'Outra despesa de moradia',
  ]),
  // Delivery e lanches não entram aqui: pertencem a Lazer.
  categoria('alimentacao', 'Alimentação', [
    'Supermercado', 'Feira', 'Hortifruti', 'Padaria', 'Açougue/proteínas', 'Água mineral',
    'Restaurante', 'Alimentação escolar', 'Compras emergenciais', 'Outra alimentação',
  ]),
  categoria('transporte', 'Transporte', [
    'Combustível', 'Transporte público', 'Uber/99/táxi', 'Estacionamento', 'Pedágio', 'Prestação do veículo',
    'Financiamento do veículo', 'Seguro', 'IPVA', 'Licenciamento', 'Manutenção', 'Revisão', 'Troca de óleo',
    'Pneus', 'Peças', 'Acessórios', 'Lavagem', 'Multas', 'Aluguel de veículo', 'Outro transporte',
  ]),
  // Sem plano de saúde e sem plano odontológico.
  categoria('saude', 'Saúde', [
    'Consulta médica', 'Consulta odontológica', 'Exames', 'Medicamentos', 'Farmácia', 'Psicólogo/terapia',
    'Fisioterapia', 'Nutricionista', 'Óculos', 'Lentes', 'Vacinas', 'Academia', 'Procedimentos médicos',
    'Emergência médica', 'Hospital', 'Outra despesa de saúde',
  ]),
  categoria('educacao', 'Educação', [
    'Escola', 'Faculdade', 'Pós-graduação', 'Cursos', 'Matrícula', 'Mensalidade', 'Material escolar',
    'Livros', 'Uniforme', 'Transporte escolar', 'Reforço escolar', 'Idiomas', 'Cursos online',
    'Softwares educacionais', 'Congressos/eventos educacionais', 'Equipamentos para estudo', 'Outra despesa educacional',
  ]),
  categoria('filhos', 'Filhos e família', [
    'Fraldas', 'Lenços umedecidos', 'Higiene infantil', 'Leite/fórmula', 'Alimentação infantil',
    'Roupas infantis', 'Calçados infantis', 'Brinquedos', 'Passeios infantis', 'Mesada', 'Babá', 'Creche',
    'Festas de aniversário', 'Material infantil', 'Gestação', 'Enxoval', 'Ajuda a familiares',
    'Cuidados com idosos', 'Outra despesa familiar',
  ]),
  categoria('vestuario', 'Vestuário e cuidados pessoais', [
    'Roupas', 'Calçados', 'Acessórios', 'Barbearia', 'Salão', 'Cosméticos', 'Perfumes',
    'Higiene pessoal', 'Maquiagem', 'Lavanderia', 'Outro cuidado pessoal',
  ]),
  categoria('assinaturas', 'Comunicação e assinaturas', [
    'Celular', 'Internet móvel', 'Streaming de vídeo', 'Streaming de música', 'Armazenamento em nuvem',
    'Aplicativos', 'Softwares', 'Assinaturas digitais', 'Jornais/revistas', 'Inteligência artificial', 'Outra assinatura',
  ]),
  // Delivery e lanches moram aqui. Cinema e shows não existem nesta lista.
  categoria('lazer', 'Lazer', [
    'Delivery', 'Lanches', 'Passeios em família', 'Restaurantes por lazer', 'Viagens curtas/passeios',
    'Parques', 'Praia', 'Hobbies', 'Jogos', 'Esportes', 'Livros por lazer', 'Brinquedos recreativos',
    'Atividades infantis', 'Clubes/associações recreativas', 'Festas e eventos familiares', 'Outro lazer',
  ]),
  categoria('viagens', 'Viagens', [
    'Passagens', 'Hospedagem', 'Alimentação da viagem', 'Transporte da viagem', 'Passeios',
    'Seguro viagem', 'Bagagem', 'Documentação', 'Compras da viagem', 'Outra despesa de viagem',
  ]),
  categoria('generosidade', 'Dízimos, ofertas e generosidade', [
    'Dízimo', 'Oferta regular', 'Oferta missionária', 'Oferta especial', 'Projetos da igreja', 'Doações',
    'Ajuda a pessoas', 'Ajuda a famílias', 'Ação social', 'Projeto missionário', 'Outra contribuição',
  ]),
  categoria('dividas', 'Dívidas e financiamentos', [
    'Empréstimo pessoal', 'Empréstimo consignado', 'Financiamento', 'Renegociação', 'Parcelamento de dívida',
    'Cheque especial', 'Juros', 'Dívida pessoal', 'Acordo financeiro', 'Outro compromisso financeiro',
  ]),
  categoria('taxas', 'Taxas e impostos', [
    'Tarifa bancária', 'Anuidade', 'IOF', 'Imposto de renda', 'IPTU', 'Taxas públicas',
    'Documentação', 'Cartório', 'Multas', 'Outras taxas',
  ]),
  categoria('pet', 'Animais de estimação', [
    'Ração', 'Veterinário', 'Medicamentos', 'Vacinas', 'Banho/tosa', 'Acessórios',
    'Hospedagem', 'Produtos de higiene', 'Outra despesa pet',
  ]),
  categoria('presentes', 'Presentes e comemorações', [
    'Aniversários', 'Natal', 'Dia das Mães', 'Dia dos Pais', 'Casamento', 'Chá de bebê',
    'Presentes', 'Decoração', 'Festas', 'Outras comemorações',
  ]),
  categoria('imprevistos', 'Manutenção e imprevistos', [
    'Manutenção emergencial', 'Consertos', 'Reposição', 'Perdas', 'Franquia de seguro',
    'Emergência familiar', 'Emergência residencial', 'Emergência com veículo', 'Outro imprevisto',
  ]),
  categoria('outros', 'Outros', ['Despesa eventual', 'Despesa não classificada', 'Outra despesa']),
]

export type NaturezaDoLancamento = 'entrada' | 'saida'

export function categoriasDe(natureza: NaturezaDoLancamento): CategoriaFinanceira[] {
  return natureza === 'entrada' ? CATEGORIAS_DE_ENTRADA : CATEGORIAS_DE_SAIDA
}

/** A categoria e a subcategoria de um código, ou nulo quando não existe. */
export function acharSubcategoria(codigoBuscado: string): { categoria: CategoriaFinanceira; subcategoria: Subcategoria } | null {
  for (const grupo of [...CATEGORIAS_DE_ENTRADA, ...CATEGORIAS_DE_SAIDA]) {
    const encontrada = grupo.subcategorias.find((item) => item.codigo === codigoBuscado)
    if (encontrada) return { categoria: grupo, subcategoria: encontrada }
  }
  return null
}

/** "Alimentação · Supermercado", para mostrar numa linha de extrato. */
export function nomeCompleto(codigoBuscado: string): string {
  const achado = acharSubcategoria(codigoBuscado)
  return achado ? `${achado.categoria.nome} · ${achado.subcategoria.nome}` : ''
}

/**
 * Busca por nome, para o seletor em etapas não virar uma lista de duzentos itens.
 *
 * O acento não pode atrapalhar: quem digita "agua" precisa achar "Água".
 */
export function buscarSubcategorias(natureza: NaturezaDoLancamento, termo: string): Array<{ categoria: CategoriaFinanceira; subcategoria: Subcategoria }> {
  const limpo = termo.normalize('NFD').replace(/[\u0300-\u036f]/gu, '').toLocaleLowerCase('pt-BR').trim()
  if (!limpo) return []
  const achados: Array<{ categoria: CategoriaFinanceira; subcategoria: Subcategoria }> = []
  for (const grupo of categoriasDe(natureza)) {
    for (const subcategoria of grupo.subcategorias) {
      const nome = subcategoria.nome.normalize('NFD').replace(/[\u0300-\u036f]/gu, '').toLocaleLowerCase('pt-BR')
      if (nome.includes(limpo)) achados.push({ categoria: grupo, subcategoria })
    }
  }
  return achados
}
