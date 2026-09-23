# AUTORIZAÇÃO FINAL DE PRODUÇÃO

Commit candidato: **`99364b6`** · PR **#14** · Migration **`0013`** · Função Edge **`lembretes-push` v3**

## Antes de autorizar

- [ ] Homologação publicada testada e aprovada
- [ ] Teste físico do push no iPhone aprovado (`docs/TESTE_FISICO_PUSH.md`)
- [ ] PR #14 com todos os checks verdes
- [ ] Você quer publicar agora

## Publicar — nesta ordem

- [ ] **1.** Supabase de **produção** → SQL Editor:
      `select jobid, jobname from cron.job;` → anotar o `jobid`
- [ ] **2.** `select cron.alter_job(job_id := <id>, active := false);`
- [ ] **3.** Publicar a função `lembretes-push` no Supabase de **produção**
      (conteúdo de `supabase/functions/lembretes-push/index.ts`, `verify_jwt` desligado)
- [ ] **4.** Aplicar `supabase/migrations/0013_push_do_aparelho_revogado_up.sql`
      em **produção**
      *(se produção ainda não tiver push: aplicar `0010`, `0011`, `0012` antes, nesta ordem)*
- [ ] **5.** Conferir, tudo numa consulta só:
      `select public.app_schema_version() as esquema,
              public.lembretes_push_disponivel() as push,
              has_table_privilege('service_role','public.push_subscriptions','select') as porta_aberta;`
      **Esperado: `9`, `true`, `false`.** Qualquer outra coisa: **PARE**
- [ ] **6.** `select cron.alter_job(job_id := <id>, active := true);`
- [ ] **7.** Mergear a PR #14 em `main`
- [ ] **8.** Aguardar os dois deploys do Cloudflare ficarem verdes

## Depois de publicar

- [ ] Abrir o endereço de produção e entrar na sua conta
- [ ] Segurança → a lista de aparelhos aparece
- [ ] Lembretes → Notificações → o painel abre sem erro
- [ ] Sincronização → sincronizar uma vez, sem erro
- [ ] `select status, count(*) from cron.job_run_details
       where start_time > now() - interval '10 minutes' group by status;`
      → sem `failed`

## PARE se

- [ ] O esquema não responder **9**
- [ ] `lembretes_push_disponivel` não responder **true**
- [ ] `porta_aberta` não responder **false**
- [ ] Aparecer `failed` no agendador
- [ ] Qualquer check da PR ficar vermelho

## Voltar atrás

- [ ] **1.** Pausar o agendador (passo 2 acima)
- [ ] **2.** Cloudflare → *Deployments* → implantação anterior → **Rollback**
      (nos dois projetos)
- [ ] **3.** Aplicar `0013_push_do_aparelho_revogado_down.sql` em produção
- [ ] **4.** Publicar de novo a função Edge do commit anterior
- [ ] **5.** Religar o agendador

Nada disso apaga lembrete, cadastro, inscrição ou qualquer dado pastoral.
