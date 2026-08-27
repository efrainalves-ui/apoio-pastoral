# Escopo entregue — cuidado pastoral da V1

Atualizado em: 20 de agosto de 2026.

## Blocos concluídos

- BL-009: visitas pastorais agendadas diretamente pela Agenda ou espontâneas, modo rápido, participantes cadastrados e convidados;
- BL-010: entrevista oficial com 38 perguntas selecionáveis, respostas individuais/familiares e snapshots versionados;
- BL-011: pedidos de oração, acompanhamentos e tarefas;
- rodadas manuais de visitação e painéis de atenção.

## Regras preservadas

- nenhuma pergunta é obrigatória; a interface permite pular explicitamente;
- pedido de oração é a última etapa e começa oculto no painel;
- perguntas de saúde tratam apenas hábitos gerais, sem doença, diagnóstico ou tratamento;
- não existe nota, ranking ou decisão espiritual automatizada;
- correções acrescentam uma versão; respostas anteriores e a versão exata da pergunta permanecem intactas;
- convidados não entram automaticamente no cadastro de pessoas;
- a pergunta de renda aparece somente para pessoa presente com renda desconhecida e classificação Não dizimista ou Dizimista não sistemático;
- a resposta de renda não aceita valores; “não informado” preserva o estado desconhecido e não altera a fidelidade;
- a criação de visita exige igreja primeiro; pessoas são filtradas por igreja e famílias mistas aparecem quando ao menos um integrante pertence à igreja escolhida;
- mudar a igreja limpa o cadastro selecionado de forma explícita; pesquisa por nome ocorre somente dentro da lista filtrada localmente;
- revisão do pedido começa em 180 dias e pode ser ajustada;
- rodada só fica concluída quando todas as famílias escolhidas foram visitadas, sem prazo fixo;
- painéis mostram contagens e prazos, nunca o texto de oração em notificações ou resumos.

## Privacidade e offline

Visitas, respostas, participantes, convidados, pedidos, acompanhamentos, tarefas e rodadas são payloads AES-GCM. A migration local v5 acrescenta somente tipos técnicos ao cofre genérico. Toda gravação usa a mesma fila offline; o transporte remoto continua aceitando apenas ciphertext, IV, AAD, versões e identificadores aleatórios.

## Fora do escopo

Sermões, crescimento financeiro, batismos, relatórios gerais, Comissão de Nomeações, V1.1, V2 e Futuro não foram implementados.
