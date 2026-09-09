# Modelo de segurança do Marco 0 e da V1

## Fronteira de confiança

O conteúdo nasce no cliente, é cifrado antes de persistir e só é aberto em memória com o cofre desbloqueado. O servidor é tratado como não confiável para confidencialidade.

## Chaves e envelopes

1. O cliente gera 256 bits aleatórios para a chave mestra.
2. A senha deriva uma KEK via PBKDF2-HMAC-SHA-256, 600.000 iterações e salt de 128 bits.
3. A KEK protege a chave mestra com AES-GCM 256 e IV aleatório de 96 bits.
4. A chave de recuperação contém 256 bits aleatórios e deriva uma KEK independente via HKDF-SHA-256.
5. Dados usam AES-GCM 256 com AAD que vincula ID e versão do schema.
6. A troca de senha recriptografa apenas o envelope da chave mestra.
7. As chaves abertas em memória não são exportáveis: o material bruto existe
   apenas dentro das funções que criam ou abrem um envelope e é zerado em
   seguida. Uma falha de script na página não consegue extrair a chave.
8. Do mesmo segredo deriva-se, por HKDF-SHA-256, uma chave HMAC que autentica os
   metadados de cada operação de sincronização.
9. A redefinição de senha pelo e-mail troca a senha do serviço; o cofre é
   reaberto com a chave de recuperação, porque o envelope antigo estava
   protegido pela senha perdida. Não há outro caminho — nem para o serviço.
   A ordem importa: a sessão do link precisa ser da conta daquele e-mail e a
   chave precisa abrir o envelope **antes** de a senha do serviço mudar. Com a
   ordem invertida, uma chave digitada errada deixava o titular sem a senha
   antiga e sem cofre.
10. A troca de senha grava o envelope novo antes de o serviço saber dele.
   Fechar o navegador entre a troca remota e a gravação deixava a conta com a
   senha nova no serviço e o envelope antigo em todo lugar; a entrada seguinte
   agora reconhece as três situações — não valeu, valeu pela metade, valeu
   inteira — e conclui ou desfaz.

## Dados remotos permitidos

- e-mail gerenciado pelo Supabase Auth;
- IDs aleatórios de conta, dispositivo, operação e registro;
- estado do dispositivo e timestamps técnicos;
- ciphertext, IV, AAD, versão de chave, schema e registro;
- cursor e versão-base para sincronização.

Não há colunas remotas para nome de pessoa, visita, entrevista, oração, sermão ou outro conteúdo pastoral. RLS limita leitura e escrita ao `auth.uid()` proprietário, e um trigger impede reativar dispositivo revogado.

## Barreiras de aparelho no servidor

O cliente deixou de decidir se um aparelho está autorizado.

- `devices` e `encrypted_operations` não aceitam mais escrita direta de
  `authenticated`. Registrar aparelho, confirmar, revogar, enviar e receber são
  funções `security definer` com `search_path` fixo.
- Cada sessão do serviço é amarrada a um aparelho pelo `session_id` do JWT
  (`device_sessions`). As funções descobrem o aparelho pela sessão; o
  `device_id` enviado no corpo da requisição é ignorado.
- Entrar com e-mail e senha em um aparelho novo continua funcionando: a senha é
  a prova, e o aparelho nasce ativo.
- Revogar marca a linha, apaga o envelope de chave daquele aparelho, remove as
  sessões dele em `auth` quando disponíveis e as registra em
  `revoked_sessions`. Uma sessão revogada não reivindica nem o mesmo
  identificador nem um novo — voltar exige provar a senha outra vez.
- Aparelho pendente não confirma a si mesmo, nem trocando de sessão.
- A revogação vale para o token que já foi emitido. As políticas dos envelopes
  de senha, de recuperação e de chave, e a lista de aparelhos, exigem uma
  sessão que não foi revogada. Antes, o aparelho revogado seguia até uma hora
  podendo ler esses envelopes, apagar os dos outros aparelhos e sobrescrever o
  de senha — o que trancaria o titular para fora de qualquer aparelho novo.
- A sessão que ainda não reivindicou aparelho nenhum é liberada de propósito:
  é a entrada com e-mail e senha em um aparelho novo, em que o envelope é
  buscado antes de o aparelho existir. A senha continua sendo a prova.
- `revoke_all_devices` revoga a conta inteira em uma transação. É o que o
  encerramento de distrito usa: cada instalação guarda só a si mesma, então
  percorrer a lista local revogava apenas o aparelho em que o pastor estava.
- `supabase/tests/02_device_barriers.sql` e `03_sessao_revogada.sql` provam cada
  uma dessas barreiras em um Postgres descartável, incluindo as tentativas de
  contorno. `scripts/api-barreiras.mjs` repete as mesmas provas falando direto
  com a API de homologação, que é como um atacante falaria.

## Ordem, paginação e autenticação da sincronização

- A ordem de download é `seq`, atribuída pelo servidor na chegada. O carimbo de
  tempo do aparelho é informativo. Antes ele era o cursor, e um relógio
  adiantado ou um envio atrasado faziam operações nunca serem baixadas.
- O recebimento percorre todas as páginas até o serviço não ter mais nada.
- Cada operação leva um HMAC-SHA-256 (versão 3) sobre o identificador da
  operação, a conta, o registro, o tipo de operação, a versão, a versão-base, o
  formato, a versão de chave, o carimbo de tempo e o próprio texto cifrado. O
  carimbo entra porque ele vira a data do registro guardado aqui; o
  identificador, porque é a chave de idempotência, de conflito e de quarentena.
  O aparelho de origem fica de fora: quem o atribui é o servidor, pela sessão.
  Operação sem assinatura válida vai para quarentena local, sem ser aplicada
  nem descartada.
- Conflito é decidido pela linhagem: só entra por cima o que foi editado sobre a
  versão que o aparelho tem. As duas versões ficam guardadas cifradas.
- A escolha do pastor é publicada por cima da versão do outro aparelho, nas
  duas direções: a exclusão feita lá pode ser aceita aqui, e a exclusão feita
  aqui sobe como lápide nova quando o outro aparelho mandou uma alteração. Sem isso, "ficar com a deste
  aparelho" só marcava a revisão como resolvida e os dois lados discordavam
  para sempre, em silêncio.
- O recebimento percorre quantas páginas existirem. O teto antigo eram
  cinquenta — dez mil operações — e a rodada parava ali dizendo "Dados
  atualizados"; pior, carimbava a marca da primeira sincronização, que é o que
  autoriza acreditar em uma lista vazia, e o pastor era mandado criar um
  segundo distrito por cima do primeiro. A trava que restou vale só para o
  serviço que diz ter mais página e não move o cursor.
- Rodada incompleta devolve `incomplete`, não carimba a primeira
  sincronização, não anuncia "Dados atualizados" e não libera a criação de
  distrito.
- **Limitação declarada**: `deviceId` não entra na assinatura. Quem o atribui é
  o servidor, pela sessão — o valor enviado no corpo é ignorado de propósito —,
  ele muda quando o aparelho é reautorizado, e não decide nada ao aplicar. A
  limitação real é que quem controlasse o serviço poderia atribuir uma operação
  ao aparelho errado; isso não muda o que é aplicado nem abre o conteúdo.
- Falha de sincronização nunca é interpretada como conta vazia: um aparelho que
  ainda não recebeu os dados espera em uma tela própria.
- Um registro local que não abre é pulado e contado, em vez de derrubar a
  listagem inteira.

## Conta, backup e separação financeira

- cada instalação do navegador mantém uma única conta local, evitando colisões dos envelopes locais de senha e recuperação;
- o backup pastoral é cifrado, vinculado à conta de origem e restaurado em lotes retomáveis; outra conta é recusada e uma interrupção deixa uma marca local para continuar com segurança;
- criar e restaurar dependem de ações explícitas; o arquivo não é enviado automaticamente;
- **Sair** encerra a sessão **deste** aparelho (`scope: 'local'`) e fecha o
  cofre. Sair no celular não derruba o computador: quem quer tirar outro
  aparelho da conta usa **Revogar**, na tela de Segurança, que também apaga o
  envelope de chave daquele aparelho.
  **Bloquear cofre** apenas fecha o cofre e mantém a sessão. O cofre também se
  fecha sozinho após 15 minutos sem uso ou 5 minutos em segundo plano;
- a opção de permanecer conectado mantém chaves não exportáveis somente para a mesma aba, expira em no máximo 8 horas e é apagada ao bloquear ou sair. Código executado na mesma origem ainda pode usar uma chave enquanto essa sessão estiver válida;
- o Orçamento Familiar e a Leitura usam bancos locais separados e não entram na
  sincronização pastoral, mas **entram no backup** (versão 4 do arquivo), no
  mesmo envelope cifrado pelo código que o titular escolhe;
- a restauração aceita os formatos 3 e 4 e recusa arquivo de outra conta, formato não suportado, conteúdo truncado, malformado ou grande demais antes da primeira gravação.

Pessoas, famílias, WhatsApp, nascimento, histórico, divergências de importação e fidelidade vivem dentro dos mesmos envelopes cifrados. O tipo técnico do registro pode indicar `person`, `family` ou `import_batch`, mas não revela o conteúdo, nome, igreja, categoria ou quantidade de meses. A busca não cria índice aberto e não sincroniza os termos.

## Importações locais

- o navegador aceita somente arquivo PDF e impõe limite de 20 MB;
- a extração é feita em memória com PDF.js, no cliente;
- o arquivo original não é armazenado nem enviado;
- formatos vazios, escaneados sem OCR ou desconhecidos são recusados antes da aplicação;
- toda aplicação é transacional e registra apenas envelopes cifrados na outbox;
- no modo controlado `VITE_DISABLE_SYNC=true`, a autenticação remota, o transporte e a criação de itens na outbox ficam desativados; os envelopes permanecem somente no cofre local;
- erros de aplicação não deixam pessoas parcialmente gravadas;
- logs continuam limitados a códigos técnicos allowlisted e não recebem nomes, telefones, arquivos ou divergências.

## Exclusão e expurgo

Apagar um registro troca o envelope por uma lápide, e isso resolve o presente.
O passado é outra coisa: cada versão anterior fica guardada na fila de envio,
nas revisões de conflito, na quarentena e no histórico do serviço — cifrada com
a mesma chave que o titular usa todo dia. Dizer a uma pessoa que os dados dela
foram apagados enquanto isso permanece recuperável não seria verdade.

- o expurgo local acontece na hora da exclusão;
- o do serviço entra em fila e roda na sincronização seguinte, logo depois do
  envio: apagar o histórico antes de a lápide subir deixaria os outros
  aparelhos sem saber da remoção;
- a fila guarda, para cada registro, a operação que este aparelho publicou.
  `purge_record_history` só apaga quando aquela operação ainda é a última —
  qualquer coisa mais recente é alteração concorrente de outro aparelho, e o
  histórico dela não some por causa de uma decisão tomada antes de ela existir;
  o registro fica pendente para o pastor decidir de novo;
- o envio vai em lotes de 500, que é o teto do serviço;
- **o que o expurgo não alcança**: o que outro aparelho já baixou continua
  nele, backups já salvos continuam com quem os salvou, e o serviço continua
  sabendo que houve operações e quando. Nenhum aplicativo alcança isso, e
  prometer o contrário seria mentira.

## Duas contas no mesmo navegador

A sessão do serviço vive no armazenamento da origem, e esse armazenamento é um
só para todas as abas. Entrar com a conta B em uma aba troca a sessão de todas:
a aba que mostra a conta A continua desenhando o nome, os aparelhos e os
registros de A, mas cada chamada remota que ela faz sai autenticada como B.
Listar aparelhos mostrava os de B; revogar revogava os de B; encerrar distrito
encerrava o de B; apagar uma pessoa mandava a lápide e o pedido de expurgo para
a conta errada.

Antes de **toda** operação remota, o aplicativo confere que o `user.id` da
sessão é o `accountId` desta aba. Quando não é, a aba fica bloqueada: o cofre
fecha, a tela pede um acesso novo com e-mail e senha, e nenhuma operação remota
acontece até isso. O bloqueio é local à aba e não volta sozinho — nem se a
sessão voltar a ser a de A por coincidência, porque quem prova de quem é a
sessão é o acesso, não a coincidência.

A conferência falha fechada: erro técnico ao consultar a sessão bloqueia
também. Uma operação remota feita com a conta errada não tem volta; uma tela
bloqueada por engano custa um novo acesso.

## Registros cifrados que não abrem

Um registro que não decifra neste aparelho vai para uma quarentena gravada, com
conta, tipo e versão, e a leitura devolve nada em vez de levantar exceção. Antes
essa lista vivia na memória: a contagem sumia a cada recarregamento e, pior, um
único registro corrompido derrubava a criação do backup, a exportação dos dados
de uma pessoa, o encerramento do distrito e as listagens inteiras — o que, para
quem usa, é indistinguível de ter perdido tudo.

O registro em quarentena continua guardado e não é apagado às cegas: apagar o
que não se conseguiu ler seria apagar sem saber o quê. Se a versão dele mudar —
uma sincronização trouxe outra, um backup foi restaurado — ele sai da quarentena
sozinho na leitura seguinte.

## Importação de planilha ACMS

A planilha `.xlsx` é aberta **dentro do aparelho**, com leitor próprio: um
`.xlsx` é um ZIP com XML, e o navegador já traz `DecompressionStream` e
`DOMParser`. Não é preciosismo evitar a dependência — uma biblioteca de
planilha é código grande, com histórico de problemas de segurança, para rodar
em cima de um arquivo que chegou por e-mail.

O arquivo bruto **não é gravado em lugar nenhum**: nem no banco local, nem no
serviço, nem no backup. Ele é lido na memória, mostrado em prévia por igreja e
descartado. O que fica guardado, depois de o pastor confirmar, são os
indicadores numéricos e o nome da igreja — nenhum nome de membro é extraído,
porque nenhum é lido.

Formato não reconhecido não vira importação parcial: a leitura recusa com uma
explicação do que faltou e não grava nada. Importar meia dúzia de números de
origem duvidosa é pior do que não importar, porque o erro só apareceria depois,
no painel, quando os totais não fechassem.

As fixtures de teste são inteiramente inventadas, incluindo um `.xlsx` montado
dentro do próprio teste. Nenhuma planilha real entra em teste, no repositório
ou na documentação.

## Limites honestos

- E2EE não oculta todos os metadados (volume, timestamps e identificadores).
- O modo local é para desenvolvimento, não substitui autenticação remota de
  produção, e só existe quando declarado: `VITE_APP_ENV=desenvolvimento`. Uma
  build que declara `homologacao` ou `producao` e não tem endereço, chave
  pública ou projeto declarado — ou tem os três discordando — não abre. Antes
  ela caía no transporte local em silêncio, e quem usasse cadastraria o distrito
  inteiro achando que estava sincronizando.
- E-mail e senha abrem o cofre também em uma nova instalação. O serviço guarda somente o envelope da chave mestra já cifrado pela senha; nunca recebe a senha ou o conteúdo pastoral em texto aberto.
- Uma nova instalação é registrada como outro dispositivo após a entrada. Safari e o aplicativo instalado no iPhone são instalações independentes para esse controle.
- A chave de recuperação é contingência para perda de acesso aos dispositivos; ela não é enviada por e-mail e não é o caminho normal de entrada em um aparelho novo.
- O orçamento do trabalho, os materiais, as necessidades e os relatórios ACMS
  importados são dados do distrito e saem no encerramento. O orçamento
  familiar, a lista de compras, a leitura e a agenda pessoal ficam.
- A quilometragem é digitada. Não há GPS, rastreamento nem localização
  automática em nenhum ponto do aplicativo.
- Encerrar o distrito é durável e retomável por etapas: a intenção é gravada
  **antes** da primeira exclusão local, e o fluxo só termina depois de publicar
  as lápides, confirmar que elas subiram, expurgar o histórico distrital no
  serviço, revogar os aparelhos e devolver a este uma autorização nova. Cada
  etapa é idempotente e uma tela própria conclui o que ficou pela metade. Antes,
  a exclusão vinha primeiro e fechar o navegador ali deixava metade do distrito
  apagada aqui, inteira no serviço, e nada explicando.
- Restaurar um backup também é durável: o arquivo é conferido por inteiro antes
  da primeira gravação, os registros entram em lotes atômicos e a marca de
  pendência registra o que já entrou. Enquanto uma restauração estiver pela
  metade, a sincronização se recusa a subir esse estado — metade de um backup
  publicada para os outros aparelhos é pior do que backup nenhum. O que fica
  guardado para a retomada é o arquivo **como veio**, cifrado; a retomada pede o
  código de novo, e é por isso que ela pede.
- As tabelas de sessão (`device_sessions`, `revoked_sessions`) saíram do alcance
  direto do cliente. Elas não têm conteúdo pastoral, mas descrevem o mapa da
  conta — quantos aparelhos existem, quais foram derrubados e quando —, e era
  justamente o que um aparelho revogado, com o token ainda vivo, continuava
  lendo.
- Revogar um aparelho impede acesso futuro ao serviço, aos envelopes e à
  sincronização, inclusive com o token que ele já tinha emitido.
  **Não apaga o que já foi baixado naquele aparelho** — nenhum
  aplicativo faz isso à distância. Se a senha também pode ter vazado, trocar a
  senha é o passo que importa.
- O token de acesso já emitido vale até expirar; por isso a revogação também
  registra a sessão como revogada, e não confia apenas na remoção do refresh.
- A revisão independente de segurança e o parecer jurídico continuam obrigatórios antes de uso público.
- As garantias RLS e de sincronização precisam ser confirmadas em Supabase exclusivo de homologação depois da aprovação do CI Linux. Dados reais continuam proibidos até as validações externas documentadas.

## Preparo do acesso em ambiente novo

O envelope protegido pela senha fica também no serviço, cifrado pela própria
senha — o serviço não tem como abri-lo. É o que permite entrar com e-mail e
senha em um navegador, computador ou celular novo.

Contas criadas antes desse envelope existir são preenchidas sozinhas: quando o
titular entra em um aparelho onde a conta já abre, aquele aparelho, que acabou
de provar a senha, grava o envelope que faltava. Nenhuma senha, chave ou token
sai do aparelho em texto aberto nesse processo.

Safari e o aplicativo instalado pela Tela de Início do iPhone têm armazenamentos
separados, então contam como aparelhos diferentes — cada um registra o próprio
aparelho ao entrar, e todos aparecem na tela de Segurança.

Redefinir a senha usa o e-mail oficial do serviço. A chave de recuperação nunca
é enviada por e-mail: ela fica com o titular e serve para quando a senha e todos
os aparelhos foram perdidos.

## Separação entre ambientes

A conferência acontece **antes** de e-mail e senha saírem daqui: as duas
funções que identificam o serviço respondem também a quem ainda não entrou.
Antes ela vinha depois de autenticar, e nesse desenho uma build apontada para o
projeto errado já tinha entregado a credencial do titular.

Endereço do serviço, chave pública e projeto declarado precisam falar do mesmo
projeto; qualquer divergência impede abrir a conexão. Declarar o projeto passou
a ser obrigatório: esquecer a variável não pode virar permissão para falar com
qualquer projeto.

O banco também declara o que ele é, em `public.service_environment`, escrito uma
única vez por quem provisiona o projeto. Logo depois de entrar, e antes de
buscar ou gravar envelope nenhum, o aplicativo confere a versão do esquema e
esse ambiente. Uma build de produção apontada para o banco de homologação — ou o
contrário — não sincroniza, e um banco que não declara nada também não. O
ambiente de homologação mostra uma marca discreta no cabeçalho.

Toda **tabela** criada depois nasce fora do alcance de `anon` e `authenticated`:
os privilégios padrão de `public` foram zerados. Antes, uma tabela nova nasceria
legível e gravável pelo navegador, e sem RLS ligada não haveria barreira nenhuma.

Com **função e procedimento** o caminho foi outro, e a história vale ser contada
inteira porque ela corrige uma promessa que este documento já fez e não podia
cumprir. O PostgreSQL concede EXECUTE a `PUBLIC` em toda função nova. A resposta
escrita aqui antes era um gatilho de evento, que fecharia automaticamente toda
função criada no schema. A homologação provou que esse caminho não existe em
Supabase gerenciado: `create event trigger` exige superusuário, o papel que
aplica migrations não é superusuário, e todos os gatilhos de evento do projeto
pertencem ao papel administrativo da plataforma. O editor SQL do painel roda com
o mesmo papel, então fazer à mão não contorna. Depender de suporte manual da
plataforma também não serve: seria uma proteção que ninguém consegue reaplicar
ao recriar o projeto.

No lugar da prevenção automática impossível ficaram três coisas que existem:

1. **Privilégio padrão**, que resolve **tabela** e não resolve **função**. A
   prova do CI é explícita nos dois sentidos: uma tabela criada depois das
   migrations nasce fora do alcance do navegador; uma função criada sem
   `revoke` nasce aberta para `PUBLIC`, mesmo com o `alter default privileges`
   declarado para o papel que a cria. A `0005` declara para cada papel sobre o
   qual tem poder, conferido por `pg_has_role`, e avisa quais ficaram de fora —
   mas o `revoke` de cada função continua escrito à mão, e é a porta do CI que
   garante que ninguém esqueça.
2. **Auditoria do catálogo**. `public.protecao_de_funcao_nova()` não afirma que
   existe um mecanismo: olha o estado real e responde se hoje alguma função de
   `public` está ao alcance de `PUBLIC` ou de `anon`.
   `public.funcoes_publicas_abertas()` diz quais são, para o problema ter nome.
3. **Porta no CI**, fora do banco. `src/sync/migrationSecurity.test.ts` recusa
   uma migration que crie função ou procedimento em `public` sem o `revoke`
   escrito ao lado, recusa `grant` a `PUBLIC`, recusa `execute` a `anon` fora
   das duas funções de identificação e recusa qualquer migration que volte a
   depender de superusuário. Função nova entra fechada, ou não entra.

**O limite, sem rodeio.** Quem tem acesso administrativo ao próprio projeto pode
criar uma função aberta à mão, e nenhuma migration impede isso — nem a versão
com gatilho de evento impediria, porque quem é superusuário também apaga o
gatilho. Prevenir o dono de si mesmo não é promessa que um banco de dados possa
cumprir. O que este desenho cobre de verdade é o aplicativo, as migrations
versionadas e os acessos de usuários; sobre o resto, ele garante que a abertura
**aparece**: a auditoria responde falso, a checklist de homologação reprova e
`pnpm test:api` reprova.

A prova de banco do CI passou a rodar com as mesmas fronteiras da nuvem — papel
sem superusuário, fora de `supabase_admin`. Um teste com mais poder do que a
produção não estava testando a produção, e foi exatamente por isso que as duas
impossibilidades só apareceram na homologação.

A conferência de `01_rls_isolation.sql` continua no lugar e continua sendo ela
quem reprova se algo escapar. Essa conferência tinha
um furo: `PUBLIC` aparece com identificador zero, sem linha em `pg_roles`, e o
`join` a descartava justamente no caso que mais importava. Corrigido, ele
apanhou a função de gatilho da primeira migration, aberta desde então.
