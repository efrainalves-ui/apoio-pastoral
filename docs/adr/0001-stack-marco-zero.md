# ADR 0001 — Stack do Marco 0

Status: aceita em 18 de agosto de 2026.

## Decisão

Usar React + TypeScript + Vite, componentes acessíveis próprios, PWA via Workbox, Dexie/IndexedDB, Supabase Auth/Postgres e testes Vitest/Testing Library/Playwright.

## Motivo

É a stack recomendada pela Bíblia do Produto e atende web-first, offline-first, baixo custo de piloto e evolução sem antecipar Capacitor.

## Consequência

Capacitor não entra no Marco 0. O cliente continua responsável por criptografia e resolução de estado local.
