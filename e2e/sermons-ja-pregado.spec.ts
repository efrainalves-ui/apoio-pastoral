import { expect, test, type Page } from '@playwright/test'
import { navigateInsideApp } from './navigation'

const email = 'pastor.japregado@example.invalid'
const password = 'senha-ficticia-segura-2026'
const DISTRITO = 'Distrito Fictício das Pregações'

async function entrar(page: Page) {
  await page.goto('/acesso')
  await page.getByLabel('E-mail').fill(email)
  await page.getByRole('textbox', { name: 'Senha' }).fill(password)
  await page.getByRole('button', { name: 'Criar conta' }).click()
  await page.getByRole('button', { name: 'Já guardei em local seguro' }).click()
  await page.getByLabel('Nome do distrito').fill(DISTRITO)
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByRole('button', { name: 'Cadastrar manualmente' }).click()
  await page.getByRole('link', { name: 'Ir para o início' }).click()
  await expect(page.getByRole('heading', { name: 'Visão do distrito' })).toBeVisible()
}

async function cadastrarIgreja(page: Page, nome: string) {
  await navigateInsideApp(page, '/app/distrito', page.getByRole('heading', { name: DISTRITO }))
  await page.getByRole('link', { name: 'Nova igreja' }).click()
  await page.getByLabel(/Nome da igreja/).fill(nome)
  await page.getByLabel(/Tipo/).selectOption('organized_church')
  await page.getByRole('button', { name: 'Salvar igreja' }).click()
  await expect(page.getByRole('heading', { name: nome, exact: true })).toBeVisible()
}

async function contarRegistros(page: Page, tipo: string): Promise<number> {
  return page.evaluate((recordType) => new Promise<number>((resolve, reject) => {
    const pedido = indexedDB.open('apoio-pastoral')
    pedido.onerror = () => reject(new Error(pedido.error?.message ?? 'Banco local não abriu.'))
    pedido.onsuccess = () => {
      const leitura = pedido.result.transaction('vaultRecords').objectStore('vaultRecords').getAll()
      leitura.onerror = () => reject(new Error(leitura.error?.message ?? 'Leitura do banco local falhou.'))
      leitura.onsuccess = () => {
        resolve((leitura.result as Array<{ recordType: string; deletedAt?: string }>).filter((registro) => registro.recordType === recordType && !registro.deletedAt).length)
        pedido.result.close()
      }
    }
  }), tipo)
}

test('o sermão pregado antes do aplicativo entra no histórico sem data e sem compromisso na Agenda', async ({ page }) => {
  test.setTimeout(180_000)
  await entrar(page)
  for (const nome of ['Fictícia A', 'Fictícia B', 'Fictícia C']) await cadastrarIgreja(page, nome)

  await navigateInsideApp(page, '/app/sermoes/novo', page.getByLabel('Título'))
  await page.getByLabel('Título').fill('Graça fictícia')
  await page.getByLabel('Texto bíblico principal').fill('Efésios 2:8')
  await page.getByRole('button', { name: 'Salvar sermão' }).click()
  await expect(page.getByRole('heading', { name: 'Graça fictícia', level: 1 })).toBeVisible()

  // Uma igreja, sem data.
  await page.getByRole('button', { name: 'Marcar como já pregado' }).click()
  const painel = page.getByRole('dialog')
  await painel.getByLabel('Uma igreja do distrito').check()
  await painel.getByRole('combobox').selectOption({ label: 'Fictícia A' })
  const marcar = painel.getByRole('button', { name: 'Marcar como já pregado' })
  await expect(marcar).toBeDisabled()
  await painel.getByLabel('Não lembro a data').check()
  await expect(painel.getByLabel('Data', { exact: true })).toHaveValue('')
  await marcar.click()
  await expect(painel.getByRole('status')).toHaveText('Registrado em: Fictícia A.')

  // Todas as igrejas: a que já consta aparece e não é registrada de novo.
  await painel.getByLabel('Todas as igrejas ativas do distrito').check()
  await expect(painel.getByText('Já constam no histórico')).toBeVisible()
  await marcar.click()
  await expect(painel.getByRole('status')).toContainText('Registrado em: Fictícia B, Fictícia C.')
  await expect(painel.getByRole('status')).toContainText('Já constavam no histórico: Fictícia A.')
  await painel.getByRole('button', { name: 'Fechar' }).click()

  const historico = page.locator('.sermon-preaching-list li')
  await expect(historico).toHaveCount(3)
  await expect(historico.filter({ hasText: 'Data não informada' })).toHaveCount(3)

  // Lembrou a data depois.
  await page.getByRole('button', { name: 'Editar registro de Fictícia A' }).click()
  const linhaA = historico.filter({ hasText: 'Fictícia A' })
  await linhaA.getByLabel('Não lembro a data').uncheck()
  await linhaA.getByLabel('Data', { exact: true }).fill('2026-03-14')
  await linhaA.getByRole('button', { name: 'Salvar' }).click()
  await expect(historico.first()).toContainText('Fictícia A')
  await expect(historico.first()).toContainText('14/03/2026')

  page.once('dialog', (dialog) => void dialog.accept())
  await page.getByRole('button', { name: 'Remover registro de Fictícia C' }).click()
  await expect(historico).toHaveCount(2)
  await expect(historico.filter({ hasText: 'Fictícia C' })).toHaveCount(0)

  await navigateInsideApp(page, '/app/sermoes', page.getByRole('heading', { name: 'Sermões', level: 1 }))
  await expect(page.locator('.cartao-sermao').filter({ hasText: 'Graça fictícia' })).toContainText('Pregado 2x')

  expect(await contarRegistros(page, 'sermon_preaching')).toBe(2)
  expect(await contarRegistros(page, 'agenda_event')).toBe(0)
})
