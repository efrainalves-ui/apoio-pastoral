# ADR 0002 — Cofre criptográfico

Status: aceita em 18 de agosto de 2026.

## Decisão

Usar Web Crypto nativo com AES-GCM 256; PBKDF2-HMAC-SHA-256 com 600.000 iterações para senha; HKDF-SHA-256 para recovery code; IV aleatório por envelope; AAD versionada.

## Motivo

São primitivas padronizadas e implementadas pela plataforma. Nenhum algoritmo criptográfico próprio foi criado.

## Consequência

A chave mestra é exportável apenas durante a criação de seus envelopes e é mantida em memória enquanto o cofre está aberto. Mudança futura de KDF exige nova ADR, benchmark e migração de envelope.
