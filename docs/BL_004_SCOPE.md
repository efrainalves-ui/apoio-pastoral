# BL-004 — Distrito e Igrejas

Status: concluído em 20 de agosto de 2026.

## Escopo entregue

- um distrito pessoal, com nome obrigatório, criação, edição e exclusão;
- igrejas dos tipos igreja organizada, grupo e ponto de pregação;
- criação, visualização, edição e remoção das igrejas;
- evolução permitida de ponto de pregação para grupo e de grupo para igreja organizada;
- histórico imutável de criação, alterações cadastrais, tipo e situação;
- endereço, código externo, dias e horários de culto e observações administrativas;
- situações ativa e arquivada;
- validações de campos, estados vazios, carregamento e mensagens de erro;
- telas responsivas para celular e computador;
- persistência local offline e sincronização baseada na fila do Marco 0.

## Privacidade

O domínio é cifrado antes da persistência. O IndexedDB e a outbox armazenam envelopes com ciphertext, IV, AAD e metadados técnicos. O transporte de sincronização não recebe nome do distrito, nome da igreja, endereço, horários ou observações em texto aberto. Exclusões são representadas por tombstones cifradas.

## Regras preservadas

- somente um distrito ativo pode existir no cofre;
- nome do distrito, nome da igreja e tipo da igreja são obrigatórios;
- a evolução de tipo não retrocede nem pula etapas;
- o distrito não pode ser excluído enquanto possuir igrejas;
- BL-005, importação, pessoas, membros e famílias não fazem parte desta entrega.

## Evidências

Os testes automatizados do domínio verificam validação, unicidade do distrito, CRUD, evolução de tipo, histórico, tombstones e ausência de conteúdo aberto no banco e na outbox. A jornada visual verificou os mesmos dados fictícios em desktop, celular, após sincronização e sem conexão. O resultado consolidado está em `TEST_REPORT.md`.
