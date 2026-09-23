# Publicar uma atualização e voltar atrás com segurança

Guia curto e prático. Ele **não publica nada sozinho** e não guarda senha,
chave, token nem endereço privado. O endereço e as credenciais do provedor
ficam só com o pastor responsável.

## 1. Antes de publicar: os portões que precisam passar

Rode na sua máquina, um de cada vez, e confira que cada um termina sem erro:

```bash
pnpm install --frozen-lockfile
```

```bash
pnpm lint
```

```bash
pnpm typecheck
```

```bash
pnpm test
```

```bash
pnpm build
```

```bash
pnpm verify:pwa
```

```bash
pnpm verify:repo
```

```bash
pnpm test:e2e
```

O que cada um garante:

| Comando | Garante |
|---|---|
| `pnpm lint` | Nenhum aviso de código pendente |
| `pnpm typecheck` | Tipos conferidos em todo o projeto |
| `pnpm test` | Testes unitários, incluindo regras pastorais e de cifra |
| `pnpm build` | Versão de produção compila e gera a pasta `dist` |
| `pnpm verify:pwa` | Manifesto, ícones e service worker prontos para instalar |
| `pnpm verify:repo` | Nenhuma chave, senha ou dado real no repositório |
| `pnpm test:e2e` | Jornadas completas em computador e celular emulado |

Os mesmos portões rodam sozinhos no GitHub, nos workflows **CI** e
**Homologação interna (Linux)**. Só publique com os dois verdes no commit que
você vai enviar.

## 2. Conferências de conteúdo antes de enviar

- a interface não mostra nenhum botão de demonstração nem dado fictício: os
  atalhos de teste existem apenas quando `VITE_E2E=true`, que é usado só pelos
  testes automatizados e nunca no build de produção;
- nenhuma tela exibe chave, token, URL privada ou dado real;
- o aplicativo não escreve nada no console do navegador.

## 3. Publicar a atualização

1. gere a versão: `pnpm install --frozen-lockfile && pnpm build`;
2. envie a pasta `dist` para o mesmo endereço privado já protegido por senha,
   pelo painel do provedor;
3. anote a data, o commit publicado e quem publicou;
4. abra o endereço no computador e no celular, entre com uma conta e confira:
   a tela inicial abre, a sincronização responde e o aplicativo instalado
   continua abrindo.

O aplicativo é estático: a pasta `dist` é o site inteiro. Não há servidor
próprio, banco no servidor nem processo para reiniciar.

## 4. Voltar atrás (reverter) com segurança

Reverter troca apenas os arquivos do site. **Nenhum dado do pastor é afetado**:
tudo fica cifrado no aparelho e, quando a sincronização está ligada, o que está
no Supabase continua cifrado e intocado.

Duas formas, na ordem de preferência:

1. **Pelo provedor**: escolha a publicação anterior na lista de versões e
   marque-a como a atual. É a forma mais rápida e não depende do código local.
2. **Pelo repositório**: volte ao commit que estava publicado
   (`git checkout <commit>`), rode `pnpm install --frozen-lockfile && pnpm build`
   e envie a `dist` de novo.

Depois de reverter:

- abra o endereço em uma aba nova e confirme a versão que carregou;
- no celular, feche e reabra o aplicativo instalado — o service worker troca
  para a versão publicada na próxima abertura;
- registre o motivo da reversão junto com a data e o commit.

## 5. Ambientes: homologação e produção são separados

A build declara em qual ambiente está, e só dois valores abrem conexão remota:

| `VITE_APP_ENV` | O que acontece |
|---|---|
| `desenvolvimento` | tudo local, nenhuma conexão remota |
| `homologacao` | fala com o projeto Supabase de teste, só dados fictícios |
| `producao` | fala com o projeto Supabase real do distrito |
| vazio ou qualquer outro valor | **o aplicativo não abre** |

Modo local deixou de ser o que sobra quando alguém esquece a variável. Antes,
uma build que declarava homologação e esquecia o endereço do serviço não parava:
caía no transporte local e abria normalmente, e o pastor cadastraria o distrito
inteiro achando que estava sincronizando. Agora `homologacao` e `producao`
falham fechado — sem endereço, sem chave pública, sem projeto declarado, com os
três discordando, ou com `VITE_DISABLE_SYNC=true`, a build mostra o motivo e não
abre. E uma build sem ambiente declarado também não abre.

Cada ambiente tem o seu próprio projeto Supabase, com URL e chave pública
próprias, guardadas apenas no painel do provedor e no `.env.local` de quem
gera a build. Nunca aponte um ambiente para o banco do outro.

Além do `VITE_APP_ENV`, declare também `VITE_SUPABASE_PROJECT_REF` com o
identificador do projeto daquele ambiente (a parte antes de `.supabase.co` no
endereço). O aplicativo compara três coisas antes de abrir qualquer conexão: o
endereço, o projeto declarado e o projeto gravado dentro da chave pública. Se
os três não forem o mesmo, nenhuma conexão é aberta — é o que impede uma build
de produção falar com o banco de teste, e o contrário.

Antes de publicar, rode a mesma conferência fora do navegador:

```bash
pnpm verify:env
```

Ele lê `VITE_APP_ENV`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
`VITE_SUPABASE_PROJECT_REF` e `VITE_DISABLE_SYNC` do ambiente de quem executa,
reprova o que estiver faltando ou discordando, e não imprime valor nenhum — só
o nome da variável. Os dois workflows já o executam.

O ambiente de homologação mostra uma marca discreta "Homologação" no cabeçalho.
Se ela aparecer em produção, a build foi gerada com a variável errada.

## 5.1 Hospedagem: Cloudflare Pages, e só

Nesta fase, **Cloudflare Pages é a única hospedagem oficialmente suportada**.

`public/_headers` está no formato do Cloudflare Pages e é o único lugar onde os
cabeçalhos de segurança deste aplicativo existem: CSP, HSTS, Permissions-Policy,
as políticas de origem cruzada e a regra que impede o service worker de ficar
preso em cache. Havia um `vercel.json` versionado com três desses cabeçalhos e
nenhum dos outros — publicar por ali era publicar o mesmo aplicativo com bem
menos proteção, e nada na documentação dizia isso. Ele foi retirado.

`pnpm verify:headers` confere `public/_headers` e reprova se um arquivo de
configuração de outra hospedagem voltar ao repositório. Para apoiar outra:
reproduzir **todos** os cabeçalhos no formato dela, conferir cada um na resposta
HTTP real do ambiente publicado, e só então versionar a configuração e ampliar o
script. Enquanto isso não for feito e registrado, a alternativa não é
documentada — documentar uma opção com proteção inferior é oferecer a opção
errada.

## 5.2 A homologação no Cloudflare Pages

O repositório já está ligado a um projeto Pages, de uma publicação de teste
antiga e desatualizada. Em vez de criar um segundo projeto sobre o mesmo
repositório, esse projeto passa a ser **exclusivamente a homologação**: mesma
origem, uma configuração só, e nenhuma dúvida sobre qual endereço é qual.

Um projeto Pages não pode ser renomeado. O endereço continua com o nome antigo,
então o nome do endereço **não** é o que diz o ambiente — quem diz é o próprio
aplicativo, na tela, antes do login.

| Campo | Valor |
|---|---|
| Build command | `pnpm build` |
| Build output directory | `dist` |
| Root directory | `/` |
| Variável de build | `NODE_VERSION` = `24.20.0` (o projeto exige Node ≥ 22; é a versão em que a suíte e a build foram provadas) |

O repositório já traz o que o Pages precisa: `public/_redirects` devolve
`index.html` nas rotas internas e `public/_headers` leva os cabeçalhos de
segurança. Os dois são copiados para `dist` na build.

Variáveis da build, **somente os nomes** — os valores são digitados direto no
painel, nunca em documento, mensagem ou log:

- `VITE_APP_ENV` = `homologacao`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_SUPABASE_PROJECT_REF`
- `VITE_DISABLE_SYNC` = `false`
- `NODE_VERSION` = `24.20.0`

Nenhuma variável de E2E e nenhuma variável de produção. Variável antiga que
sobrou de outra configuração é apagada: o que não está escrito hoje não pode
continuar valendo por inércia.

### Produção e Preview são dois conjuntos de variáveis

Este é o detalhe que custou uma rodada inteira em 23/09/2026, e ele não é
óbvio: no Cloudflare Pages, **cada projeto tem dois ambientes de build** —
*Production*, que constrói a branch de produção do projeto, e *Preview*, que
constrói qualquer outra branch. **Eles não compartilham variáveis.**

Os dois projetos deste repositório (`apoio-pastoral-homologacao` e
`apoio-pastoral-producao`) têm a `main` como branch de produção. Logo:

- `apoio-pastoral.pages.dev` é a **produção do projeto de homologação**, e
  segue a `main` — não a branch `homologacao`;
- empurrar para a branch `homologacao` gera uma **prévia**, em
  `https://homologacao.apoio-pastoral.pages.dev`.

Essa prévia não abria. As seis variáveis estavam preenchidas só em
*Production*, e a build de Preview saía sem `VITE_SUPABASE_PROJECT_REF`. O
aplicativo então falhava fechado, com "Esta instalação não está configurada" —
que é o comportamento correto, e foi ele que denunciou o problema em vez de
deixar a prévia falar com projeto nenhum.

**Na prática faltava uma só.** A ordem das conferências em
`src/sync/config.ts` diz qual: a build de prévia chegou até a checagem do
projeto, e essa checagem só é alcançada depois de `VITE_APP_ENV`,
`VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` já terem passado. Logo, em
*Preview* faltava apenas **`VITE_SUPABASE_PROJECT_REF`** — que não é segredo:
é a parte do endereço antes de `.supabase.co`, já visível dentro do pacote que
qualquer visitante baixa.

Antes de acrescentar qualquer outra, **olhe a lista de Preview no painel**. Estas
são as seis que precisam existir lá, no projeto `apoio-pastoral-homologacao`:

| Variável | Ambiente Preview |
|---|---|
| `VITE_APP_ENV` | `homologacao` |
| `VITE_SUPABASE_URL` | o endereço do projeto Supabase **de homologação** |
| `VITE_SUPABASE_ANON_KEY` | a chave pública (anon) do mesmo projeto |
| `VITE_SUPABASE_PROJECT_REF` | a parte do endereço antes de `.supabase.co` |
| `VITE_DISABLE_SYNC` | `false` |
| `NODE_VERSION` | `24.20.0` |

Nenhum desses valores é segredo de verdade — a chave anon e o identificador do
projeto vão dentro do pacote que qualquer visitante baixa. Mesmo assim eles não
entram em documento, mensagem nem log: quem os digita é quem tem o painel.

**Não mexa no ambiente Preview do projeto `apoio-pastoral-producao`.** Ele
constrói prévias com a configuração de produção, e não é ali que se testa.

Depois de salvar, o Cloudflare **não** reconstrói sozinho: o Vite grava o valor
dentro do pacote no momento da build, então é preciso uma build nova. Na branch,
**Deployments → a última da branch `homologacao` → Retry deployment**, ou um
envio novo qualquer para a branch.

**As variáveis precisam existir antes da build que vai ser usada.** O Vite grava
o valor delas dentro do arquivo compilado; publicar antes de configurá-las gera
um aplicativo que abre na tela "Esta instalação não está configurada" e não
passa dali. Isso é a trava funcionando, e está provado: uma build sem variável
nenhuma carrega essa tela e não carrega endereço de projeto nenhum.

Pelo mesmo motivo, marcar uma variável `VITE_` como secreta no painel não
esconde nada: ela termina dentro do arquivo que o navegador baixa. A chave
pública do Supabase é feita para ficar visível — quem protege os dados é o RLS
e a criptografia no aparelho, não o segredo da chave.

### O endereço é público, e isso não é contornável aqui

O Cloudflare Access protege endereços de um domínio **seu**. `pages.dev` é
domínio da Cloudflare, então **o endereço de produção de um projeto Pages não
recebe Access sem domínio próprio**. Ele é alcançável por qualquer pessoa que
tenha a URL.

Portanto a homologação **não é privada**, e não é chamada disso. A consequência
prática é uma regra, não um conforto: **na homologação só entram contas, nomes,
e-mails e números fictícios.** Nenhum dado de membro real, em nenhuma tela, em
nenhum momento.

Existem duas formas de fechar o endereço, se um dia for necessário:

1. **Domínio próprio** apontado para o projeto — aí o Access se aplica.
2. **Sair por preview em vez de produção**: apontar a branch de produção do
   projeto para uma branch que não existe e deixar a `main` sair como preview,
   que aceita Access no plano gratuito. Custa o endereço de produção do projeto,
   que passa a não servir para nada.

Enquanto nenhuma das duas estiver feita, o endereço é público e a regra do
dado fictício é o que protege — não a obscuridade da URL.

## 6. Migrations, na ordem de aplicação

No projeto de produção recém-criado, aplique nesta ordem:

| Ordem | Arquivo | O que cria |
|---|---|---|
| 0 | `supabase/migrations/0000_plataforma_fechada_up.sql` | Nada. Retira o `EXECUTE` que PUBLIC recebe por padrão sobre funções de gatilho de evento em `public` criadas pelo provisionamento do projeto |
| 1 | `supabase/migrations/0001_marco_zero_up.sql` | `devices`, `device_key_envelopes`, `recovery_key_envelopes`, `encrypted_operations`; índice do cursor de sincronização; gatilho que impede reativar aparelho revogado; RLS por dono e privilégios mínimos |
| 2 | `supabase/migrations/0002_password_key_envelopes_up.sql` | `password_key_envelopes`, com RLS por dono e mínimo de 600 mil iterações |
| 3 | `supabase/migrations/0003_device_sessions_up.sql` | ordem de chegada (`seq`) e assinatura das operações; `device_sessions` e `revoked_sessions`; funções `claim_device`, `approve_device`, `revoke_device`, `upload_operations`, `download_operations` e `app_schema_version`; retirada da escrita direta em `devices` e `encrypted_operations`; privilégios padrão do schema revogados |
| 4 | `supabase/migrations/0004_sessao_revogada_e_ambiente_up.sql` | `session_is_not_revoked` e `session_is_authorized`; políticas dos envelopes exigindo sessão não revogada; `service_environment` e `app_environment`; `revoke_all_devices` |
| 5 | `supabase/migrations/0005_ambiente_antes_da_senha_up.sql` | `app_schema_version` e `app_environment` respondem antes da autenticação, para a conferência acontecer antes de a credencial sair |
| 6 | `supabase/migrations/0006_expurgo_de_historico_up.sql` | `purge_record_history`, que apaga o histórico de um registro somente quando a operação esperada ainda é a última dele |
| 7 | `supabase/migrations/0007_funcao_nova_fechada_up.sql` | auditoria do catálogo: `funcoes_publicas_abertas()` lista as funções de `public` ao alcance de PUBLIC ou de anon, e `protecao_de_funcao_nova()` responde se a lista está vazia |
| 8 | `supabase/migrations/0008_revogacao_idempotente_up.sql` | `revoke_all_devices` idempotente: repetir devolve zero em vez de erro, e é assim que a retomada distingue trabalho já feito de falha |
| 9 | `supabase/migrations/0009_sessoes_fora_de_alcance_up.sql` | `device_sessions` e `revoked_sessions` saem do alcance direto do cliente, e suas políticas passam a exigir sessão não revogada |

A `0000` existe por um caso concreto: um projeto Supabase criado depois de
setembro de 2026 chega com o gatilho de evento `ensure_rls`, cuja função
`rls_auto_enable()` vive em `public`, pertence a `postgres` e não tem ACL
explícita — e sem ACL o PostgreSQL concede `EXECUTE` a PUBLIC. A auditoria da
`0007` então aborta, corretamente, ao encontrar função de `public` ao alcance de
PUBLIC. Não é porta explorável (o PostgreSQL recusa a chamada direta de função
de gatilho), mas é exceção ao invariante, e uma auditoria com exceção tolerada
deixa de servir. A `0000` fecha a concessão, não apaga nada da plataforma, não
cria objeto e **não** muda `app_schema_version()` — por isso ela é `0000` e não
`0010`: é pré-condição do contrato, não parte dele.

O aplicativo espera a versão de esquema **9** (`app_schema_version()`) e recusa
sincronizar com um serviço em versão diferente. Aplicar as nove migrations é
obrigatório antes da primeira entrada.

As migrations `0010` a `0013` são das notificações dos lembretes e **não** mudam
`app_schema_version()`: uma build sem elas continua falando com o banco, e uma
build com elas pergunta a `lembretes_push_disponivel()` antes de oferecer o
recurso. São opcionais para sincronizar e obrigatórias para notificar.
A `0013` fecha a revogação: aparelho revogado deixa de ser avisado. O passo a
passo de cada uma está em `docs/LEMBRETES_NOTIFICACOES.md`.

As nove são aplicáveis em Supabase gerenciado, e isso deixou de ser suposição.
A `0007` chegou a depender de `create event trigger`, que exige superusuário: a
primeira tentativa de homologação provou que o papel que aplica migrations não é
superusuário, e a `0005` provou o mesmo para `alter default privileges` de um
papel do qual ela não é membro. As duas foram redesenhadas para trabalhar dentro
dessas fronteiras, e a prova de banco do CI passou a rodar com elas.

Depois de aplicar, a **parada obrigatória** de
[SUPABASE_HOMOLOGATION.md](SUPABASE_HOMOLOGATION.md): `app_schema_version()`
responde `9`, `protecao_de_funcao_nova()` responde `true` e
`funcoes_publicas_abertas()` devolve zero linhas. Enquanto isso não passar, a
homologação fechada não começa.

Operações que já existirem no banco sem assinatura de metadados — só é o caso
de bancos de teste anteriores a esta versão — entram em quarentena no aparelho
que as receber, sem serem aplicadas. Em um projeto de produção recém-criado
isso não acontece.

Para desfazer, na ordem inversa: `0009_sessoes_fora_de_alcance_down.sql`,
`0008_revogacao_idempotente_down.sql`, `0007_funcao_nova_fechada_down.sql`,
`0006_expurgo_de_historico_down.sql`, `0005_ambiente_antes_da_senha_down.sql`,
`0004_sessao_revogada_e_ambiente_down.sql`, `0003_device_sessions_down.sql`,
`0002_password_key_envelopes_down.sql` e `0001_marco_zero_down.sql`. Desfazer
apaga as tabelas e o que estiver nelas — faça backup antes e só em ambiente de
teste. A reversão da `0009` devolve a leitura direta das tabelas de sessão ao
cliente: só faz sentido para desfazer uma aplicação errada.

Os dois workflows do GitHub aplicam, provam e revertem essas migrations em um
Postgres descartável a cada envio, incluindo a prova de isolamento entre duas
contas fictícias.

## 6.1 Provar as barreiras direto na API

As barreiras de aparelho são provadas a cada envio em um Postgres descartável
(`supabase/tests/02_device_barriers.sql`). Falta a confirmação falando com o
serviço de verdade, por HTTP, que é como um atacante falaria. Ela depende de um
projeto de homologação no ar e de duas contas fictícias, então é um passo
manual:

```bash
SUPABASE_URL=... SUPABASE_ANON_KEY=... \
CONTA_A_EMAIL=... CONTA_A_SENHA=... \
CONTA_B_EMAIL=... CONTA_B_SENHA=... \
pnpm test:api
```

O script (`scripts/api-barreiras.mjs`) confere, sem o aplicativo no meio, que
escrever direto nas tabelas é recusado, que uma conta não alcança o aparelho da
outra, que o envio ignora conta e aparelho declarados no corpo da requisição,
que o aparelho revogado para de receber e que a versão do esquema é a esperada.
Use apenas contas e dados fictícios, e apenas no projeto de homologação.

## 6.2 As notificações: compatibilidade, ordem e volta atrás

As migrations `0010`–`0013` e a função de envio `lembretes-push` são a única
parte deste sistema em que **três peças precisam combinar**: o aplicativo no
navegador, o banco e a função que roda no servidor. O aplicativo é a peça
folgada; a função é a apertada.

### O que combina com o quê

| | Banco **antes** da `0013` | Banco **depois** da `0013` |
|---|---|---|
| **Aplicativo antigo** | funciona (é o estado de hoje) | funciona: a `0013` não mexe em nenhum privilégio de `authenticated`, e `revoke_device` continua com a mesma assinatura — ela só passa a apagar também a inscrição |
| **Aplicativo novo** | funciona, **sem** oferecer notificações: ele pergunta a `lembretes_push_disponivel`, não encontra a função e não oferece o recurso em vez de pedir a permissão e falhar ao gravar | funciona inteiro |
| **Função de envio antiga** | funciona | **perde avisos.** Ela lê `push_subscriptions` direto, privilégio que a `0013` devolveu; o erro virava "nenhuma inscrição" e o aviso era marcado como `failed` sem nunca sair |
| **Função de envio nova** | pausa, sem perder nada: a porta `lembretes_push_inscricoes_ativas` ainda não existe, o erro é tratado como passageiro e o aviso volta para a fila | funciona inteiro |

Como cada linha é sustentada:

- **aplicativo novo, banco antigo**: `src/lembretes/compatibilidadeDoBanco.test.ts`,
  e confirmado ao vivo em 23/09/2026 — com a `0013` revertida na homologação, a
  API respondeu `PGRST202` para `lembretes_push_disponivel`, que é exatamente o
  código que o teste afirma;
- **aplicativo antigo, banco novo**: conferido no banco pelos privilégios, que a
  `0013` não toca (`has_table_privilege` de `authenticated` em
  `push_subscriptions` e `notification_schedule`, e `has_function_privilege` em
  `revoke_device`), e por `supabase/tests/06_push_do_aparelho_revogado.sql`;
- **as duas linhas da função de envio**: pelo código da própria função, e o ciclo
  reverter → conferir → reaplicar foi ensaiado no banco de homologação **com
  dados dentro**, sem perder aparelho, conta nem operação cifrada.

### A ordem segura

A tabela decide sozinha: **a função vai antes do banco.** Função nova com banco
antigo apenas adia; função antiga com banco novo perde aviso.

O aplicativo é indiferente — as duas versões dele funcionam com as duas versões
do banco —, então ele vai por último, que também é o que a PWA pede (abaixo).

1. **Pausar o agendador**, para que a janela não gaste as tentativas:
   `select cron.alter_job(job_id := <id>, active := false);`
   O `<id>` sai de `select jobid, jobname from cron.job;`.
   **Use `cron.alter_job`, não `update cron.job`**: o `update` direto na tabela
   é recusado com "permission denied for table job" fora do papel dono — foi
   testado em 23/09/2026. Sem esta pausa, o `cron` dispara a cada minuto e cinco
   falhas seguidas (`MAX_TENTATIVAS`) marcam o aviso como perdido em cinco
   minutos.
2. **Publicar a função de envio** `lembretes-push`.
3. **Aplicar a `0013`** no projeto correspondente.
4. **Religar o agendador**:
   `select cron.alter_job(job_id := <id>, active := true);`
5. **Publicar o aplicativo**.

Entre 2 e 4 nada é enviado e nada é perdido: o que vencer fica `pending` e sai
assim que o agendador voltar, dentro da validade de 12 horas do serviço de push.

**Se a produção ainda não tiver nenhuma das migrations de push**, não há janela
nenhuma: não existe função publicada nem inscrição para perder. Aplique
`0010`→`0013` na ordem, depois publique a função, depois o aplicativo.

### A PWA pode estar rodando a versão antiga

O service worker usa `skipWaiting` e `clientsClaim`: a versão nova assume assim
que chega. Mas **uma janela já aberta continua executando o pacote antigo até
recarregar** — e no iPhone, com o aplicativo na Tela de Início, isso pode durar
dias.

Por isso o aplicativo é o último passo, e por isso ele pode ser o último com
tranquilidade: aplicativo antigo com banco novo é uma combinação boa. O
contrário — publicar o aplicativo primeiro e o banco depois — também não quebra,
mas deixa o pastor com um botão de notificações que não faz nada até a migration
chegar, e isso é pior de explicar do que esperar.

### Voltar atrás

O rollback **não apaga inscrição, lembrete nem dado pastoral**. Nenhuma das
peças toca `encrypted_operations`, que é onde o conteúdo cifrado vive.

Na ordem inversa, e com o agendador pausado do mesmo jeito:

1. Pausar o agendador.
2. **Aplicativo**: no Cloudflare, *Deployments* → a implantação anterior →
   *Rollback*. Ou reverter o commit de merge na `main`, que reconstrói.
3. **Banco**: aplicar `0013_push_do_aparelho_revogado_down.sql`. Ele devolve a
   `revoke_device` e a `revoke_all_devices` às versões de `0003` e `0008`,
   restitui os privilégios que a `0012` dava ao servidor e apaga as três funções
   novas. Nenhuma linha de dado é removida.
4. **Função de envio**: publicar de novo a versão anterior (o arquivo no commit
   anterior). Neste ponto ela volta a ter o privilégio direto de que precisa.
5. Religar o agendador.

**O que o rollback não desfaz:** a `0013`, ao ser aplicada, apaga as inscrições
que tinham ficado para trás de revogações anteriores — inscrições de aparelhos
que já estavam revogados. Elas não voltam, e não devem voltar: eram justamente o
defeito. O aparelho afetado só precisa ativar as notificações outra vez, e um
aparelho revogado não consegue nem isso.

### Critérios de interrupção

Pare, e não siga para o passo seguinte, se qualquer um destes acontecer:

- `select public.app_schema_version();` não responder **9** depois da `0013` —
  ela não muda a versão, e mudança aqui significa que outra coisa foi aplicada;
- `select public.lembretes_push_disponivel();` não responder **true** depois da
  `0013`;
- `has_table_privilege('service_role','public.push_subscriptions','select')`
  continuar **true** depois da `0013` — a porta não fechou;
- o painel de Notificações do aplicativo oferecer "Ativar" num ambiente onde
  `lembretes_push_disponivel` não existe;
- `cron.job_run_details` acumular `failed` depois de religar o agendador;
- qualquer conferência da seção 1 reprovar.

## 7. Se a atualização mexer no banco

Nesta etapa o aplicativo funciona sem servidor. Quando a sincronização estiver
ligada, antes de publicar:

- aplique as migrations pendentes no projeto Supabase correspondente;
- rode `pnpm test:db` para conferir as regras de acesso por conta;
- lembre que reverter o site **não** desfaz uma migration: prepare o `down`
  correspondente antes de aplicar qualquer mudança de banco.
