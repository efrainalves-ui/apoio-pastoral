# Relatório de testes — Marco 0 + organização e cuidado pastoral da V1

Atualizado em: 27 de agosto de 2026. Este relatório cobre as validações registradas até aqui; módulos adicionados posteriormente requerem validação integrada antes de dados reais.

## Automatizados executados

| Verificação | Resultado |
|---|---|
| TypeScript estrito | aprovado |
| ESLint sem warnings | aprovado |
| Vitest | 134/134 testes aprovados em 46 arquivos |
| Build de produção | aprovado, inclusive PDF.js e worker local |
| Criptografia e cofre | senha incorreta, recovery code, troca de senha e autenticação de payload aprovados |
| Banco e sincronização | ausência de plaintext, transação outbox e ciphertext-only aprovados |
| PWA | manifesto standalone, ícones, service worker e precache verificados |

Todos os testes usam contas, pessoas, famílias, igrejas, endereços e senhas fictícios.

## Validação da preparação para homologação interna

- a tela de acesso cobre criação de conta, entrada, recuperação condicionada à existência de conta, rótulos acessíveis e alternância das abas por teclado;
- rotas internas continuam protegidas sem sessão desbloqueada;
- as rotas removidas de Transferência de Distrito e Novo Distrito continuam redirecionadas para a V1 disponível;
- o repositório local recusa mutação de registro pertencente a outra conta e mantém as listagens isoladas;
- dispositivo local revogado não é reativado durante o acesso e o mesmo identificador não pode ser vinculado a outra conta;
- backup de uma conta é recusado em outra, exige confirmação visual e aplica o lote integralmente ou não aplica nenhum registro;
- conflitos de sincronização com mesma versão são preservados somente como envelopes cifrados, sem substituir a versão local;
- o cursor composto preserva operações com o mesmo horário e o envio remoto usa repetição idempotente;
- lint sem warnings, TypeScript estrito, build de produção e verificação PWA foram aprovados;
- a build atual foi revisada em 1440 × 1000 e 390 × 844, sem rolagem horizontal, com foco visível e contraste reforçado no tema escuro.

## Preparação local para Supabase de homologação

- `src/sync/service.test.ts` cobre duas contas fictícias isoladas: cada pull recebe somente a própria operação e o transporte não contém o conteúdo pastoral fictício em texto legível;
- a revisão da migration e o roteiro manual estão em `docs/SUPABASE_HOMOLOGATION.md`;
- nenhuma migration foi aplicada e nenhuma URL, chave, token ou conta de Supabase foi usada nesta validação local;
- a migration local foi corrigida para recusar envelope da conta B apontando para dispositivo da conta A, exigir dispositivo ativo e impedir exclusão/recriação após revogação;
- a validação remota permanece bloqueada até a primeira execução aprovada do CI Linux e precisa comprovar essas regras no projeto exclusivo de homologação.

## Encaminhamentos externos preparados

- `docs/MOBILE_HOMOLOGATION.md` contém a rodada pendente para iPhone e Android reais, incluindo instalação, acesso, offline, atualização, backup, restauração e remoção do aplicativo com dados fictícios;
- `docs/AUDIT_HANDOFF.md` organiza arquitetura, fluxos sensíveis, riscos, evidências e perguntas para auditoria independente, explicitamente pendente;
- não há remoto Git configurado nesta cópia, portanto a CI Linux e a homologação Supabase não foram executadas.

## BL-005 — Pessoas e importação de membros

| Critério | Resultado |
|---|---|
| Cadastro | criar, editar, visualizar e remover, com validações e estados vazios |
| Vínculos | igreja atual e períodos históricos preservados em mudança manual ou por importação |
| Situação | ativo/a resgatar independente do estado da lista importada |
| Pesquisa e contagem | busca local por nome e totais de distrito e igreja |
| PDF | validação de extensão/tamanho, extração local e recusa de vazio, escaneado ou formato inesperado |
| Leiaute paginado | duas colunas, cabeçalho repetido, data técnica e mudança de página reconhecidos por coordenadas proporcionais |
| Identidade | nome + nascimento; homônimos não são unidos somente pelo nome |
| Prévia | novas, atualizadas, ausentes, divergências e contagem por igreja |
| Idempotência | repetição do mesmo hash não duplica registros |
| Atomicidade | falha provocada no lote deixa zero alterações parciais |
| Reversão | última importação desfeita apenas sem alteração ou dependência posterior |

## BL-006, BL-017 e BL-018

| Critério | Resultado |
|---|---|
| Famílias | criação, edição, exclusão e composição manual entre igrejas |
| Duplicidades | nome duplicado e pessoa já presente em outra família são recusados |
| Visitas futuras | tipo de referência aceita pessoa ou convidado nominal sem cadastro permanente |
| Busca global | pessoa, família, igreja e WhatsApp filtrados somente em memória |
| Aniversários | hoje, próximos, filtro por igreja, idade e acesso ao perfil |
| Mensagens | cinco faixas etárias, edição e cópia sem telefone ou envio automático |

## BL-012 — Fidelidade privada

| Critério | Resultado |
|---|---|
| Dados | mês exato, faixa ou somente categoria, sempre com origem, atualização e histórico |
| Regras | 8–12 sistemático; 1–7 não sistemático; 0 sem registro |
| Restrições | sem valores, sem inferir “sem renda”, sem ranking ou decisão automática |
| Importação | prévia, não encontrados, ambiguidades, resumo e confirmação |
| Faixas | grupos 8–12 e 1–7 são armazenados como faixas; “sem registro” equivale somente a 0 |
| Similaridade | grafias semelhantes são sinalizadas e só podem ser associadas por seleção manual explícita na mesma igreja |
| Migração | snapshots antigos são normalizados em memória; IndexedDB v3 registra a mudança sem expor ou regravar plaintext |
| Visões | totais e percentuais do distrito e por igreja, além do perfil privado |
| Privacidade | nomes e categorias ausentes do IndexedDB e da outbox em texto aberto |

## BL-007 — Agenda e itinerário

## BL-008 — Sermões e histórico de pregações

Validação direcionada: testes de Sermões e Agenda com dados fictícios cobrem CRUD cifrado, ausência de texto aberto, tags, remoção e retrato imutável no compromisso de Pregação. Lint, TypeScript e build de produção passaram.

Validação direcionada desta retomada: `src/agenda/service.test.ts` passou com 4 cenários fictícios. Lint, TypeScript e build de produção passaram. A validação cobre conteúdo cifrado, conflito/sobreposição, intervalo mínimo, folga de segunda, padrões de Visita/Concílio, itens pessoais fora do PDF e geração local do arquivo.

| Critério | Resultado |
|---|---|
| CRUD cifrado | criar, editar e remover sem título ou observação em plaintext |
| Padrões | visita 1h/15 min, comissão 1h30, PGP 9h–12h e Concílio dia todo |
| Conflitos | sobreposição e intervalo menor que cinco minutos explicados sem ajuste automático |
| Segunda-feira | folga projetada no mês; compromisso exige exceção explícita |
| PDF | gerado localmente só com itens selecionados; Pessoal fica fora por padrão |

## BL-009, BL-010 e BL-011

Validação direcionada da integração atual: `src/care/service.test.ts` passou com 5 cenários inteiramente fictícios, incluindo visita espontânea, vínculo com compromisso da Agenda, entrevista versionada, pedido, acompanhamento, tarefa, renda manual e rodada. Lint, TypeScript e build de produção passaram.

Validação de filtragem da visita: `src/care/visitSelection.test.ts` cobre ausência de registros antes da escolha da igreja, pesquisa por nome sem acentos e disponibilidade de famílias com integrantes de igrejas diferentes. Em conjunto com os testes de cuidado, foram 7 cenários fictícios aprovados.

| Critério | Resultado |
|---|---|
| Visitas | agendada ou espontânea, pessoa/família, participantes e convidado não cadastrado |
| Registro rápido | finaliza sem exigir questionário ou resumo extenso |
| Instrumento | 38 perguntas oficiais disponíveis e selecionáveis |
| Escopos | respostas individuais por presente e familiares uma vez |
| Versões | correção acrescenta snapshot; pergunta e resposta antigas não são sobrescritas |
| Saúde | apenas hábitos gerais; nenhuma estrutura para diagnóstico ou tratamento |
| Renda | sugestão condicional, sem valor; “prefere não responder” preserva desconhecido |
| Oração | última etapa, revisão inicial de 180 dias e conteúdo oculto no painel |
| Acompanhamento/tarefa | estados, prazos, prioridades e vínculos cifrados |
| Rodadas | famílias escolhidas manualmente; conclusão automática somente ao visitar todas |
| Atomicidade | visita e efeitos derivados entram na mesma transação cifrada |
| Privacidade | conteúdo pastoral ausente do IndexedDB, outbox, logs, fixtures e documentação |

## Pedidos de Oração, Leitura e cerimônias

| Critério | Resultado |
|---|---|
| Pedidos vinculados | criação vinculada a pessoa fictícia e filtro por igreja aprovados |
| Sem identificação | criação sem vínculo pessoal aprovada |
| Acompanhamento | mudança de situação e histórico de atualizações aprovados |
| Privacidade no painel | somente a contagem é exibida; nome e motivo não aparecem |
| Leitura | livro, páginas, minutos, conclusão automática e totais mensal/anual aprovados |
| Metas | atualização da meta do mês sem duplicação aprovada |
| Separação | registros de leitura ficam no banco pessoal exclusivo e não entram no banco pastoral |
| Cerimônias | Batismo, Santa Ceia, Casamento e Dedicação de criança criados com rótulos e campos próprios |
| Checklist | marcações persistem nos quatro tipos de compromisso |
| Menu | Pedidos de Oração e Leitura aparecem nas navegações principal e móvel; Leitura e Orçamento permanecem identificados como áreas pessoais |

Também foram simplificados os textos visíveis de Backup, Segurança e Sincronização, sem mudança de funcionamento. Nenhum código interno ou linguagem de implementação permanece nessas páginas ativas.

## Recursos temporariamente retirados da V1

Transferência de Distrito foi retirada da interface, rotas, ações e testes exclusivos para revisão de privacidade e segurança. Novo Distrito também foi retirado da interface; seu código permanece preservado, mas sem rota ou link de acesso até a revisão da limpeza sincronizada. O Backup Seguro manual não usa senha fixa, é vinculado à conta e continua disponível.

## Planejamento Anual e Evangelismo

| Critério | Resultado |
|---|---|
| Metas anuais | criação, atualização, mudança de situação, exclusão preservando campanhas e cópia revisável para outro ano |
| Ligação meta/campanha | campanha liga meta existente ou cria uma nova meta na mesma transação cifrada |
| Agenda | compromisso principal, encontros adicionais, pontos e tarefas opcionais usam identificadores persistentes e não duplicam em atualizações |
| Atualização ligada | edição de título, data ou prazo na Agenda volta para campanha, ponto ou tarefa correspondente |
| Pontos e equipe | cadastro, filtros, remoção, pessoas existentes e aviso de outra campanha no mesmo período |
| Tarefas | criação, situação, remoção, urgência, atraso, proximidade do prazo e lembrete opcional na Agenda |
| Checklist | modelos iniciais, conclusão, acréscimo, edição e remoção |
| Acompanhamento | vínculos por identificador com pessoas, interessados, estudos, pedidos, visitas, duplas, PG, Escola Sabatina e UAPG, sem copiar cadastros |
| Orçamento da campanha | previsto, entradas, despesas, saldos, itens pendentes e separação comprovada do banco do Orçamento Familiar |
| Relatório | PDF local sem nomes individuais por padrão; inclusão nominal depende de escolha explícita |
| Privacidade | textos fictícios ausentes dos registros brutos; nenhum segredo, documento ou dado real usado |
| Interface | rotas, menu, painel inicial e viewport móvel revisados no navegador integrado |

## Playwright

A suíte contém 18 cenários e é projetada para dois projetos, totalizando 36 execuções: desktop Chromium 1440 × 1000 e Pixel 7. Ela cobre criação de conta, entrada, saída protegida, recuperação após conta existente, proteção de rota, PWA, acessibilidade, Distrito, Pessoas, Agenda, Cuidado Pastoral, Comissões, Nomeações, Orçamento Familiar, Pedidos de Oração, Leitura, cerimônias, Planejamento Anual e Evangelismo. Cada cenário inicia em contexto do navegador e armazenamento vazios e usa somente dados fictícios.

Na execução final de 27 de agosto de 2026, o build e o servidor de teste foram concluídos. A suíte iniciou 28 execuções, mas o sandbox macOS bloqueou cada Chromium iniciado por permissão de MachPort antes de abrir uma página ou executar uma asserção. Depois de 25 falhas idênticas de inicialização, a tentativa foi encerrada; uma execução ficou interrompida e duas não chegaram a iniciar. Isso não é aprovação nem falha funcional dos cenários. O workflow Linux de homologação executará `pnpm test:e2e` em host compatível para concluir essa validação.

## Verificação no navegador integrado

- conta, cofre e chave de recuperação fictícios criados em ambiente local;
- distrito, igreja e pessoa fictícios cadastrados pela interface;
- importação simulada de membros exibiu 3 linhas, 2 pessoas novas, 1 ausência e 1 divergência antes da confirmação; o lote foi aplicado e entrou no histórico cifrado;
- família formada manualmente e perfil da composição reaberto;
- próximo aniversário mostrou idade, mensagem por faixa etária, edição e confirmação de cópia;
- busca global encontrou a família somente pelo índice local em memória;
- fidelidade simulada mostrou prévia de 3 correspondências e, após confirmação, 1 sistemático, 1 não sistemático e 1 sem registro, com 33% em cada categoria e sem ranking;
- sincronização enviou e recebeu 12 operações cifradas, com zero conflitos e fila final zerada;
- desktop 1440 × 1000 e celular 390 × 844 conferidos, ambos sem rolagem horizontal; no celular, cabeçalho e navegação inferior ficaram ativos;
- uma build de produção foi servida em porta isolada, recebeu um registro fictício, teve o servidor encerrado e foi recarregada pelo service worker; após desbloquear o cofre, o registro cifrado reapareceu offline;
- manifesto, ícones e `display: standalone` foram verificados pelo script PWA; a confirmação nativa de instalação no sistema operacional continua sendo um teste físico do navegador/plataforma;
- nenhum erro ou warning foi registrado no console durante a jornada.
- Comissões percorreu as três etapas com dados fictícios: a pauta foi preparada sem nenhum campo de votação, a ata foi recusada enquanto havia assunto sem decisão, a decisão foi registrada um assunto por vez e a ata só então foi gerada e finalizada. A configuração manteve o pastor como presidente sem exigir escolha.
- Comissão de Nomeações percorreu formação, cargos, indicações, reunião, relatório e votação oficial por cargo com dados fictícios; nenhuma tela de demonstração apareceu, o associado foi aceito em Patrimônio, recusado em Ancião, e o relatório público não citou fidelidade nem contagem de votos.
- Planejamento Anual e Evangelismo foram abertos pelo menu; uma meta fictícia foi criada com o cadastro simples e acompanhada em seguida — divisão por igreja com aviso de soma diferente, tarefa do plano de ação, item de orçamento da meta e resultado do mês, chegando a 25% da meta. Campanha, ponto, tarefa e item de orçamento fictícios foram criados, e a Agenda mostrou campanha, ponto e lembrete vinculados sem recadastro.
- a build final foi aberta em origem nova, sem ler armazenamento anterior; a entrada foi conferida em desktop e 390 × 844 sem rolagem horizontal, as abas Entrar/Criar conta e seus rótulos estavam presentes, e a rota protegida de Backup retornou corretamente para a entrada.

## Pendências de validação externa

- manter fixtures fictícias alinhadas aos leiautes paginados já validados localmente;
- aplicar e testar migration/RLS em Supabase de homologação;
- confirmar as 36 execuções dos 18 cenários Playwright no CI Linux;
- instalar fisicamente em iPhone e Android antes do piloto;
- realizar revisão independente de segurança e jurídica antes de usar dados reais.
- revisar as prévias de todos os relatórios para assegurar que nenhum campo privado opcional seja incluído indevidamente.
