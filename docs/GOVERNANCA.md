# Governança de dados do Apoio Pastoral

Documento operacional, escrito para o pastor que usa o aplicativo e para quem
for revisá-lo. Não é parecer jurídico e não afirma conformidade certificada com
nenhuma lei. Complementa [PRIVACIDADE.md](PRIVACIDADE.md) e
[SECURITY_MODEL.md](SECURITY_MODEL.md).

## Quem responde pelos dados

Cada conta pertence a um pastor e cuida apenas do distrito dele. Não há
compartilhamento entre contas, não há transferência entre pastores e nenhuma
instituição participa do acesso nesta fase. Quem decide o que registrar, o que
exportar e o que apagar é o próprio pastor.

## O que o serviço enxerga

Mesmo com sincronização ligada, o serviço guarda apenas:

- e-mail da conta, gerido pelo serviço de autenticação;
- identificadores aleatórios de conta, aparelho, sessão, registro e operação;
- situação do aparelho, rótulo genérico ("Computador", "Dispositivo móvel") e
  carimbos técnicos;
- envelopes cifrados: texto cifrado, IV, AAD, versão de chave e de formato;
- ordem de chegada, versão e versão-base de cada operação, e a assinatura dos
  metadados.

Não existe coluna remota para nome, telefone, endereço, visita, pedido de
oração, anotação, sermão ou valor. O serviço não tem como abrir o conteúdo: a
chave nunca sai do aparelho.

**Metadados que permanecem visíveis para quem opera o serviço**: quantidade de
registros, frequência e horários de sincronização, número de aparelhos e o
e-mail da conta. Cifra ponta a ponta não esconde isso, e não adianta prometer o
contrário.

## Retenção e exclusão verificável

| Ação | O que acontece | Como conferir |
|---|---|---|
| Apagar uma pessoa | Registro e o que era só dela viram exclusão; a citação dela sai de todo o resto — respostas de entrevista dentro de visita de família, comissões, processo de nomeações, campanha, meta do planejamento e a cópia guardada pela importação de listas — e o histórico cifrado daqueles registros é expurgado aqui e no serviço | O perfil deixa de existir, a contagem da igreja cai e a fila de expurgo fica vazia depois da sincronização seguinte |
| Encerrar distrito | Todos os registros do distrito são apagados no aparelho e a mesma exclusão cifrada é enfileirada para o serviço; o serviço revoga todos os aparelhos da conta, inclusive os que este aparelho nunca conheceu | A tela mostra a contagem antes e depois; a lista de aparelhos fica só com a autorização nova |
| Sair da conta | A sessão **deste** aparelho é encerrada; os outros continuam abertos e os dados cifrados continuam no aparelho | Entrar de novo exige e-mail e senha; o outro aparelho segue como estava |
| Revogar um aparelho | Aquele aparelho para de enviar, receber, perde o envelope de chave e deixa de alcançar qualquer envelope da conta — o token que ele já tinha na mão para de valer na hora | A tela de Segurança mostra "Revogado"; aquele aparelho recebe aviso e para |

Exclusão é registrada como operação de exclusão cifrada e propagada para os
outros aparelhos na próxima sincronização. O histórico de operações do serviço
guarda que houve uma exclusão — não o que foi excluído.

**Expurgo.** Trocar o envelope por uma lápide resolve o presente e não toca no
passado: cada versão anterior seguia guardada na fila de envio, nas revisões de
conflito, na quarentena e no histórico do serviço, cifrada com a mesma chave que
o titular usa todo dia. O expurgo local acontece na hora da exclusão; o do
serviço entra em fila e roda logo depois de a lápide subir, porque apagá-lo
antes deixaria os outros aparelhos sem saber da remoção. Sobra, de propósito, a
lápide.

**Limite honesto**: o que já foi baixado em um aparelho continua nele. Nenhuma
revogação, exclusão, encerramento ou expurgo alcança um aparelho fora do seu
controle, nem um backup que já foi salvo em outro lugar. O serviço também
continua sabendo que houve operações e quando — quantidade e carimbos nunca
foram segredo.

## Pedidos do titular dos dados

O titular aqui é a pessoa cadastrada (membro, interessado, visitado). O canal é
o próprio pastor, pelo e-mail da conta dele.

1. **Acesso**: perfil da pessoa → *Exportar dados* gera um documento legível com
   o cadastro e o conteúdo dos registros que falam somente dela. Dos registros
   compartilhados sai uma versão redigida: o que o registro é e o que há sobre
   quem pediu — nunca o que é de terceiro. O que sai ali é uma lista fechada de
   campos de contexto, e não uma tentativa de remover o que é dos outros: a
   regra inversa erra sempre que aparece um campo novo, e erra entregando.
2. **Exclusão**: perfil da pessoa → *Apagar dados*, com prévia do que sai e
   confirmação dupla.
3. **Correção**: edição direta no cadastro.
4. **Prazo sugerido**: responder em até 15 dias, anotando a data no próprio
   aplicativo (uma tarefa serve).

## Minimização

- Relatórios saem sem nomes por padrão; incluir nomes é uma escolha explícita,
  com aviso.
- Os campos de visita, pedido de oração e anotações orientam a registrar o
  essencial pastoral e evitar detalhes íntimos desnecessários.
- Pedidos de oração, observações e anotações não entram em relatório padrão nem
  em busca global.
- O aplicativo não envia notificações, não usa analytics e não faz chamada de
  rede além do serviço de sincronização.
- Os registros técnicos são códigos de evento de uma lista fixa; não recebem
  nome, telefone, conteúdo nem mensagem de erro do serviço.

## Incidentes

O que fazer se houver suspeita de acesso indevido:

1. **Aparelho perdido ou roubado**: em outro aparelho, Configurações →
   Segurança → revogar o aparelho, e em seguida **trocar a senha**. Revogar
   bloqueia o serviço; a senha é o que impede uma entrada nova.
2. **Senha possivelmente conhecida por outra pessoa**: trocar a senha primeiro,
   depois revogar os aparelhos que não reconhecer.
3. **Chave de recuperação exposta**: ela abre o cofre. Não há como invalidá-la
   sozinha nesta versão; o caminho é encerrar o distrito, criar a conta de novo
   e restaurar de um backup. Registre a data e o motivo.
4. **Alterações recebidas em quarentena**: a tela de Sincronização avisa. Isso
   significa que chegou algo que não confere com a conta. Pare de sincronizar
   naquele aparelho e procure ajuda técnica antes de continuar.
5. **Anotar sempre**: data, o que aconteceu, o que foi feito. Se dados de
   terceiros puderem ter sido expostos, avise as pessoas afetadas.

## Backups

O arquivo de backup é do pastor: cifrado com um código que só ele conhece,
guardado onde ele escolher. Perdido o código, o arquivo não abre — nem por ele,
nem por ninguém. O aplicativo não envia backup para lugar nenhum e não alcança
os arquivos já salvos.

## Revisões pendentes antes de uso com dados reais

- revisão independente de segurança e criptografia;
- parecer jurídico sobre o uso pastoral e sobre dados de menores;
- confirmação das barreiras do banco no projeto real, com contas fictícias.
