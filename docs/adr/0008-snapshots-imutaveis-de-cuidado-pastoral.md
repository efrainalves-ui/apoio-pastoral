# ADR 0008 — Snapshots imutáveis de cuidado pastoral

Status: aceita em 20 de agosto de 2026.

## Decisão

Cada visita contém versões append-only. Uma resposta incorpora o snapshot da pergunta apresentada: código, versão, texto, escopo, tipo, opções e sensibilidade. Corrigir a visita cria uma nova versão e não reinterpreta a resposta antiga.

A finalização prepara visita, pedido, acompanhamento, tarefa, resposta explícita de renda e avanço de rodada e grava tudo em uma única transação de envelopes cifrados. Falha antes do commit deixa zero alterações parciais.

Pedidos de oração são ocultos por padrão. Painéis usam apenas contagens descriptografadas em memória, depois da abertura do cofre. Não há campos pastorais em índices locais, logs ou metadados remotos.

## Consequências

O histórico ocupa mais espaço, porém continua auditável e fiel ao instrumento apresentado. Comparações futuras podem usar versões sem produzir pontuação espiritual. O servidor não consegue gerar painéis nominais porque não recebe plaintext.
