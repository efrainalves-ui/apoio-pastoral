# Privacidade e controle de dados

Texto de apoio ao que o aplicativo já faz. Não é parecer jurídico e não afirma
certificação de nenhuma lei.

## Regra de dados

- Cada conta pertence a um pastor e cuida apenas do distrito dele.
- Uma conta começa com o próprio distrito; não há compartilhamento interno de
  dados entre pastores.
- Não existe transferência de dados de um pastor ou distrito para outro.
- Associação, Missão ou outra instituição não participa do acesso nesta fase.
- Nenhum pastor vê, pesquisa, sincroniza, restaura ou recebe dados de outro.
- Relatórios só saem quando o próprio pastor gera e exporta.

## Categorias de dados

| Categoria | Exemplos | Onde fica |
|---|---|---|
| Distrito | igrejas, membros, famílias, visitas, pedidos de oração, acompanhamentos, tarefas, agenda do distrito, sermões, metas, campanhas, comissões | cifrado no aparelho; cifrado no serviço quando a sincronização está ligada |
| Pessoal | leitura, orçamento familiar, agenda marcada como pessoal | cifrado no aparelho, em bancos separados |
| Conta | e-mail, envelopes de chave, aparelhos autorizados | aparelho e, quando há sincronização, serviço |

## Direitos do titular

- **Exportar**: no perfil da pessoa, *Exportar dados* gera um documento legível
  com o cadastro e com o **conteúdo** dos registros que falam somente dela —
  visitas, pedidos de oração, acompanhamentos, tarefas e estudos. Dos registros
  em que ela aparece junto de outras pessoas sai uma versão redigida: o que o
  registro é e o que há sobre ela, nunca o que é das outras.
- **Apagar**: no mesmo perfil, *Apagar dados* remove o cadastro e o que era só
  daquela pessoa, e retira a citação dela em todo o resto — família, dupla
  missionária, classe, Pequeno Grupo, compromisso de cerimônia, respostas de
  entrevista dentro de visita de família, comissões, processo de nomeações,
  campanha de evangelismo, meta do planejamento anual e a cópia que a
  importação de listas guarda para poder desfazer. Junto disso, o histórico
  cifrado daqueles registros é apagado aqui e no serviço: sem isso, cada versão
  anterior continuaria recuperável com a chave que o titular usa todo dia. O que
  outro aparelho já baixou e os backups já salvos continuam fora do alcance.
- **Canal**: o e-mail cadastrado na própria conta.

## Governança, retenção e incidentes

O documento operacional está em [GOVERNANCA.md](GOVERNANCA.md): o que o serviço
enxerga mesmo com tudo cifrado, como conferir uma exclusão, como responder a um
pedido do titular e o que fazer em caso de aparelho perdido.

## Encerrar distrito

Em Configurações, *Encerrar distrito*:

1. apaga os registros do distrito no aparelho e enfileira a mesma remoção
   cifrada para o serviço de sincronização;
2. revoga, no próprio serviço, todos os aparelhos da conta — inclusive os que
   este aparelho nunca conheceu — e dá uma autorização nova a ele;
3. preserva a conta, leitura, orçamento familiar e a agenda pessoal;
4. deixa a conta pronta para começar um distrito vazio.

Backups baixados manualmente continuam com o pastor: o aplicativo não alcança
esses arquivos.

## Relatórios

- O padrão é sem nomes: datas, tipos, locais, cargos, assuntos, decisões,
  números e totais.
- Um documento com nomes só é gerado quando o pastor marca *Incluir nomes*, com
  aviso de que o arquivo passa a conter dados pessoais.
- É a mesma caixa, com o mesmo texto, em todos: itinerário, histórico de
  pregações, pauta e ata de comissão, relatório da Comissão de Nomeações e
  relatório de encerramento de campanha.
- Pedidos de oração, observações privadas e anotações não entram no padrão.
- O itinerário da agenda e o histórico de pregações seguem a mesma regra: sem
  marcar, saem data, tipo, igreja e local; o título fica de fora porque é ali
  que o nome costuma aparecer.

## Menores e informações sensíveis

Crianças e adolescentes podem ser cadastrados normalmente. Nos campos de visita,
pedido de oração e anotações, o aplicativo orienta em uma linha a registrar o
essencial pastoral e evitar detalhes íntimos desnecessários, sem bloquear o uso.
Esse conteúdo não aparece em relatórios padrão, buscas globais nem mensagens de
erro. Também não aparece nas notificações dos lembretes: o servidor não tem o
conteúdo para mandar. Veja "Notificações dos lembretes", abaixo.

## Orçamento, materiais e relatório ACMS

- O **orçamento do trabalho** — auxílios, despesas do ministério e quilometragem
  — é dado do distrito: fica no cofre cifrado, sincroniza entre os seus
  aparelhos e sai no encerramento de distrito. O **orçamento familiar**, a
  **Leitura** e a **lista de compras** também ficam no cofre cifrado e
  sincronizam entre os seus aparelhos — antes viviam em bancos próprios que
  sincronização nenhuma olhava, e o que você anotava no celular não existia no
  computador, sem aviso nenhum. A separação continua inteira, agora pelo tipo
  do registro: o encerramento de distrito preserva esses três quando tudo o
  mais é apagado. O que viaja é envelope cifrado; a tabela de operações do
  serviço não tem sequer coluna de tipo.
- A quilometragem é **digitada por você**. O aplicativo não usa GPS, não
  registra localização e não acompanha deslocamento.
- **Materiais e necessidades** são do distrito e saem no encerramento.
- O **relatório ACMS** é lido da planilha dentro do aparelho. O arquivo não é
  salvo, não é enviado ao serviço e não entra no backup: ficam apenas os
  indicadores numéricos por igreja, depois de você confirmar a prévia. Nenhum
  nome de membro é extraído.
- **Links úteis** abre endereços em uma aba nova do navegador; nada do seu
  distrito é enviado a eles.
- O **WhatsApp** entra de duas formas, as duas dentro do aparelho. O número
  fica no cofre cifrado, como qualquer outro dado da pessoa, e a busca por ele
  é local. Ao enviar uma mensagem de aniversário, o aplicativo monta um
  endereço `wa.me` com o número e o texto e **abre o WhatsApp**: daí em diante
  a conversa é sua com ele, e o que você mandar passa a seguir as regras do
  WhatsApp, não as deste aplicativo. Nada é enviado sem você tocar, e o
  aplicativo não tem acesso às suas conversas.

## Notificações dos lembretes

São opcionais e desligadas até você ativar, aparelho por aparelho.

O que o serviço guarda para entregar um aviso: a conta, o aparelho, o endereço
de entrega do navegador, o horário e uma chave opaca da ocorrência, calculada
no seu aparelho. Nenhuma coluna guarda título, observação, pessoa, igreja ou
área — o servidor não tem esse conteúdo.

O aviso enviado é sempre genérico: "Apoio Pastoral / Você tem um lembrete".
O **título na tela bloqueada** só aparece se você ligar a opção **e** o cofre
daquele aparelho estiver aberto; nesse caso o título é decifrado no próprio
aparelho, pelo service worker, e não sai dele. A chave que permite isso é a da
sessão mantida, que dura no máximo oito horas e some ao bloquear ou sair.

Um aparelho revogado para de receber notificação: a inscrição dele é apagada no
serviço, a função de envio só entrega a aparelho ativo, e o próprio aparelho se
cala — nem o aviso genérico aparece.

Desativar as notificações no painel apaga a inscrição daquele aparelho. Sair da
conta também.
