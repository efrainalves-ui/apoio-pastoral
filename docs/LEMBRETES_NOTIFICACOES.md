# Notificações dos Lembretes — configuração por ambiente

Primeiro na homologação. Produção só com autorização expressa, com as próprias
chaves. Nenhuma chave vai para o repositório, para variável digitada à mão ou
para o chat.

## 1. Banco

Aplicar, nesta ordem:

- `supabase/migrations/0010_lembretes_push_up.sql` — inscrições e horários, com
  RLS por conta;
- `supabase/migrations/0011_lembretes_push_config_up.sql` — funções que leem e
  gravam a configuração do envio no Vault, executáveis só pelo servidor.

Nenhuma das duas muda `app_schema_version`. Reverter: os `_down.sql`, na ordem
inversa (os segredos do Vault ficam).

## 2. Segredos no Vault (gerados, nunca digitados)

No SQL do projeto:

- `lembretes_cron_secret`: gerado dentro do banco com
  `extensions.gen_random_bytes(32)`;
- `lembretes_vapid_subject`: o endereço público do ambiente (`https://…`);
- `lembretes_vapid_public` e `lembretes_vapid_private`: **gerados pela função
  de envio** na primeira execução autorizada e gravados pela 0011. A chave
  privada nunca sai do servidor.

Cada projeto gera os seus: homologação e produção não compartilham chaves.

## 3. Função de envio

Publicar `supabase/functions/lembretes-push` com verificação de JWT desligada na
plataforma: a função autentica sozinha (segredo do agendamento em tempo
constante, ou sessão do usuário para o teste).

## 4. Agendamento a cada minuto

Habilitar `pg_cron` e `pg_net`. O job chama a função por POST e lê o segredo do
Vault na hora de cada execução — o texto do job não contém o segredo.

## 5. Chave pública na build

Depois da primeira execução, a chave **pública** (`lembretes_vapid_public`) vai
para a variável `VITE_VAPID_PUBLIC_KEY` do Cloudflare Pages, só no ambiente da
branch correspondente, seguida de nova publicação. Ela é pública por natureza: é
a que o navegador usa para se inscrever.

## 6. Teste no iPhone

1. Abrir o endereço de homologação no Safari e usar "Adicionar à Tela de Início".
2. Abrir pelo ícone, entrar, ir a Lembretes → Notificações → "Ativar notificações".
3. "Enviar notificação de teste".
4. Criar um lembrete para daqui a 3 minutos com "Notificar no horário".
5. Bloquear o aparelho, esperar o aviso, tocar nele e entrar: abre o lembrete.

## O que o servidor guarda

Conta, aparelho, endereço de entrega, horário, chave opaca da ocorrência (HMAC
calculado no aparelho) e estado do envio. O aviso enviado é sempre "Apoio Pastoral /
Você tem um lembrete", com o caminho `/app/lembretes/aviso/<chave opaca>`. O
título só aparece se a opção estiver ligada **e** o cofre do aparelho estiver
aberto; nesse caso é decifrado no próprio aparelho.

## Com o aplicativo aberto

Quando a hora chega com o aplicativo aberto, aparece um aviso dentro dele, com ou
sem internet, uma vez por ocorrência neste aparelho. Dispensar não conclui.

## Sem internet

O lembrete fica salvo no cofre e aparece como atrasado. O aviso pode chegar quando
a conexão voltar (validade de 12 horas no serviço de push). A mesma ocorrência não
é enviada duas vezes: a linha é reservada antes do envio e tem chave única.
