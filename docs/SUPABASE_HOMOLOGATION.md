# Homologação controlada do Supabase

Este roteiro é exclusivo para um projeto Supabase novo, vazio, privado e separado de produção. Não autoriza publicação nem dados reais. A execução remota permanece bloqueada até o CI Linux passar.

## Preparação já feita localmente

As migrations de `0001_marco_zero_up.sql` a `0008_revogacao_idempotente_up.sql` mantêm somente metadados técnicos e conteúdo cifrado. Elas foram reforçadas para:

- impedir que um envelope de uma conta aponte para dispositivo de outra conta;
- aceitar novo envelope apenas para dispositivo ativo da mesma conta;
- impedir reativação de dispositivo revogado;
- retirar exclusão de dispositivo, evitando apagar e recriar um dispositivo revogado;
- aceitar operações somente de dispositivo ativo pertencente à conta autenticada;
- manter operações remotas sem permissão de atualização ou exclusão.
- manter o envelope da senha protegido por RLS, disponível somente para a própria conta e sem expor a senha ou a chave mestra;
- barrar a sessão de um aparelho revogado nos envelopes de senha, de recuperação e de chave, e na lista de aparelhos — o token que ele já tinha na mão para de valer na hora, e não só quando expira;
- revogar todos os aparelhos da conta em um único comando, que é o que o encerramento de distrito precisa;
- exigir que o próprio banco declare se é homologação ou produção;
- deixar toda tabela futura de `public` fora do alcance do navegador até alguém conceder explicitamente, e exigir que cada função traga o próprio `revoke`, conferido pela prova de isolamento, pela porta do CI e pela auditoria `public.protecao_de_funcao_nova()`;
- responder a versão do esquema e o ambiente declarado também a quem ainda não entrou, para a build conferir com quem está falando antes de mandar e-mail e senha;
- apagar, por `purge_record_history`, as versões anteriores de um registro excluído, preservando apenas a lápide.

Essas garantias têm testes estáticos e unitários locais, e a prova de banco do CI passou a rodar com as **mesmas fronteiras de permissão do Supabase gerenciado**: um papel sem superusuário, que não é membro de `supabase_admin`. Foi essa diferença que deixou a primeira tentativa de homologação parar na `0005` — o CI aplicava as migrations com mais poder do que a nuvem jamais teria, e por isso aprovava o que a nuvem recusa.

## Variáveis necessárias — somente nomes

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_SUPABASE_PROJECT_REF`, com o identificador do projeto de homologação; sem ele o aplicativo recusa qualquer conexão remota
- `VITE_APP_ENV`, obrigatoriamente com o valor `homologacao`; sem ele o aplicativo recusa qualquer conexão remota
- `VITE_DISABLE_SYNC`, com o valor `false` apenas durante esta rodada

Inserir os valores somente no computador privado do avaliador. Não versionar `.env` ou `.env.local`, não copiar valores para documentação, CI, logs, screenshots ou mensagens e nunca usar `service_role` no navegador. Durante o teste remoto, `VITE_DISABLE_SYNC` não pode estar definido como `true`.

## Passo a passo para o responsável

1. Confirmar que o CI Linux da branch passou integralmente, inclusive Playwright desktop e celular.
2. Criar um projeto Supabase vazio e identificado claramente como homologação; conferir que não é produção.
3. Em Auth, permitir somente as contas fictícias da rodada. Se necessário, desabilitar confirmação de e-mail apenas nesse projeto temporário.
4. Aplicar, **nesta ordem e uma de cada vez**, `0001_marco_zero_up.sql`, `0002_password_key_envelopes_up.sql`, `0003_device_sessions_up.sql`, `0004_sessao_revogada_e_ambiente_up.sql`, `0005_ambiente_antes_da_senha_up.sql`, `0006_expurgo_de_historico_up.sql`, `0007_funcao_nova_fechada_up.sql`, `0008_revogacao_idempotente_up.sql` e `0009_sessoes_fora_de_alcance_up.sql`. Não aplicar os arquivos `*_down.sql` na validação normal. Depois de aplicar todas, `select public.app_schema_version();` precisa responder **9**.
5. Declarar o ambiente no próprio banco, uma única vez, pelo editor SQL do projeto:

   ```sql
   insert into public.service_environment (environment) values ('homologacao');
   ```

   Sem esta linha o aplicativo se recusa a sincronizar, de propósito: um banco sem identidade declarada é exatamente o caso em que dado real acaba no lugar errado. No projeto de produção o valor é `producao`, e em nenhum momento os dois projetos recebem o mesmo valor.
6. Confirmar as oito tabelas, RLS habilitada, políticas, funções `security definer` com `search_path` fixo e trigger de revogação. Em seguida, a **parada obrigatória** descrita mais abaixo: `select public.app_schema_version();` responde `9` e `select public.protecao_de_funcao_nova();` responde `true`, com `select * from public.funcoes_publicas_abertas();` devolvendo zero linhas.
7. Inserir URL, chave pública e identificador do projeto somente no ambiente local privado, fora do Git.
8. Criar duas contas fictícias distintas usando apenas endereços `example.test`, senhas exclusivas de teste e registros claramente inventados.
9. Executar toda a checklist abaixo, e também `pnpm test:api` com as variáveis das duas contas fictícias, que prova as mesmas barreiras falando direto com a API. Parar na primeira reprovação; não contornar RLS com credencial administrativa.
10. Apagar contas e projeto temporário ao fim da rodada, conforme a política interna. Guardar apenas evidência técnica redigida.

## Checklist e critérios

| Verificação | Procedimento fictício | Aprovação | Reprovação |
|---|---|---|---|
| Migration | Aplicar em projeto vazio | Transação conclui; tabelas, RLS, políticas e trigger existem | Qualquer erro, RLS ausente ou contrato diferente |
| Login | Criar A e B, sair e entrar novamente | Cada sessão mantém sua identidade | Sessões ou identidades se misturam |
| Novo dispositivo | Entrar em navegador limpo com a conta A | E-mail e senha abrem a conta, registram outro dispositivo e não pedem a chave de recuperação | Entrada pede chave de recuperação ou cria outra conta |
| Leitura entre contas | Como B, consultar linhas de A em cada tabela | Zero linhas | Qualquer linha de A é visível |
| Escrita entre contas | Como B, tentar escrever com `owner_id` de A | Operação recusada e A intacta | Escrita aceita ou A alterada |
| Vínculo cruzado | Como B, tentar envelope apontando para dispositivo de A | Inserção recusada | Inserção aceita |
| Revogação | Revogar dispositivo de A; tentar sincronizar, reativar, excluir e recriar | Todas as tentativas são recusadas | Qualquer tentativa é aceita |
| Token do revogado | Com a aba do dispositivo revogado ainda aberta, ler e apagar `password_key_envelopes`, `recovery_key_envelopes`, `device_key_envelopes` e `devices` | Zero linhas em toda leitura; nenhuma exclusão alcança linha nenhuma | Qualquer envelope aparece ou desaparece |
| Encerrar distrito | Com A ativa em dois dispositivos, encerrar o distrito em um deles | Os dois ficam revogados no serviço e o que encerrou segue com autorização nova | Algum dispositivo continua ativo |
| Redefinição por e-mail | Pedir o link, abri-lo no aparelho, definir a senha nova e informar a chave de recuperação fictícia | A senha do serviço muda e o cofre reabre; entrar em aparelho novo funciona com a senha nova | A senha não muda ou o cofre não reabre |
| Sair | Entrar com A em dois dispositivos e sair em um | O outro continua com a sessão aberta | Sair derruba o outro dispositivo |
| Ambiente declarado | Apontar a build de homologação para um projeto sem a linha de ambiente, ou com `producao` | O aplicativo recusa sincronizar e diz por quê | A sincronização acontece |
| Tabela futura | Criar uma tabela qualquer em `public` pelo editor SQL e consultá-la como conta fictícia | Acesso negado antes mesmo da RLS | A tabela responde ao navegador |
| Função futura | Criar uma função e um procedimento em `public` pelo editor SQL, sem `revoke`, e consultar os privilégios | PUBLIC não aparece em nenhum dos dois | PUBLIC continua com EXECUTE |
| Função aberta em public | `select public.protecao_de_funcao_nova();` e `select * from public.funcoes_publicas_abertas();` | Responde `true` e zero linhas | Responde `false`: há função ao alcance de PUBLIC ou de anon, e a lista diz qual |
| Privilégio padrão declarado | Ler o `notice` da `0005` ao aplicar | Diz para quais papéis declarou; os de fora estão nomeados | A migration falha por não alcançar papel nenhum |
| Sessões fora de alcance | Como conta fictícia autenticada, `GET /rest/v1/device_sessions` e `GET /rest/v1/revoked_sessions` | As duas respondem erro; nenhuma linha sai | Qualquer uma responde 200 com linhas |
| Expurgo concorrente | Apagar uma pessoa fictícia, alterar o mesmo registro por outro aparelho antes de sincronizar, e sincronizar | O histórico daquele registro não é apagado e a pendência permanece | O histórico some por baixo da alteração |
| Encerramento retomado | Fechar a aba entre revogar e reautorizar, abrir, concluir; repetir o teste três vezes | A conta termina com exatamente um aparelho ativo | Sobra mais de um aparelho ativo |
| Ambiente antes da senha | Apontar a build para o projeto errado e tentar entrar | O aplicativo recusa antes de enviar e-mail e senha | A credencial chega ao serviço errado |
| Expurgo | Apagar uma pessoa fictícia com histórico, sincronizar e inspecionar `encrypted_operations` | Sobra apenas a lápide daquele registro | Alguma versão anterior continua no serviço |
| Encerramento interrompido | Fechar a aba entre revogar e reautorizar; abrir de novo | A tela oferece concluir e o aparelho volta a ter autorização | A conta abre e não entra mais no serviço |
| Primeira sincronização grande | Conta com mais de 10.000 operações em um aparelho novo | Recebe tudo antes de dizer que está em dia; nunca oferece criar distrito | Diz "Dados atualizados" com dados faltando |
| Documentos | Gerar pauta, ata, relatório de nomeações, itinerário, pregações e encerramento de campanha sem marcar nada | Nenhum identifica pessoas | Algum traz nome sem confirmação |
| Conteúdo remoto | Sincronizar registro pastoral fictício e inspecionar tabelas | Somente IDs, versões, ciphertext, IV, AAD e timestamps; envelope de senha não contém senha nem chave legível | Qualquer conteúdo legível aparece |
| Envio e recebimento | Alterar registro fictício no computador A e receber no celular A | Uma cópia lógica, sem duplicidade e com conteúdo correto após desbloqueio | Perda, duplicidade ou texto legível no transporte |
| Isolamento do pull | Sincronizar A e executar pull como B | B não recebe operação de A | B recebe ID, envelope ou contagem de A |
| Offline e retorno | Criar e editar dados fictícios sem rede; restaurar a rede e sincronizar | Dados locais continuam visíveis e fila conclui sem perda | Dados somem, duplicam ou fila é descartada |
| Conflito | Alterar o mesmo registro fictício em dois dispositivos antes de sincronizar | Conflito fica preservado e sinalizado; nenhuma versão é apagada silenciosamente | Uma versão desaparece sem aviso |
| Backup | Criar por ação explícita, tentar conta B e restaurar na conta A | B é recusada; A exige confirmação e restaura integralmente | Mistura de contas ou restauração parcial |
| Orçamento Familiar | Criar lançamento fictício e sincronizar dados pastorais | Orçamento permanece no banco pessoal separado e não aparece nas tabelas remotas | Lançamento financeiro aparece na sincronização pastoral |

## O que o Supabase gerenciado não permite, e o que fica no lugar

A primeira tentativa de homologação parou na `0005`. O diagnóstico, comprovado
no próprio projeto, vale para todo projeto Supabase gerenciado:

| Fato comprovado | Consequência |
|---|---|
| O papel que aplica migrations é `postgres` | Não é superusuário (`rolsuper = false`) |
| `postgres` não é membro de `supabase_admin` | `alter default privileges for role supabase_admin` é recusado |
| `create event trigger` exige superusuário | Nenhuma migration normal cria gatilho de evento |
| Todos os gatilhos de evento do projeto pertencem a `supabase_admin` | Foram criados pelo provisionamento da plataforma, não por migration |
| O editor SQL do painel roda como `postgres` | Fazer à mão não contorna nada disso |

As duas migrations foram redesenhadas para isso, sem afrouxar barreira nenhuma:

- **`0005`** só declara privilégio padrão para os papéis sobre os quais ela
  realmente tem poder, conferido por `pg_has_role`. Existir não é poder. Ela
  avisa, por `notice`, quais papéis ficaram de fora, e falha se não alcançar
  nenhum.
- **`0007`** não cria mais gatilho de evento. No lugar entram três coisas que
  existem de verdade: o privilégio padrão da `0005` (melhor esforço, e dito como
  tal), a **auditoria do catálogo** (`protecao_de_funcao_nova()` e
  `funcoes_publicas_abertas()`) e a **porta do CI**
  (`src/sync/migrationSecurity.test.ts`), que recusa uma migration que crie
  função ou procedimento em `public` sem o `revoke` ao lado.

### O limite, dito por extenso

Quem tem acesso administrativo ao próprio projeto pode criar uma função aberta à
mão, e **nenhuma migration impede isso** — nem a versão com gatilho de evento
impediria, porque quem é superusuário também apaga o gatilho. Prevenir o dono de
si mesmo não é promessa que um banco de dados possa cumprir.

O que este desenho cobre, e cobre de verdade: **o aplicativo**, que só alcança o
que as políticas permitem; **as migrations versionadas**, que não entram no
repositório com função aberta; e **os acessos de usuários**, que continuam
isolados por RLS. E o que ele garante sobre o resto é que a abertura **aparece**:
a auditoria responde falso, esta checklist reprova e `pnpm test:api` reprova.

## Parada obrigatória: a auditoria de funções abertas

Depois de aplicar todas as migrations, três conferências no projeto de
homologação. **Se qualquer uma reprovar, a homologação para aqui.**

1. **As nove migrations concluíram, sem execução parcial.** Cada uma é atômica;
   uma que falhe volta atrás por inteiro e não deixa registro. Confirme a
   versão final:

   ```sql
   select public.app_schema_version();
   ```

   Precisa responder **9**.

2. **Nenhuma função de `public` está aberta.**

   ```sql
   select public.protecao_de_funcao_nova();
   ```

   Precisa responder `true`. Ela lê o catálogo — não afirma nada por conta
   própria —, então continua respondendo a verdade se alguém abrir uma função
   depois, por fora das migrations.

3. **E, se responder falso, o problema tem nome.**

   ```sql
   select * from public.funcoes_publicas_abertas();
   ```

   Precisa devolver zero linhas. Cada linha é uma função de `public` ao alcance
   de `PUBLIC` ou de `anon` — as duas de identificação do serviço
   (`app_schema_version`, `app_environment`) são exceção declarada e não
   aparecem aqui.

`pnpm test:api` faz as mesmas perguntas por HTTP, com a chave pública, e ainda
confere que a própria auditoria não responde a quem não entrou.

**O que não fazer se reprovar:** não conceder `execute` a `PUBLIC` ou a `anon`
para "resolver"; não remover a conferência da migration; não seguir para os
testes seguintes. O caminho é fechar a função que apareceu na lista, com um
`revoke` escrito em migration versionada, e aplicar de novo.

## Evidências permitidas

Registrar somente: identificador da rodada, commit testado, versão da migration, nomes de tabelas/políticas, aprovado/reprovado, contagens e código técnico de erro. Não registrar URL, token, e-mail fora de `example.test`, senha, chave de recuperação, ciphertext completo, PDF, backup, formulário, nome ou conteúdo pastoral.

## Decisão

A etapa reprova com qualquer acesso cruzado, vínculo cruzado, reativação, acesso do token de um aparelho revogado, encerramento que deixa dispositivo ativo, conteúdo legível remoto, perda silenciosa, mistura de backup ou ausência de RLS. A aprovação de todos os itens apenas libera a próxima etapa de teste privado fictício em dispositivos físicos; não libera produção nem dados reais.
