# Encaminhamento para auditoria independente

Status: **pendente de profissional ou equipe externa**. Este material organiza a revisão; não afirma que uma auditoria foi executada ou concluída. Não anexar segredos, dados reais, PDFs, backups, logs de formulários ou variáveis de ambiente.

## Visão geral

- Cliente: React, TypeScript, Vite, PWA Workbox e IndexedDB/Dexie (`docs/adr/0001-stack-marco-zero.md`).
- Proteção local: AES-GCM-256, PBKDF2-HMAC-SHA-256 e HKDF-SHA-256; a chave mestra fica em memória apenas enquanto o cofre está aberto (`docs/adr/0002-cofre-criptografico.md`).
- Sincronização: envelopes cifrados, IDs aleatórios e metadados mínimos; não há conteúdo pastoral legível no contrato remoto (`docs/adr/0003-sync-ciphertext-only.md`).
- Modelo de segurança completo: `docs/SECURITY_MODEL.md`.

## Fluxos sensíveis para revisão

1. criação de conta, entrada, bloqueio, recuperação e troca de senha;
2. criação, armazenamento e abertura dos envelopes de chave e recuperação;
3. outbox local, push/pull, idempotência e isolamento de contas;
4. migrations e RLS Supabase, incluindo revogação de dispositivo;
5. importação local de PDF, geração local de relatórios e backup/restauração;
6. PWA, service worker, persistência offline e remoção do aplicativo.

## Evidências disponíveis sem dados sensíveis

- `docs/TEST_REPORT.md`: resultados locais e limitações registradas;
- `docs/CI_HOMOLOGATION.md`: workflow Linux planejado, execução e política de artefatos;
- `docs/SUPABASE_HOMOLOGATION.md`: checklist de migration, RLS, isolamento, sincronização e revogação;
- `docs/MOBILE_HOMOLOGATION.md`: roteiro pendente para dispositivos físicos;
- `supabase/migrations/0001_marco_zero_up.sql`: schema remoto e políticas atuais;
- ADRs em `docs/adr/`: decisões de arquitetura, cofre, sincronização e domínios cifrados.

## Limites e riscos conhecidos

- E2E em Linux ainda não possui execução externa aprovada; o sandbox macOS local impede a porta de teste antes das asserções.
- Supabase de homologação ainda não foi configurado, e nenhuma migration/RLS foi aplicada remotamente.
- A policy de `device_key_envelopes` não associa explicitamente `device_id` ao mesmo `owner_id`; o cenário cruzado entre duas contas fictícias deve reprovar se for aceito.
- Testes físicos em iPhone e Android permanecem pendentes.
- E2EE não oculta metadados técnicos, como volume, timestamps e IDs aleatórios.

## Perguntas para a auditoria

### Segurança e criptografia

- As derivações de chave, parâmetros, IVs, AAD e ciclos de vida das chaves atendem ao risco declarado?
- Há caminhos de erro, memória, logs, traces ou backups que exponham plaintext, senhas ou chaves?
- A recuperação e a troca de senha preservam as propriedades de segurança esperadas?

### Privacidade e Supabase

- O contrato remoto contém somente campos permitidos pelo modelo ciphertext-only?
- As policies RLS impedem leitura, escrita e associação cruzada entre duas contas autenticadas?
- Revogação de dispositivo impede novos envios e reativação, inclusive sob repetição e corrida?
- Há metadados excessivos ou retenção inadequada para o propósito declarado?

### LGPD e operação

- Qual base legal, aviso de privacidade, responsabilidades e retenção são necessários antes de qualquer dado real?
- Como atender direitos de titulares, incidente de segurança, descarte de backups e controles de acesso?
- Quais requisitos documentais e contratuais devem anteceder piloto, publicação ou integração remota?

## Critérios antes de dados reais

A auditoria deve validar, no mínimo: criptografia e envelopes, ausência de plaintext em persistência e transporte, RLS com contas fictícias isoladas, revogação, tratamento de logs/artefatos, PWA/offline em dispositivos físicos, backup/restauração e requisitos jurídicos/LGPD. Uma conclusão favorável depende de evidências independentes; ela não pode ser inferida dos testes locais.
