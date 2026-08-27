# Lista de verificação para homologação interna

Esta lista organiza uma homologação local do Apoio Pastoral. Ela não autoriza publicação, conexão com produção nem uso de informações verdadeiras.

## Regra obrigatória de dados fictícios

- Use somente dados evidentemente inventados, como `Ana Exemplo`, `Família Exemplo` e `Igreja Central Fictícia`.
- Use um endereço de e-mail reservado para testes, preferencialmente com domínio `.invalid` ou `.test`.
- Crie uma senha exclusiva para esta homologação, com no mínimo 12 caracteres, sem reutilizar qualquer senha pessoal ou profissional.
- Não abra nem importe PDFs reais. Quando um fluxo exigir arquivo, use exclusivamente uma fixture sintética do repositório.
- Não use chaves, tokens, arquivos `.env`, backups ou credenciais reais.
- Não registre conteúdo pastoral verdadeiro em campos livres, capturas de tela, logs ou relatórios.
- Apague manualmente os arquivos de relatório e backup fictícios ao terminar a homologação no dispositivo.

## Preparação do ambiente

- [ ] Confirmar que o ambiente está local e sem conexão com produção.
- [ ] Para uma rodada estritamente local, iniciar com `VITE_DISABLE_SYNC=true`.
- [ ] Confirmar que Transferência de Distrito e Novo Distrito não aparecem na navegação.
- [ ] Confirmar que links públicos, Transferência de Distrito e Novo Distrito não estão disponíveis.
- [ ] Registrar navegador, sistema operacional, tamanho da janela e data da rodada.
- [ ] Manter o console aberto apenas para observar erros técnicos; não copiar conteúdo de formulários para logs.

## 1. Conta, entrada, bloqueio e recuperação

- [ ] Abrir `/acesso` e confirmar a mensagem “Seu ministério organizado. Seus dados, só seus.”.
- [ ] Confirmar que a primeira tela não menciona criptografia, cofre, chave mestra, AES, servidor, sincronização, IndexedDB ou ambiente de desenvolvimento.
- [ ] Alternar entre as abas “Entrar” e “Criar conta” com mouse ou toque.
- [ ] Alternar entre as abas com teclado e confirmar foco visível.
- [ ] Criar uma conta com e-mail e senha exclusivamente fictícios.
- [ ] Guardar a chave de recuperação fictícia somente durante a rodada de homologação.
- [ ] Bloquear o acesso pela interface.
- [ ] Entrar novamente com a conta fictícia.
- [ ] Confirmar que uma senha fictícia incorreta é recusada sem expor detalhes técnicos.
- [ ] Abrir a recuperação somente depois de existir uma conta.
- [ ] Recuperar o acesso com a chave fictícia criada nesta rodada e definir outra senha exclusivamente de teste.
- [ ] Confirmar que uma rota interna aberta sem sessão desbloqueada retorna para `/acesso`.

## 2. Distrito e igrejas

- [ ] Criar `Distrito Exemplo` e confirmar o estado vazio inicial.
- [ ] Criar `Igreja Central Fictícia`, um grupo fictício e um ponto de pregação fictício.
- [ ] Editar endereço, horários, situação e observações inventadas.
- [ ] Evoluir um ponto de pregação fictício para grupo e depois para igreja organizada.
- [ ] Confirmar que o histórico fictício permanece disponível após a evolução.
- [ ] Confirmar novamente que não existe ação para Transferência de Distrito nem Novo Distrito.

## 3. Pessoas e famílias

- [ ] Criar `Ana Exemplo` e pelo menos outra pessoa com dados inventados.
- [ ] Editar e reabrir os perfis fictícios.
- [ ] Pesquisar por nome inventado e conferir os totais.
- [ ] Criar `Família Exemplo` com integrantes fictícios.
- [ ] Confirmar a recusa de duplicidade de pessoa na família.
- [ ] Se validar importação, usar somente a fixture PDF sintética mantida nos testes e revisar a prévia antes de aplicar.
- [ ] Confirmar que nenhuma informação nominal aparece no console.

## 4. Agenda e itinerário

- [ ] Criar compromissos fictícios nas visões de hoje, semana e mês.
- [ ] Conferir duração padrão, endereço inventado e filtros.
- [ ] Criar uma sobreposição fictícia e confirmar o aviso de conflito.
- [ ] Testar compromisso na segunda-feira e a confirmação explícita de exceção.
- [ ] Gerar a prévia local do itinerário apenas com itens fictícios selecionados.
- [ ] Confirmar que itens pessoais ficam fora da seleção inicial.

## 5. Visitas e acompanhamento pastoral

- [ ] Selecionar primeiro uma igreja fictícia e confirmar a filtragem de pessoas e famílias.
- [ ] Registrar uma visita fictícia rápida sem conteúdo pastoral verdadeiro.
- [ ] Registrar outra visita fictícia com respostas sintéticas, pedido, acompanhamento e tarefa.
- [ ] Corrigir a visita e confirmar a preservação da versão anterior.
- [ ] Confirmar que pedidos de oração fictícios ficam ocultos por padrão.
- [ ] Criar uma rodada de visitação fictícia e verificar seu avanço.

## 6. Sermões

- [ ] Criar, editar e reabrir um sermão inteiramente fictício.
- [ ] Vincular o sermão a uma pregação fictícia na agenda.
- [ ] Alterar o sermão e confirmar que o compromisso mantém o retrato anterior.
- [ ] Remover um sermão fictício sem afetar registros fora do escopo esperado.

## 7. Metas

- [ ] Definir metas anuais com números fictícios.
- [ ] Criar lançamentos fictícios e conferir os acumulados.
- [ ] Verificar os indicadores missionários disponíveis.
- [ ] Gerar somente uma prévia local com dados inventados.

## 8. Interessados e estudos bíblicos

- [ ] Criar um interessado fictício vinculado à igreja fictícia.
- [ ] Iniciar um estudo bíblico fictício e conferir a situação em andamento.
- [ ] Concluir o estudo pela ação disponível ao pastor.
- [ ] Confirmar o histórico por pessoa e igreja fictícias.

## 9. Duplas missionárias

- [ ] Criar uma dupla com duas pessoas fictícias distintas da mesma igreja.
- [ ] Confirmar a recusa de pessoas duplicadas ou de igrejas diferentes.
- [ ] Editar e desativar a dupla fictícia.
- [ ] Confirmar que não existe inscrição ou link público.

## 10. Escola Sabatina, Pequenos Grupos e UAPG

- [ ] Criar uma classe fictícia da Escola Sabatina.
- [ ] Criar um Pequeno Grupo fictício.
- [ ] Criar uma UAPG fictícia e testar a associação opcional ao Pequeno Grupo.
- [ ] Editar, reabrir e remover somente os registros fictícios criados na rodada.
- [ ] Conferir o resumo por igreja e distrito.

## 11. Relatórios locais

- [ ] Abrir a Central de Relatórios e revisar os filtros antes de gerar cada prévia.
- [ ] Gerar prévias fictícias de Visitações, Agenda/Itinerário, Metas/Indicadores e Sermões/Pregações.
- [ ] Confirmar que entrevistas, pedidos de oração e fidelidade individual não aparecem indevidamente.
- [ ] Confirmar que nenhuma prévia é enviada ou publicada automaticamente.
- [ ] Fechar a prévia e remover o arquivo fictício baixado, se houver.

## 12. Backup local

- [ ] Criar um código de backup exclusivo e fictício com pelo menos 12 caracteres.
- [ ] Criar o backup por ação explícita e conferir somente data, tamanho e quantidade de registros no resumo.
- [ ] Tentar restaurar com um código fictício incorreto e confirmar a recusa sem alteração parcial.
- [ ] Restaurar o arquivo fictício com o código correto e confirmar a quantidade de registros.
- [ ] Confirmar que a restauração exige arquivo selecionado e botão explícito de confirmação.
- [ ] Confirmar o aviso de possível substituição e marcar a confirmação antes de restaurar.
- [ ] Tentar restaurar o backup na segunda conta fictícia e confirmar que a mistura é recusada.
- [ ] Confirmar que o backup pastoral não inclui o Orçamento Familiar e exportar o orçamento fictício separadamente na própria área.
- [ ] Remover o arquivo de backup fictício do dispositivo ao concluir a rodada.

## 13. Comportamento offline

Execute esta seção somente quando o navegador e o ambiente local permitirem testar o service worker sem contornar proteções da plataforma.

- [ ] Com o aplicativo já carregado, interromper apenas a conexão de rede do ambiente de teste.
- [ ] Reabrir o aplicativo instalado ou a aba previamente carregada.
- [ ] Entrar com a conta fictícia e confirmar o reaparecimento dos registros fictícios locais.
- [ ] Criar e editar um registro fictício offline.
- [ ] Confirmar que o aplicativo não apresenta publicação ou link público.
- [ ] Restaurar a rede e conferir o estado esperado da fila, somente se a sincronização de homologação estiver autorizada e configurada.

## 14. Computador, celular e acessibilidade

- [ ] Revisar a entrada em 1440 × 1000 e em 390 × 844.
- [ ] Confirmar ausência de rolagem horizontal e cortes de texto.
- [ ] Confirmar contraste, tamanho legível, alvos de toque e espaçamento entre campos e botões.
- [ ] Percorrer título, abas, campos, mensagens e botões com leitor de tela.
- [ ] Percorrer todos os controles por teclado, com foco sempre visível.
- [ ] Conferir tema claro e escuro, se ambos estiverem habilitados no dispositivo.

## Critérios de encerramento

- [ ] Nenhum dado verdadeiro foi usado, exibido ou persistido.
- [ ] Nenhum erro da aplicação apareceu no console durante os fluxos aprovados.
- [ ] Testes automatizados, lint, TypeScript e build foram registrados com seus resultados reais.
- [ ] Limitações de E2E, instalação física ou offline foram registradas sem declarar aprovação indevida.
- [ ] A rodada não foi publicada e não utilizou produção.

Mesmo com todos os itens aprovados, dados reais e publicação continuam bloqueados até homologação remota controlada, validação física em iPhone e Android, execução E2E no CI Linux e revisão independente de segurança, privacidade e aspectos jurídicos.
