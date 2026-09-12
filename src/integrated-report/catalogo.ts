/**
 * Os indicadores do Relatório Integrado, como o próprio relatório os escreve.
 *
 * O catálogo é escrito, não deduzido: o rótulo é o que a igreja lê no papel, e
 * mudá-lo por conta própria faria o pastor conferir uma pergunta contra outra.
 *
 * **Batismo não está aqui, de propósito.** Ele pertence a outro relatório, e
 * "Número de pessoas levadas ao batismo por influência da Unidade de ação/PG"
 * ficou de fora por decisão do pastor. Um teste guarda essa ausência.
 */
export type FormatoDoIndicador = 'numero' | 'sim_nao' | 'por_classe' | 'por_sabado'

/**
 * O que fazer com o número quando chega outro trimestre.
 *
 *  é resultado do período — campanhas realizadas, pessoas alcançadas: o
 * ano é a soma dos trimestres.  é situação da igreja — quantos
 * Pequenos Grupos existem, quantos alunos há: somar o primeiro trimestre com o
 * segundo inventaria uma igreja com o dobro do tamanho.
 */
export type TratamentoDoIndicador = 'somar' | 'atualizar'

export interface IndicadorDoRelatorio {
  id: string
  rotulo: string
  secao: string
  formato: FormatoDoIndicador
  tratamento: TratamentoDoIndicador
}

/** As classes da Escola Sabatina, na ordem e com os nomes do relatório. */
export const CLASSES_DA_ESCOLA_SABATINA = [
  'Bebês', 'Iniciantes', 'Infantis', 'Primários', 'Pré-Adolescentes',
  'Adolescentes', 'Jovens', 'Adultos', 'Classes Bíblicas', 'Filiais',
] as const
export type ClasseDaEscolaSabatina = (typeof CLASSES_DA_ESCOLA_SABATINA)[number]

export const CATALOGO_DO_RELATORIO: readonly IndicadorDoRelatorio[] = [
  { id: "planejamento-estrategico--quantos-membros-participaram-de-programas-relacionados-a-identidade", rotulo: "Quantos membros participaram de programas relacionados à Identidade profética da IASD, neste trimestre? {Ancionato}", secao: "Planejamento Estratégico", formato: 'numero', tratamento: 'somar' },
  { id: "planejamento-estrategico--sua-igreja-esta-ministrando-algum-curso-sobre-crencas", rotulo: "Sua igreja está ministrando algum curso sobre crenças fundamentais ou estilo de vida adventista para os recém-batizados? (por exemplo: Crescendo em Cristo) {Mordomia Cristã}", secao: "Planejamento Estratégico", formato: 'sim_nao', tratamento: 'atualizar' },
  { id: "planejamento-estrategico--quantos-oficiais-participaram-de-programas-de-formacao-de", rotulo: "Quantos oficiais participaram de programas de formação de liderança (realizados pela igreja local ou pelo campo-união), neste trimestre? {Ancionato}", secao: "Planejamento Estratégico", formato: 'numero', tratamento: 'somar' },
  { id: "planejamento-estrategico--quantos-membros-foram-ensinados-a-desenvolver-os-seus", rotulo: "Quantos membros foram ensinados a desenvolver os seus dons, neste trimestre? {Ministério Pessoal}", secao: "Planejamento Estratégico", formato: 'numero', tratamento: 'atualizar' },
  { id: "planejamento-estrategico--numero-de-pessoas-que-estao-ministrando-estudos-biblicos", rotulo: "Número de pessoas que estão ministrando Estudos Bíblicos. (individual, em duplas, etc.). {Ministério Pessoal}", secao: "Planejamento Estratégico", formato: 'numero', tratamento: 'atualizar' },
  { id: "planejamento-estrategico--numero-de-alunos-que-estudam-diariamente-a-licao", rotulo: "Número de alunos que estudam diariamente a lição. {Escola Sabatina}", secao: "Planejamento Estratégico", formato: 'por_classe', tratamento: 'atualizar' },
  { id: "planejamento-estrategico--numero-de-alunos-da-classe-envolvidos-em-frentes", rotulo: "Número de alunos da classe envolvidos em frentes missionárias (Classes Bíblicas, Pequenos Grupos, Estudos Bíblicos, Evangelismo Público etc.). {Escola Sabatina}", secao: "Planejamento Estratégico", formato: 'por_classe', tratamento: 'atualizar' },
  { id: "acao-solidaria-adventista--numero-de-projetos-que-foram-realizados-em-favor", rotulo: "Número de projetos que foram realizados em favor de pessoas necessitadas na comunidade.", secao: "Ação Solidária Adventista (ASA)", formato: 'numero', tratamento: 'somar' },
  { id: "acao-solidaria-adventista--numero-de-pessoas-que-foram-beneficiadas-pelos-projetos", rotulo: "Número de pessoas que foram beneficiadas pelos projetos realizados na comunidade.", secao: "Ação Solidária Adventista (ASA)", formato: 'numero', tratamento: 'somar' },
  { id: "acao-solidaria-adventista--numero-de-pessoas-recebendo-estudos-biblicos-pela-asa", rotulo: "Número de pessoas recebendo Estudos Bíblicos pela ASA.", secao: "Ação Solidária Adventista (ASA)", formato: 'numero', tratamento: 'somar' },
  { id: "ancionato--numero-de-anciaos-ancias-da-igreja-ou-diretores", rotulo: "Número de anciãos/anciãs da igreja ou Diretores de grupo organizado", secao: "Ancionato", formato: 'numero', tratamento: 'atualizar' },
  { id: "children-s-ministries--numero-de-classes-biblicas-com-criancas-e-adolescentes", rotulo: "Número de Classes Bíblicas com crianças e adolescentes.", secao: "CHILDREN'S MINISTRIES", formato: 'numero', tratamento: 'atualizar' },
  { id: "children-s-ministries--numero-de-projetos-de-discipulado-em-funcionamento", rotulo: "Número de projetos de Discipulado em funcionamento (Escola de pais, Tudo começa em casa, Amigos de Jesus).", secao: "CHILDREN'S MINISTRIES", formato: 'numero', tratamento: 'atualizar' },
  { id: "children-s-ministries--numero-de-programas-projetos-comunitarios-com-a-participacao", rotulo: "Número de programas/projetos comunitários com a participação de crianças e adolescentes.", secao: "CHILDREN'S MINISTRIES", formato: 'numero', tratamento: 'somar' },
  { id: "children-s-ministries--numero-de-escolas-cristas-de-ferias-realizadas", rotulo: "Número de Escolas Cristãs de Férias (ECF) realizadas.", secao: "CHILDREN'S MINISTRIES", formato: 'numero', tratamento: 'somar' },
  { id: "children-s-ministries--numero-de-criancas-que-participaram-da-ecf", rotulo: "Número de crianças que participaram da ECF (total).", secao: "CHILDREN'S MINISTRIES", formato: 'numero', tratamento: 'somar' },
  { id: "children-s-ministries--numero-de-criancas-adventistas-que-participaram-da-ecf", rotulo: "Número de crianças adventistas que participaram da ECF.", secao: "CHILDREN'S MINISTRIES", formato: 'numero', tratamento: 'somar' },
  { id: "children-s-ministries--possuem-um-coordenador-do-ministerio-da-crianca-e", rotulo: "Possuem um(a) Coordenador(a) do Ministério da Criança e do Ministério do Adolescente?", secao: "CHILDREN'S MINISTRIES", formato: 'sim_nao', tratamento: 'atualizar' },
  { id: "escola-sabatina--e-realizada-a-classe-de-professores", rotulo: "É realizada a Classe de Professores?", secao: "Escola Sabatina", formato: 'sim_nao', tratamento: 'atualizar' },
  { id: "escola-sabatina--numero-de-pequenos-grupos-da-igreja", rotulo: "Número de Pequenos Grupos da igreja.", secao: "Escola Sabatina", formato: 'numero', tratamento: 'atualizar' },
  { id: "escola-sabatina--numero-de-unidades-de-acao", rotulo: "Número de Unidades de Ação. (Classes)", secao: "Escola Sabatina", formato: 'por_classe', tratamento: 'atualizar' },
  { id: "escola-sabatina--numero-de-professores-em-cada-classe", rotulo: "Número de professores em cada classe.", secao: "Escola Sabatina", formato: 'por_classe', tratamento: 'atualizar' },
  { id: "escola-sabatina--numero-de-alunos-da-escola-sabatina", rotulo: "Número de alunos da Escola Sabatina.", secao: "Escola Sabatina", formato: 'por_classe', tratamento: 'atualizar' },
  { id: "escola-sabatina--numero-de-alunos-presentes", rotulo: "Número de alunos presentes.", secao: "Escola Sabatina", formato: 'por_classe', tratamento: 'atualizar' },
  { id: "escola-sabatina--numero-de-pessoas-que-tem-sua-licao-da", rotulo: "Número de pessoas que têm sua lição da Escola Sabatina", secao: "Escola Sabatina", formato: 'por_classe', tratamento: 'atualizar' },
  { id: "escola-sabatina--numero-de-alunos-que-estao-dando-estudos-biblicos", rotulo: "Número de alunos que estão dando estúdos bíblicos", secao: "Escola Sabatina", formato: 'por_classe', tratamento: 'atualizar' },
  { id: "evangelismo--numero-de-campanhas-evangelisticas-em-geral", rotulo: "Número de Campanhas evangelísticas em geral.", secao: "Evangelismo", formato: 'numero', tratamento: 'somar' },
  { id: "evangelismo--numero-de-programas-de-alcance-evangelistico-com-criancas", rotulo: "Número de programas de alcance evangelístico com crianças e adolescentes (Semana Santa, Semana de Evangelismo, Evangelismo Kids, Sou Missionário Kids e Teens, Geração Missionária, WAR / É Guerra, etc.).", secao: "Evangelismo", formato: 'numero', tratamento: 'somar' },
  { id: "evangelismo--a-igreja-realiza-cultos-evangelisticos-semanais-aos-domingos", rotulo: "A igreja realiza cultos evangelísticos semanais aos domingos?", secao: "Evangelismo", formato: 'sim_nao', tratamento: 'atualizar' },
  { id: "ministerio-adventista-das--sua-igreja-elegeu-um-lider-do-ministerio-adventista", rotulo: "Sua igreja elegeu um líder do Ministério Adventista das Possibilidades?", secao: "Ministério Adventista das Possibilidades", formato: 'sim_nao', tratamento: 'atualizar' },
  { id: "ministerio-adventista-das--o-ministerio-adventista-das-possibilidades-esta-funcionando-na", rotulo: "O Ministério Adventista das Possibilidades está funcionando na sua igreja?", secao: "Ministério Adventista das Possibilidades", formato: 'sim_nao', tratamento: 'atualizar' },
  { id: "ministerio-da-mulher--foi-realizado-neste-trimestre-o-sabado-missionario-da", rotulo: "Foi realizado neste trimestre o Sábado Missionário da Mulher Adventista em sua igreja e/ou comunidade?", secao: "Ministério da Mulher", formato: 'sim_nao', tratamento: 'atualizar' },
  { id: "ministerio-da-mulher--foi-realizado-neste-trimestre-a-semana-de-evangelismo", rotulo: "Foi realizado neste trimestre a Semana de Evangelismo Feminino em sua igreja e/ou comunidade?", secao: "Ministério da Mulher", formato: 'sim_nao', tratamento: 'atualizar' },
  { id: "ministerio-da-mulher--foi-realizado-neste-trimestre-o-projeto-quebrando-o", rotulo: "Foi realizado neste trimestre o projeto “Quebrando o Silencio” em sua igreja e/ou comunidade?", secao: "Ministério da Mulher", formato: 'sim_nao', tratamento: 'atualizar' },
  { id: "ministerio-da-mulher--numero-de-mulheres-que-concluiram-o-curso-de", rotulo: "Número de mulheres que concluíram o Curso de Liderança Feminina.", secao: "Ministério da Mulher", formato: 'numero', tratamento: 'somar' },
  { id: "ministerio-da-mulher--numero-de-retiros-espirituais-e-congressos-realizados-pelo", rotulo: "Número de retiros espirituais e congressos realizados pelo Ministério da Mulher neste trimestre.", secao: "Ministério da Mulher", formato: 'numero', tratamento: 'somar' },
  { id: "ministerio-da-mulher--numero-de-mulheres-adventistas-presentes-nos-retiros-espirituais", rotulo: "Número de mulheres adventistas presentes nos retiros espirituais e congressos do Ministério da Mulher neste trimestre.", secao: "Ministério da Mulher", formato: 'numero', tratamento: 'somar' },
  { id: "ministerio-da-mulher--numero-de-mulheres-nao-adventistas-presentes-nos-retiros", rotulo: "Número de mulheres não adventistas presentes nos retiros espirituais e congressos do Ministério da Mulher neste trimestre.", secao: "Ministério da Mulher", formato: 'numero', tratamento: 'somar' },
  { id: "ministerio-da-mulher--numero-de-seminarios-de-capacitacao-e-treinamento-realizados", rotulo: "Número de seminários de capacitação e treinamento realizados pelo Ministério da Mulher neste trimestre.", secao: "Ministério da Mulher", formato: 'numero', tratamento: 'somar' },
  { id: "ministerio-da-recepcao--a-igreja-possui-um-coordenador-de-recepcao-e", rotulo: "A igreja possui um coordenador de recepção e a equipe está atuante?", secao: "Ministério da Recepção", formato: 'sim_nao', tratamento: 'atualizar' },
  { id: "ministerio-da-recepcao--a-igreja-realiza-a-acao-semanal", rotulo: "A igreja realiza a ação semanal? (Recepção atuante em todos os cultos, registro de dados dos amigos, contato com eles durante a semana e encaminhamento de suas solicitações).", secao: "Ministério da Recepção", formato: 'sim_nao', tratamento: 'atualizar' },
  { id: "ministerio-da-recepcao--a-igreja-realiza-a-acao-mensal", rotulo: "A igreja realiza a ação mensal? (Instrução para os membros serem acolhedores).", secao: "Ministério da Recepção", formato: 'sim_nao', tratamento: 'atualizar' },
  { id: "ministerio-da-recepcao--a-igreja-realiza-a-acao-trimestral", rotulo: "A igreja realiza a ação trimestral? (Reunião de avaliação do trabalho, treinamento da equipe e preenchimento do relatório).", secao: "Ministério da Recepção", formato: 'sim_nao', tratamento: 'atualizar' },
  { id: "ministerio-da-saude--funciona-o-clube-vida-e-saude", rotulo: "Funciona o Clube Vida e Saúde?", secao: "Ministério da Saúde", formato: 'sim_nao', tratamento: 'atualizar' },
  { id: "ministerio-da-saude--quantas-feiras-de-saude-foram-realizadas", rotulo: "Quantas Feiras de Saúde foram realizadas?", secao: "Ministério da Saúde", formato: 'numero', tratamento: 'somar' },
  { id: "ministerio-da-saude--foram-realizados-cursos-de-cozinha-saudavel", rotulo: "Foram realizados cursos de cozinha saudável?", secao: "Ministério da Saúde", formato: 'sim_nao', tratamento: 'atualizar' },
  { id: "ministerio-da-saude--foi-realizado-algum-programa-de-saude-mental-e", rotulo: "Foi realizado algum programa de saúde mental e emocional?", secao: "Ministério da Saúde", formato: 'sim_nao', tratamento: 'atualizar' },
  { id: "ministerio-de-publicacoes--a-igreja-tem-um-coordenador-de-publicacoes", rotulo: "A igreja tem um Coordenador de Publicações?", secao: "Ministério de Publicações e Espírito de Profecia", formato: 'sim_nao', tratamento: 'atualizar' },
  { id: "ministerio-de-publicacoes--durante-este-ano-sua-congregacao-realizou-alguma-atividade", rotulo: "Durante este ano, sua congregação realizou alguma atividade (sermão, palestra ou seminário) sobre o tema do espírito de profecia?", secao: "Ministério de Publicações e Espírito de Profecia", formato: 'sim_nao', tratamento: 'atualizar' },
  { id: "ministerio-jovem--foi-realizada-a-semana-jovem", rotulo: "Foi realizada a Semana Jovem?", secao: "Ministério Jovem", formato: 'sim_nao', tratamento: 'atualizar' },
  { id: "ministerio-jovem--numero-de-participantes-do-maranata-academy", rotulo: "Número de participantes do Maranata Academy.", secao: "Ministério Jovem", formato: 'numero', tratamento: 'somar' },
  { id: "ministerio-jovem--numero-de-doadores-de-sangue-e-ou-medula", rotulo: "Número de doadores de sangue e/ou medula que participaram do projeto Vida por Vidas.", secao: "Ministério Jovem", formato: 'numero', tratamento: 'somar' },
  { id: "ministerio-jovem--realizou-a-celebracao-do-dia-mundial-do-jovem", rotulo: "Realizou a celebração do Dia Mundial do Jovem Adventista (Global Youth Day)?", secao: "Ministério Jovem", formato: 'sim_nao', tratamento: 'atualizar' },
  { id: "ministerio-pessoal--numero-de-treinamentos-encontros-missionarios", rotulo: "Número de treinamentos/encontros missionários (duplas missionárias, instrutor bíblico, Classes Bíblicas, Pequenos Grupos etc.).", secao: "Ministério Pessoal", formato: 'numero', tratamento: 'somar' },
  { id: "ministerio-pessoal--numero-de-classes-biblicas-em-funcionamento", rotulo: "Número de Classes Bíblicas em funcionamento.", secao: "Ministério Pessoal", formato: 'numero', tratamento: 'atualizar' },
  { id: "ministerio-pessoal--numero-de-pessoas-recebendo-estudos-biblicos", rotulo: "Número de pessoas recebendo Estudos Bíblicos (por todos os métodos missionários).", secao: "Ministério Pessoal", formato: 'numero', tratamento: 'somar' },
  { id: "ministerio-pessoal--numero-de-duplas-missionarias-ministrando-estudos-biblicos", rotulo: "Número de duplas missionárias ministrando Estudos Bíblicos.", secao: "Ministério Pessoal", formato: 'numero', tratamento: 'atualizar' },
  { id: "ministerio-pessoal--pontos-de-pregacao-de-semana-santa-igreja-pgs", rotulo: "Pontos de pregação de Semana Santa: Igreja, PGs, salão, online (Zoom, Youtube, Facebook, etc.).", secao: "Ministério Pessoal", formato: 'numero', tratamento: 'somar' },
  { id: "ministerio-pessoal--total-de-amigos-presentes-na-semana-santa", rotulo: "Total de amigos (interessados) presentes na Semana Santa.", secao: "Ministério Pessoal", formato: 'numero', tratamento: 'somar' },
  { id: "mordomia-crista--antes-de-recolher-a-oferta-no-culto-divino", rotulo: "Antes de recolher a oferta no culto divino, são apresentados os testemunhos “Provai e Vede”?", secao: "Mordomia Cristã", formato: 'sim_nao', tratamento: 'atualizar' },
  { id: "mordomia-crista--foi-pregado-um-sermao-por-mes-sobre-fidelidade", rotulo: "Foi pregado um sermão por mês sobre fidelidade a Deus?", secao: "Mordomia Cristã", formato: 'sim_nao', tratamento: 'atualizar' },
  { id: "mordomia-crista--foi-realizado-o-diagnostico-espiritual-da-igreja-incluindo", rotulo: "Foi realizado o diagnóstico espiritual da igreja incluindo o plano de visitação?", secao: "Mordomia Cristã", formato: 'sim_nao', tratamento: 'atualizar' },
  { id: "mordomia-crista--a-igreja-realizou-os-10-dias-de-clamor", rotulo: "A igreja realizou os 10 Dias de Clamor?", secao: "Mordomia Cristã", formato: 'sim_nao', tratamento: 'atualizar' },
  { id: "relacoes-publicas-e--durante-este-ano-sua-congregacao-realizou-alguma-atividade", rotulo: "Durante este ano, sua congregação realizou alguma atividade (sermão, palestra ou seminário) sobre o tema da liberdade religiosa?", secao: "Relações Públicas e Liberdade Religiosa", formato: 'sim_nao', tratamento: 'atualizar' },
  { id: "secretaria--numero-de-presentes-na-escola-sabatina", rotulo: "Número de presentes na Escola Sabatina (todos os presentes inclusive os não batizados).", secao: "Secretaria", formato: 'por_sabado', tratamento: 'atualizar' },
  { id: "secretaria--numero-de-presentes-no-culto-divino", rotulo: "Número de presentes no Culto Divino (todos os presentes inclusive os não batizados).", secao: "Secretaria", formato: 'por_sabado', tratamento: 'atualizar' },
  { id: "secretaria--sua-igreja-realizou-o-evangelismo-reencontro-neste-trimestre", rotulo: "Sua igreja realizou o Evangelismo Reencontro neste trimestre?", secao: "Secretaria", formato: 'sim_nao', tratamento: 'atualizar' },
  { id: "secretaria--a-classificacao-dos-membros-foi-analisada-na-comissao", rotulo: "A classificação dos membros foi analisada na Comissão Diretiva neste trimestre?", secao: "Secretaria", formato: 'sim_nao', tratamento: 'atualizar' },
  { id: "secretaria--as-respostas-do-relatorio-integrado-foram-analisadas-na", rotulo: "As respostas do relatório integrado foram analisadas na Comissão Diretiva neste trimestre?", secao: "Secretaria", formato: 'sim_nao', tratamento: 'atualizar' },
  { id: "secretaria--quando-ha-batismos-as-fichas-batismais-sao-cadastradas", rotulo: "Quando há batismos, as fichas batismais são cadastradas no ACMS pelo(a) secretário(a) da igreja?", secao: "Secretaria", formato: 'sim_nao', tratamento: 'atualizar' },
  { id: "secretaria--o-cadastro-da-lista-de-oficiais-esta-devidamente", rotulo: "O cadastro da lista de oficiais está devidamente atualizado no ACMS?", secao: "Secretaria", formato: 'sim_nao', tratamento: 'atualizar' },
  { id: "secretaria--capacidade-instalada-quantos-adultos-cabem-sentados-nos-bancos", rotulo: "Capacidade instalada: Quantos adultos cabem sentados nos bancos da nave da sua igreja. Se possuem 2 cultos no sábado, multiplique o número por 2. (Não incluir neste cálculo cadeiras de outros ambientes: como sala dos", secao: "Secretaria", formato: 'numero', tratamento: 'atualizar' },
  { id: "children-s-ministries--numero-de-professores-e-lideres-que-concluiram-o", rotulo: "Número de professores e líderes que concluíram o curso de liderança do MC/MA.", secao: "CHILDREN'S MINISTRIES", formato: 'numero', tratamento: 'atualizar' },
  { id: "comunicacao--numero-de-seguidores-que-a-congregacao-possui-somados", rotulo: "Número de seguidores que a congregação possui somados em todas as redes sociais.", secao: "Comunicação", formato: 'numero', tratamento: 'atualizar' },
  { id: "ministerio-adventista-das--numero-de-pessoas-com-algum-tipo-de-deficiencia", rotulo: "Número de pessoas com algum tipo de deficiência (física, cega, surda, transtorno ou síndrome).", secao: "Ministério Adventista das Possibilidades", formato: 'numero', tratamento: 'atualizar' },
  { id: "ministerio-adventista-das--numero-de-interpretes-para-surdos", rotulo: "Número de intérpretes para surdos.", secao: "Ministério Adventista das Possibilidades", formato: 'numero', tratamento: 'atualizar' },
  { id: "ministerio-da-musica--existe-um-ministerio-de-louvor-organizado-na-igreja", rotulo: "Existe um ministério de louvor organizado na igreja?", secao: "Ministério da Música", formato: 'sim_nao', tratamento: 'atualizar' },
  { id: "ministerio-da-musica--possuem-um-coral-ou-grupo-musical-ativo-na", rotulo: "Possuem um coral ou grupo musical ativo na igreja?", secao: "Ministério da Música", formato: 'sim_nao', tratamento: 'atualizar' },
  { id: "ministerio-da-musica--possuem-uma-banda-orquestra-que-toca-nos-cultos", rotulo: "Possuem uma banda/orquestra que toca nos cultos da igreja?", secao: "Ministério da Música", formato: 'sim_nao', tratamento: 'atualizar' },
] as const

export function indicadorPorId(id: string): IndicadorDoRelatorio | null {
  return CATALOGO_DO_RELATORIO.find((item) => item.id === id) ?? null
}
