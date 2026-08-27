# ADR 0007 — Agenda cifrada e itinerário local

Status: aceita em 20 de agosto de 2026.

## Decisão

Compromissos são registros `agenda_event` inteiramente cifrados. Datas, títulos, igrejas e observações não são índices do IndexedDB nem metadados remotos. A migration local v4 só registra o novo tipo técnico; o contrato remoto continua genérico.

Folgas de segunda-feira são projeções determinísticas, evitando criar registros infinitos. Um compromisso na segunda exige `mondayException=true`. O PDF é montado no navegador com os itens selecionados e nunca enviado ao servidor; itens pessoais começam fora da seleção.

## Consequências

Busca e detecção de conflitos exigem o cofre aberto. O PDF baixado deixa o perímetro do cofre por ação explícita do pastor e deve ser tratado como documento privado.
