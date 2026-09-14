-- Reverte 0011. Os segredos já gravados no Vault ficam onde estão: apagá-los
-- invalidaria as inscrições dos aparelhos, e isso é decisão de quem administra
-- o projeto, não de uma reversão.

drop function if exists public.lembretes_push_guardar_vapid(text, text);
drop function if exists public.lembretes_push_config();
