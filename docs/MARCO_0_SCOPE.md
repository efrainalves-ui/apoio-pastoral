# Escopo e aceite do Marco 0

## Entregue

| Requisito | Implementação | Evidência |
|---|---|---|
| Repositório, padrões e CI | Git, TypeScript estrito, ESLint e GitHub Actions | `git status`, `pnpm lint` |
| Design system e navegação | componentes próprios, shell oficial de cinco áreas, responsivo | validação desktop e 390 × 844 |
| Autenticação | conta local de desenvolvimento e adapter Supabase Auth | testes de acesso e jornada real |
| Cofre | AES-GCM 256, PBKDF2, HKDF, recovery code | `vault.test.ts` |
| Banco local | Dexie/IndexedDB, schema v1 e histórico | `repository.test.ts` |
| Migrations | upgrade local e SQL remoto up/down | `supabase/migrations` |
| Offline | cache de shell + IndexedDB + outbox | servidor desligado e reload funcional |
| Base de sync | push/pull idempotente e RLS | `service.test.ts` e migration SQL |
| PWA | manifesto, 3 ícones e service worker | `pnpm verify:pwa` |
| Dados fictícios | fixtures `.invalid` e rótulos explicitamente fictícios | varredura de testes e UI |

## Deliberadamente não implementado

- distrito, igrejas, pessoas, famílias, visitas, agenda, orações, sermões, indicadores, imports, relatórios e backup `.apoio` (V1);
- links externos, transferência, comissão, votação e documentos (V1.1);
- Capacitor, push, calendário e recursos de V2/Futuro.

As rotas Agenda, Pessoas e Distrito funcionam como guardas explícitas de escopo: não armazenam dados nem simulam funcionalidades futuras.
