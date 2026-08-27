# ADR 0006 — Classificação e precisão explícitas na fidelidade

Status: aceita em 20 de agosto de 2026.

## Contexto

O relatório oficial considera os últimos 12 meses e pode informar um número, uma faixa (8–12 ou 1–7) ou somente uma categoria. Converter faixa em um número exato criaria um dado que a fonte não fornece. A classificação oficial é: 0 mês, Não dizimista; 1–7 meses, Dizimista não sistemático; 8–12 meses, Dizimista.

## Decisão

Cada snapshot cifrado grava primeiro a categoria oficial e declara `precision` como `exact`, `range` ou `category_only`, além dos limites mínimo e máximo da faixa de origem. `months` só é preenchido quando a fonte contém um número exato. Faixas válidas não geram divergência. Nome e igreja com correspondência única são associados automaticamente; nome ausente, múltiplas correspondências, ambiguidade real e linha repetida permanecem para revisão.

Snapshots legados são normalizados em memória depois da abertura do cofre. A migration local v6 registra a nomenclatura oficial, mas não altera índices nem regrava conteúdo pastoral em texto aberto. O lote de fidelidade usa o modelo 3, permitindo um reprocessamento controlado de arquivos aplicados pelos modelos anteriores. O contrato remoto permanece inalterado e recebe somente ciphertext.

## Consequências

- a interface não afirma uma quantidade de meses que o relatório não sustenta;
- a classificação aparece antes da faixa ou quantidade complementar;
- uma importação anterior pode ser reprocessada uma vez pelo modelo 3 do lote;
- a segunda importação no modelo atual é idempotente;
- “sem renda” permanece desconhecido até resposta pastoral explícita;
- nomes e divergências continuam exclusivamente dentro do payload cifrado.
