begin;

-- ---------------------------------------------------------------------------
-- Não há o que desfazer, e isso é uma decisão, não um esquecimento.
--
-- A subida apenas retira o `EXECUTE` que PUBLIC tinha sobre funções de gatilho
-- de evento em `public`. Desfazer seria conceder de volta a PUBLIC — o oposto
-- do que todo o resto deste repositório garante, e algo que a porta do CI
-- recusa em qualquer migration.
--
-- A subida também não cria tabela, função nem coluna. Reverter, aqui, é não
-- fazer nada: o esquema fica exatamente como estava.
-- ---------------------------------------------------------------------------

do $$
begin
  raise notice 'nada a reverter: a 0000 apenas retira concessao, e reconceder a PUBLIC nao e reversao, e regressao';
end;
$$;

commit;
