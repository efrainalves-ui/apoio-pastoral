# ADR 0003 — Sincronização ciphertext-only

Status: aceita em 18 de agosto de 2026.

## Decisão

A outbox e o banco remoto trafegam envelopes cifrados, IDs aleatórios e metadados mínimos. Operações têm UUID, versão-base e versão de registro para idempotência e conflitos.

## Motivo

O operador técnico não pode acessar conteúdo pastoral em texto aberto.

## Consequência

Busca, relatórios e regras sobre conteúdo serão locais. Novos campos remotos exigem revisão explícita de privacidade e prova de ausência de plaintext.
