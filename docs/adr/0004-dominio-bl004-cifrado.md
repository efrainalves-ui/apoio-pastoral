# ADR 0004 — Domínio do BL-004 no cofre cifrado

Status: aceita em 20 de agosto de 2026.

## Contexto

Distrito e igrejas contêm dados pastorais e administrativos que não podem ficar legíveis no servidor, em logs ou na fila de sincronização. O Marco 0 já fornece cofre local, registros cifrados genéricos e transporte ciphertext-only.

## Decisão

Distrito e igreja são payloads versionados dentro dos envelopes AES-GCM existentes. O tipo técnico local permite localizar registros, mas todo o conteúdo de domínio permanece no ciphertext. Cada alteração substitui o envelope local e cria uma operação idempotente na outbox. Exclusões usam tombstones cifradas. A evolução de tipo e as mudanças de situação são registradas no histórico que vive dentro do payload cifrado.

O servidor continua usando o contrato genérico do Marco 0 e não recebe tabelas ou colunas com nomes, endereços, horários ou observações. Não foi necessária migration remota para o BL-004.

## Consequências

- o aplicativo consegue trabalhar integralmente offline;
- administradores do servidor não conseguem ler o domínio pastoral;
- listagens exigem descriptografar registros no dispositivo do usuário;
- consultas e relatórios remotos por conteúdo não são possíveis por desenho;
- alterações futuras do payload exigirão versionamento e migration local explícita.
