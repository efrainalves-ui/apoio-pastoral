begin;

-- ---------------------------------------------------------------------------
-- Nenhuma função de `public` ao alcance de PUBLIC ou de `anon`.
--
-- A versão anterior desta migration fazia isso com `create event trigger`, que
-- fecharia automaticamente toda função criada no schema. A homologação provou
-- que esse caminho não existe em Supabase gerenciado: `create event trigger`
-- exige superusuário, o papel que aplica migrations (`postgres`) não é
-- superusuário, e todos os gatilhos de evento do projeto pertencem a
-- `supabase_admin`, criado pelo provisionamento da plataforma. O editor SQL do
-- painel roda com o mesmo papel, então fazer à mão não contorna. Depender de
-- suporte manual da plataforma também não é solução: seria uma proteção que
-- ninguém consegue reaplicar sozinho ao recriar o projeto.
--
-- Trocamos prevenção automática impossível por três coisas que existem de
-- verdade:
--
--   1. **Privilégio padrão**, que resolve tabela e **não** resolve função. A
--      prova do CI é explícita: uma tabela criada depois das migrations nasce
--      fora do alcance do navegador; uma função criada sem `revoke` nasce
--      ABERTA para PUBLIC, mesmo com o `alter default privileges` declarado
--      para o papel que a cria. O `revoke` de função continua sendo escrito à
--      mão em cada migration, e é a porta do CI que garante que ninguém
--      esqueça. A declaração da 0005 fica de pé porque para tabela ela é
--      justamente o que funciona.
--
--   2. **Auditoria do catálogo**, aqui. `protecao_de_funcao_nova()` não afirma
--      que existe um mecanismo: ela olha o estado real e responde se hoje
--      alguma função de `public` está aberta. `funcoes_publicas_abertas()` diz
--      quais são, para o problema ter nome em vez de virar um "false" mudo.
--
--   3. **Porta no CI**, fora do banco. `src/sync/migrationSecurity.test.ts`
--      recusa uma migration que crie função ou procedimento em `public` sem o
--      `revoke ... from public` escrito ao lado, e `supabase/tests` reprova o
--      catálogo aberto. Uma função nova entra no repositório fechada, ou não
--      entra.
--
-- O limite, dito sem rodeio: quem tem acesso administrativo ao próprio projeto
-- pode criar uma função aberta à mão, e nenhuma migration impede isso — nem a
-- versão com gatilho de evento impediria, porque quem é superusuário também
-- apaga o gatilho. O que este desenho garante é que a abertura **aparece**: a
-- auditoria responde falso, a checklist de homologação reprova e `pnpm
-- test:api` reprova. Prevenir o dono de si mesmo não é uma promessa que um
-- banco de dados possa cumprir; detectar e recusar seguir, é.
-- ---------------------------------------------------------------------------

-- Funções de `public` alcançáveis por quem não deveria alcançá-las.
--
-- `app_environment` e `app_schema_version` são a exceção declarada: as duas
-- respondem a `anon` de propósito, porque a build precisa conferir com qual
-- serviço está falando **antes** de mandar e-mail e senha. Qualquer terceira
-- função ao alcance de `anon` aparece aqui.
--
-- PUBLIC entra por `grantee = 0`, que não tem linha em `pg_roles`: é assim que
-- o EXECUTE embutido do PostgreSQL se apresenta, e era justamente o caso que
-- um `join` com `pg_roles` deixava passar.
create function public.funcoes_publicas_abertas()
returns table (funcao text, alcance text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.oid::regprocedure::text,
         case when a.grantee = 0 then 'PUBLIC' else 'anon' end
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  cross join lateral pg_catalog.aclexplode(
    coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
  ) as a
  where n.nspname = 'public'
    and a.privilege_type = 'EXECUTE'
    and (
      a.grantee = 0
      or (
        a.grantee = (select r.oid from pg_catalog.pg_roles r where r.rolname = 'anon')
        and p.proname not in ('app_environment', 'app_schema_version')
      )
    )
  order by 1, 2;
$$;

comment on function public.funcoes_publicas_abertas() is
  'Funções de public ao alcance de PUBLIC ou de anon, com quem as alcança. Vazio é o estado correto.';

-- A resposta curta, para a checklist e para `pnpm test:api`.
create function public.protecao_de_funcao_nova()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (select 1 from public.funcoes_publicas_abertas());
$$;

comment on function public.protecao_de_funcao_nova() is
  'Verdadeiro quando nenhuma função de public está ao alcance de PUBLIC nem de anon, fora as duas de identificação do serviço. Lê o catálogo: não é uma afirmação, é uma leitura.';

-- ---------------------------------------------------------------------------
-- A migration não conclui afirmando um estado que não conferiu.
--
-- Se alguma função de `public` estiver aberta neste ponto — inclusive as duas
-- criadas logo acima, caso o `revoke` abaixo não tenha alcançado —, a
-- transação inteira volta atrás e a mensagem diz quais são.
-- ---------------------------------------------------------------------------

revoke all on function public.funcoes_publicas_abertas(),
  public.protecao_de_funcao_nova() from public, anon;
grant execute on function public.funcoes_publicas_abertas(),
  public.protecao_de_funcao_nova() to authenticated;

do $$
declare
  abertas text;
begin
  select string_agg(format('%s (%s)', f.funcao, f.alcance), '; ')
    into abertas
  from public.funcoes_publicas_abertas() f;

  if abertas is not null then
    raise exception 'ha funcao de public ao alcance de PUBLIC ou de anon: %', abertas;
  end if;

  raise notice 'auditoria: nenhuma funcao de public ao alcance de PUBLIC ou de anon';
end;
$$;

create or replace function public.app_schema_version()
returns integer
language sql
immutable
security invoker
set search_path = ''
as $$ select 7 $$;

commit;
