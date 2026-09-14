-- 0012 — O envio no servidor alcança só o que precisa.
--
-- O projeto nasce fechado: nem service_role tem privilégio nas tabelas de
-- public. A função de envio precisa ler as inscrições, apagar a que o serviço
-- de push recusou, reservar e marcar o envio dos horários e limpar o histórico.
-- Só isso, só nessas duas tabelas: as operações cifradas e os envelopes
-- continuam fora do alcance do servidor.
--
-- Não muda app_schema_version.

grant select, delete on public.push_subscriptions to service_role;
grant select, delete on public.notification_schedule to service_role;
grant update (state, attempts, sent_at, updated_at) on public.notification_schedule to service_role;
