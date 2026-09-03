begin;

-- ---------------------------------------------------------------------------
-- As tabelas de sessão saem do alcance direto do navegador.
--
-- A `0004` fechou os envelopes contra um token revogado, mas deixou de lado as
-- duas tabelas que descrevem as próprias sessões. `device_sessions` e
-- `revoked_sessions` continuaram com `grant select ... to authenticated` e uma
-- política que só perguntava `auth.uid() = owner_id`. Consequência: um aparelho
-- revogado, com o token de acesso ainda vivo na memória — até uma hora —,
-- seguia lendo por HTTP a lista de sessões da conta e o registro de quais
-- sessões foram revogadas, com identificador de sessão, identificador de
-- aparelho e o horário exato de cada revogação. Não é conteúdo pastoral, mas é
-- o mapa da conta: quantos aparelhos existem, quais foram derrubados e quando.
-- E é justamente a informação que a revogação existe para tirar de quem foi
-- revogado.
--
-- Duas correções, e as duas juntas de propósito:
--
--   1. O cliente não lê mais essas tabelas por HTTP. O aplicativo nunca as
--      consultou — quem precisa delas são as funções `security definer`, que
--      rodam com os privilégios do dono e não dependem deste grant. Um grant
--      que ninguém usa é superfície que só existe para ser explorada.
--
--   2. As políticas passam a exigir `session_is_not_revoked()`. Se um dia
--      alguém devolver o `grant select` — por engano, ou por precisar de uma
--      tela nova —, a política continua barrando o token revogado. Uma defesa
--      que depende de o próximo desenvolvedor lembrar não é defesa.
-- ---------------------------------------------------------------------------

drop policy device_sessions_owner_select on public.device_sessions;
create policy device_sessions_owner_select on public.device_sessions
  for select using (auth.uid() = owner_id and public.session_is_not_revoked());

drop policy revoked_sessions_owner_select on public.revoked_sessions;
create policy revoked_sessions_owner_select on public.revoked_sessions
  for select using (auth.uid() = owner_id and public.session_is_not_revoked());

revoke all on public.device_sessions, public.revoked_sessions from public, anon, authenticated;

comment on table public.device_sessions is
  'Vínculo entre sessão do serviço e aparelho. Fora do alcance direto do cliente: só as funções security definer leem esta tabela.';
comment on table public.revoked_sessions is
  'Sessões barradas por revogação. Fora do alcance direto do cliente pelo mesmo motivo: é o mapa da conta, e quem foi revogado não pode continuar lendo.';

create or replace function public.app_schema_version()
returns integer
language sql
immutable
security invoker
set search_path = ''
as $$ select 9 $$;

commit;
