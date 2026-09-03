# Como abrir uma versão privada no iPhone e no Android

Guia curto para o teste privado. Esta etapa **não publica o aplicativo**: o
endereço fica protegido por senha e só você entra.

## Por que não dá para usar o endereço da rede local

O aplicativo cifra tudo no próprio aparelho com a criptografia nativa do
navegador (`crypto.subtle`). Os navegadores só liberam essa função em **contexto
seguro**: `https://` ou `localhost`. Num endereço `http://192.168.x.x` o cofre
não abre, o service worker não instala e não há modo offline — ou seja, o teste
não valeria.

Por isso o caminho é publicar em um endereço `https` **privado**.

## O que já está pronto no projeto

| Item | Situação |
|---|---|
| Aplicativo estático, sem servidor próprio | Pronto — a pasta `dist` é o site inteiro |
| Manifesto, ícones e service worker | Prontos e conferidos por `pnpm verify:pwa` |
| Rotas internas funcionando em link direto | `public/_redirects` |
| Cabeçalhos de segurança | `public/_headers`, conferido por `pnpm verify:headers` |
| Nenhuma chave no repositório | Conferido por `pnpm verify:repo` |

Gerar a versão para enviar:

```bash
pnpm install --frozen-lockfile && pnpm build
```

## O que só você pode fazer

**Cloudflare Pages é a única hospedagem suportada nesta fase**, com Cloudflare
Access ligado.

Não é preferência: `public/_headers` está no formato do Cloudflare Pages e é o
único lugar onde os cabeçalhos de segurança deste aplicativo existem — CSP,
HSTS, Permissions-Policy, as políticas de origem cruzada e a regra que impede o
service worker de ficar preso em cache. Havia aqui um `vercel.json` versionado
com três cabeçalhos e nenhum dos demais: publicar por ali era publicar o mesmo
aplicativo com bem menos proteção, e nada avisava. Ele foi retirado, e
`pnpm verify:headers` reprova se um arquivo de configuração de outra hospedagem
voltar ao repositório.

Para apoiar outra hospedagem, o caminho é este, nesta ordem: reproduzir **todos**
os cabeçalhos de `public/_headers` no formato dela, conferir cada um na resposta
HTTP real do ambiente publicado, e só então versionar a configuração e ampliar
`scripts/verify-headers.mjs`. Enquanto isso não for feito e registrado, a
alternativa não é documentada — documentar uma opção com proteção inferior é
oferecer a opção errada.

Procedimento:

1. Criar um projeto novo e **privado** no Cloudflare Pages, apontando para a
   pasta `dist`.
2. **Ligar o Cloudflare Access antes do primeiro envio.** Sem isso o endereço
   fica aberto na internet.
3. Definir as variáveis de ambiente do projeto, com os mesmos valores do seu
   `.env.local`: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
   `VITE_SUPABASE_PROJECT_REF`, `VITE_APP_ENV=homologacao` e
   `VITE_DISABLE_SYNC=false`. Aponte **somente** para o projeto Supabase de
   homologação. As quatro primeiras precisam ser do mesmo projeto: a build
   confere e se recusa a abrir se discordarem.
4. Rodar `pnpm verify:env` com essas variáveis antes de enviar. Ele reprova a
   build que declara homologação e esquece endereço, chave ou projeto — a falha
   que antes virava, em silêncio, um aplicativo funcionando só no aparelho.
5. Enviar a pasta `dist` e conferir que o endereço pede autenticação.

## No aparelho

1. Abrir o endereço no navegador e entrar com a senha do site.
2. **iPhone:** Safari → Compartilhar → *Adicionar à Tela de Início*.
   **Android:** Chrome → menu → *Instalar aplicativo*.
3. Abrir pelo ícone e entrar com a conta fictícia.
4. Seguir [CHECKLIST_DISPOSITIVOS.md](CHECKLIST_DISPOSITIVOS.md), seção 3.

## Regras que continuam valendo

- Somente contas e dados fictícios.
- Não deixar o endereço sem senha em momento nenhum.
- Não colocar URL, chave, senha ou token em Git, em log ou em documento.
- Ao terminar, apagar o site privado junto com o projeto de homologação.

Este teste privado **não** libera dados reais nem produção. Antes disso
continuam obrigatórias a revisão independente de segurança, privacidade e LGPD,
conforme [CONTINUITY.md](CONTINUITY.md).
