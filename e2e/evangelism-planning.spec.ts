import { expect, test, type Page } from '@playwright/test'
import { addDays, futureDate, isoDate, today } from './dates'
import { navigateInsideApp } from './navigation'

async function registerWithFictitiousDistrict(page: Page) {
  await page.goto('/acesso')
  await page.getByLabel('E-mail').fill('planejamento.evangelismo.e2e@example.invalid')
  await page.getByRole('textbox', { name: 'Senha' }).fill('senha-ficticia-planejamento-2026')
  await page.getByRole('button', { name: 'Criar conta' }).click()
  await page.getByRole('button', { name: 'Já guardei em local seguro' }).click()
  await page.getByLabel('Nome do distrito').fill('Distrito Fictício do Planejamento')
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByRole('button', { name: 'Cadastrar manualmente' }).click()
  await page.getByRole('link', { name: 'Ir para o início' }).click()
  await navigateInsideApp(page, '/app/distrito/igrejas/nova', page.getByLabel(/Nome da igreja/))
  await page.getByLabel(/Nome da igreja/).fill('Igreja Modelo Fictícia')
  await page.getByLabel(/Tipo/).selectOption('organized_church')
  await page.getByRole('button', { name: 'Salvar igreja' }).click()
  await expect(page.getByRole('heading', { name: 'Igreja Modelo Fictícia' })).toBeVisible()
}

test('planeja uma meta e uma campanha integradas no computador e no celular', async ({ page }) => {
  // A Agenda abre na semana corrente, de domingo a sábado. A campanha começa
  // hoje para que o compromisso principal caia sempre dentro dessa semana; o
  // ponto fica no dia seguinte para não colidir com o horário da campanha.
  const campaignStart = today()

  await registerWithFictitiousDistrict(page)
  await navigateInsideApp(page, '/app/planejamento', page.getByText('Igreja Modelo Fictícia', { exact: true }))
  await expect(page.getByRole('heading', { name: 'Planejamento Anual' })).toBeVisible()
  await page.getByRole('link', { name: 'Nova meta do planejamento' }).click()
  await page.getByLabel('Título').fill('Meta Fictícia do Planejamento')
  await page.getByLabel('Data de início').fill(isoDate(today()))
  await page.getByLabel('Data de fim').fill(isoDate(futureDate(90)))
  await page.getByLabel('Quantidade esperada').fill('12')
  await page.getByRole('button', { name: 'Salvar meta' }).click()

  // O acompanhamento abre sozinho depois de salvar: a meta é do distrito e as
  // igrejas, o plano, o orçamento e a agenda entram aqui.
  await expect(page.getByRole('heading', { name: 'Meta Fictícia do Planejamento' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '1. Resumo' })).toBeVisible()

  await page.getByLabel('Meta de Igreja Modelo Fictícia').fill('5')
  await page.getByRole('heading', { name: '3. Plano de ação' }).click()
  await expect(page.getByText('A soma das igrejas está diferente da meta do distrito.')).toBeVisible()

  await page.getByLabel('O que será feito').fill('Visitar as famílias fictícias do distrito')
  await page.getByLabel('Nova tarefa da lista').fill('Combinar as duplas fictícias')
  await page.getByRole('button', { name: 'Adicionar' }).click()
  await expect(page.getByText('Combinar as duplas fictícias')).toBeVisible()

  await page.getByLabel('Item', { exact: true }).fill('Material fictício da meta')
  await page.getByLabel('Previsto').fill('300')
  await page.getByLabel('Gasto').fill('120')
  await page.getByRole('button', { name: 'Somar ao orçamento' }).click()
  await expect(page.getByText('Previsto R$ 300,00 · Gasto R$ 120,00')).toBeVisible()

  await page.getByLabel('Resultado de Jan').fill('3')
  await page.getByRole('heading', { name: '6. Acompanhamento' }).click()
  await expect(page.getByText('25% da meta')).toBeVisible()

  await page.getByRole('link', { name: 'Criar campanha para esta meta' }).click()
  await page.getByLabel('Nome da campanha').fill('Campanha Fictícia Integrada')
  await page.getByLabel('Data de início').fill(isoDate(campaignStart))
  await page.getByLabel('Data de término').fill(isoDate(addDays(campaignStart, 7)))
  await page.getByLabel('Responsável geral').fill('Responsável Fictício')
  await page.getByText('Igreja Modelo Fictícia', { exact: true }).click()

  // Toda campanha nasce ligada a uma meta de estudos bíblicos e a uma de batismos.
  await page.locator('#campaign-goal-bible_studies').selectOption('nova')
  await page.getByLabel('Título da meta de estudos bíblicos').fill('Meta Fictícia de Estudos')
  await page.locator('#campaign-goal-baptisms').selectOption('nova')
  await page.getByLabel('Título da meta de batismos').fill('Meta Fictícia de Batismos')

  await page.getByRole('button', { name: 'Salvar campanha e Agenda' }).click()
  await expect(page.getByRole('heading', { name: 'Campanha Fictícia Integrada' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Metas vinculadas à campanha' })).toBeVisible()
  await expect(page.getByText('Meta Fictícia de Estudos')).toBeVisible()
  await expect(page.getByText('Meta Fictícia de Batismos')).toBeVisible()

  await page.getByLabel('Nome do ponto').fill('Ponto Fictício Central')
  await page.locator('#point-date').fill(isoDate(addDays(campaignStart, 1)))
  await page.locator('#point-responsible').fill('Pessoa Fictícia A')
  await page.getByRole('button', { name: 'Adicionar ponto e Agenda' }).click()
  await expect(page.getByText('Ponto Fictício Central')).toBeVisible()

  await page.getByLabel('Título da tarefa').fill('Preparar recepção fictícia')
  await page.getByLabel('Prazo').last().fill(isoDate(addDays(campaignStart, 2)))
  await page.getByText('Aparecer como lembrete na Agenda').click()
  await page.getByRole('button', { name: 'Criar tarefa' }).click()
  await expect(page.locator('.campaign-task-list article').filter({ hasText: 'Preparar recepção fictícia' })).toBeVisible()

  await page.getByLabel('Descrição', { exact: true }).fill('Material fictício')
  await page.getByLabel('Valor', { exact: true }).fill('120')
  await page.getByRole('button', { name: 'Adicionar item' }).click()
  await expect(page.getByText('Material fictício')).toBeVisible()

  await navigateInsideApp(page, '/app/agenda', page.getByRole('heading', { name: 'Agenda', exact: true }))
  await expect(page.getByText('Campanha Fictícia Integrada').first()).toBeVisible()
  const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
  expect(horizontalOverflow).toBe(false)
})
