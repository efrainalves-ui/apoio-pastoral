import { expect, test, type Page } from '@playwright/test'
import { navigateInsideApp } from './navigation'

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
  await expect(page.getByRole('heading', { name: 'Igreja Fictícia de Nomeações', exact: true })).toBeVisible()

  for (const name of [
    'Pessoa Fictícia Alfa',
    'Pessoa Fictícia Beta',
    'Pessoa Fictícia Gama',
  ]) {
    await navigateInsideApp(page, '/app/pessoas/nova', page.getByLabel('Nome completo *'))
    await page.getByLabel('Nome completo *').fill(name)
    await page.getByRole('button', { name: 'Salvar pessoa' }).click()
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible()
  }
}

test('jornada completa e confidencial da Comissão de Nomeações', async ({ page }) => {
  await prepare(page)
  await navigateInsideApp(page, '/app/comissoes', page.getByRole('heading', { name: 'Comissões', exact: true }))
  const nominationsChurch = page.getByRole('combobox', { name: /^Igreja(?:$|\s)/ })
  await expect(nominationsChurch).toContainText('Igreja Fictícia de Nomeações')
  await page.getByRole('link', { name: 'Abrir Nomeações' }).click()
  await expect(nominationsChurch).toContainText('Igreja Fictícia de Nomeações')
  await page.getByRole('button', { name: 'Preparar demonstração fictícia de Nomeações' }).click()

  await expect(page.getByRole('heading', { name: 'Comissão de Nomeações', exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Formação' }).click()
  await expect(page.getByLabel('Quórum')).toHaveValue('3')
  await expect(page.getByLabel('Pessoa Fictícia Alfa').last()).toBeChecked()

  await page.getByRole('button', { name: 'Cargos' }).click()
  await expect(page.getByText('Ancião(ã)').first()).toBeVisible()

  await page.getByRole('button', { name: 'Indicações' }).click()
  await expect(page.getByText(/não consta como dizimista regular/)).toBeVisible()
  await expect(page.getByText(/Recomendação aprovada/)).toBeVisible()

  await page.getByRole('button', { name: 'Reuniões' }).click()
  await expect(page.getByText('Registro confidencial', { exact: true })).toBeVisible()
  await expect(page.getByText(/Na Agenda/)).toBeVisible()

  await page.getByRole('button', { name: 'Relatório e objeções' }).click()
  await expect(page.getByText(/versão 2/)).toBeVisible()
  await expect(page.locator('.public-report')).not.toContainText('dizimista')
  await expect(page.locator('.public-report')).not.toContainText('confidencial')
  await expect(page.locator('.entity-row small').filter({ hasText: 'Relatório alterado' })).toBeVisible()

  await page.getByRole('button', { name: 'Votação oficial' }).click()
  await expect(page.getByText('Relatório aprovado').first()).toBeVisible()
  await expect(page.getByText(/VOTADO aprovar e registrar/)).toBeVisible()

  await page.getByRole('button', { name: 'Vagas e pendências' }).click()
  await expect(page.getByText('Vaga em preenchimento').first()).toBeVisible()
  await expect(page.getByText(/na Agenda pastoral/)).toBeVisible()
})
