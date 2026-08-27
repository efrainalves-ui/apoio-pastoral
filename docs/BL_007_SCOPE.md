# Escopo entregue — BL-007 Agenda e conflitos

Atualizado em: 20 de agosto de 2026.

## Entregue

- criação, edição e remoção de compromissos cifrados;
- categorias oficiais, duração em minutos editável e horário final ajustável;
- local, endereço, igreja e observações dentro do payload cifrado;
- visita com lembrete inicial de 15 minutos, PGP de 9h às 12h e Concílio de dia todo;
- preparação de vínculo futuro da Visita com pessoa ou família, sem criar nem acessar o módulo de visitas;
- bloqueio de sobreposição e de intervalo menor que cinco minutos, sem ajuste silencioso;
- toda segunda-feira exibida como folga; compromisso nesse dia exige exceção explícita;
- visualizações responsivas de hoje, semana e mês, com filtros de tipo, igreja e período selecionado;
- seleção nominal dos compromissos para gerar PDF local, incluindo local, endereço e igreja quando informados;
- categoria Pessoal indisponível para o itinerário por padrão;
- nenhuma URL pública e nenhuma transmissão do PDF;
- armazenamento local AES-GCM e fila remota contendo apenas ciphertext.

## Limites preservados

Pregações podem referenciar uma igreja, mas vínculo com sermões não foi criado porque sermões estão fora do bloco autorizado. A preparação de vínculo da Visita não cria, lista nem lê pessoas ou famílias; a integração real continua fora deste bloco.

## Testes

Os testes fictícios cobrem CRUD cifrado, ausência de texto aberto, campos de local e endereço, padrões, folga de segunda, bloqueio de sobreposição, intervalo curto, exclusão de Pessoal e geração de um PDF válido.
