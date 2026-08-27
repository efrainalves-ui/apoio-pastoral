# Homologação interna contínua

O workflow `.github/workflows/homologation-linux.yml` executa no Linux uma instalação limpa e, nesta ordem: lint, TypeScript, testes unitários, build, verificação PWA e Playwright E2E em Chromium desktop e celular.

Ele não recebe credenciais, não acessa Supabase, não publica o aplicativo e mantém a sincronização remota desativada. Todos os cenários usam somente dados inventados, com domínios `example.invalid`.

## Execução local

Use Node.js 22 e a versão de pnpm declarada em `package.json`.

```sh
pnpm install --frozen-lockfile
pnpm lint
pnpm exec tsc --noEmit
pnpm exec vitest run --maxWorkers=1
pnpm build
pnpm verify:pwa
pnpm exec playwright install chromium
VITE_DISABLE_SYNC=true pnpm test:e2e
```

No Linux, use `pnpm exec playwright install --with-deps chromium`, como faz o CI. No macOS restrito por sandbox, a abertura de porta local, a instalação ou a inicialização do Chromium pode falhar antes da primeira asserção. Essa limitação externa deve ser validada pelo workflow Linux; não é motivo para alterar autenticação, criptografia, PWA ou portas locais.

## Leitura de falhas

- Falha de lint ou TypeScript: corrigir tipagem, estilo ou importações antes de prosseguir.
- Falha unitária: isolar o serviço ou componente citado pelo Vitest e usar somente fixtures fictícias.
- Falha de build/PWA: conferir o manifesto e os arquivos gerados, sem publicar nada.
- Falha E2E: o CI guarda por sete dias `playwright-report` e `test-results`, que incluem relatório HTML, screenshots e traces apenas das falhas. Esses materiais devem conter exclusivamente os dados fictícios já presentes nos testes; não enviar casos reais para reproduzir um erro.

Os testes E2E iniciam cada cenário em um `BrowserContext` novo do Playwright e declaram armazenamento inicial vazio. Assim, conta, sessão e base local de um teste não são reutilizadas pelo próximo.

## Segurança do pipeline

- Não há tokens, chaves, valores de variáveis de ambiente, arquivos `.env` ou credenciais no workflow.
- O job usa apenas a permissão `contents: read` e desativa sincronização remota com `VITE_DISABLE_SYNC=true`.
- Logs e artefatos não devem receber dados pessoais, PDFs, senhas, chaves de recuperação ou backups reais. Valores digitados pelos E2E são deliberadamente fictícios.
- A aprovação do CI não autoriza publicação, conexão de produção ou uso de dados reais.

Atualmente o pipeline não precisa de variáveis de homologação. Se uma futura validação remota for explicitamente aprovada, documentar apenas os nomes `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` como segredos do ambiente de homologação, sem registrar valores e sem apontar para produção.

## Bloqueios para dados reais

Antes de qualquer dado real, permanecem obrigatórios:

1. homologação isolada de Supabase, RLS e migrations;
2. testes físicos de instalação e offline em iPhone e Android;
3. revisão controlada de relatórios privados e seus PDFs;
4. auditoria independente de segurança, criptografia, privacidade e aspectos jurídicos.

O CI reduz regressões técnicas; não substitui essas etapas e não libera Transferência de Distrito, Novo Distrito, links públicos ou publicação.

Os dois workflows Linux mantêm `VITE_DISABLE_SYNC=true`. O Playwright recebe armazenamento vazio, executa os mesmos projetos desktop e celular e usa apenas dados identificados como fictícios. Relatórios, screenshots e traces são retidos somente em falha por sete dias; devem ser apagados antes se uma revisão detectar conteúdo indevido.
