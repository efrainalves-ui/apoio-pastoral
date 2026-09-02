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

## 5. Se a atualização mexer no banco

Nesta etapa o aplicativo funciona sem servidor. Quando a sincronização estiver
ligada, antes de publicar:

- aplique as migrations pendentes no projeto Supabase correspondente;
- rode `pnpm test:db` para conferir as regras de acesso por conta;
- lembre que reverter o site **não** desfaz uma migration: prepare o `down`
  correspondente antes de aplicar qualquer mudança de banco.
