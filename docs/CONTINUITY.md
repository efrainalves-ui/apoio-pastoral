# Continuidade do projeto

Atualizado em: 27 de agosto de 2026.

## Estado atual

- Marco 0: concluído e preservado.
- BL-004 — Distrito e Igrejas: concluído e integrado.
- BL-005, BL-006, BL-008, BL-009, BL-010, BL-011, BL-012, BL-017 e BL-018: implementação concluída. BL-008 preserva um retrato cifrado do sermão em cada compromisso de Pregação.
- Metas: versão estável concluída com lançamentos cifrados, meta anual e prévia local de PDF. Duplas missionárias e UAPG permanecem explicitamente fora desta etapa.
- A seleção de cadastro em Visitas requer igreja; listas e pesquisa são filtradas localmente e não modificam o conteúdo cifrado existente.
- BL-007 — Agenda e Itinerário: concluído com visualizações de hoje/semana/mês, filtros, local/endereço, bloqueio de conflitos e itinerário PDF local.
- Banco local: migration v6 registra a classificação oficial de fidelidade; conteúdo permanece cifrado e snapshots legados são normalizados somente após desbloqueio.
- Contrato remoto: inalterado e genérico, somente ciphertext e metadados técnicos permitidos.

## Retomada registrada

- Em 1º de setembro de 2026, o acesso em novo dispositivo foi corrigido no código: depois de confirmar e-mail e senha, a instalação baixa somente o envelope de senha cifrado da própria conta e registra um novo dispositivo. A migration complementar `0002_password_key_envelopes_up.sql` precisa ser aplicada no Supabase de homologação antes de publicar esta versão.
- Safari e o aplicativo instalado na Tela de Início do iPhone devem ser validados como instalações diferentes. Ambos devem entrar somente com e-mail e senha, aparecer separadamente na lista de dispositivos e manter sincronização, isolamento e revogação.
- A chave de recuperação não é enviada por e-mail e permanece reservada à contingência de perda de acesso aos dispositivos. A alteração passou em lint, TypeScript, 197 testes unitários com dados fictícios, build, verificação PWA e revisão de segurança do repositório. Ainda faltam a prova da migration no Supabase de homologação e os testes físicos documentados.

- A correção de fidelidade pelo modelo 3 está separada e deve ser preservada: classificação oficial, quantidade exata opcional, faixa de origem preservada e compatibilidade de snapshots legados.
- A leitura local anterior de documentos reais não deixou PDFs, nomes ou conteúdo pastoral no repositório. A sincronização permaneceu desativada para essa conta local de homologação.
- Havia artefatos experimentais claramente separados de cache/desenvolvimento e uma importação temporária no ecrã de fidelidade. Eles foram descartados sem tocar na correção de fidelidade.
- Não reimportar documentos reais nem reiniciar investigações de cache, service worker, portas locais ou PWA nesta retomada.
- A automação Linux de homologação interna está em `.github/workflows/homologation-linux.yml`: instala dependências de forma limpa e executa lint, TypeScript, testes unitários, build, PWA e Playwright com dados fictícios. Em falha E2E, guarda apenas relatório, screenshots e traces por sete dias.
- A preparação local para Supabase de homologação está em `docs/SUPABASE_HOMOLOGATION.md`. A migration foi reforçada contra vínculo cruzado de dispositivo, reativação e exclusão/recriação após revogação. Ela não deve ser aplicada remotamente antes da primeira aprovação do CI Linux e ainda precisa de validação com duas contas fictícias.
- As etapas externas estão prontas, mas pendentes: `docs/MOBILE_HOMOLOGATION.md` orienta testes físicos em iPhone e Android, e `docs/AUDIT_HANDOFF.md` organiza a entrega para auditoria independente sem dados reais.
- Esta cópia local não possui remoto Git configurado; por isso, o workflow Linux não foi enviado nem executado. O responsável deve configurar o remoto autorizado, revisar e versionar apenas as alterações de homologação e então enviar a branch para disparar o CI.

## Pendências atuais

- revisar privacidade e segurança antes de reativar Transferência de Distrito;
- revisar a limpeza sincronizada antes de reativar Novo Distrito; o backup atual não usa senha fixa e agora é vinculado à conta;
- homologar sincronização remota, RLS e migrations em Supabase;
- configurar o remoto Git autorizado, versionar e confirmar a primeira execução externa do CI Linux antes de aplicar migrations ou configurar Supabase de homologação;
- validar migrations, RLS, login, isolamento, sincronização e revogação somente no projeto Supabase exclusivo de homologação, seguindo `SUPABASE_HOMOLOGATION.md`;
- validar instalação/offline em iPhone e Android;
- executar a checklist física por responsável em iPhone e Android e encaminhar `AUDIT_HANDOFF.md` a profissional ou equipe externa;
- não publicar, não criar links públicos e não conectar produção.

## Etapa estável: Interessados e Estudos Bíblicos

Concluída a base local cifrada para interessados e estudos: cadastro por igreja, contato opcional, observações privadas, situações, início automático de estudo em andamento, conclusão controlada pelo pastor e histórico por pessoa/igreja. O painel mostra estudos do mês e acumulado anual. A próxima etapa é Duplas Missionárias; nenhum link público foi criado.

## Etapa estável: Duplas Missionárias

Concluído o cadastro de duplas ativas, sempre vinculadas a uma única igreja e formadas por dois membros distintos daquela igreja. A tela do pastor não cria inscrição pública nem expõe dados fora do cofre. Próximo trabalho pendente: Escola Sabatina, Pequenos Grupos e UAPG; depois, ampliar os indicadores missionários em Metas.

## Etapa estável: Escola Sabatina, PGs, UAPG e Metas missionárias

Concluídos os registros locais cifrados de classes da Escola Sabatina, Pequenos Grupos e UAPG, incluindo a associação informativa opcional entre UAPG e PG. O resumo por igreja/distrito está disponível e a subárea Metas missionárias apresenta os indicadores reais de interessados, estudos, duplas, classes, PGs e UAPG. Não foram criados links públicos, publicação ou relatórios gerais em PDF.

## Etapa estável: Relatório de Visitações

Concluída a prévia local em PDF de Visitações com filtro de período e distrito/igreja, totais de pessoas e famílias visitadas e pendências da rodada. O gerador não recebe respostas de entrevista, pedidos de oração, observações privadas ou dados individuais de fidelidade. Próximos relatórios autorizados: Agenda e itinerário, Metas e indicadores, e Sermões.

## Etapa estável: Central de Relatórios

A Central passou a concentrar Visitações, Agenda/Itinerário, Metas/Indicadores e Sermões/Pregações. As prévias são geradas localmente antes de qualquer ação do pastor. Não há transmissão de PDFs, links públicos ou inclusão de dados íntimos de visitas.

## Etapa estável: Backup Seguro

Concluída a criação e restauração de backup local cifrado. O arquivo contém somente um envelope cifrado, é vinculado à conta de origem, tem resumo seguro e exige confirmação explícita do risco de substituir versões locais. A restauração é preparada em lote para não deixar registros parciais. O Orçamento Familiar permanece separado e precisa de exportação própria.

## Etapa estável: oração, leitura pessoal e cerimônias na Agenda

- Pedidos de Oração possui área própria em Cuidado Pastoral: cadastro por igreja, pessoa limitada à igreja escolhida ou pedido sem identificação, filtros, situação, atualizações, edição e exclusão confirmada. O painel inicial mostra somente a contagem em oração, sem nome ou motivo.
- Leitura é uma área pessoal separada dos registros pastorais e não participa de Distrito, Fidelidade, Comissões, Relatórios ou telas de secretaria. Livros, sessões e metas ficam protegidos em banco local exclusivo; páginas, minutos, progresso e conclusões são calculados no dispositivo.
- A Agenda aceita Batismo, Santa Ceia, Casamento e Dedicação de criança, com responsável, pessoas aplicáveis e checklists próprios. Os compromissos continuam no mesmo fluxo de Dia, Semana, Mês e Lista; nenhum documento civil ou certificado foi criado.
- Em 27 de agosto de 2026, lint, TypeScript, build, PWA e 134 testes Vitest em 46 arquivos foram aprovados. O Playwright permanece pendente no CI Linux porque o Chromium headless foi bloqueado pelo sandbox macOS antes de abrir qualquer página.

## Etapa estável: auditoria técnica antes da criação do ambiente real

- O conteúdo cifrado passou a ser conferido contra o registro que o guarda: um envelope colocado na linha de outro registro é recusado ao abrir, mesmo dentro da mesma conta e mesmo que venha do serviço remoto.
- A trava de ambiente aceita `homologacao` e `producao` como valores declarados; qualquer outro valor, ou vazio, mantém tudo local. Homologação e produção continuam sendo projetos separados.
- A prova de banco ganhou três guardas: nenhuma view em `public`, nenhuma função `security definer` sem `search_path` fixo e nenhum bucket de armazenamento.
- Uma auditoria de isolamento com duas contas fictícias cobre, em um só lugar: leitura de registros, chave de uma conta contra o conteúdo da outra, fila de envio, recebimento de operação alheia, backup cruzado e senha trocada.
- O atalho de sincronização mostra um ponto discreto quando há alterações aguardando envio, com o número apenas no rótulo de acessibilidade; ao sincronizar, o ponto some.
- Configurações passou a dizer, em três linhas, onde os dados ficam.

## Etapa estável: varredura de interface antes da fase de segurança

- Contraste corrigido em todo o aplicativo: títulos de estado vazio, números grandes de Fidelidade e Leitura, abas e atalhos da Agenda, texto secundário e barra inferior do celular. A verificação foi automatizada e repetida nos temas claro e escuro, em tela larga e em 375px.
- Alvos de toque abaixo de 40px foram corrigidos na Agenda e no calendário do Planejamento.
- Textos decorativos e explicações longas saíram das telas: sobraram título, campos, dados e ações. Frases que ajudam a decidir — backup, aprovação de dispositivo, conflitos de sincronização e primeira configuração — foram mantidas.
- Toda exclusão pede confirmação, inclusive itens de checklist e de orçamento dentro de campanhas e metas.

## Etapa estável: relatórios por área, missão dentro de Metas e Configurações

- Não existe mais um módulo geral de Relatórios. Cada área gera o seu: Visitação tem o relatório de visitas e rodadas, a Agenda tem o itinerário, Metas tem o relatório de resultados com a missão junto, Sermões tem o histórico de pregações e o Orçamento Familiar mantém a própria aba de relatórios.
- Aniversários saiu do menu: continua no resumo da tela inicial, que abre a tela com aniversariantes de hoje, próximos e filtro por igreja.
- Interessados e estudos bíblicos, duplas missionárias e Escola Sabatina/PG/UAPG passaram a viver dentro de Metas, na área Missão e discipulado. Os estudos continuam contando na meta de Estudos Bíblicos e as UAPG na meta de UAPG, sem lançamento duplicado. As rotas antigas redirecionam e nenhum cadastro foi movido.
- O menu Mais virou o ícone de engrenagem ao lado de Sair, sem rótulo, com busca, backup, segurança, sincronização e revisão de alterações concorrentes. O botão Trocar conta saiu: sair volta para a tela de acesso, que lista as contas já existentes no aparelho.

## Etapa estável: Distrito como centro e Visitação unificada

- O menu principal ficou com Início, Agenda, Distrito, Visitação, Sermões, Metas, Planejamento Anual, Evangelismo, Comissões, Fidelidade, Leitura, Orçamento Familiar e Mais. Pessoas, Famílias, Cuidado pastoral, Visitas e Importar lista de membros deixaram de ser módulos próprios; o Mais lista apenas o que não está no menu principal e não oferece nenhuma ação de criação.
- Distrito abre com a lista de igrejas e uma busca única que encontra igreja, membro e família. A igreja abre em abas: Visão geral, Membros, Famílias, Agenda, Histórico e Indicadores. A aba Membros traz Cadastrar membro e Importar lista de membros, e a importação acontece já dentro da igreja escolhida, sem perguntar a igreja de novo. A importação fictícia simulada saiu da interface.
- Visitação reúne Visitas, Acompanhamentos, Pedidos de oração e Tarefas em abas, mais as rodadas de visitação. Nada foi migrado nem duplicado: as telas antigas de Visitas, Cuidados e Pedidos de Oração redirecionam para a aba correspondente, e todos os registros continuam sendo lidos dos mesmos dados cifrados.
- O botão + segue como atalho único de criação e agora oferece também Novo acompanhamento e Nova tarefa, apontando para as abas de Visitação.

## Etapa estável: topo simples, Leitura enxuta e Orçamento com resumo visual

- O topo do aplicativo ficou só com dois atalhos em ícone: criar (+) e sincronizar. A barra de pesquisa saiu do cabeçalho — a Busca continua em Mais — e a faixa branca deu lugar ao mesmo verde-escuro do menu lateral. A tela inicial perdeu a frase de abertura e os botões com texto; criar qualquer registro passa pelo +.
- Fidelidade entrou no menu principal e saiu de Mais. O menu Mais lista apenas módulos que não aparecem no menu principal, sem nenhuma ação de criação.
- Leitura perdeu a frase de abertura, o botão Definir meta ganhou contraste e lugar próprio, e a lista de livros virou uma lista compacta: título, autor e situação, com progresso, meta, concluir, editar e excluir aparecendo só ao tocar no livro. Abrir Adicionar livro leva a tela até o formulário e deixa o cursor no primeiro campo.
- Orçamento Familiar mantém todos os cálculos como estavam e ganhou, na Visão do mês, o comparativo de entradas e saídas, a distribuição das despesas por categoria, o disponível, a projeção até o fim do mês e dicas curtas com cor, ícone e texto — verde para tudo em ordem, amarelo para atenção e vermelho para risco. Botões de editar, Mês atual, abas ativas e ícones passaram a ter contraste conferido nos temas claro e escuro.

## Etapa estável: comparação com o ano anterior e campanhas ligadas às metas

- Metas guarda o resultado consolidado de um ano já encerrado para Financeiro e Batismos, em registro próprio. Ele serve só para comparação: não vira lançamento, não altera meta e não entra no resultado do ano corrente. Sem consolidado registrado, vale o que estiver lançado naquele ano — nunca os dois somados.
- A tela de cada meta mostra resultado do ano anterior, meta do ano, resultado atual, percentual, quanto falta e a diferença para o ano anterior. Os cartões de Metas e o resumo da tela inicial trazem a mesma comparação em uma linha.
- Toda campanha nova nasce com pelo menos uma igreja envolvida e ligada a uma meta de estudos bíblicos e a uma meta de batismos, escolhidas entre as existentes ou criadas ali mesmo. A campanha mostra as metas ligadas com o resultado real da área, sem lançamento duplicado. Campanhas antigas continuam abrindo e salvando; excluir uma meta solta o vínculo e preserva a campanha.
- Planejamento Anual, Nova meta do planejamento, Evangelismo e Nova campanha perderam os textos explicativos que poluíam a leitura. A tela interna da campanha ficou com blocos mais próximos, tipografia padronizada, itens de checklist equilibrados com ações discretas de editar e excluir, e o botão Acrescentar item visível, com contraste conferido no claro e no escuro.

## Etapa estável: Registrar visita e Pedidos de Oração

- A tela de registrar visita ficou com os títulos dos blocos e os campos, sem os textos explicativos que poluíam a leitura. Nada do funcionamento mudou: igreja, membros visitados, perguntas, anotações, pedido de oração, acompanhamento e tarefa continuam iguais.
- Pedidos de Oração começa vazio com apenas o título, o botão Novo pedido e o convite para cadastrar o primeiro. Cartões zerados, filtros, busca, listas vazias e acompanhamento só aparecem depois que existe pedido.
- O cadastro pergunta a igreja e mostra sozinho os membros dela. Quem pediu tem três situações distintas: membro da igreja, pessoa não cadastrada (com o nome digitado) e sem identificação. Não há mais campo de pesquisar membro.
- O acompanhamento virou uma lista leve: igrejas, depois as pessoas com pedidos, depois os pedidos daquela pessoa. Só ao abrir um pedido aparecem os detalhes, a atualização, a situação, o encerramento e a exclusão, ambos com confirmação. Pessoas não cadastradas e pedidos sem identificação têm seções próprias.

## Etapa estável: Comissões e Comissão de Nomeações

- O presidente padrão da comissão é o pastor, e a configuração diz isso na tela. Só em igreja organizada é possível escolher um ancião, e apenas entre os membros marcados como anciãos naquela igreja; em grupo e ponto de pregação a escolha nem aparece. A pauta e a ata assinam com o nome do pastor quando é ele quem preside.
- A reunião segue três etapas separadas. 1. Preparar pauta: dados, participantes, cadastro e ordem dos assuntos, com a pauta pronta para imprimir. 2. Realizar comissão: um assunto por vez, com a decisão registrada na hora e navegação para o próximo. 3. Gerar ata: só abre depois que todos os assuntos têm decisão, permite a revisão final dos textos e a finalização protegida.
- A Comissão de Nomeações não tem nenhuma demonstração na interface: o pastor cria o processo e percorre formação, cargos, indicações, reuniões, relatório, votação oficial e vagas com os dados da própria igreja.
- O catálogo de cargos traz ancião, diácono chefe, diaconisa chefe, primeiro diácono, primeira diaconisa, diáconos, diaconisas, secretários dos departamentos, sonoplastia, mídia, adolescentes, Desbravadores, Aventureiros, Ministério da Mulher, Ministério dos Homens, Patrimônio e Escola Sabatina, entre os demais. Diáconos e diaconisas continuam separados e cada cargo pode ser votado sozinho.
- Ancião e todo o diaconato nunca têm associados, mesmo quando o cargo é digitado à mão; os demais cargos podem ter associado quando a igreja achar necessário, e o relatório mostra isso ao lado do cargo.

## Etapa estável: Planejamento Anual e Evangelismo

- Planejamento Anual organiza metas por ano e pelas áreas Identidade, Liderança, Novas gerações e Discipulado. O cadastro pede apenas título, área estratégica, vínculo opcional com Financeiro, Batismos, Estudos Bíblicos ou UAPG, datas de início e fim e quantidade esperada; toda meta é do distrito. Cada meta abre em Acompanhar, com resumo, divisão opcional por igreja, plano de ação, agenda, orçamento próprio e resultado mês a mês. Quando há vínculo, o resultado vem da área correspondente, sem lançamento duplicado. Inclui calendário mensal, próximas ações, resumo por igreja, histórico, vínculos e cópia revisável para outro ano.
- Evangelismo organiza campanhas, pontos, equipe formada por pessoas já cadastradas, tarefas, checklist editável, orçamento próprio, acompanhamentos e encerramento com relatório PDF local.
- Uma campanha pode ligar uma meta existente ou criar a meta na mesma confirmação. Campanha, encontros adicionais, pontos e tarefas marcadas entram na Agenda com identificadores persistentes, evitando compromissos duplicados.
- A edição de um compromisso criado por Evangelismo devolve título, data ou prazo ao registro ligado. A exclusão de uma meta preserva campanhas; a exclusão da campanha preserva a meta e remove somente seus compromissos ligados.
- O orçamento da campanha fica no banco pastoral cifrado e não utiliza o banco exclusivo do Orçamento Familiar. Nenhuma tela pede dados bancários, cartões, PIX, salário ou renda pessoal.
- O painel inicial mostra somente um resumo de campanhas e tarefas que pedem atenção. Planejamento Anual e Evangelismo ficam disponíveis no menu principal e em Mais.
- A revisão no navegador integrado cobriu uma conta, distrito, igreja, meta, campanha, ponto, tarefa e item de orçamento inteiramente fictícios, além da presença dos três compromissos correspondentes na Agenda em viewport móvel.
- A tentativa Playwright desktop e móvel chegou à inicialização do navegador, mas o sandbox macOS bloqueou o Chromium por MachPort antes da primeira asserção. O cenário permanece preparado para o CI Linux.

## Etapa estável: Transferência de Distrito

Adiada temporariamente por revisão de privacidade e segurança. A tela, rota, ações de exportação/importação, serviço e testes exclusivos foram retirados da V1; não há mecanismo substituto nesta etapa. Reativar somente depois de definir um escopo verificável de dados transferíveis e uma importação atômica.

## Etapa estável: Novo Distrito

Desativado temporariamente na interface. O código e os testes existentes foram preservados fora das rotas da V1, sem limpar dados ou executar migrações. Reativar somente após revisão da limpeza em cenários sincronizados.

## Como retomar

1. confirmar que a árvore está limpa e identificar o commit mais recente;
2. para alterações que afetem o fluxo inicial, executar `docs/CI_HOMOLOGATION.md` e confirmar a primeira execução do workflow Linux;
3. executar somente os testes relacionados ao bloco em andamento, além de lint, TypeScript e build;
4. consultar `BL_007_SCOPE.md`, `TEST_REPORT.md` e as ADRs aplicáveis;
5. preservar o contrato ciphertext-only e a proibição de conteúdo pastoral em logs.

Próximo passo recomendado: executar a suíte Playwright completa no CI Linux e revisar os artefatos somente se houver falha. A aprovação não autoriza publicação, conexão com produção ou uso de dados reais.

## Validações externas antes de dados reais

- executar Playwright no CI Linux ou host sem a restrição de sandbox do Chromium;
- validar migrations e RLS em Supabase de homologação;
- confirmar em homologação que a policy de `device_key_envelopes` corrigida rejeita a associação de um dispositivo fictício de outra conta;
- testar instalação física e offline em iPhone e Android;
- submeter os parsers a PDFs anonimizados dos leiautes efetivamente usados;
- realizar revisão independente de segurança, criptografia, privacidade e aspectos jurídicos.

## Pronto localmente

- contrato remoto limitado a envelopes cifrados e metadados técnicos;
- migration reforçada contra vínculo de dispositivo entre contas e contra contorno da revogação;
- dispositivo revogado ou pertencente a outra conta recusado também no banco local;
- fila offline preservada, envio idempotente e cursor composto para operações simultâneas;
- versões concorrentes preservadas cifradas e sinalizadas, sem substituição silenciosa;
- backup pastoral manual, cifrado, atômico e vinculado à conta, com confirmação de substituição;
- Orçamento Familiar separado do banco, sincronização e backup pastorais;
- workflows Linux sem credenciais, com lint, TypeScript, unitários, build, PWA e Playwright desktop/celular;
- roteiros de Supabase, dispositivos físicos e auditoria preparados somente com dados fictícios.

## O que o responsável precisa fazer depois

1. criar ou autorizar um repositório Git privado;
2. enviar o projeto e confirmar o CI Linux;
3. criar Supabase de homologação;
4. inserir credenciais localmente, sem enviar ao Git;
5. executar a checklist com duas contas fictícias;
6. testar em iPhone e Android reais;
7. fazer revisão independente de segurança, privacidade e LGPD;
8. somente então criar ambiente privado de uso real;
9. iniciar o uso real de forma gradual e com backup.

**Dados reais continuam bloqueados até que toda essa lista seja concluída e documentada.**
