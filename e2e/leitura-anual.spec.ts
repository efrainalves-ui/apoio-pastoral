import { expect, test, type Page } from '@playwright/test'
import { navigateInsideApp } from './navigation'

const password = 'senha-ficticia-leitura-anual-2026'

async function entrar(page: Page) {
  await page.goto('/acesso')
  await page.getByLabel('E-mail').fill('leitura.anual.e2e@example.invalid')
  await page.getByRole('textbox', { name: 'Senha' }).fill(password)
  await page.getByRole('button', { name: 'Criar conta' }).click()
  await page.getByRole('button', { name: 'Já guardei em local seguro' }).click()
  await page.getByLabel('Nome do distrito').fill('Distrito Fictício da Leitura Anual')
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByRole('button', { name: 'Cadastrar manualmente' }).click()
  await page.getByRole('link', { name: 'Ir para o início' }).click()
}

/*
  O ano do pastor em uma tela: a meta anual de livros e de páginas, o tempo só
  como resultado, e o mês que se consulta e se corrige sessão por sessão.
*/
test('meta anual de livros e páginas, tempo como resultado, e o relatório do mês recalcula ao editar e excluir', async ({ page }) => {
  test.setTimeout(180_000)
  await entrar(page)
  await navigateInsideApp(page, '/app/leitura', page.getByRole('heading', { name: 'Leitura', exact: true }))
  const { ano, hoje } = await page.evaluate(() => {
    const d = new Date()
    const dois = (n: number) => String(n).padStart(2, '0')
    return { ano: String(d.getFullYear()), hoje: `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}` }
  })

  await expect(page.getByRole('heading', { name: `Meta anual de ${ano}` })).toBeVisible()
  await expect(page.getByText(`Defina a meta anual de livros e páginas de ${ano}.`)).toBeVisible()
  await expect(page.getByText(/meta mensal|meta do mês|objetivo mensal/iu)).toHaveCount(0)

  await page.getByRole('button', { name: 'Definir meta anual' }).click()
  await expect(page.getByLabel(/minutos|horas/iu)).toHaveCount(0)
  await page.getByLabel('Livros que desejo concluir').fill('2')
  await page.getByLabel('Páginas que desejo ler').fill('100')
  await page.getByRole('button', { name: 'Salvar meta anual' }).click()
  await expect(page.getByText('0 de 2 livros', { exact: true })).toBeVisible()
  await expect(page.getByText('0 de 100 páginas', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Adicionar livro' }).first().click()
  await page.getByLabel('Título').fill('Livro Fictício do Ano')
  await page.getByLabel('Autor').fill('Autora Fictícia')
  await page.getByLabel('Total de páginas (opcional)').fill('60')
  await page.getByRole('button', { name: 'Salvar livro' }).click()
  await expect(page.getByText('Livro salvo.')).toBeVisible()

  await page.getByRole('button', { name: 'Registrar leitura' }).click()
  await page.getByRole('combobox', { name: 'Livro', exact: true }).selectOption({ label: 'Livro Fictício do Ano' })
  await page.getByLabel('Data', { exact: true }).fill(hoje)
  await page.getByLabel('Páginas lidas').fill('60')
  await page.getByLabel('Tempo de leitura (minutos)').fill('95')
  await page.getByRole('button', { name: 'Salvar leitura' }).click()

  // Sessão com as 60 páginas conclui o livro; o tempo aparece como resultado, sem meta.
  await expect(page.getByText('1 de 2 livros', { exact: true })).toBeVisible()
  await expect(page.getByText('60 de 100 páginas', { exact: true })).toBeVisible()
  await expect(page.getByText('1h 35min de leitura no ano', { exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: /^Resultado de / }).getByText('Sessões')).toBeVisible()
  await expect(page.getByText('60 página(s) · 1h 35min', { exact: true })).toBeVisible()

  // Corrigir a sessão para 120 páginas: a meta de páginas é superada e o valor real aparece.
  await page.getByRole('button', { name: /^Editar leitura de / }).click()
  await page.getByLabel('Páginas lidas').fill('120')
  await page.getByRole('button', { name: 'Salvar leitura' }).click()
  await expect(page.getByText('120 de 100 páginas — meta superada em 20', { exact: true })).toBeVisible()

  // Excluir a sessão recalcula para zero, sem ficar negativo.
  page.once('dialog', (dialogo) => void dialogo.accept())
  await page.getByRole('button', { name: /^Excluir leitura de / }).click()
  await expect(page.getByText('0 de 100 páginas', { exact: true })).toBeVisible()
  await expect(page.getByText('Nenhuma leitura registrada neste mês')).toBeVisible()
})
