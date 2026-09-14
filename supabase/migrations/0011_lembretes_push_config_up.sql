-- 0011 — Configuração do envio das notificações, guardada no Vault do projeto.
--
-- As chaves VAPID e o segredo do agendamento não passam por repositório, por
-- variável digitada nem por conversa: a chave VAPID é gerada pela própria função
-- de envio na primeira execução e guardada aqui; o segredo do agendamento é
-- gerado dentro do banco. Cada projeto (homologação, produção) gera os seus.
--
-- Só o papel do servidor (service_role) chama estas funções. O navegador, com
-- anon ou authenticated, não lê nem grava nada disto.
--
-- Não muda app_schema_version: a build atual continua valendo antes e depois.
-- Os corpos citam o schema vault, que só existe no Supabase; plpgsql resolve
-- esses nomes na execução, então a migration aplica também no Postgres de teste.

create or replace function public.lembretes_push_config()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  resultado jsonb;
begin
  select jsonb_object_agg(s.name, s.decrypted_secret)
    into resultado
    from vault.decrypted_secrets s
   where s.name in ('lembretes_vapid_public', 'lembretes_vapid_private', 'lembretes_vapid_subject', 'lembretes_cron_secret');
  return coalesce(resultado, '{}'::jsonb);
end;
$$;

-- Grava o par VAPID uma vez só. Se outro envio já gravou, não substitui: devolve false.
create or replace function public.lembretes_push_guardar_vapid(chave_publica text, chave_privada text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if chave_publica is null or chave_privada is null or char_length(chave_publica) < 40 or char_length(chave_privada) < 20 then
    raise exception 'par VAPID inválido';
  end if;
  if exists (select 1 from vault.secrets s where s.name in ('lembretes_vapid_public', 'lembretes_vapid_private')) then
    return false;
  end if;
  perform vault.create_secret(chave_publica, 'lembretes_vapid_public', 'Chave pública VAPID das notificações');
  perform vault.create_secret(chave_privada, 'lembretes_vapid_private', 'Chave privada VAPID das notificações');
  return true;
exception
  when unique_violation then
    return false;
end;
$$;

revoke all on function public.lembretes_push_config() from public, anon, authenticated;
revoke all on function public.lembretes_push_guardar_vapid(text, text) from public, anon, authenticated;
grant execute on function public.lembretes_push_config() to service_role;
grant execute on function public.lembretes_push_guardar_vapid(text, text) to service_role;
