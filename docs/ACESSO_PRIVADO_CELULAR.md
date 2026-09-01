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
| Rotas internas funcionando em link direto | `public/_redirects` e `vercel.json` |
| Cabeçalhos de segurança | `vercel.json` |
| Nenhuma chave no repositório | Conferido por `pnpm verify:repo` |

Gerar a versão para enviar:

```bash
pnpm install --frozen-lockfile && pnpm build
```

## O que só você pode fazer

Escolha **um** serviço de hospedagem estática que ofereça proteção por senha, e
entre com a sua conta. Qualquer um dos três serve:

- **Cloudflare Pages** com Cloudflare Access
- **Netlify** com proteção por senha do site
- **Vercel** com proteção por senha (Deployment Protection)

Em todos, o procedimento é o mesmo:

1. Criar um projeto novo e **privado**, apontando para a pasta `dist`.
2. **Ligar a proteção por senha antes do primeiro envio.** Sem isso o endereço
   fica aberto na internet.
3. Definir as variáveis de ambiente do projeto, com os mesmos valores do seu
   `.env.local`: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
   `VITE_APP_ENV=homologacao` e `VITE_DISABLE_SYNC=false`. Aponte **somente**
   para o projeto Supabase de homologação.
4. Enviar a pasta `dist` e conferir que o endereço pede senha.

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
