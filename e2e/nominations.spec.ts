import { expect, test, type Page } from '@playwright/test'

async function prepare(page: Page) {
  await page.goto('/acesso')
  await page.getByRole('tab', { name: 'Criar conta' }).click()
  await page.getByLabel('E-mail').fill('nomeacoes.e2e@example.invalid')
  await page.getByLabel('Senha').fill('senha-ficticia-nomeacoes-2027')
  await page.getByRole('button', { name: 'Criar conta' }).click()
  await page.getByRole('button', { name: 'Já guardei em local seguro' }).click()
  await page.getByLabel('Nome do distrito').fill('Distrito Fictício de Nomeações')
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByRole('button', { name: 'Cadastrar manualmente' }).click()
  await page.getByRole('link', { name: 'Revisar igrejas' }).click()
  await page.getByRole('link', { name: 'Nova igreja' }).click()
  await page.getByLabel('Nome da igreja *').fill('Igreja Fictícia de Nomeações')
  await page.getByLabel('Tipo *').selectOption('organized_church')
  await page.getByRole('button', { name: 'Salvar igreja' }).click()

  for (const name of [
    'Pessoa Fictícia Alfa',
    'Pessoa Fictícia Beta',
    'Pessoa Fictícia Gama',
  ]) {
    await page.locator('a[href="/app/pessoas"]').first().click()
    await page.getByRole('link', { name: 'Nova pessoa' }).click()
    await page.getByLabel('Nome completo *').fill(name)
    await page.getByRole('button', { name: 'Salvar pessoa' }).click()
  }
}

test('jornada completa e confidencial da Comissão de Nomeações', async ({ page }) => {
  await prepare(page)
  await page.locator('a[href="/app/comissoes"]').first().click()
  await page.getByRole('link', { name: 'Abrir Nomeações' }).click()
  await page.getByRole('button', { name: 'Preparar demonstração fictícia de Nomeações' }).click()

  await expect(page.getByRole('heading', { name: /Nomeações/ })).toBeVisible()

  await page.getByRole('button', { name: 'Formação' }).click()
  await expect(page.getByLabel('Quórum')).toHaveValue('3')
  await expect(page.getByLabel('Pessoa Fictícia Alfa').last()).toBeChecked()

  await page.getByRole('button', { name: 'Cargos' }).click()
  await expect(page.getByText('Ancião(ã)').first()).toBeVisible()

  await page.getByRole('button', { name: 'Indicações' }).click()
  await expect(page.getByText(/não consta como dizimista regular/)).toBeVisible()
  await expect(page.getByText(/Recomendação aprovada/)).toBeVisible()

  await page.getByRole('button', { name: 'Reuniões' }).click()
  await expect(page.getByText(/Registro confidencial/)).toBeVisible()
  await expect(page.getByText(/Na Agenda/)).toBeVisible()

  await page.getByRole('button', { name: 'Relatório e objeções' }).click()
  await expect(page.getByText(/versão 2/)).toBeVisible()
  await expect(page.locator('.public-report')).not.toContainText('dizimista')
  await expect(page.locator('.public-report')).not.toContainText('confidencial')
  await expect(page.getByText('Relatório alterado')).toBeVisible()

  await page.getByRole('button', { name: 'Votação oficial' }).click()
  await expect(page.getByText('Relatório aprovado').first()).toBeVisible()
  await expect(page.getByText(/VOTADO aprovar e registrar/)).toBeVisible()

  await page.getByRole('button', { name: 'Vagas e pendências' }).click()
  await expect(page.getByText('Vaga em preenchimento').first()).toBeVisible()
  await expect(page.getByText(/na Agenda pastoral/)).toBeVisible()
})
