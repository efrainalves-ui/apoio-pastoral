# Apoio Pastoral — Marco 0 + V1 integrada

Aplicativo local-first com Distrito, Pessoas, Agenda, Planejamento Anual, Evangelismo, Visitas, Pedidos de Oração, Leitura pessoal, Sermões, Metas, Missionário, Comissões, Orçamento Familiar, Relatórios locais e Backup Seguro manual. Transferência de Distrito e Novo Distrito estão temporariamente fora da V1 enquanto passam por revisão de privacidade e segurança. A publicação, links públicos e sincronização remota homologada continuam fora do escopo entregue.

## O que funciona

- conta local de desenvolvimento e integração de autenticação Supabase por ambiente;
- cofre com chave mestra aleatória AES-GCM 256;
- envelope de senha via PBKDF2-HMAC-SHA-256 disponível à própria conta em qualquer dispositivo, e envelope de recuperação via HKDF-SHA-256 para contingência;
- IndexedDB/Dexie com conteúdo cifrado e migrations versionadas;
- fila offline idempotente e transporte Supabase que aceita apenas envelopes cifrados;
- dispositivos ativos/revogados e RLS no banco remoto;
- PWA instalável com manifesto, ícones e service worker;
- shell responsivo em português, tema claro/escuro/automático e navegação acessível;
- criação, edição e exclusão do distrito pessoal;
- cadastro, visualização, edição e remoção de igrejas organizadas, grupos e pontos de pregação;
- evolução ponto de pregação → grupo → igreja organizada, com histórico preservado;
- endereço, cultos, situação e observações administrativas disponíveis offline e cifrados;
- cadastro, edição, remoção, pesquisa e histórico de pessoas, com vínculo histórico às igrejas;
- importação local de PDFs textuais de membros, com prévia, divergências, aplicação atômica, idempotência e reversão segura;
- famílias manuais entre igrejas, com prevenção de duplicidade e estrutura futura para convidados ocasionais;
- aniversários, mensagens por faixa etária editáveis e cópia local sem envio automático;
- busca global local por pessoa, família, igreja, compromisso e WhatsApp;
- importação e visão privada de fidelidade pelas categorias Não dizimista, Dizimista não sistemático e Dizimista, com quantidade exata opcional, faixa preservada e sem valores, ranking ou decisão automatizada;
- painel parcial com membros, situação pastoral, famílias, aniversários, fidelidade e alertas de importação;
- agenda, itinerário local, visitas, entrevista versionada, tarefas, retornos e rodadas;
- Pedidos de Oração com vínculo opcional a uma pessoa da igreja, opção sem identificação, situação e histórico de atualizações;
- Leitura pessoal em armazenamento separado, com livros, sessões, progresso, conclusão, resumos e metas mensais;
- Batismo, Santa Ceia, Casamento e Dedicação de criança dentro da Agenda, com campos e checklists próprios;
- Planejamento Anual por ano, igreja e quatro áreas pastorais, com metas, prioridades, situações, calendário, histórico, resumo e cópia revisável para outro ano;
- Evangelismo com campanhas, pontos, equipe, tarefas, checklist, acompanhamentos e relatório PDF local;
- campanhas, encontros, pontos e lembretes integrados à Agenda sem duplicação, com atualização do registro de origem ao editar um compromisso ligado;
- orçamento de campanha separado do Orçamento Familiar e sem dados bancários ou financeiros pessoais;
- sermões, pregações, metas, interessados, estudos, duplas, Escola Sabatina, PGs e UAPG;
- relatórios PDF locais e backup cifrado manual;
- testes unitários, integração, acessibilidade e jornadas E2E.

## Executar localmente

Requisitos: Node.js 22+ e pnpm 11.

```bash
pnpm install
pnpm dev
```

Abra `http://localhost:5173`. Sem `.env`, o aplicativo usa somente o transporte local de desenvolvimento e deve receber exclusivamente dados fictícios.

Para uma validação estritamente local, use `VITE_APP_ENV=desenvolvimento` e `VITE_DISABLE_SYNC=true` em `.env.local`. Nesse modo, autenticação remota, transporte e fila de saída ficam desativados; gravações continuam cifradas no IndexedDB. A homologação oficial usa `VITE_APP_ENV=homologacao` e um projeto Supabase exclusivo de testes.

Para usar Supabase, copie `.env.example` para `.env.local`, preencha URL, chave anônima e `VITE_SUPABASE_PROJECT_REF`, e aplique as migrations **nesta ordem**:

```
0000_plataforma_fechada_up.sql
0001_marco_zero_up.sql
0002_password_key_envelopes_up.sql
0003_device_sessions_up.sql
0004_sessao_revogada_e_ambiente_up.sql
0005_ambiente_antes_da_senha_up.sql
0006_expurgo_de_historico_up.sql
0007_funcao_nova_fechada_up.sql
0008_revogacao_idempotente_up.sql
0009_sessoes_fora_de_alcance_up.sql
```

Depois, declare uma única vez o que aquele banco é — sem esta linha o aplicativo se recusa a sincronizar, de propósito:

```sql
insert into public.service_environment (environment) values ('homologacao');
```

A versão de esquema esperada por esta build é **9** (`public.app_schema_version()`). O cadastro por e-mail pode exigir confirmação conforme a configuração do Auth. Reversão: aplique os arquivos `*_down.sql` na ordem inversa.

## Verificações

```bash
pnpm lint
pnpm test
pnpm build
pnpm verify:pwa
pnpm test:e2e
```

O Playwright cobre Chromium desktop (1440 × 1000), viewport móvel Pixel 7, instalação PWA, offline, acessibilidade, BL-004 e a jornada integrada deste bloco da V1. Consulte `docs/TEST_REPORT.md` para o resultado desta entrega.

## Segurança operacional

- Não use dados reais em desenvolvimento ou testes.
- Não adicione mensagens livres a logs. A telemetria aceita somente códigos técnicos e metadados allowlisted.
- Não adicione colunas de conteúdo pastoral às tabelas remotas. O contrato remoto é ciphertext + IV + AAD + versões e identificadores aleatórios.
- PDFs são lidos no dispositivo e descartados; a aplicação aceita somente formatos textuais reconhecidos e exige prévia e confirmação.
- Sincronização não substitui backup; o formato atual é `.apb`, versão 4, e a restauração mantém compatibilidade com arquivos da versão 3.

Documentos técnicos e decisões estão em `docs/`. O estado de continuidade está em `docs/CONTINUITY.md`.

Para preparar a rodada de homologação em nuvem com dados fictícios, comece por
`docs/HOMOLOGACAO_NUVEM.md` e siga `docs/CHECKLIST_DISPOSITIVOS.md`.

## Licença

[AGPL-3.0-or-later](LICENSE).

Quem modificar este aplicativo e oferecê-lo a outras pessoas — inclusive apenas
pela rede, sem distribuir arquivo nenhum — precisa publicar o código da versão
modificada. A escolha é deliberada: este aplicativo guarda dados de membros
cifrados no aparelho do pastor, e uma versão fechada com a criptografia
enfraquecida seria indistinguível desta por quem a usasse.
