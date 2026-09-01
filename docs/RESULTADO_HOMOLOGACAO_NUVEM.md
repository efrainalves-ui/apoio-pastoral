# Resultado da rodada de homologação em nuvem

Registro da rodada conforme [HOMOLOGACAO_NUVEM.md](HOMOLOGACAO_NUVEM.md),
[SUPABASE_HOMOLOGATION.md](SUPABASE_HOMOLOGATION.md) e
[CHECKLIST_DISPOSITIVOS.md](CHECKLIST_DISPOSITIVOS.md).

Segue a regra de evidência daqueles documentos: aqui entram apenas identificador
da rodada, commit, versão da migration, nomes de tabelas e políticas,
aprovado/reprovado, contagens e código técnico de erro. Não entram URL do
projeto, identificador do projeto, chaves, e-mails fora de `example.test` ou
`example.invalid`,
senhas, chave de recuperação, ciphertext nem conteúdo digitado.

## Identificação

| Campo | Valor |
|---|---|
| Rodada | `nuvem-2026-09-01` |
| Situação geral | **Aprovação parcial** — tudo o que é executável por ferramenta passou; faltam os aparelhos físicos |
| Migration | `0001_marco_zero_up.sql` |
| Projeto | Supabase de homologação, vazio e exclusivo desta rodada |

> Atualização posterior: este resultado descreve a rodada anterior, em que um
> aparelho novo ainda usava a chave de recuperação. A versão seguinte troca
> esse acesso por e-mail e senha e exige a migration
> `0002_password_key_envelopes_up.sql`. A nova rodada deve repetir as seções de
> entrada, dispositivos e isolamento antes de qualquer uso real.

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

## 6. Jornada do aplicativo com duas contas fictícias

Executada com três aparelhos independentes da conta A (origens locais separadas,
portanto armazenamentos separados) e um aparelho da conta B. Contas
`@example.test`, conforme a convenção adotada nesta rodada.

### Reprovações encontradas e corrigidas

| # | Item | Situação |
|---|---|---|
| 1 | Autorizar um aparelho novo | **Reprovava** — corrigido |
| 2 | Receber o distrito da conta num aparelho novo | **Reprovava** — corrigido |
| 3 | Ver registros criados em outro aparelho | **Reprovava** — corrigido |
| 4 | Revogar outro aparelho pela interface | **Reprovava** — corrigido |

**1. Aparelho novo não podia ser autorizado.** A tela dizia que o dispositivo
precisava ser autorizado com a chave de recuperação, mas a entrada para isso só
aparecia quando já existia conta local — que num aparelho novo nunca existe. O
motor já suportava o caso; faltava a porta.

**2. Aparelho novo era mandado criar outro distrito.** O guarda de rota olhava
só o distrito local, não achava nada e enviava para a configuração inicial,
duplicando o distrito da conta. Não havia saída: a tela de Sincronização mora
dentro da área protegida, que só abre depois de existir distrito.

**3. Registros de outro aparelho chegavam e ficavam invisíveis.** Quem recebe
não pode saber o tipo do registro sem abrir o conteúdo cifrado, então ele era
gravado com tipo genérico; as listagens filtravam por tipo e o descartavam.
Distrito e igrejas escapavam por serem procurados pelo conteúdo já decifrado.
Pessoas, famílias, agenda e visitas sumiam — indistinguível de perda de dados.

**4. A revogação era inalcançável.** A lista de dispositivos vinha do banco
local, e cada aparelho guarda apenas a si mesmo: a tela mostrava só o aparelho
em uso, e o botão de revogar nunca aparecia.

### Aprovado depois das correções

| Verificação | Resultado |
|---|---|
| Conta A criada pelo aplicativo, com chave de recuperação | Aprovado |
| Primeiro aparelho registrado como `active` | Aprovado |
| Senha sozinha não autoriza aparelho novo | Aprovado — exige a chave de recuperação |
| Segundo aparelho autorizado e listado na conta | Aprovado — dois dispositivos `active` |
| Registro criado no computador aparece no celular | Aprovado — uma cópia, conteúdo correto |
| Registro criado no celular aparece no computador | Aprovado — uma cópia |
| Offline: edição guardada e fila preservada | Aprovado — envio 0, fila mantida |
| Retorno à rede: fila sobe sem perda | Aprovado |
| Conflito entre dois aparelhos | Aprovado — sinalizado, nenhuma versão apagada |
| Revisão mostra as duas versões lado a lado | Aprovado |
| "Manter as duas" preserva ambas | Aprovado — viraram dois registros |
| Conta B começa vazia | Aprovado |
| Conta B não vê distrito, igreja nem pessoas de A | Aprovado |
| Conta A não vê nada de B | Aprovado |
| Backup criado só por ação explícita, no aparelho | Aprovado — nada enviado |
| Restaurar em B um backup de A | Aprovado — recusado, mesmo com o código correto |
| Orçamento Familiar fora da sincronização pastoral | Aprovado — nenhuma operação remota |

### Conteúdo remoto

Linha real de `encrypted_operations` gerada pelo aplicativo contém apenas
identificadores, versões, `created_at` e `ciphertext`/`iv`/`aad` opacos. Nenhum
nome de igreja, pessoa, distrito ou lançamento financeiro aparece legível em
nenhuma coluna.

## 7. Revogação de dispositivo

| Verificação | Resultado |
|---|---|
| Revogar outro aparelho pela interface | Aprovado — chega ao serviço com data |
| Aparelho revogado tenta entrar de novo | Aprovado — recusado pelo gatilho, não reativa |
| Aparelho revogado com sessão aberta tenta sincronizar | Aprovado — recusado |
| Aparelho revogado **envia** algo depois da revogação | Aprovado — nenhuma operação registrada |
| Aparelho revogado **recebe** algo criado depois | Aprovado — não recebeu |

O aparelho revogado com sessão ainda aberta foi barrado antes do envio e antes
do recebimento, e a fila local permaneceu intacta. No serviço, esse aparelho
consta com zero operações enviadas em toda a sua existência.

Limitação conhecida e aceita: o que já estava gravado no aparelho revogado
permanece nele. A trava impede novas trocas; não apaga o passado à distância.

## 8. Observações menores, sem reprovação

- A revisão de conflito mostra as duas versões, mas o resumo exibe apenas o
  título do registro; quando a diferença está em outro campo, as duas colunas
  ficam visualmente iguais.
- A tela de Sincronização informa as revisões pendentes, mas não quantas já
  foram resolvidas.

## 9. Avisos do analisador do Supabase

Nenhum achado de RLS ou de exposição de dados nas quatro tabelas. Resta um aviso
informativo de Auth, sobre proteção contra senhas vazadas estar desligada, sem
efeito nesta rodada fictícia.

## 10. Pendente

| Item | Motivo |
|---|---|
| Seção 3 da CHECKLIST_DISPOSITIVOS em iPhone e Android físicos | Não executável por ferramenta |
| Instalação do PWA no aparelho e tela sem corte nem rolagem horizontal | Idem |
| Encerramento: apagar contas fictícias e o projeto de homologação | Ação destrutiva; aguarda decisão do responsável |

## Decisão

Todas as verificações executáveis por ferramenta passaram, quatro delas somente
depois de correção. Esta aprovação **não** libera dados reais, publicação nem
produção. Continuam obrigatórios os testes em iPhone e Android físicos e a
revisão independente de segurança, privacidade e LGPD, conforme
[CONTINUITY.md](CONTINUITY.md).
