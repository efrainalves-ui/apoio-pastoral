# Resultado da rodada de homologação em nuvem

Registro da rodada conforme [HOMOLOGACAO_NUVEM.md](HOMOLOGACAO_NUVEM.md),
[SUPABASE_HOMOLOGATION.md](SUPABASE_HOMOLOGATION.md) e
[CHECKLIST_DISPOSITIVOS.md](CHECKLIST_DISPOSITIVOS.md).

Segue a regra de evidência daqueles documentos: aqui entram apenas identificador
da rodada, commit, versão da migration, nomes de tabelas e políticas,
aprovado/reprovado, contagens e código técnico de erro. Não entram URL do
projeto, identificador do projeto, chaves, e-mails fora de `example.invalid`,
senhas, chave de recuperação, ciphertext nem conteúdo digitado.

## Identificação

| Campo | Valor |
|---|---|
| Rodada | `nuvem-2026-09-01` |
| Situação geral | **Aprovação parcial** — banco e isolamento aprovados; jornada do aplicativo bloqueada no Auth |
| Migration | `0001_marco_zero_up.sql` |
| Projeto | Supabase de homologação, vazio e exclusivo desta rodada |

## 1. Conexão e escopo

| Verificação | Resultado |
|---|---|
| Conector limitado a um único projeto de homologação | Aprovado — apenas o projeto da rodada é visível |
| Nenhum projeto de produção alcançável | Aprovado |
| Chave `service_role` não usada em nenhum momento | Aprovado |

## 2. Migration

Aplicada uma única vez sobre um projeto vazio. O corpo é idêntico ao arquivo
versionado; apenas o `begin`/`commit` foi omitido, porque a ferramenta de
migração já executa em transação própria.

| Verificação | Resultado |
|---|---|
| Quatro tabelas: `devices`, `device_key_envelopes`, `recovery_key_envelopes`, `encrypted_operations` | Aprovado |
| RLS habilitada nas quatro | Aprovado |
| Sete políticas, conforme a migration | Aprovado |
| Trigger `devices_prevent_reactivation` | Aprovado |
| Índice `encrypted_operations_owner_created_idx` | Aprovado |

## 3. Reprovação encontrada e corrigida: privilégios padrão

| Item | Situação |
|---|---|
| `authenticated` com `TRUNCATE` nas quatro tabelas | **Reprovava** |
| `authenticated` com `TRIGGER` e `REFERENCES` nas quatro tabelas | **Reprovava** |

O Supabase concede privilégios padrão a `anon`, `authenticated` e `service_role`
em toda tabela nova de `public`. A migration revogava tudo de `anon`, mas não de
`authenticated`, e os grants explícitos apenas somavam ao que já estava
concedido. `TRUNCATE` não passa pela RLS: qualquer conta autenticada apagaria as
linhas de todas as outras. `TRIGGER` permitiria anexar um gatilho à tabela e
desviar linhas alheias.

Comprovado sem executar comando destrutivo: rodando como a própria conta
fictícia B, `has_table_privilege` sobre `TRUNCATE` retornava verdadeiro nas
quatro tabelas.

Este defeito só aparece num projeto Supabase real. O Postgres descartável do CI
nascia sem privilégios padrão, então a suíte não tinha como percebê-lo. O shim
do CI passou a reproduzi-los e a suíte de isolamento ganhou uma verificação
estrutural que reprova `TRUNCATE`, `TRIGGER` ou `REFERENCES` ao alcance de
`authenticated` em qualquer tabela de `public`, inclusive nas futuras.

Depois da correção, os privilégios de `authenticated` ficaram exatamente:

| Tabela | Privilégios |
|---|---|
| `devices` | SELECT, INSERT, UPDATE |
| `device_key_envelopes` | SELECT, INSERT, UPDATE, DELETE |
| `recovery_key_envelopes` | SELECT, INSERT, UPDATE, DELETE |
| `encrypted_operations` | SELECT, INSERT |

## 4. Isolamento entre as contas fictícias A e B

Comprovado no projeto real, com duas contas fictícias e sessões distintas.

| Verificação | Resultado |
|---|---|
| Controle positivo: cada conta enxerga os próprios registros | Aprovado |
| B lê dispositivos de A | Aprovado — 0 linhas |
| B lê envelopes de dispositivo de A | Aprovado — 0 linhas |
| B lê envelope de recuperação de A | Aprovado — 0 linhas |
| B recebe operações cifradas de A | Aprovado — 0 linhas |
| B altera dispositivo de A | Aprovado — 0 linhas afetadas |
| B cria dispositivo em nome de A | Aprovado — recusado (42501) |
| B substitui envelope de recuperação de A | Aprovado — recusado (42501) |
| B vincula chave ao dispositivo de A | Aprovado — recusado (42501) |
| B grava operação na conta de A | Aprovado — recusado (42501) |
| B sincroniza usando o dispositivo de A | Aprovado — recusado (42501) |
| Qualquer conta apaga operações cifradas | Aprovado — recusado (42501) |
| Qualquer conta reescreve operações cifradas | Aprovado — recusado (42501) |
| B trunca operações cifradas | Aprovado — recusado (42501) |
| B cria gatilho na tabela de operações | Aprovado — recusado (42501) |
| Visitante anônimo lê ou escreve em qualquer das quatro tabelas | Aprovado — recusado (42501) |

## 5. Revogação de dispositivo

| Verificação | Resultado |
|---|---|
| A revoga o próprio dispositivo | Aprovado — 1 linha |
| Dispositivo revogado é reativado | Aprovado — recusado (P0001, pelo trigger) |
| Dispositivo revogado é apagado e recriado | Aprovado — recusado (42501) |
| Dispositivo revogado envia operação | Aprovado — recusado (42501) |
| Dispositivo revogado recebe nova chave | Aprovado — recusado (42501) |

Limite confirmado no banco: a RLS separa contas, não aparelhos. Depois da
revogação, a conta continua enxergando as próprias operações, porque a política
de select compara apenas o proprietário. Bloquear o **recebimento** é, por
construção, responsabilidade do aplicativo, e é o que a correção do commit
`52a291a` faz, consultando o registro remoto do dispositivo antes de enviar e
antes de receber. A suíte de isolamento fixa esse limite para que a trava do
aplicativo não seja removida no futuro supondo que a RLS a cubra.

Limitação conhecida e aceita: o que já está gravado num aparelho revogado
permanece nele. A trava impede novas trocas; não apaga o passado à distância.

## 6. Bloqueio: Auth não aceita a convenção de e-mail da documentação

A jornada do aplicativo não pôde ser executada. Duas causas, ambas de
configuração do projeto:

| Causa | Efeito |
|---|---|
| O Auth do Supabase recusa o domínio reservado `.invalid` com `email_address_invalid` | Nenhuma conta `@example.invalid` pode ser criada pelo aplicativo |
| A confirmação por e-mail continua ligada | O cadastro tenta enviar mensagem e esbarra em `over_email_send_rate_limit` |

Domínios alternativos passam pela validação de formato, o que confirma que a
recusa é específica do TLD `.invalid`.

A segunda causa se resolve desligando a confirmação por e-mail apenas neste
projeto temporário, como os roteiros já preveem. A primeira exige decisão
humana: a convenção `@example.invalid` está fixada em três documentos e não é
aceita pelo serviço.

## 7. Pendente

| Item | Motivo |
|---|---|
| Contas fictícias A e B criadas pelo aplicativo | Bloqueado pelo item 6 |
| Conteúdo remoto observado numa linha real de `encrypted_operations` | Depende das contas |
| Sincronização entre computador e celular emulado, offline, conflito e resolução | Depende das contas |
| Revogação verificada pela interface, com envio e recebimento | Depende das contas |
| Backup: recusa em B e restauração em A | Depende das contas |
| Orçamento Familiar fora da sincronização pastoral | Depende das contas |
| Seção 3 da CHECKLIST_DISPOSITIVOS em iPhone e Android físicos | Não executável por ferramenta |
| Encerramento: apagar contas fictícias e o projeto | Ao fim da rodada |

Sobre o item 6, vale registrar o que já está provado por outro caminho: a
verificação estática da migration e os testes unitários confirmam que apenas
`ciphertext`, `iv`, `aad` e metadados técnicos saem do dispositivo, e que
nenhuma coluna das quatro tabelas guarda texto pastoral. O que falta é a
observação numa linha gerada pelo próprio aplicativo.

## 8. Avisos do analisador do Supabase

Nenhum achado de RLS ou de exposição de dados nas quatro tabelas. Resta um aviso
informativo de Auth, sobre proteção contra senhas vazadas estar desligada, sem
efeito nesta rodada fictícia.

## Estado em que o projeto ficou

Migration aplicada, privilégios corrigidos, nenhuma conta, nenhuma linha e
nenhum objeto auxiliar de teste. Pronto para a jornada do aplicativo assim que o
item 6 for resolvido.

## Decisão

Esta aprovação parcial **não** libera dados reais, publicação nem produção.
Continuam obrigatórios a jornada do aplicativo, os testes em iPhone e Android
físicos e a revisão independente de segurança, privacidade e LGPD, conforme
[CONTINUITY.md](CONTINUITY.md).
