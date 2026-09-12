import { expect, test, type Page } from '@playwright/test'
import { navigateInsideApp } from './navigation'
import { relatorioIntegradoFicticio } from './pdfFicticio'

const email = 'pastor.relatorio@example.invalid'
const password = 'senha-ficticia-segura-2026'

async function entrar(page: Page) {
  await page.goto('/acesso')
  await page.getByLabel('E-mail').fill(email)
  await page.getByRole('textbox', { name: 'Senha' }).fill(password)
  await page.getByRole('button', { name: 'Criar conta' }).click()
  await page.getByRole('button', { name: 'Já guardei em local seguro' }).click()
  await page.getByLabel('Nome do distrito').fill('Distrito Fictício do Relatório')
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByRole('button', { name: 'Cadastrar manualmente' }).click()
  await page.getByRole('link', { name: 'Ir para o início' }).click()
  await expect(page.getByRole('heading', { name: 'Visão do distrito' })).toBeVisible()
}

async function cadastrarIgreja(page: Page, nome: string) {
  await navigateInsideApp(page, '/app/distrito', page.getByRole('heading', { name: 'Distrito Fictício do Relatório' }))
  await page.getByRole('link', { name: 'Nova igreja' }).click()
  await page.getByLabel(/Nome da igreja/).fill(nome)
  await page.getByLabel(/Tipo/).selectOption('organized_church')
  await page.getByRole('button', { name: 'Salvar igreja' }).click()
  await expect(page.getByRole('heading', { name: nome, exact: true })).toBeVisible()
}

async function enviarPdf(page: Page, arquivo: string, conteudo: Buffer) {
  await page.getByLabel('Arquivo').setInputFiles({ name: arquivo, mimeType: 'application/pdf', buffer: conteudo })
}

const NORTE = { nome: 'Fictícia do Norte', alunos: ['0', '2', '4', '4', '3', '6', '6', '9', '2', '2', '38'] }

test('o Relatório Integrado entra trimestre a trimestre, e o número fora do padrão espera confirmação', async ({ page }) => {
  test.setTimeout(240_000)
  await entrar(page)
  await cadastrarIgreja(page, NORTE.nome)

  await navigateInsideApp(page, '/app/metas/relatorio-integrado', page.getByRole('heading', { name: 'Relatório Integrado' }))

  /*
    Primeiro trimestre. Nada com que comparar ainda, então nada interrompe: os
    números entram como vieram.
  */
  await enviarPdf(page, 'primeiro-ficticio.pdf', relatorioIntegradoFicticio(1, [
    { ...NORTE, pequenosGrupos: '5', campanhas: '1' },
  ]))
  await expect(page.getByRole('heading', { name: /1º trimestre de 2026 · primeiro-ficticio\.pdf/ })).toBeVisible()
  await page.getByRole('checkbox', { name: /Conferi os números/ }).check()
  await page.getByRole('button', { name: /Gravar 1º trimestre de 2026/ }).click()
  await expect(page.getByText('1º trimestre de 2026 gravado para 1 igreja(s).')).toBeVisible()

  // O que ficou guardado aparece pelo valor do distrito.
  await expect(page.getByRole('cell', { name: 'Número de Pequenos Grupos da igreja.' })).toBeVisible()

  /*
    Segundo trimestre com 45 onde havia 5. É erro de digitação típico, e gravá-lo
    em silêncio estragaria o total do distrito sem deixar rastro.
  */
  await enviarPdf(page, 'segundo-ficticio.pdf', relatorioIntegradoFicticio(2, [
    { ...NORTE, pequenosGrupos: '45', campanhas: '2' },
  ]))
  await expect(page.getByRole('heading', { name: /2º trimestre de 2026/ })).toBeVisible()
  await expect(page.getByText('Valores fora do padrão')).toBeVisible()
  await expect(page.getByText('1º trimestre de 2026: 5 · agora: 45')).toBeVisible()

  // Recusar o número: ele não é gravado, e o indicador segue valendo o trimestre anterior.
  await page.getByRole('checkbox', { name: /Não gravar este número/ }).check()
  await page.getByRole('checkbox', { name: /Conferi os números/ }).check()
  await page.getByRole('button', { name: /Gravar 2º trimestre de 2026/ }).click()
  await expect(page.getByText('2º trimestre de 2026 gravado para 1 igreja(s).')).toBeVisible()

  await expect(page.getByText('5 Pequenos Grupos')).toBeVisible()
})

test('igreja sem relatório não é zerada, e o traço não vira zero', async ({ page }) => {
  test.setTimeout(240_000)
  await entrar(page)
  await cadastrarIgreja(page, NORTE.nome)
  await cadastrarIgreja(page, 'Fictícia do Sul')

  await navigateInsideApp(page, '/app/metas/relatorio-integrado', page.getByRole('heading', { name: 'Relatório Integrado' }))
  await enviarPdf(page, 'apenas-norte-ficticio.pdf', relatorioIntegradoFicticio(1, [
    { ...NORTE, pequenosGrupos: '5', campanhas: '1' },
  ]))

  // A do Sul não entregou: continua ativa, e não passa a ter zero.
  await expect(page.getByText('Igrejas sem relatório neste trimestre')).toBeVisible()
  await expect(page.getByText('Continua ativa.', { exact: false })).toBeVisible()

  /*
    "Classes Bíblicas em funcionamento" veio com traço: fica sem informação, e
    não como zero. O resumo é um <summary>, que o navegador não expõe como
    botão — por texto é como se chega nele.
  */
  await page.getByText(/indicador\(es\) sem informação/).click()
  await expect(page.getByText('Número de Classes Bíblicas em funcionamento.')).toBeVisible()
})
