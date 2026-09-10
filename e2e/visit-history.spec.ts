import { expect, test, type Page } from '@playwright/test'
import { navigateInsideApp } from './navigation'

const email = 'v1.evolucao.e2e@example.invalid'
const password = 'senha-ficticia-evolucao-2026'

async function foundation(page: Page) {
  await page.goto('/acesso')
  await page.getByLabel('E-mail').fill(email)
  await page.getByRole('textbox', { name: 'Senha' }).fill(password)
  await page.getByRole('button', { name: 'Criar conta' }).click()
  await page.getByRole('button', { name: 'Já guardei em local seguro' }).click()
  await page.getByLabel('Nome do distrito').fill('Distrito Evolução Fictício')
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByRole('button', { name: 'Cadastrar manualmente' }).click()
  await page.getByRole('link', { name: 'Ir para o início' }).click()
  await navigateInsideApp(page, '/app/distrito', page.getByRole('heading', { name: 'Distrito Evolução Fictício' }))
  await page.getByRole('link', { name: 'Nova igreja' }).click()
  await page.getByLabel(/Nome da igreja/).fill('Igreja Evolução Fictícia')
  await page.getByLabel(/Tipo/).selectOption('organized_church')
  await page.getByRole('button', { name: 'Salvar igreja' }).click()
  await expect(page.getByRole('heading', { name: 'Igreja Evolução Fictícia', exact: true })).toBeVisible()
  await navigateInsideApp(page, '/app/pessoas/nova', page.getByLabel(/Nome completo/))
  await page.getByLabel(/Nome completo/).fill('Pessoa Evolução Fictícia')
  await page.getByLabel(/Igreja/).selectOption({ label: 'Igreja Evolução Fictícia' })
  await page.getByRole('button', { name: 'Salvar pessoa' }).click()
  await expect(page.getByRole('heading', { name: 'Pessoa Evolução Fictícia', exact: true })).toBeVisible()
}

/** Abre o registro de visita e escolhe a igreja e o membro. */
async function abrirRegistro(page: Page) {
  await navigateInsideApp(page, '/app/visitacao', page.getByRole('heading', { name: 'Visitação', exact: true }))
  await navigateInsideApp(page, '/app/visitas/nova', page.getByRole('heading', { name: 'Igreja e quem você visitou' }))
  /*
    Pelo id, e não pelo rótulo: o `<label>` envolve o seletor, então o nome
    acessível calculado engorda com o texto de cada opção assim que a lista de
    igrejas chega — "Igreja" deixa de casar no meio do caminho.
  */
  const igreja = page.locator('#visit-church')
  await expect(igreja.locator('option', { hasText: 'Igreja Evolução Fictícia' })).toHaveCount(1)
  await igreja.selectOption({ label: 'Igreja Evolução Fictícia' })
  await page.getByLabel('Buscar membro').fill('Pessoa Evolução')
  await page.locator('.visit-members__results').getByRole('button', { name: 'Pessoa Evolução Fictícia' }).click()
}

/*
  Registrar a terceira visita de alguém sem ver as duas primeiras é registrar um
  retrato solto. O que o pastor precisa saber não é "como ele está", é "como ele
  está em relação à última vez": se a leitura da Bíblia subiu, ou se caiu. Por
  isso a tela avisa que a pessoa já foi visitada, e a resposta anterior fica
  encostada no campo enquanto ele responde a nova.
*/
test('a segunda visita mostra a resposta da primeira ao lado da nova', async ({ page }) => {
  test.setTimeout(180_000)
  await foundation(page)

  const pergunta = () => page.locator('.question-card').filter({ hasText: 'Você estudou a Bíblia hoje?' })

  await abrirRegistro(page)
  await expect(page.locator('.ja-visitados')).toHaveCount(0)
  await expect(pergunta().locator('.resposta-de-antes')).toHaveCount(0)
  await pergunta().getByRole('button', { name: 'Sim', exact: true }).click()
  await page.getByRole('button', { name: 'Finalizar visita' }).click()
  await expect(page.getByRole('heading', { name: 'Pessoa Evolução Fictícia', level: 1 })).toBeVisible()

  await abrirRegistro(page)
  const jaVisitado = page.locator('.ja-visitados')
  await expect(jaVisitado).toContainText('Pessoa Evolução Fictícia')
  await expect(jaVisitado).toContainText('Visitado 1 vez')
  await expect(jaVisitado.getByRole('link', { name: 'Ver a anterior' })).toBeVisible()

  const deAntes = pergunta().locator('.resposta-de-antes')
  await expect(deAntes).toContainText('Antes')
  await expect(deAntes).toContainText('Sim')

  // Responder diferente agora não mexe no que ficou registrado antes.
  await pergunta().getByRole('button', { name: 'Não', exact: true }).click()
  await expect(deAntes).toContainText('Sim')
  await page.getByRole('button', { name: 'Finalizar visita' }).click()
  await expect(page.getByRole('heading', { name: 'Pessoa Evolução Fictícia', level: 1 })).toBeVisible()

  // Na terceira, a comparação passa a ser com a segunda, que é a mais recente.
  await abrirRegistro(page)
  await expect(page.locator('.ja-visitados')).toContainText('Visitado 2 vezes')
  await expect(pergunta().locator('.resposta-de-antes')).toContainText('Não')
})
