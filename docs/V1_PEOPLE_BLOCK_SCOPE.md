# Escopo entregue — bloco de pessoas da V1

Atualizado em: 20 de agosto de 2026.

## Blocos concluídos

- BL-005: pessoas, membros e importação local da lista em PDF;
- BL-006: famílias formadas manualmente, inclusive entre igrejas;
- BL-012: informação privada de fidelidade com classificação oficial e precisão explícita (mês exato, faixa ou somente categoria);
- BL-017: busca global local;
- BL-018: aniversários e mensagens editáveis.

O BL-004 continua integrado: a igreja mostra sua contagem de membros, e pessoas e famílias mantêm os vínculos cifrados com distrito e igrejas.

## Regras implementadas

- pessoa é a entidade central; igreja atual e períodos de vínculo são históricos separados;
- o cadastro manual exige nome e igreja, calcula idade e preserva situação pastoral independente da importação;
- a identidade de importação de membros usa nome normalizado e nascimento. Homônimos não são unidos apenas pelo nome;
- ausência em lista recente muda somente o estado da lista para “não consta”; não muda automaticamente a situação pastoral;
- lotes são atômicos, idempotentes pelo hash do arquivo e reversíveis apenas quando não há alterações ou dependências posteriores;
- famílias podem ter pessoas de igrejas diferentes e uma pessoa não entra acidentalmente em duas famílias;
- participantes futuros de visitas podem ser uma referência a pessoa ou um convidado pelo nome, sem cadastro permanente;
- busca e cálculos de aniversário acontecem em memória, no dispositivo;
- fidelidade grava a categoria informada, a precisão efetivamente disponível, faixa de origem, data e histórico. Classificação: 0 mês Não dizimista; 1–7 meses Dizimista não sistemático; 8–12 meses Dizimista;
- “sem renda” não é inferido;
- não existem valores monetários, ranking entre igrejas, pontuação espiritual ou automação de decisões.

## Formatos de PDF aceitos nesta validação

O importador aceita PDF textual de até 20 MB. PDFs vazios, protegidos sem texto, escaneados sem OCR ou com estrutura desconhecida são recusados sem alterar dados.

Membros podem ser reconhecidos como seções `IGREJA: Nome` seguidas de linhas `Nome | dd/mm/aaaa`, linhas `Igreja;Nome;dd/mm/aaaa` ou relatórios paginados em duas colunas com igreja e total no cabeçalho. Datas técnicas do cabeçalho não entram como nascimento.

Fidelidade aceita as mesmas seções com `Nome | meses`, `Igreja;Nome;meses` e relatórios paginados divididos em “8 a 12”, “1 a 7” e “sem registro”. Colunas alheias à classificação são descartadas durante a leitura. Quando o documento informa somente faixa ou categoria, o snapshot preserva esse nível de precisão, mantém `months` nulo e não cria divergência. Correspondência única de nome e igreja é aplicada automaticamente; nomes ausentes, múltiplas correspondências, ambiguidades reais e linhas repetidas permanecem na prévia.

A validação com PDFs reais deve acontecer em ambiente local controlado, com sincronização desativada. Correções de leiaute entram no projeto somente com fixtures integralmente fictícias; arquivos e conteúdo reais não são versionados. Um leiaute diferente exige um parser genérico testado, e o sistema não tenta adivinhar campos.

## Fora do escopo

Não foram implementados agenda, visitas, questionário pastoral, pedidos de oração, sermões, crescimento financeiro, batismos, Comissão de Nomeações, V1.1, V2 ou Futuro.
