-- Reverte 0012: o servidor volta a não alcançar as tabelas das notificações.

revoke update (state, attempts, sent_at, updated_at) on public.notification_schedule from service_role;
revoke select, delete on public.notification_schedule from service_role;
revoke select, delete on public.push_subscriptions from service_role;
