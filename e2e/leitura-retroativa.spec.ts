import { expect, test, type Page } from '@playwright/test'
import { navigateInsideApp } from './navigation'

const password = 'senha-ficticia-leitura-2026'

async function entrar(page: Page) {
  await page.goto('/acesso')
  await page.getByLabel('E-mail').fill('leitura.retroativa.e2e@example.invalid')
  await page.getByRole('textbox', { name: 'Senha' }).fill(password)
  await page.getByRole('button', { name: 'Criar conta' }).click()
  await page.getByRole('button', { name: 'Já guardei em local seguro' }).click()
  await page.getByLabel('Nome do distrito').fill('Distrito Fictício da Leitura')
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByRole('button', { name: 'Cadastrar manualmente' }).click()
  await page.getByRole('link', { name: 'Ir para o início' }).click()
}

test('um livro lido meses atrás entra no mês em que foi lido', async ({ page }) => {
  test.setTimeout(120_000)
  await entrar(page)

  await navigateInsideApp(page, '/app/leitura', page.getByRole('heading', { name: 'Leitura', exact: true }))
  await page.getByRole('button', { name: 'Adicionar livro' }).first().click()

  /*
    Livro fictício, lido em fevereiro e cadastrado agora. Antes, a conclusão era
    carimbada com a data de hoje e o tempo só existia dentro de uma sessão que o
    pastor não tinha como criar no passado — fevereiro fechava sem a leitura
    que houve.
  */
  await page.getByLabel('Título').fill('Livro Fictício de Fevereiro')
  await page.getByLabel('Autor').fill('Autora Fictícia')
  await page.getByLabel('Data de início').fill('2026-02-03')
  await page.getByLabel('Data de conclusão').fill('2026-02-20')
  await page.getByLabel('Páginas lidas').fill('180')
  await page.getByLabel('Tempo de leitura (minutos)').fill('420')

  // Informar a conclusão já marca o livro como concluído.
  await expect(page.getByLabel('Situação')).toHaveValue('completed')

  await page.getByRole('button', { name: 'Salvar livro' }).click()
  await expect(page.getByText('Livro e leitura registrados.')).toBeVisible()

  /*
    O livro entra como concluído, e a sessão nasce em fevereiro. O histórico da
    tela mostra o mês corrente, então fevereiro não aparece ali — e é assim que
    tem de ser. O que se confere aqui é que o registro existe e está concluído;
    a data da sessão é garantida em `sessaoDoRegistroRetroativo`.
  */
  await expect(page.getByText('Livro Fictício de Fevereiro').first()).toBeVisible()
  await expect(page.getByText('Concluído').first()).toBeVisible()

  /*
    E a leitura pode ser reencontrada: o histórico tem mês próprio. Sem isso,
    ela existia, contava no ano, e sumia da tela para sempre.
  */
  await page.getByRole('button', { name: 'Histórico de leituras' }).click()
  await page.locator('#reading-history-month').fill('2026-02')
  await expect(page.getByText('420 minuto(s)', { exact: false })).toBeVisible()
})

test('a conclusão não pode ser antes do começo', async ({ page }) => {
  test.setTimeout(120_000)
  await entrar(page)

  await navigateInsideApp(page, '/app/leitura', page.getByRole('heading', { name: 'Leitura', exact: true }))
  await page.getByRole('button', { name: 'Adicionar livro' }).first().click()
  await page.getByLabel('Título').fill('Livro Fictício Impossível')
  await page.getByLabel('Autor').fill('Autora Fictícia')
  await page.getByLabel('Data de início').fill('2026-02-20')
  await page.getByLabel('Data de conclusão').fill('2026-02-03')
  await page.getByRole('button', { name: 'Salvar livro' }).click()

  await expect(page.getByRole('alert')).toContainText('não pode ser antes')
})
