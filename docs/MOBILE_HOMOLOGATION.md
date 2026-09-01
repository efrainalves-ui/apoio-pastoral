# Checklist de homologação física — iPhone e Android

Esta etapa exige dispositivos físicos e uma pessoa responsável. Ela está **pendente**; esta lista não constitui evidência de execução. Use somente contas, senhas, backups e registros claramente fictícios.

| Verificação | Aprovação | Reprovação |
|---|---|---|
| Instalação | Aplicativo instala pela forma autorizada para homologação, sem apontar para produção | Falha de instalação, origem não autorizada ou pedido de dado real |
| Abertura inicial | Tela de acesso abre sem corte, rolagem horizontal ou texto técnico | Tela inacessível, conteúdo técnico inicial ou erro não tratado |
| Conta e acesso | Criar conta fictícia; entrar no Safari e no app instalado somente com e-mail e senha; recuperar com chave fictícia apenas como contingência | Sessão de outra conta aparece, a entrada normal pede a chave, recuperação falha ou há exposição de segredo |
| Uso offline | Após primeiro carregamento, abrir e consultar registros fictícios sem rede | Dados fictícios somem, falha sem mensagem tratada ou há tentativa de publicação |
| Retorno à rede | Restaurar rede e observar somente o estado previsto da fila de homologação | Dados de outra conta aparecem, conteúdo legível é enviado ou há conexão com produção |
| Atualização | Atualizar o aplicativo e confirmar abertura do cofre local fictício | Atualização perde ou mistura dados locais fictícios sem aviso controlado |
| Backup fictício | Criar backup fictício por ação explícita e verificar apenas data, tamanho e quantidade | Backup é enviado/publicado ou revela conteúdo fora do dispositivo |
| Restauração fictícia | Recusar código fictício incorreto; restaurar com código fictício correto | Restauração parcial, sem confirmação ou com dados de outra conta |
| Remoção do app | Remover o aplicativo e registrar o comportamento local observado da plataforma | Declaração de apagamento não verificada ou qualquer dado remoto real envolvido |

## Registro mínimo da rodada

Anotar somente: plataforma (iPhone ou Android), versão do sistema, versão do aplicativo, data, resultado de cada linha e código técnico de falha. Não registrar URL, conta fora de `example.test`, senha, chave de recuperação, ciphertext, backup ou screenshots com campos preenchidos.

Uma falha bloqueia o uso de dados reais. A aprovação desta lista também não libera produção, publicação, Supabase de produção ou auditoria independente.
