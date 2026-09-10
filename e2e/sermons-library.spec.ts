import { expect, test, type Page } from '@playwright/test'
import { navigateInsideApp } from './navigation'

const email = 'pastor.sermoes@example.invalid'
const password = 'senha-ficticia-segura-2026'

const ESBOCOS: Array<[string, string, string, 'draft' | 'ready']> = [
  ['A cruz fictícia', '', 'Gálatas 6:13-16', 'draft'],
  ['Esperança fictícia em tempos difíceis', 'Sofrimento', 'Romanos 8:28', 'ready'],
  ['O maior mandamento fictício', 'Amor', 'Mateus 22:37-40', 'draft'],
]

async function register(page: Page) {
  await page.goto('/acesso')
  await page.getByLabel('E-mail').fill(email)
  await page.getByRole('textbox', { name: 'Senha' }).fill(password)
  await page.getByRole('button', { name: 'Criar conta' }).click()
  await page.getByRole('button', { name: 'Já guardei em local seguro' }).click()
  await page.getByLabel('Nome do distrito').fill('Distrito Fictício dos Sermões')
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByRole('button', { name: 'Cadastrar manualmente' }).click()
  await page.getByRole('link', { name: 'Ir para o início' }).click()
  await expect(page.getByRole('heading', { name: 'Visão do distrito' })).toBeVisible()
}

test('a biblioteca busca, filtra, ordena e guarda a exclusão no sermão aberto', async ({ page }) => {
  await register(page)

  for (const [titulo, tema, texto, situacao] of ESBOCOS) {
    await navigateInsideApp(page, '/app/sermoes/novo', page.getByLabel('Título'))
    await page.getByLabel('Título').fill(titulo)
    if (tema) await page.getByLabel('Tema').fill(tema)
    await page.getByLabel('Texto bíblico principal').fill(texto)
    await page.getByLabel('Situação').selectOption(situacao)
    await page.getByRole('button', { name: 'Salvar sermão' }).click()
    await expect(page.getByRole('heading', { name: titulo, level: 1 })).toBeVisible()
  }

  await navigateInsideApp(page, '/app/sermoes', page.getByRole('heading', { name: 'Sermões', level: 1 }))
  await expect(page.getByText('3 no acervo')).toBeVisible()

  // A sigla do livro substitui o mesmo ícone repetido em toda linha.
  await expect(page.getByText('GL', { exact: true })).toBeVisible()
  await expect(page.getByText('RM', { exact: true })).toBeVisible()

  // Os contadores dos filtros são lidos do acervo, não escritos à mão.
  const prontos = page.getByRole('button', { name: /^Prontos/ })
  await expect(prontos).toContainText('1')
  await expect(page.getByRole('button', { name: /^Nunca pregados/ })).toContainText('3')

  await prontos.click()
  await expect(page.getByText('Esperança fictícia em tempos difíceis')).toBeVisible()
  await expect(page.getByText('A cruz fictícia')).toHaveCount(0)
  await page.getByRole('button', { name: /^Todos/ }).click()

  const busca = page.getByLabel('Buscar título, tema ou texto bíblico')
  await busca.fill('esperanca')
  await expect(page.getByText('Esperança fictícia em tempos difíceis')).toBeVisible()
  await expect(page.getByText('A cruz fictícia')).toHaveCount(0)
  await busca.fill('mateus')
  await expect(page.getByText('O maior mandamento fictício')).toBeVisible()
  await busca.fill('nada disso existe')
  await expect(page.getByText('Nenhum sermão encontrado')).toBeVisible()
  await busca.fill('')

  await page.getByLabel('Ordenar por').selectOption('titulo')
  await expect(page.locator('.cartao-sermao').first()).toContainText('A cruz fictícia')

  /*
    A lixeira saiu de toda linha da lista — ação destrutiva exposta em cada
    registro é risco sem contrapartida. Ela passou a viver no sermão aberto,
    que é onde o pastor já está quando decide apagar.
  */
  await expect(page.locator('.cartao-sermao').first().getByRole('button')).toHaveCount(0)
  await page.locator('.cartao-sermao').first().click()
  await expect(page.getByRole('heading', { name: 'A cruz fictícia', level: 1 })).toBeVisible()

  page.once('dialog', (dialog) => void dialog.accept())
  await page.getByRole('button', { name: 'Excluir' }).click()
  await expect(page.getByRole('heading', { name: 'Sermões', level: 1 })).toBeVisible()
  await expect(page.getByText('2 no acervo')).toBeVisible()
  await expect(page.getByText('A cruz fictícia')).toHaveCount(0)
})
