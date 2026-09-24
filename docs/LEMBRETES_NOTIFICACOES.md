# Notificações dos Lembretes — configuração por ambiente

Primeiro na homologação. Produção só com autorização expressa, com as próprias
chaves. Nenhuma chave vai para o repositório, para variável digitada à mão ou
para o chat.

## 1. Banco

Aplicar, nesta ordem:

- `supabase/migrations/0010_lembretes_push_up.sql` — inscrições e horários, com
  RLS por conta;
- `supabase/migrations/0011_lembretes_push_config_up.sql` — funções que leem e
  gravam a configuração do envio no Vault, executáveis só pelo servidor;
- `supabase/migrations/0012_lembretes_push_servidor_up.sql` — o alcance do
  papel do servidor nas tabelas de notificação. O projeto nasce fechado: nem
  `service_role` tem privilégio em `public` sem concessão escrita;
- `supabase/migrations/0013_push_do_aparelho_revogado_up.sql` — revogar apaga a
  inscrição, o servidor passa a ler só inscrição de aparelho ativo e o banco
  declara se tem notificações.

Nenhuma delas muda `app_schema_version`. Reverter: os `_down.sql`, na ordem
inversa (os segredos do Vault ficam; as inscrições apagadas não voltam, e quem
foi revogado ativa de novo).

A prova `supabase/tests/06_push_do_aparelho_revogado.sql` roda no workflow
`Banco`, num Postgres descartável, junto com a reversão e a reaplicação.

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

## 5. Chave pública

Nenhuma variável no Cloudflare. O painel de notificações, com a conta logada,
pede a chave **pública** à função (`{ acao: 'chave-publica' }`), que a lê do
Vault do próprio projeto. Assim homologação e produção usam cada uma a sua, sem
copiar nada à mão. `VITE_VAPID_PUBLIC_KEY`, se declarada na build, tem
prioridade.

## 6. Teste no iPhone

1. Abrir o endereço de homologação no Safari e usar "Adicionar à Tela de Início".
2. Abrir pelo ícone, entrar, ir a Lembretes → Notificações → "Ativar notificações".
3. "Enviar notificação de teste".
4. Criar um lembrete para daqui a 3 minutos com "Notificar no horário".
5. Bloquear o aparelho, esperar o aviso, tocar nele e entrar: abre o lembrete.

## Aparelho revogado

Revogar um aparelho cala também as notificações dele. São três travas, e cada
uma sozinha basta:

1. `revoke_device` e `revoke_all_devices` apagam a inscrição daquele aparelho,
   junto com o envelope de chave e as sessões;
2. a função de envio lê as inscrições por
   `lembretes_push_inscricoes_ativas`, que devolve só aparelho com
   `status = 'active'`. O privilégio direto do servidor em
   `push_subscriptions` foi devolvido: a função é a única porta. Isso importa
   porque `service_role` passa por cima da RLS — as políticas de 0010 exigem
   aparelho ativo para **inscrever**, e não têm voz sobre o que o servidor lê
   na hora de **entregar**;
3. o próprio aparelho se cala assim que descobre que foi revogado, marcando
   isso no banco local que o service worker lê. Vale sem internet, e nem o
   aviso genérico aparece — o service worker ainda cancela a inscrição para o
   serviço de push parar de procurá-lo.

Um aparelho revogado também não recebe a notificação de teste que ele mesmo
pedir: a função responde "aparelho sem inscrição ativa".

## Quando o agendamento falha

Os horários de aviso são conferidos em três passos — ler o que já está lá,
tirar o que não vale mais, gravar o que falta. Falha em qualquer um deles
aparece no painel de Notificações, dizendo em que passo parou, com o botão
"Tentar de novo".

Falha passageira (rede caída, serviço fora do ar, tempo esgotado) é repetida
sozinha. Erro permanente — permissão negada, violação de restrição — para na
hora: repetir só gastaria bateria e esconderia o defeito.

## Dois aparelhos na mesma conta

A chave da ocorrência é igual em todos os aparelhos da conta, então dois
aparelhos agendam a mesma ocorrência numa linha só.

Apagar exige saber. O cofre de um aparelho pode estar atrasado, e um horário
que nasceu depois da última sincronização dele veio de um lembrete que ele
ainda não recebeu. Só sai da frente o que já existia antes do que aquele
aparelho conhece; um aparelho que nunca sincronizou não apaga nada. Repetir a
sincronização com os mesmos dados não grava nem apaga de novo.

## Banco sem as migrations

O aplicativo pergunta a `lembretes_push_disponivel` antes de oferecer as
notificações. Sem as tabelas e funções, o painel diz "Notificações
indisponíveis nesta instalação" em vez de pedir a permissão e falhar na hora de
gravar a inscrição. A ausência da própria função já é a resposta.

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
