# ADR 0005 — Pessoas, importações e fidelidade dentro do cofre

Status: aceita em 20 de agosto de 2026.

## Contexto

Pessoas, famílias, nascimento, WhatsApp, observações e fidelidade são conteúdo pastoral altamente sensível. Importações precisam comparar e atualizar muitos registros sem expor dados ao servidor ou deixar aplicação parcial.

## Decisão

Pessoas, famílias e lotes de importação são payloads AES-GCM no cofre genérico. O IndexedDB v2 adiciona somente tipos técnicos de registro; nenhum índice contém nome, telefone, igreja, nascimento ou categoria de fidelidade.

PDFs são extraídos no cliente e não são persistidos. Prévia, divergências, hash idempotente, snapshots de reversão e histórico ficam dentro do lote cifrado. A aplicação e a reversão usam uma única transação Dexie que grava registros cifrados e as operações correspondentes na outbox.

A busca descriptografa os registros do proprietário após o cofre ser aberto e filtra somente em memória. O servidor continua recebendo envelopes genéricos com ciphertext, IV, AAD, versões, IDs aleatórios e timestamps técnicos. Não há migration remota porque o contrato ciphertext-only não mudou.

## Consequências

- administradores da infraestrutura não conseguem consultar pessoas ou fidelidade em texto aberto;
- busca e importação completas exigem o cofre desbloqueado e capacidade do dispositivo;
- snapshots aumentam o tamanho local e remoto cifrado dos lotes, mas permitem desfazer com segurança;
- divergências mantêm nomes cifrados para revisão do pastor, nunca em logs;
- layouts de PDF não reconhecidos falham de modo fechado, sem inferência silenciosa;
- uma revisão independente de criptografia, segurança e privacidade continua obrigatória antes de dados reais.
