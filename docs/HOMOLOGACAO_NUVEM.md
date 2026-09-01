# Como criar o ambiente fictício de homologação

Guia curto. É o ponto de partida; os detalhes técnicos estão em
[SUPABASE_HOMOLOGATION.md](SUPABASE_HOMOLOGATION.md) e o modelo de segurança em
[SECURITY_MODEL.md](SECURITY_MODEL.md).

Esta rodada **não publica o aplicativo**, **não cria produção** e **não usa nenhum
dado real**. Tudo o que você digitar deve ser inventado.

## O que você precisa criar

Uma coisa só: **um projeto Supabase novo e vazio**, usado apenas para esta
homologação e apagado no fim.

1. Crie o projeto e dê a ele um nome que deixe claro o que é, por exemplo
   `apoio-pastoral-homologacao`. Guarde a senha do banco no seu gerenciador de
   senhas; ela não entra no aplicativo nem no Git.
2. Em **Authentication → Sign In / Providers**, deixe apenas e-mail e senha.
   Desligue a confirmação por e-mail **somente neste projeto temporário**, para
   conseguir criar as contas fictícias sem caixa de entrada.
3. Em **SQL Editor**, cole e execute o conteúdo de
   `supabase/migrations/0001_marco_zero_up.sql`. Execute uma vez só.
4. Em **Table Editor**, confirme que apareceram quatro tabelas: `devices`,
   `device_key_envelopes`, `recovery_key_envelopes` e `encrypted_operations`, e
   que todas mostram RLS ativa.

Não execute o arquivo `0001_marco_zero_down.sql` durante a validação: ele existe
para desfazer a migration e apaga as quatro tabelas.

## As duas informações que o aplicativo pede

Em **Project Settings → API**, copie:

| Nome da variável | Onde encontrar | Pode ser compartilhada? |
|---|---|---|
| `VITE_SUPABASE_URL` | Project URL | Sim, mas não precisa |
| `VITE_SUPABASE_ANON_KEY` | Chave pública `anon` | Sim; é feita para ficar no navegador |

São as **únicas** duas informações necessárias, e ambas são públicas por
definição. Nunca copie a chave `service_role`: ela ignora todas as regras de
isolamento e não tem nenhum uso neste projeto.

## Onde colocar essas informações

No seu computador, dentro da pasta do projeto, copie `.env.example` para
`.env.local` e preencha:

```
VITE_SUPABASE_URL=<o Project URL do seu projeto de homologação>
VITE_SUPABASE_ANON_KEY=<a chave anon do seu projeto de homologação>
VITE_APP_ENV=homologacao
VITE_DISABLE_SYNC=false
```

`.env.local` é ignorado pelo Git e nunca sai do seu computador. `VITE_DISABLE_SYNC=false`
é o que liga a sincronização; enquanto ele for `true`, nada sai do dispositivo.

`VITE_APP_ENV=homologacao` é obrigatório: sem essa marca, o aplicativo se recusa
a abrir qualquer conexão remota, mesmo com URL e chave preenchidas. É a trava que
impede apontar sem querer para um ambiente de produção.

## Como iniciar os testes fictícios

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Depois, no navegador:

> **Por que `.test` e não `.invalid`.** Os dois são TLDs reservados pela RFC 2606:
> nenhum é registrável, nenhum resolve e nenhum entrega mensagem, então um envio
> acidental não chega a pessoa nenhuma. A escolha por `.test` é imposta pelo
> serviço: o Auth do Supabase recusa `.invalid` com `email_address_invalid`. Os
> testes automatizados locais continuam usando `@example.invalid`, porque não
> falam com o Auth.

1. Crie a **conta fictícia A** com um endereço `@example.test` e uma senha só
   de teste. Guarde a chave de recuperação que aparecer.
2. Crie o distrito, uma igreja e uma pessoa, tudo com nomes inventados.
3. Crie a **conta fictícia B**, também `@example.test`, com dados diferentes.
4. Siga [CHECKLIST_DISPOSITIVOS.md](CHECKLIST_DISPOSITIVOS.md) no computador e
   depois no celular.

## Como conferir que o isolamento funciona

No Supabase, em **Table Editor**, abra `encrypted_operations`. Você deve ver
apenas identificadores, versões, datas e texto embaralhado nas colunas
`ciphertext`, `iv` e `aad`. Se aparecer qualquer nome, endereço ou observação
legível, **pare a rodada**: isso reprova a homologação.

## Ao terminar

Apague as contas fictícias e o projeto Supabase inteiro. Guarde apenas o
resultado de cada linha da checklist, sem URL, sem chave, sem e-mail e sem
conteúdo digitado.

## O que isto ainda não libera

Aprovar esta rodada não libera dados reais, publicação do aplicativo nem
ambiente de produção. Antes disso continuam obrigatórios os testes em iPhone e
Android físicos e a revisão independente de segurança, privacidade e LGPD,
conforme [CONTINUITY.md](CONTINUITY.md).
