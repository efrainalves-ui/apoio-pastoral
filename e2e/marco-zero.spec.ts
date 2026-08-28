import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { navigateInsideApp } from './navigation'

const email = 'pastor.teste@example.invalid'
const password = 'senha-ficticia-segura-2026'

async function register(page: Page) {
  await page.goto('/acesso')
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha').fill(password)
  await page.getByRole('button', { name: 'Criar conta' }).click()
  await expect(page.getByRole('heading', { name: 'Guarde sua chave de recuperação' })).toBeVisible()
  await expect(page.getByTestId('recovery-code')).toContainText('APOIO-1-')
  await page.getByRole('button', { name: 'Já guardei em local seguro' }).click()
  await page.getByLabel('Nome do distrito').fill('Distrito Fictício do Acesso')
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByRole('button', { name: 'Cadastrar manualmente' }).click()
  await page.getByRole('link', { name: 'Ir para o início' }).click()
  await expect(page.getByRole('heading', { name: 'Visão do distrito' })).toBeVisible()
}

test('jornada básica usa somente dados fictícios', async ({ page }) => {
  await register(page)
  await expect(page.getByRole('heading', { name: 'Agenda' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Evangelismo' })).toBeVisible()
})

test('cria conta, protege rota, bloqueia, entra e recupera acesso', async ({ page }) => {
  await page.goto('/acesso')
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha').fill(password)
  await page.getByRole('button', { name: 'Criar conta' }).click()
  const recoveryCode = await page.getByTestId('recovery-code').textContent()
  expect(recoveryCode).toMatch(/^APOIO-1-/)
  await page.getByRole('button', { name: 'Já guardei em local seguro' }).click()
  await page.getByLabel('Nome do distrito').fill('Distrito Fictício de Recuperação')
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByRole('button', { name: 'Cadastrar manualmente' }).click()
  await page.getByRole('link', { name: 'Ir para o início' }).click()
  await expect(page.getByRole('heading', { name: 'Visão do distrito' })).toBeVisible()

  page.once('dialog', (dialog) => void dialog.accept())
  await page.getByRole('button', { name: 'Sair' }).last().click()
  await expect(page.getByRole('heading', { name: 'Entre na sua conta' })).toBeVisible()
  await page.goto('/app/distrito')
  await expect(page).toHaveURL(/\/acesso$/)
  await expect(page.getByRole('heading', { name: 'Entre na sua conta' })).toBeVisible()

  await page.getByLabel('Senha').fill(password)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page.getByRole('heading', { name: 'Visão do distrito' })).toBeVisible()

  page.once('dialog', (dialog) => void dialog.accept())
  await page.getByRole('button', { name: 'Sair' }).last().click()
  await page.getByRole('button', { name: 'Usar chave de recuperação' }).click()
  await expect(page.getByRole('heading', { name: 'Recupere o acesso' })).toBeVisible()
  await page.getByLabel('Chave de recuperação').fill(recoveryCode ?? '')
  await page.getByLabel('Senha da conta').fill('senha-recuperada-ficticia-2026')
  await page.getByRole('button', { name: 'Recuperar acesso' }).click()
  await expect(page.getByRole('heading', { name: 'Visão do distrito' })).toBeVisible()
})

test('continua disponível offline depois do primeiro carregamento', async ({ page, context }) => {
  await register(page)
  await page.getByRole('link', { name: 'Novo compromisso' }).click()
  await page.getByLabel('Título').fill('Compromisso Offline Fictício')
  await page.getByRole('button', { name: 'Salvar compromisso' }).click()
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Entre na sua conta' })).toBeVisible()
  await page.getByLabel('Senha').fill(password)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page.getByRole('heading', { name: 'Visão do distrito' })).toBeVisible()
  await navigateInsideApp(page, '/app/agenda', page.getByText('Compromisso Offline Fictício'))
})

test('manifesto e service worker tornam a PWA instalável', async ({ page }) => {
  await page.goto('/acesso')
  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href')
  expect(manifestHref).toBeTruthy()
  const manifestResponse = await page.request.get(manifestHref!)
  expect(manifestResponse.ok()).toBeTruthy()
  const manifest = await manifestResponse.json() as { name: string; display: string; icons: unknown[] }
  expect(manifest).toMatchObject({ name: 'Apoio Pastoral', display: 'standalone' })
  expect(manifest.icons).toHaveLength(3)
  await expect.poll(() => page.evaluate(async () => Boolean(await navigator.serviceWorker.ready))).toBe(true)
})

test('não apresenta violações críticas de acessibilidade no acesso', async ({ page }) => {
  await page.goto('/acesso')
  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([])
})
