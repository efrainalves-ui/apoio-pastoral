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

## Dados remotos permitidos

- e-mail gerenciado pelo Supabase Auth;
- IDs aleatórios de conta, dispositivo, operação e registro;
- estado do dispositivo e timestamps técnicos;
- ciphertext, IV, AAD, versão de chave, schema e registro;
- cursor e versão-base para sincronização.

Não há colunas remotas para nome de pessoa, visita, entrevista, oração, sermão ou outro conteúdo pastoral. RLS limita leitura e escrita ao `auth.uid()` proprietário, e um trigger impede reativar dispositivo revogado.

A policy de envelopes também confirma que o dispositivo pertence à mesma conta e está ativo. Dispositivos não podem ser excluídos pela sessão autenticada, o que impede contornar a revogação apagando e recriando o mesmo identificador. Localmente, um dispositivo já vinculado a outra conta ou marcado como revogado não é reautorizado durante o acesso.

Conflitos recebidos são preservados em uma tabela local que contém somente a versão e o envelope cifrado concorrente. A versão local não é substituída silenciosamente. O cursor combina horário e identificador da operação para não perder alterações criadas no mesmo instante.

## Conta, backup e separação financeira

- cada instalação do navegador mantém uma única conta local, evitando colisões dos envelopes locais de senha e recuperação;
- o backup pastoral é cifrado, vinculado à conta de origem e restaurado em um único lote; outra conta é recusada e uma falha não deve deixar aplicação parcial;
- criar e restaurar dependem de ações explícitas; o arquivo não é enviado automaticamente;
- sair bloqueia a área interna, mas não apaga conta nem dados locais;
- o Orçamento Familiar usa banco local separado, não entra na sincronização pastoral e não está incluído no backup pastoral; suas exportações locais devem ser guardadas separadamente.

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

Ambiente novo não sincroniza de imediato: ele mostra um código curto e espera a
confirmação de um aparelho já ativo. Safari e o aplicativo instalado pela Tela
de Início do iPhone têm armazenamentos separados, então contam como ambientes
diferentes e cada um passa por essa confirmação.
