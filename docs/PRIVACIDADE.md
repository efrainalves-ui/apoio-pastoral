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
Esse conteúdo não aparece em relatórios padrão, buscas globais, mensagens de
erro nem notificações — o aplicativo não envia notificações.
