# Homologação controlada do Supabase

Este roteiro é exclusivo para um projeto Supabase novo, vazio, privado e separado de produção. Não autoriza publicação nem dados reais. A execução remota permanece bloqueada até o CI Linux passar.

## Preparação já feita localmente

A migration `supabase/migrations/0001_marco_zero_up.sql` mantém somente metadados técnicos e conteúdo cifrado. Ela foi reforçada para:

- impedir que um envelope de uma conta aponte para dispositivo de outra conta;
- aceitar novo envelope apenas para dispositivo ativo da mesma conta;
- impedir reativação de dispositivo revogado;
- retirar exclusão de dispositivo, evitando apagar e recriar um dispositivo revogado;
- aceitar operações somente de dispositivo ativo pertencente à conta autenticada;
- manter operações remotas sem permissão de atualização ou exclusão.

Essas garantias têm testes estáticos e unitários locais. Ainda precisam ser comprovadas no Supabase de homologação; nenhuma migration foi aplicada remotamente nesta preparação.

## Variáveis necessárias — somente nomes

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Inserir os valores somente no computador privado do avaliador. Não versionar `.env` ou `.env.local`, não copiar valores para documentação, CI, logs, screenshots ou mensagens e nunca usar `service_role` no navegador. Durante o teste remoto, `VITE_DISABLE_SYNC` não pode estar definido como `true`.

## Passo a passo para o responsável

1. Confirmar que o CI Linux da branch passou integralmente, inclusive Playwright desktop e celular.
2. Criar um projeto Supabase vazio e identificado claramente como homologação; conferir que não é produção.
3. Em Auth, permitir somente as contas fictícias da rodada. Se necessário, desabilitar confirmação de e-mail apenas nesse projeto temporário.
4. Aplicar `supabase/migrations/0001_marco_zero_up.sql` uma única vez. Não aplicar o arquivo `*_down.sql` na validação normal.
5. Confirmar as quatro tabelas, RLS habilitada, políticas e trigger de revogação.
6. Inserir URL e chave pública somente no ambiente local privado, fora do Git.
7. Criar duas contas fictícias distintas usando apenas endereços `example.invalid`, senhas exclusivas de teste e registros claramente inventados.
8. Executar toda a checklist abaixo. Parar na primeira reprovação; não contornar RLS com credencial administrativa.
9. Apagar contas e projeto temporário ao fim da rodada, conforme a política interna. Guardar apenas evidência técnica redigida.

## Checklist e critérios

| Verificação | Procedimento fictício | Aprovação | Reprovação |
|---|---|---|---|
| Migration | Aplicar em projeto vazio | Transação conclui; tabelas, RLS, políticas e trigger existem | Qualquer erro, RLS ausente ou contrato diferente |
| Login | Criar A e B, sair e entrar novamente | Cada sessão mantém sua identidade | Sessões ou identidades se misturam |
| Leitura entre contas | Como B, consultar linhas de A em cada tabela | Zero linhas | Qualquer linha de A é visível |
| Escrita entre contas | Como B, tentar escrever com `owner_id` de A | Operação recusada e A intacta | Escrita aceita ou A alterada |
| Vínculo cruzado | Como B, tentar envelope apontando para dispositivo de A | Inserção recusada | Inserção aceita |
| Revogação | Revogar dispositivo de A; tentar sincronizar, reativar, excluir e recriar | Todas as tentativas são recusadas | Qualquer tentativa é aceita |
| Conteúdo remoto | Sincronizar registro pastoral fictício e inspecionar linha | Somente IDs, versões, ciphertext, IV, AAD e timestamps | Qualquer conteúdo legível aparece |
| Envio e recebimento | Alterar registro fictício no computador A e receber no celular A | Uma cópia lógica, sem duplicidade e com conteúdo correto após desbloqueio | Perda, duplicidade ou texto legível no transporte |
| Isolamento do pull | Sincronizar A e executar pull como B | B não recebe operação de A | B recebe ID, envelope ou contagem de A |
| Offline e retorno | Criar e editar dados fictícios sem rede; restaurar a rede e sincronizar | Dados locais continuam visíveis e fila conclui sem perda | Dados somem, duplicam ou fila é descartada |
| Conflito | Alterar o mesmo registro fictício em dois dispositivos antes de sincronizar | Conflito fica preservado e sinalizado; nenhuma versão é apagada silenciosamente | Uma versão desaparece sem aviso |
| Backup | Criar por ação explícita, tentar conta B e restaurar na conta A | B é recusada; A exige confirmação e restaura integralmente | Mistura de contas ou restauração parcial |
| Orçamento Familiar | Criar lançamento fictício e sincronizar dados pastorais | Orçamento permanece no banco pessoal separado e não aparece nas tabelas remotas | Lançamento financeiro aparece na sincronização pastoral |

## Evidências permitidas

Registrar somente: identificador da rodada, commit testado, versão da migration, nomes de tabelas/políticas, aprovado/reprovado, contagens e código técnico de erro. Não registrar URL, token, e-mail fora de `example.invalid`, senha, chave de recuperação, ciphertext completo, PDF, backup, formulário, nome ou conteúdo pastoral.

## Decisão

A etapa reprova com qualquer acesso cruzado, vínculo cruzado, reativação, conteúdo legível remoto, perda silenciosa, mistura de backup ou ausência de RLS. A aprovação de todos os itens apenas libera a próxima etapa de teste privado fictício em dispositivos físicos; não libera produção nem dados reais.
