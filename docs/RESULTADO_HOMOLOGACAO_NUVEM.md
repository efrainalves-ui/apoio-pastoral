# Resultado da rodada de homologação em nuvem

Registro da rodada conforme [HOMOLOGACAO_NUVEM.md](HOMOLOGACAO_NUVEM.md),
[SUPABASE_HOMOLOGATION.md](SUPABASE_HOMOLOGATION.md) e
[CHECKLIST_DISPOSITIVOS.md](CHECKLIST_DISPOSITIVOS.md).

Segue a regra de evidência daqueles documentos: aqui entram apenas identificador
da rodada, commit, versão da migration, nomes de tabelas e políticas,
aprovado/reprovado, contagens e código técnico de erro. Não entram URL do
projeto, chaves, e-mails fora de `example.invalid`, senhas, chave de
recuperação, ciphertext nem conteúdo digitado.

## Identificação

| Campo | Valor |
|---|---|
| Rodada | `nuvem-2026-09-01` |
| Situação geral | **Aprovação parcial** — a parte que não depende do projeto em nuvem está concluída; a rodada em nuvem ainda não começou |
| Migration | `0001_marco_zero_up.sql` |
| Projeto de homologação | `apoio-pastoral-homologacao`, criado e vazio |

## Aprovado antes da rodada em nuvem

Provado em Postgres descartável no CI, sem credencial e sem nuvem, pelo job
`Migrations, reversão e RLS`, que roda `scripts/db/test-migrations.sh` sobre
`00_auth_shim.sql` e `01_rls_isolation.sql`:

| Verificação | Resultado |
|---|---|
| Migration aplica, reverte e reaplica sem resto | Aprovado |
| Quatro tabelas: `devices`, `device_key_envelopes`, `recovery_key_envelopes`, `encrypted_operations` | Aprovado |
| RLS habilitada e ao menos uma política em toda tabela de `public` | Aprovado |
| `anon` sem nenhum privilégio em `public` | Aprovado |
| Leitura entre contas fictícias A e B | Aprovado — zero linhas |
| Escrita em nome de outra conta | Aprovado — recusada |
| Envelope apontando para dispositivo de outra conta | Aprovado — recusado |
| `encrypted_operations` sem update e sem delete | Aprovado |
| Dispositivo revogado: reativação, exclusão, novo envelope e envio | Aprovado — todos recusados |

Provado em teste unitário, com dados fictícios:

| Verificação | Resultado |
|---|---|
| Somente ciphertext, IV, AAD e metadados técnicos saem do dispositivo | Aprovado |
| Conteúdo pastoral ausente do transporte e do registro de conflito | Aprovado |
| Trava de ambiente: sem `VITE_APP_ENV=homologacao` o cliente recusa conexão remota | Aprovado |

## Reprovado e corrigido nesta rodada

| Item | Situação |
|---|---|
| Aparelho revogado bloqueado de **enviar** | Já valia antes |
| Aparelho revogado bloqueado de **receber** | **Reprovava**; corrigido em `52a291a` |

A RLS separa contas, não aparelhos. Um dispositivo revogado continua com a
sessão da própria conta, e a política de select de `encrypted_operations` só
compara `owner_id`. Como a sincronização traz conteúdo e não o estado dos
dispositivos, o aparelho revogado nunca ficava sabendo da revogação: parava de
enviar, pela política de insert que exige dispositivo ativo, mas seguia
recebendo e abrindo tudo o que os outros aparelhos gravassem depois.

Correção: o registro remoto em `devices` passou a ser a autoridade consultada
antes de enviar e antes de receber, com gravação local do estado para que o
bloqueio continue valendo sem rede, e falha fechada quando a autorização não
pode ser confirmada. A suíte de RLS ganhou uma asserção que fixa o limite real
do banco, para que essa trava não seja removida no futuro supondo que a RLS
cubra também o recebimento.

Limitação conhecida e aceita: o que já está gravado no aparelho revogado
permanece nele. A trava impede novas trocas; não apaga o passado à distância.

## Pendente

| Item | Motivo |
|---|---|
| Aplicar a migration no projeto de homologação | Depende do conector MCP do Supabase, que exige autorização no navegador pelo responsável |
| Conferir as quatro tabelas, RLS, políticas e trigger no projeto real | Idem |
| Contas fictícias A e B, isolamento e conteúdo cifrado observados no Table Editor | Idem |
| Seções 1, 2, 4, 5 e 6 da CHECKLIST_DISPOSITIVOS em computador e celular emulado | Idem |
| Seção 3 da CHECKLIST_DISPOSITIVOS em iPhone e Android físicos | Não executável por ferramenta; fica para o responsável |
| Encerramento: apagar contas fictícias e o projeto | Ao fim da rodada |

## Decisão

Esta aprovação parcial **não** libera dados reais, publicação nem produção.
Continuam obrigatórios a rodada em nuvem completa, os testes em iPhone e Android
físicos e a revisão independente de segurança, privacidade e LGPD, conforme
[CONTINUITY.md](CONTINUITY.md).
