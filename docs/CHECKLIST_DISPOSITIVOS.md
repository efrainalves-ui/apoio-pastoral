# Checklist da rodada em nuvem — computador, iPhone e Android

Use somente contas `@example.test`, senhas exclusivas de teste e registros
inventados. Pare na primeira reprovação e anote o que aconteceu.

Pré-requisito: [HOMOLOGACAO_NUVEM.md](HOMOLOGACAO_NUVEM.md) concluído, com as
contas fictícias A e B já criadas.

Esta lista cobre o que só aparece **com sincronização ligada**. As jornadas de
uso local continuam em [INTERNAL_HOMOLOGATION_CHECKLIST.md](INTERNAL_HOMOLOGATION_CHECKLIST.md)
e os itens específicos de aparelho físico em [MOBILE_HOMOLOGATION.md](MOBILE_HOMOLOGATION.md).

## 1. Computador — conta A

| # | O que fazer | Aprova se | Reprova se |
|---|---|---|---|
| 1.1 | Entrar na conta A e criar um registro fictício | O registro aparece normalmente | Erro técnico visível ou pedido de dado real |
| 1.2 | No Supabase, abrir `encrypted_operations` | Só há ID, versão, data e texto embaralhado | Qualquer nome, endereço ou observação legível |
| 1.3 | Abrir `devices` | Há um dispositivo `active` da conta A | Dispositivo de outra conta aparece |
| 1.4 | Sair e entrar de novo | Os registros fictícios continuam lá | Dados somem ou se misturam |

## 2. Computador — conta B ao lado da A

| # | O que fazer | Aprova se | Reprova se |
|---|---|---|---|
| 2.1 | Entrar na conta B em uma janela anônima | B começa vazia | B enxerga qualquer coisa de A |
| 2.2 | Criar um registro fictício em B e sincronizar | Só o registro de B aparece em B | Registro de A aparece em B |
| 2.3 | Voltar à conta A e sincronizar | Só o registro de A aparece em A | Registro de B aparece em A |
| 2.4 | Tentar restaurar em B um backup gerado em A | O aplicativo recusa e explica o motivo | A restauração acontece ou mistura contas |

## 3. Celular — iPhone e Android, mesma conta A

Repita a seção inteira em cada aparelho.

| # | O que fazer | Aprova se | Reprova se |
|---|---|---|---|
| 3.1 | Instalar o aplicativo pela forma autorizada e entrar na conta A | A tela abre sem corte nem rolagem horizontal | Falha de instalação ou tela quebrada |
| 3.2 | Conferir a lista de dispositivos da conta A | O celular aparece como um segundo dispositivo | O celular entra sem ser registrado |
| 3.3 | Ver no celular o registro criado no computador | Aparece uma cópia só, com o conteúdo certo | Falta, duplica ou vem embaralhado |
| 3.4 | Criar um registro no celular e sincronizar | Ele aparece no computador após sincronizar | Perda, duplicidade ou erro sem mensagem |
| 3.5 | Desligar a rede, editar um registro, religar e sincronizar | A edição sobe e nada se perde | A fila é descartada ou os dados somem |

## 4. Conflito entre os dois aparelhos

| # | O que fazer | Aprova se | Reprova se |
|---|---|---|---|
| 4.1 | Sem rede nos dois, editar o **mesmo** registro no computador e no celular | Ambos aceitam a edição localmente | Algum trava ou perde a edição |
| 4.2 | Religar a rede e sincronizar os dois | O aplicativo sinaliza o conflito e preserva as duas versões | Uma versão desaparece sem aviso |
| 4.3 | Abrir Sincronização e clicar em "Revisar agora" | A tela mostra as duas versões lado a lado, com um resumo legível de cada uma | Alguma versão não aparece ou vem em linguagem técnica |
| 4.4 | Escolher "Manter as duas" | As duas passam a existir como registros separados | Alguma versão some |
| 4.5 | Em um novo conflito, escolher "Ficar com a do outro aparelho" | A versão escolhida passa a valer e a outra continua guardada no histórico | A versão preterida é apagada |
| 4.6 | Conferir o histórico de revisões | Mostra quantas revisões já foram resolvidas | O histórico não registra nada |

## 5. Revogação de dispositivo

| # | O que fazer | Aprova se | Reprova se |
|---|---|---|---|
| 5.1 | Pelo computador, revogar o dispositivo do celular | O celular passa a `revoked` na lista | A revogação não chega ao serviço |
| 5.2 | Tentar sincronizar pelo celular revogado | A sincronização é recusada | O celular continua enviando dados |
| 5.3 | No celular revogado, tentar entrar de novo | É preciso autorizar de novo por outro dispositivo | O celular se reativa sozinho |

## 6. Backup e restauração

| # | O que fazer | Aprova se | Reprova se |
|---|---|---|---|
| 6.1 | Criar um backup fictício por ação explícita | O aplicativo mostra só data, tamanho e quantidade | O backup é enviado para algum lugar |
| 6.2 | Tentar restaurar com o código errado | É recusado sem alterar nada | Restaura ou corrompe os dados |
| 6.3 | Restaurar com o código certo | Exige a confirmação escrita e restaura por inteiro | Restaura pela metade ou sem confirmar |

## 7. Encerramento

| # | O que fazer | Aprova se | Reprova se |
|---|---|---|---|
| 7.1 | Apagar as contas fictícias A e B | Somem do projeto de homologação | Sobra dado órfão |
| 7.2 | Apagar o projeto Supabase da rodada | O projeto deixa de existir | O projeto permanece acessível |

## Registro da rodada

Anote apenas: data, versão do aplicativo, commit testado, plataforma, o
resultado de cada linha e o código técnico de qualquer erro.

Não anote: URL do projeto, chaves, e-mails fora de `example.test`, senhas,
chave de recuperação, ciphertext, arquivos de backup ou capturas de tela com
campos preenchidos.

Qualquer reprovação bloqueia o uso de dados reais. A aprovação de tudo aqui
libera apenas a próxima etapa; não libera produção nem publicação.
