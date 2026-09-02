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
- `supabase/tests/02_device_barriers.sql` prova cada uma dessas barreiras em um
  Postgres descartável, incluindo as tentativas de contorno.

## Ordem, paginação e autenticação da sincronização

- A ordem de download é `seq`, atribuída pelo servidor na chegada. O carimbo de
  tempo do aparelho é informativo. Antes ele era o cursor, e um relógio
  adiantado ou um envio atrasado faziam operações nunca serem baixadas.
- O recebimento percorre todas as páginas até o serviço não ter mais nada.
- Cada operação leva um HMAC-SHA-256 sobre conta, registro, tipo de operação,
  versão, versão-base, formato, versão de chave e o próprio texto cifrado.
  Operação sem assinatura válida vai para quarentena local, sem ser aplicada
  nem descartada.
- Conflito é decidido pela linhagem: só entra por cima o que foi editado sobre a
  versão que o aparelho tem. As duas versões ficam guardadas cifradas.
- Falha de sincronização nunca é interpretada como conta vazia: um aparelho que
  ainda não recebeu os dados espera em uma tela própria.
- Um registro local que não abre é pulado e contado, em vez de derrubar a
  listagem inteira.

## Conta, backup e separação financeira

- cada instalação do navegador mantém uma única conta local, evitando colisões dos envelopes locais de senha e recuperação;
- o backup pastoral é cifrado, vinculado à conta de origem e restaurado em um único lote; outra conta é recusada e uma falha não deve deixar aplicação parcial;
- criar e restaurar dependem de ações explícitas; o arquivo não é enviado automaticamente;
- **Sair** encerra a sessão no serviço (`scope: 'global'`) e fecha o cofre;
  **Bloquear cofre** apenas fecha o cofre e mantém a sessão. O cofre também se
  fecha sozinho após 15 minutos sem uso ou 5 minutos em segundo plano;
- o Orçamento Familiar e a Leitura usam bancos locais separados e não entram na
  sincronização pastoral, mas **entram no backup** (versão 4 do arquivo), no
  mesmo envelope cifrado pelo código que o titular escolhe;
- a restauração recusa arquivo de outra conta, de outra versão, truncado,
  malformado ou grande demais, antes de tentar abrir.

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

## Limites honestos

- E2EE não oculta todos os metadados (volume, timestamps e identificadores).
- O modo local é para desenvolvimento, não substitui autenticação remota de produção.
- E-mail e senha abrem o cofre também em uma nova instalação. O serviço guarda somente o envelope da chave mestra já cifrado pela senha; nunca recebe a senha ou o conteúdo pastoral em texto aberto.
- Uma nova instalação é registrada como outro dispositivo após a entrada. Safari e o aplicativo instalado no iPhone são instalações independentes para esse controle.
- A chave de recuperação é contingência para perda de acesso aos dispositivos; ela não é enviada por e-mail e não é o caminho normal de entrada em um aparelho novo.
- Revogar um aparelho impede acesso futuro ao serviço, aos envelopes e à
  sincronização. **Não apaga o que já foi baixado naquele aparelho** — nenhum
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

Endereço do serviço, chave pública e projeto declarado precisam falar do mesmo
projeto; qualquer divergência impede abrir a conexão. O aplicativo também
confere, uma vez por sessão, que o serviço está na versão de esquema esperada, e
o ambiente de homologação mostra uma marca discreta no cabeçalho.
