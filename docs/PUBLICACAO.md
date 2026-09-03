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

## 6. Migrations, na ordem de aplicação

No projeto de produção recém-criado, aplique nesta ordem:

| Ordem | Arquivo | O que cria |
|---|---|---|
| 1 | `supabase/migrations/0001_marco_zero_up.sql` | `devices`, `device_key_envelopes`, `recovery_key_envelopes`, `encrypted_operations`; índice do cursor de sincronização; gatilho que impede reativar aparelho revogado; RLS por dono e privilégios mínimos |
| 2 | `supabase/migrations/0002_password_key_envelopes_up.sql` | `password_key_envelopes`, com RLS por dono e mínimo de 600 mil iterações |
| 3 | `supabase/migrations/0003_device_sessions_up.sql` | ordem de chegada (`seq`) e assinatura das operações; `device_sessions` e `revoked_sessions`; funções `claim_device`, `approve_device`, `revoke_device`, `upload_operations`, `download_operations` e `app_schema_version`; retirada da escrita direta em `devices` e `encrypted_operations`; privilégios padrão do schema revogados |
| 4 | `supabase/migrations/0004_sessao_revogada_e_ambiente_up.sql` | `session_is_not_revoked` e `session_is_authorized`; políticas dos envelopes exigindo sessão não revogada; `service_environment` e `app_environment`; `revoke_all_devices` |
| 5 | `supabase/migrations/0005_ambiente_antes_da_senha_up.sql` | `app_schema_version` e `app_environment` respondem antes da autenticação, para a conferência acontecer antes de a credencial sair |
| 6 | `supabase/migrations/0006_expurgo_de_historico_up.sql` | `purge_record_history`, que apaga o histórico de um registro somente quando a operação esperada ainda é a última dele |
| 7 | `supabase/migrations/0007_funcao_nova_fechada_up.sql` | auditoria do catálogo: `funcoes_publicas_abertas()` lista as funções de `public` ao alcance de PUBLIC ou de anon, e `protecao_de_funcao_nova()` responde se a lista está vazia |
| 8 | `supabase/migrations/0008_revogacao_idempotente_up.sql` | `revoke_all_devices` idempotente: repetir devolve zero em vez de erro, e é assim que a retomada distingue trabalho já feito de falha |
| 9 | `supabase/migrations/0009_sessoes_fora_de_alcance_up.sql` | `device_sessions` e `revoked_sessions` saem do alcance direto do cliente, e suas políticas passam a exigir sessão não revogada |

O aplicativo espera a versão de esquema **9** (`app_schema_version()`) e recusa
sincronizar com um serviço em versão diferente. Aplicar as nove migrations é
obrigatório antes da primeira entrada.

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

## 7. Se a atualização mexer no banco

Nesta etapa o aplicativo funciona sem servidor. Quando a sincronização estiver
ligada, antes de publicar:

- aplique as migrations pendentes no projeto Supabase correspondente;
- rode `pnpm test:db` para conferir as regras de acesso por conta;
- lembre que reverter o site **não** desfaz uma migration: prepare o `down`
  correspondente antes de aplicar qualquer mudança de banco.
