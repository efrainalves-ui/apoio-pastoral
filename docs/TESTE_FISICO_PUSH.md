# Teste físico das notificações — iPhone

Este é o único teste desta rodada que nenhuma automação faz. Web Push no iOS só
funciona com o aplicativo **instalado na Tela de Início**, a permissão é dada no
próprio aparelho, e a entrega depende do serviço da Apple. Nada disso existe num
navegador controlado por script.

**Enquanto este roteiro não for executado e o resultado informado, as
notificações não contam como aprovadas.** O resto da rodada pode estar verde; as
notificações ficam pendentes.

Use só dados fictícios. Não use a conta real do distrito.

## Antes de começar

- [ ] O endereço de homologação abre e mostra o aviso amarelo "Homologação —
      instalação de teste".
- [ ] O iPhone está com internet e com o modo Foco desligado (um Foco ativo
      segura a notificação sem erro nenhum, e o teste parece falhar).
- [ ] Você tem **dois** aparelhos na mesma conta fictícia: o iPhone e mais um
      (o computador serve).

## 1. Instalar e ativar

| # | O que fazer | Aprova se | Reprova se |
|---|---|---|---|
| 1.1 | No iPhone, abrir o endereço de homologação **no Safari** | A página abre com o aviso amarelo | Abre a produção, ou não abre |
| 1.2 | Compartilhar → **Adicionar à Tela de Início**; fechar o Safari | O ícone aparece na Tela de Início | — |
| 1.3 | Abrir **pelo ícone** e entrar na conta fictícia | Entra | — |
| 1.4 | Lembretes → Notificações | Diz "Notificações desativadas" com o botão "Ativar notificações" | Diz "Instale na Tela de Início" (você abriu pelo Safari, não pelo ícone) ou "Notificações indisponíveis nesta instalação" (o banco não tem as migrations — **pare**) |
| 1.5 | Tocar em **Ativar notificações** e permitir | Passa a "Notificações ativadas" | A permissão é negada — reinstale o ícone; o iOS só pergunta uma vez |

## 2. O aviso chega

| # | O que fazer | Aprova se | Reprova se |
|---|---|---|---|
| 2.1 | Tocar em **Enviar notificação de teste** | O aviso chega em segundos | Não chega em 2 minutos |
| 2.2 | Criar um lembrete para daqui a **3 minutos**, com "Notificar no horário" | O lembrete aparece na lista | — |
| 2.3 | **Bloquear o iPhone** e esperar | O aviso aparece na tela bloqueada como "Apoio Pastoral / Você tem um lembrete" | Não aparece, ou aparece com o título do lembrete (a opção de título está desligada por padrão) |
| 2.4 | Tocar no aviso e entrar | Abre **naquele** lembrete, não na lista genérica | Abre em outro lugar |

## 3. O título, que é opcional

| # | O que fazer | Aprova se | Reprova se |
|---|---|---|---|
| 3.1 | Notificações → ligar **Mostrar o título do lembrete** | Fica ligado | — |
| 3.2 | Repetir 2.2 e 2.3 **sem** fechar o aplicativo antes | A tela bloqueada mostra o título do lembrete | Mostra o aviso genérico — o cofre fechou; reabra e repita |
| 3.3 | Bloquear o cofre (menu → Bloquear cofre), criar o lembrete por outro aparelho e esperar | Volta ao aviso genérico: sem o cofre aberto, o título não é decifrado | Mostra o título com o cofre fechado — **pare e me avise**, isso seria um vazamento |

## 4. Aparelho revogado — o coração desta rodada

| # | O que fazer | Aprova se | Reprova se |
|---|---|---|---|
| 4.1 | Com as notificações ativas no iPhone, ir ao **outro** aparelho → Segurança | O iPhone aparece na lista como Ativo | — |
| 4.2 | Tocar em **Revogar** no iPhone | Aparece a pergunta "Revogar &lt;nome do aparelho&gt;?" com Revogar e Cancelar | Revoga direto, sem perguntar |
| 4.3 | Tocar em **Cancelar** | Nada acontece; o iPhone continua Ativo | Revogou mesmo assim |
| 4.4 | Revogar de verdade, e tocar duas vezes seguidas e rápido no botão | O botão desativa e a ação vale uma vez; nenhum erro aparece depois do sucesso | Aparece "nenhum aparelho ativo com esse identificador" |
| 4.5 | No outro aparelho, criar um lembrete para daqui a 3 minutos | — | — |
| 4.6 | Deixar o **iPhone revogado** bloqueado e esperar | **Nada aparece no iPhone** — nem o aviso genérico | Qualquer aviso aparece — **pare e me avise** |
| 4.7 | Abrir o aplicativo no iPhone revogado → Lembretes → Notificações → Enviar teste | Recusa, dizendo que o aparelho não tem inscrição ativa | O teste chega |
| 4.8 | Desligar a internet do iPhone e repetir 4.7 | Continua sem mostrar nada | Mostra algo |

## 5. Falha e nova tentativa

| # | O que fazer | Aprova se | Reprova se |
|---|---|---|---|
| 5.1 | Com o iPhone autorizado outra vez e notificando, **desligar a internet** e abrir Lembretes | O painel diz em que passo o agendamento parou e mostra "Tentar de novo" | Falha em silêncio |
| 5.2 | Religar a internet e tocar em **Tentar de novo** | O aviso some | O aviso permanece |
| 5.3 | Criar um lembrete para daqui a 3 minutos e bloquear | O aviso chega normalmente | Não chega |

## 6. Depois do teste

- [ ] Revogar os aparelhos fictícios usados.
- [ ] Apagar a conta fictícia, ou me avisar para eu apagar.
- [ ] Me dizer, item a item, o que aprovou e o que reprovou. Um "funcionou"
      genérico não serve: 4.6 e 3.3 são os dois que, se falharem, param a
      publicação.
