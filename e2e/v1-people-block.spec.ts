import { expect, test, type Page } from '@playwright/test'
import { navigateInsideApp } from './navigation'

const email = 'v1.pessoas.e2e@example.invalid'
const password = 'senha-ficticia-v1-2026'

async function register(page: Page) {
  await page.goto('/acesso')
  await page.getByLabel('E-mail').fill(email)
  await page.getByRole('textbox', { name: 'Senha' }).fill(password)
  await page.getByRole('button', { name: 'Criar conta' }).click()
  await page.getByRole('button', { name: 'Já guardei em local seguro' }).click()
  await page.getByLabel('Nome do distrito').fill('Distrito Pessoas Fictício')
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByRole('button', { name: 'Cadastrar manualmente' }).click()
  await page.getByRole('link', { name: 'Ir para o início' }).click()
  await expect(page.getByRole('heading', { name: 'Visão do distrito' })).toBeVisible()
}

async function createDistrictAndChurch(page: Page) {
  await navigateInsideApp(page, '/app/distrito', page.getByRole('heading', { name: 'Distrito Pessoas Fictício' }))
  await page.getByRole('link', { name: 'Nova igreja' }).click()
  await page.getByLabel(/Nome da igreja/).fill('Igreja Aurora Fictícia')
  await page.getByLabel(/Tipo/).selectOption('organized_church')
  await page.getByRole('button', { name: 'Salvar igreja' }).click()
  await expect(page.getByRole('heading', { name: 'Igreja Aurora Fictícia' })).toBeVisible()
}

test('pessoas, família, aniversários, busca e importações privadas funcionam juntas e offline', async ({ page, context }) => {
  await register(page)
  await createDistrictAndChurch(page)

  const now = new Date(); const birthday = `1990-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  await navigateInsideApp(page, '/app/pessoas/nova', page.getByLabel(/Nome completo/))
  await page.getByLabel(/Nome completo/).fill('Pessoa Sol Fictícia')
  await page.getByLabel('Data de nascimento').fill(birthday)
  await page.getByLabel(/Igreja/).selectOption({ label: 'Igreja Aurora Fictícia' })
  await page.getByLabel('WhatsApp').fill('(61) 99999-1111')
  await page.getByRole('button', { name: 'Salvar pessoa' }).click()
  await expect(page.getByRole('heading', { name: 'Pessoa Sol Fictícia' })).toBeVisible()

  await navigateInsideApp(page, '/app/familias/nova', page.getByLabel(/Nome da família/))
  await page.getByLabel(/Nome da família/).fill('Família Sol Fictícia')
  await page.getByLabel(/Igreja principal/).selectOption({ label: 'Igreja Aurora Fictícia' })
  await page.getByText('Pessoa Sol Fictícia').click()
  await page.getByRole('button', { name: 'Salvar família' }).click()
  await expect(page.getByRole('heading', { name: 'Família Sol Fictícia' })).toBeVisible()

  // O distrito acha igreja, membro e família na mesma busca.
  await navigateInsideApp(page, '/app/distrito', page.getByRole('heading', { name: 'Distrito Pessoas Fictício' }))
  await page.getByLabel('Igreja, membro ou família').fill('Sol')
  const achados = page.locator('.card').filter({ hasText: 'Buscar no distrito' })
  await expect(achados.getByText('Pessoa Sol Fictícia')).toBeVisible()
  await expect(achados.getByText('Família Sol Fictícia')).toBeVisible()
  await page.getByLabel('Igreja, membro ou família').fill('')

  // A importação acontece dentro da igreja e não pergunta a igreja de novo.
  await page.getByRole('link', { name: /Igreja Aurora Fictícia/ }).click()
  await page.getByRole('button', { name: 'Membros' }).click()
  await page.getByRole('button', { name: 'Importar lista de membros' }).click()
  await expect(page.getByLabel('Igreja desta lista')).toHaveCount(0)
  await page.getByRole('textbox', { name: /Lista de membros/ }).fill('Pessoa Aurora Fictícia; 21/08/1990\nPessoa Horizonte Fictícia; 10/05/1985')
  await page.getByRole('button', { name: 'Conferir lista colada' }).click()
  await expect(page.getByRole('heading', { name: 'Confira antes de salvar' })).toBeVisible()
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Confirmar e aplicar' }).click()
  await expect(page.getByRole('heading', { name: 'Importação concluída' })).toBeVisible()

  await navigateInsideApp(page, '/app/aniversarios', page.getByRole('heading', { name: 'Aniversariantes', exact: true }))
  await expect(page.getByText('Pessoa Sol Fictícia')).toBeVisible()
  await page.getByRole('button', { name: 'Criar mensagem' }).click()
  await expect(page.getByLabel('Mensagem')).toHaveValue(/Pessoa/)

  await navigateInsideApp(page, '/app/busca', page.getByRole('heading', { name: 'Busca global' }))
  await page.getByLabel(/Pessoa, família, igreja/).fill('Família Sol')
  await expect(page.getByText('Família Sol Fictícia')).toBeVisible()

  await navigateInsideApp(page, '/app/fidelidade', page.getByRole('heading', { name: 'Fidelidade nos dízimos' }))
  await page.getByRole('button', { name: 'Usar importação fictícia simulada' }).click()
  await expect(page.getByRole('heading', { name: 'Conferir fidelidade' })).toBeVisible()
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Confirmar e aplicar' }).click()
  await expect(page.getByRole('heading', { name: 'Fidelidade atualizada' })).toBeVisible()

  await context.setOffline(true)
  await page.reload()
  await page.getByRole('textbox', { name: 'Senha' }).fill(password)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page.getByRole('heading', { name: 'Visão do distrito' })).toBeVisible()
  await navigateInsideApp(page, '/app/pessoas', page.getByRole('heading', { name: 'Pessoas', exact: true }))
  await expect(page.getByText('Pessoa Sol Fictícia')).toBeVisible()
})
