import { expect, test, type Page } from '@playwright/test'
import { navigateInsideApp } from './navigation'

async function registerAndEnter(page: Page, email = 'ferramentas.pessoais.e2e@example.invalid') {
  await page.goto('/acesso')
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha').fill('senha-ficticia-ferramentas-2026')
  await page.getByRole('button', { name: 'Criar conta' }).click()
  await page.getByRole('button', { name: 'Já guardei em local seguro' }).click()
  await page.getByLabel('Nome do distrito').fill('Distrito Fictício das Ferramentas')
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByRole('button', { name: 'Cadastrar manualmente' }).click()
  await page.getByRole('link', { name: 'Ir para o início' }).click()
}

async function openMenuOnMobile(page: Page, projectName: string) {
  if (projectName === 'mobile-chromium') await page.getByRole('button', { name: 'Abrir menu' }).click()
}

function mainNavigation(page: Page) {
  return page.getByLabel('Navegação principal', { exact: true })
}

test('pedidos de oração, leitura e cerimônias são acessíveis no computador e no celular', async ({ page }, testInfo) => {
  await registerAndEnter(page)

  await openMenuOnMobile(page, testInfo.project.name)
  await mainNavigation(page).getByRole('link', { name: 'Pedidos de Oração', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Pedidos de Oração' })).toBeVisible()

  // Sem nenhum pedido, a tela mostra só o convite para cadastrar o primeiro.
  await expect(page.getByText('Cadastre seu primeiro pedido de oração.')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Acompanhamento' })).toHaveCount(0)
  await expect(page.getByLabel('Buscar por nome ou assunto')).toHaveCount(0)
  await expect(page.getByText('Em oração')).toHaveCount(0)

  await page.getByRole('button', { name: 'Novo pedido' }).click()
  await expect(page.locator('#prayer-kind')).toHaveValue('member')
  await expect(page.getByLabel('Pesquisar membro')).toHaveCount(0)

  await openMenuOnMobile(page, testInfo.project.name)
  await mainNavigation(page).getByRole('link', { name: 'Leitura', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Leitura' })).toBeVisible()
  await page.getByRole('button', { name: 'Adicionar livro' }).first().click()
  await page.getByLabel('Título').fill('Livro Fictício E2E')
  await page.getByLabel('Autor').fill('Autor Fictício E2E')
  await page.getByRole('button', { name: 'Salvar livro' }).click()

  // A lista fica compacta; os detalhes só aparecem ao tocar no livro.
  const livro = page.locator('.reading-list button.entity-row').filter({ hasText: 'Livro Fictício E2E' })
  await expect(livro).toBeVisible()
  await expect(page.getByRole('button', { name: 'Editar' })).toHaveCount(0)
  await livro.click()
  await expect(page.getByRole('button', { name: 'Editar' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Concluir' })).toBeVisible()
  await livro.click()
  await expect(page.getByRole('button', { name: 'Editar' })).toHaveCount(0)

  await openMenuOnMobile(page, testInfo.project.name)
  await mainNavigation(page).getByRole('link', { name: 'Agenda', exact: true }).click()
  await page.getByRole('link', { name: 'Novo compromisso' }).click()
  const category = page.getByLabel('Categoria')
  for (const label of ['Batismo', 'Santa Ceia', 'Casamento', 'Dedicação de criança']) {
    await category.selectOption({ label })
    await expect(page.getByRole('heading', { name: `Organização · ${label}` })).toBeVisible()
    await expect(page.getByLabel('Responsável')).toBeVisible()
    await expect(page.getByText('Checklist da cerimônia')).toBeVisible()
  }
})

test('acompanhamento dos pedidos abre por igreja, pessoa e pedido', async ({ page }) => {
  page.on('dialog', (dialog) => void dialog.accept())
  await registerAndEnter(page, 'oracao.acompanhamento.e2e@example.invalid')

  await navigateInsideApp(page, '/app/distrito/igrejas/nova', page.getByLabel(/Nome da igreja/))
  await page.getByLabel(/Nome da igreja/).fill('Igreja Fictícia da Oração')
  await page.getByLabel(/Tipo/).selectOption('organized_church')
  await page.getByRole('button', { name: 'Salvar igreja' }).click()
  await expect(page.getByRole('heading', { name: 'Igreja Fictícia da Oração' })).toBeVisible()

  await navigateInsideApp(page, '/app/pessoas/nova', page.getByLabel('Nome completo *'))
  await page.getByLabel('Nome completo *').fill('Membro Fictício da Oração')
  await page.getByLabel('Igreja *').selectOption({ label: 'Igreja Fictícia da Oração' })
  await page.getByRole('button', { name: 'Salvar pessoa' }).click()
  await expect(page.getByRole('heading', { name: 'Membro Fictício da Oração' })).toBeVisible()

  await navigateInsideApp(page, '/app/pedidos-oracao', page.getByRole('heading', { name: 'Pedidos de Oração' }))

  // Membro da igreja: a lista aparece sozinha depois de escolher a igreja.
  await page.getByRole('button', { name: 'Novo pedido' }).click()
  await page.locator('#prayer-church').selectOption({ label: 'Igreja Fictícia da Oração' })
  await page.locator('#prayer-member').selectOption({ label: 'Membro Fictício da Oração' })
  await page.getByLabel('Assunto ou motivo').fill('Motivo fictício do membro')
  await page.getByRole('button', { name: 'Salvar pedido' }).click()
  await expect(page.getByText('Pedido registrado.')).toBeVisible()

  await page.getByRole('button', { name: 'Novo pedido' }).click()
  await page.locator('#prayer-church').selectOption({ label: 'Igreja Fictícia da Oração' })
  await page.locator('#prayer-kind').selectOption('unregistered')
  await page.getByLabel('Nome da pessoa').fill('Visitante Fictício')
  await page.getByLabel('Assunto ou motivo').fill('Motivo fictício do visitante')
  await page.getByRole('button', { name: 'Salvar pedido' }).click()
  await expect(page.getByText('Pedido registrado.')).toBeVisible()

  await page.getByRole('button', { name: 'Novo pedido' }).click()
  await page.locator('#prayer-church').selectOption({ label: 'Igreja Fictícia da Oração' })
  await page.locator('#prayer-kind').selectOption('anonymous')
  await page.getByLabel('Assunto ou motivo').fill('Motivo fictício sem identificação')
  await page.getByRole('button', { name: 'Salvar pedido' }).click()
  await expect(page.getByText('Pedido registrado.')).toBeVisible()

  // A lista principal é leve: igreja, pessoas não cadastradas e sem identificação.
  await expect(page.getByRole('heading', { name: 'Acompanhamento' })).toBeVisible()
  await expect(page.getByText('Motivo fictício do membro')).toHaveCount(0)
  await expect(page.getByText('Pessoas não cadastradas')).toBeVisible()
  await expect(page.getByText('Pedidos sem identificação')).toBeVisible()

  await page.getByRole('button', { name: /Igreja Fictícia da Oração/ }).click()
  await page.getByRole('button', { name: /Membro Fictício da Oração/ }).click()
  await page.getByRole('button', { name: /Motivo fictício do membro/ }).click()

  await page.getByLabel('Nova atualização').fill('Conversamos e seguimos orando')
  await page.getByRole('button', { name: 'Registrar atualização' }).click()
  await expect(page.getByText('Conversamos e seguimos orando')).toBeVisible()
  await page.locator('#prayer-status').selectOption('answered')
  await expect(page.getByText('Pedido marcado como respondido.')).toBeVisible()
  await page.getByRole('button', { name: 'Encerrar' }).click()
  await expect(page.getByText('Pedido marcado como encerrado.')).toBeVisible()

  await page.getByRole('button', { name: 'Voltar' }).click()
  await page.getByRole('button', { name: 'Voltar' }).click()
  await page.getByRole('button', { name: 'Voltar' }).click()
  await page.getByRole('button', { name: /Pessoas não cadastradas/ }).click()
  await page.getByRole('button', { name: /Visitante Fictício/ }).click()
  await expect(page.getByText('Motivo fictício do visitante')).toBeVisible()

  await page.getByRole('button', { name: 'Voltar' }).click()
  await page.getByRole('button', { name: 'Voltar' }).click()
  await page.getByRole('button', { name: /Pedidos sem identificação/ }).click()
  await page.getByRole('button', { name: /Motivo fictício sem identificação/ }).click()
  await page.getByRole('button', { name: /Excluir pedido/ }).click()
  await expect(page.getByText('Pedido excluído.')).toBeVisible()
})
