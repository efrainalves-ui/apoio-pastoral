begin;

-- Desfaz a 0010. As inscrições e os horários de aviso somem; o conteúdo dos
-- lembretes vive no cofre e não é tocado.

drop table if exists public.notification_schedule;
drop table if exists public.push_subscriptions;

commit;
