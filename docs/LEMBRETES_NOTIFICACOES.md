# Notificações dos Lembretes — configuração externa

O código está pronto na branch `homologacao`. As notificações só funcionam depois
destes passos, feitos pelo responsável pelo projeto, **primeiro na homologação**.
Nenhuma chave vai para o repositório nem para o chat.

## 1. Banco (Supabase de homologação)

Aplicar `supabase/migrations/0010_lembretes_push_up.sql`. A migração cria duas
tabelas com RLS por conta e não muda `app_schema_version`: a build atual continua
funcionando antes e depois.

Reverter: `0010_lembretes_push_down.sql`.

## 2. Chaves VAPID

Gerar um par localmente (por exemplo `npx web-push generate-vapid-keys`).

- Chave **privada**: apenas como segredo do Supabase (`VAPID_PRIVATE_KEY`).
- Chave **pública**: segredo do Supabase (`VAPID_PUBLIC_KEY`) e variável da build
  no Cloudflare Pages (`VITE_VAPID_PUBLIC_KEY`, ambiente de preview da branch
  `homologacao`).
- `VAPID_SUBJECT`: `mailto:` de um endereço de contato do projeto.

Um par por ambiente: homologação e produção não compartilham chaves.

## 3. Função de envio

Publicar `supabase/functions/lembretes-push` e definir o segredo
`LEMBRETES_CRON_SECRET` (texto aleatório longo).

## 4. Agendamento a cada minuto

No SQL Editor da homologação, com as extensões `pg_cron` e `pg_net` habilitadas pelo
painel, criar um job que chame a função por POST a cada minuto, com o cabeçalho
`Authorization: Bearer <LEMBRETES_CRON_SECRET>`. Guardar o segredo no Vault do
Supabase, não no texto do job.

## 5. Teste no iPhone

1. Abrir o endereço de homologação no Safari e usar "Adicionar à Tela de Início".
2. Abrir pelo ícone, entrar, ir a Lembretes → Notificações → "Ativar notificações".
3. "Enviar notificação de teste".
4. Criar um lembrete para daqui a 3 minutos com "Notificar no horário".

## O que o servidor guarda

Conta, aparelho, endereço de entrega, horário, chave opaca da ocorrência (HMAC
calculado no aparelho) e estado do envio. O aviso enviado é sempre "Apoio Pastoral /
Você tem um lembrete". O título só aparece se a opção estiver ligada **e** o cofre
do aparelho estiver aberto; nesse caso é decifrado no próprio aparelho.

## Sem internet

O lembrete fica salvo no cofre e aparece como atrasado. O aviso pode chegar quando
a conexão voltar (validade de 12 horas no serviço de push). A mesma ocorrência não
é enviada duas vezes: a linha é reservada antes do envio e tem chave única.
