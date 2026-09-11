# Guia do pastor: backup, encerramento e o que não escrever

Este texto é para quem usa o aplicativo, não para quem o programa. Ele responde
seis perguntas, na ordem em que elas costumam aparecer.

---

## 1. Como faço um backup

1. Abra o menu e vá em **Backup seguro**.
2. Escreva um **código de backup** com no mínimo 12 caracteres.
3. Clique em **Criar e salvar backup**.

Um arquivo terminado em `.apb` é baixado para o seu computador ou celular.

**O código não é a sua senha.** É um segundo segredo, só para o arquivo. Escolha
um que você consiga lembrar ou guardar em papel.

> **Não existe recuperação do código de backup.** Nem eu, nem o Supabase, nem
> ninguém consegue abrir um `.apb` sem ele. Um backup com o código perdido é um
> arquivo inútil — e você só vai descobrir isso no dia em que precisar dele.
> Guarde o código **separado** do arquivo.

---

## 2. Onde o arquivo fica guardado

**Onde você o colocar, e em nenhum outro lugar.** Nada é enviado
automaticamente: o backup não vai para o Supabase, não vai para a nuvem, não vai
para mim. Ele nasce na pasta de downloads do aparelho onde você clicou.

Isso é uma decisão de privacidade, e ela tem um preço: **se o aparelho quebrar,
o backup que estava só nele quebra junto.** Copie o arquivo para um segundo
lugar — um pen drive, um HD externo, ou uma pasta na nuvem que seja sua.

O arquivo é cifrado. Conferi o conteúdo de um deles: não há um nome, uma data ou
um endereço legível dentro. Se ele cair na mão de alguém sem o código, não há o
que ler. Por isso guardá-lo na nuvem é aceitável — desde que o **código** não
esteja na mesma nuvem.

---

## 3. Como restauro

**No aparelho que já está funcionando:**

1. Menu → **Backup seguro**.
2. Em "Restaurar backup", escolha o arquivo `.apb`.
3. Marque a confirmação e informe o código.
4. Clique em **Restaurar este backup**.

**Num aparelho novo, ou num que perdeu os dados:** depois de entrar com o seu
e-mail e a sua senha, o aplicativo pergunta o nome do distrito, como se fosse a
primeira vez. **Não crie um distrito novo.** Clique em **Já tenho um backup**,
logo abaixo, e siga os mesmos passos. O distrito volta como estava.

Duas proteções que existem de propósito:

- **Um backup só entra na conta que o gerou.** Tentar restaurar o backup de uma
  conta em outra é recusado, com essa explicação.
- **Registros com o mesmo identificador podem substituir os locais.** É por isso
  que a confirmação é obrigatória: restaurar não é "juntar", é "trazer de volta".

### Se a restauração parar no meio

Se o aparelho descarregar ou o aplicativo fechar durante a restauração, ela para
onde estava — e o aplicativo passa a mostrar um aviso em todas as telas dizendo
quantos registros já entraram. **Enquanto isso aparecer, a sincronização fica
parada**, de propósito: metade de um distrito não pode subir para os outros
aparelhos.

Clique em **Concluir restauração**, informe o mesmo código, e ela continua de
onde parou. O que já entrou não entra de novo.

---

## 4. Com que frequência devo fazer

No plano atual, o serviço guarda seus dados cifrados, mas **backup automático
não existe**. A regra prática:

| Quando | Por quê |
|---|---|
| **Depois de cada carga grande** — importar uma lista de membros, cadastrar uma igreja inteira | É o trabalho que doeria mais refazer |
| **Uma vez por mês**, num dia fixo | Perder um mês de visitas é ruim; perder seis é outra coisa |
| **Antes de trocar de aparelho** ou reinstalar | O momento de maior risco de perda |
| **Antes de encerrar um distrito** | Ali a exclusão é intencional e definitiva |

Guarde os **três últimos** e apague os mais antigos. Um backup só, sobrescrito
toda vez, não protege contra o caso em que o problema já estava no último.

---

## 5. O que acontece quando encerro um distrito

O encerramento existe para quando você é transferido: os dados do distrito
antigo não devem viajar com você.

**O que é apagado** — tudo que é do distrito: igrejas, pessoas, famílias,
visitas, pedidos de oração, acompanhamentos, sermões, metas, comissões,
nomeações, campanhas, materiais, relatórios importados, os lançamentos do
ministério (auxílios, despesas, quilometragem, reembolsos) e os compromissos de
agenda ligados a igrejas.

**O que fica** — o que é seu, e não do distrito:

- a sua **Leitura**;
- o seu **Orçamento Familiar** e a lista de compras;
- os compromissos de agenda marcados como **pessoais e sem igreja vinculada**;
- os **seus parâmetros de obreiro**: FPE, Percentual de Audit, dependentes,
  contracheques e o histórico do LETRA.

Os parâmetros de obreiro ficam porque são seus, não do lugar: o seu FPE continua
o mesmo depois da transferência, e um item do LETRA comprado no ano passado não
volta a ser elegível só porque você mudou de cidade.

Um compromisso pessoal que tenha uma igreja escolhida é tratado como do
distrito e vai junto. Se você quer que algo fique, marque como pessoal e não
vincule igreja.

O encerramento também **revoga todos os aparelhos** da conta e autoriza de novo
apenas aquele em que você o concluiu. Se a tela fechar no meio, o aplicativo
oferece concluir na próxima entrada — não deixe pela metade.

**Faça um backup antes.** Encerrar é para apagar mesmo.

---

## 6. O que não escrever

Este é o item mais importante do documento, e o único que nenhum recurso técnico
resolve.

O aplicativo cifra tudo no seu aparelho, e o servidor não consegue ler nada. Mas
**criptografia protege contra estranhos, não contra o próprio registro.** O que
está escrito continua escrito — e aparece em relatório, em backup, na tela aberta
em cima da mesa, e no aparelho que alguém pegar emprestado.

**Em visitas e pedidos de oração, escreva o suficiente para lembrar, não para
contar.**

| Em vez de | Escreva |
|---|---|
| O que a pessoa relatou sobre a intimidade do casamento | "Assunto familiar delicado. Acompanhar." |
| O diagnóstico de saúde mental, o nome do remédio | "Saúde. Visitar em duas semanas." |
| A dívida, o valor, com quem | "Dificuldade financeira. Orar e acompanhar." |
| A acusação contra terceiro | Nada. Isso não é registro pastoral. |

Três perguntas antes de gravar:

1. **Se essa pessoa lesse esta anotação, ela se sentiria traída?**
2. **Preciso deste detalhe para lembrar, ou só para contar a história?**
3. **Se isso vazasse, o dano seria meu ou dela?**

O terceiro é o que decide. O risco de um registro pastoral quase nunca é seu.

**Nunca escreva:** o que foi dito em confissão; conteúdo de conflito conjugal
com nomes; suspeita ou acusação sobre terceiro; diagnóstico de saúde mental;
orientação sexual; situação migratória; valores de dívida.

Os relatórios que o aplicativo gera já saem **sem nomes por padrão** — pauta,
ata, itinerário, relatório de nomeações. Nome só aparece quando você marca a
confirmação, e essa marcação é uma decisão sua, para cada documento.

---

## Em uma linha

Backup mensal com o código guardado longe do arquivo; encerrar distrito apaga o
distrito e preserva o que é seu; e em visita e pedido de oração, anote o
bastante para lembrar — nunca o bastante para expor.
