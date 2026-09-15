import { expect, test, type Locator, type Page } from '@playwright/test'
import { navigateInsideApp } from './navigation'

/*
  Revisar correções encontradas: a análise roda ao abrir, mas nada é removido,
  unido ou alterado sem a confirmação do pastor. Cada correção pode ser aplicada,
  mantida separada ou desfeita, e tudo continua certo depois de recarregar.
*/
test.use({ timezoneId: 'America/Sao_Paulo' })

const email = 'revisar.correcoes.e2e@example.invalid'
const password = 'senha-ficticia-revisao-2026'
const IGREJA = 'Igreja Modelo Fictícia'
const PRIMAVERA = 'Primavera Fictícia'
const COLHEITA = 'Semana de Colheita Fictícia'
const JOVEM = 'Evangelismo Jovem Fictício'

async function tocar(alvo: Locator) {
  await alvo.evaluate((elemento) => elemento.scrollIntoView({ block: 'center' }))
  await alvo.click()
}

async function registrar(page: Page) {
  await page.goto('/acesso')
  await page.getByLabel('E-mail').fill(email)
  await page.getByRole('textbox', { name: 'Senha' }).fill(password)
  await page.getByRole('button', { name: 'Criar conta' }).click()
  await page.getByRole('button', { name: 'Já guardei em local seguro' }).click()
  await page.getByLabel('Nome do distrito').fill('Distrito Fictício da Revisão')
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByRole('button', { name: 'Cadastrar manualmente' }).click()
  await page.getByRole('link', { name: 'Ir para o início' }).click()
  await navigateInsideApp(page, '/app/distrito/igrejas/nova', page.getByLabel(/Nome da igreja/))
  await page.getByLabel(/Nome da igreja/).fill(IGREJA)
  await page.getByLabel(/Tipo/).selectOption('organized_church')
  await page.getByRole('button', { name: 'Salvar igreja' }).click()
  await expect(page.getByRole('heading', { name: IGREJA })).toBeVisible()
}

async function entrarDeNovo(page: Page) {
  await page.reload()
  await page.getByRole('textbox', { name: 'Senha' }).fill(password)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page.locator('.app-shell')).toBeVisible()
}

async function criarCampanha(page: Page, nome: string, inicio: string, fim: string) {
  await navigateInsideApp(page, '/app/evangelismo/nova', page.getByLabel('Nome da campanha'))
  await page.getByLabel('Nome da campanha').fill(nome)
  await page.getByLabel('Data de início').fill(inicio)
  await page.getByLabel('Data de término').fill(fim)
  await page.getByLabel('Responsável geral').fill('Responsável Fictício')
  await page.getByLabel('Meta de estudos bíblicos').fill('30')
  await page.getByLabel('Meta de batismos').fill('5')
  await tocar(page.getByRole('button', { name: IGREJA, exact: true }))
  await tocar(page.getByRole('button', { name: 'Salvar campanha e Agenda' }))
  await expect(page.getByRole('heading', { name: nome, level: 1 })).toBeVisible()
}

/** Meta com o nome da campanha e fim em 31/12 — o que as tentativas antigas deixavam. */
async function criarMetaRepetida(page: Page, titulo: string, ligacao: 'Estudos Bíblicos' | 'Batismos', inicio: string) {
  await navigateInsideApp(page, '/app/planejamento/nova?ano=2026', page.getByRole('heading', { name: 'Nova meta do planejamento' }))
  await page.getByLabel('Título').fill(titulo)
  await page.getByLabel('Ligar a uma meta acompanhada (opcional)').selectOption({ label: ligacao })
  await page.getByLabel('Data de início').fill(inicio)
  await page.getByLabel('Data de fim').fill('2026-12-31')
  await tocar(page.getByRole('button', { name: 'Salvar meta' }))
  await expect(page.getByRole('heading', { name: titulo, level: 1 })).toBeVisible()
}

/** Pelo endereço: no celular, o link do menu lateral não assenta depois de o relógio simulado andar. */
async function abrirPlanejamento(page: Page) {
  await page.evaluate(() => { window.history.pushState({}, '', '/app/planejamento'); window.dispatchEvent(new PopStateEvent('popstate')) })
  await expect(page.getByRole('heading', { name: 'Calendário Anual' })).toBeVisible()
}

const totalDeMetas = (page: Page) => page.getByRole('region', { name: 'Resumo do planejamento' }).locator('div').filter({ hasText: /^Metas/ }).locator('strong')
const grupo = (page: Page, titulo: string) => page.getByRole('article', { name: `Correção de ${titulo}` })
const grupos = (page: Page) => page.locator('.revisao-grupo')

test('revisar, manter separados, aplicar, desfazer e recarregar, sem nenhuma exclusão antes da confirmação', async ({ page }) => {
  test.setTimeout(300_000)
  await page.clock.install({ time: new Date('2026-09-15T10:00:00-03:00') })
  await registrar(page)

  await criarCampanha(page, PRIMAVERA, '2026-09-11', '2026-09-20')
  await criarCampanha(page, COLHEITA, '2026-09-13', '2026-09-19')
  await criarCampanha(page, JOVEM, '2026-10-04', '2026-10-10')
  await criarMetaRepetida(page, PRIMAVERA, 'Estudos Bíblicos', '2026-09-11')
  await criarMetaRepetida(page, PRIMAVERA, 'Batismos', '2026-09-11')
  await criarMetaRepetida(page, COLHEITA, 'Estudos Bíblicos', '2026-09-13')
  await criarMetaRepetida(page, JOVEM, 'Batismos', '2026-10-04')
  // Uma anotação do pastor: esta meta não pode ser apagada.
  const enderecoDaMetaAnotada = new URL(page.url()).pathname
  await page.getByLabel('O que será feito').fill('Plano fictício preservado')
  await page.getByRole('heading', { name: JOVEM, level: 1 }).click()
  await expect(page.getByText('Plano de ação atualizado.').or(page.getByRole('status')).first()).toBeVisible()

  // Prévia: abrir Evangelismo e Planejamento, e recarregar, não muda nada.
  await navigateInsideApp(page, '/app/evangelismo', page.getByRole('heading', { name: 'Campanhas', exact: true }))
  await expect(page.getByRole('link', { name: 'Revisar correções encontradas (3)' })).toBeVisible()
  await abrirPlanejamento(page)
  await expect(grupos(page)).toHaveCount(3)
  await expect(totalDeMetas(page)).toHaveText('10')
  const primavera = grupo(page, PRIMAVERA)
  await expect(primavera).toContainText('Registro principal · mantido')
  await expect(primavera).toContainText('11/09/2026 a 20/09/2026')
  await expect(primavera).toContainText('11/09/2026 a 31/12/2026')
  await expect(primavera).toContainText(IGREJA)
  await expect(primavera).toContainText('Evangelismo')
  await expect(primavera).toContainText('Motivo')
  await expect(primavera.locator('dl')).toContainText('Removido')
  await expect(grupo(page, JOVEM)).toContainText('Preservar e ligar à campanha')
  await expect(grupo(page, JOVEM)).toContainText('Anotações, resultados e plano')
  await expect(page.getByRole('button', { name: 'Desfazer limpeza' })).toHaveCount(0)
  await entrarDeNovo(page)
  await abrirPlanejamento(page)
  await expect(grupos(page)).toHaveCount(3)
  await expect(totalDeMetas(page)).toHaveText('10')

  // Manter separados.
  await tocar(grupo(page, COLHEITA).getByRole('button', { name: 'Manter separados' }))
  await expect(page.getByRole('status').filter({ hasText: 'Registros mantidos separados.' })).toBeVisible()
  await expect(grupos(page)).toHaveCount(2)
  await expect(totalDeMetas(page)).toHaveText('10')

  // Aplicar uma correção.
  await tocar(grupo(page, PRIMAVERA).getByRole('button', { name: 'Aplicar correção' }))
  await expect(page.getByRole('status').filter({ hasText: 'Correção aplicada: 2 meta(s) removida(s)' })).toBeVisible()
  await expect(grupos(page)).toHaveCount(1)
  await expect(totalDeMetas(page)).toHaveText('8')
  await expect(page.getByRole('button', { name: 'Desfazer limpeza' })).toBeVisible()

  // Recarregar: a decisão e a cópia de segurança continuam.
  await entrarDeNovo(page)
  await abrirPlanejamento(page)
  await expect(grupos(page)).toHaveCount(1)
  await expect(grupo(page, COLHEITA)).toHaveCount(0)
  await expect(totalDeMetas(page)).toHaveText('8')

  // Aplicar todas as correções seguras: a meta anotada é ligada, e não removida.
  await tocar(page.getByRole('button', { name: 'Aplicar todas as correções seguras (1)' }))
  await expect(page.getByRole('status').filter({ hasText: 'Correção aplicada: 0 meta(s) removida(s), 1 ligada(s)' })).toBeVisible()
  await expect(grupos(page)).toHaveCount(0)
  await expect(totalDeMetas(page)).toHaveText('8')
  await expect(page.locator('.planning-campaign-row').filter({ hasText: JOVEM })).toHaveCount(1)
  await navigateInsideApp(page, enderecoDaMetaAnotada, page.getByLabel('O que será feito'))
  await expect(page.getByLabel('O que será feito')).toHaveValue('Plano fictício preservado')

  // Desfazer, uma limpeza por vez.
  await abrirPlanejamento(page)
  await tocar(page.getByRole('button', { name: 'Desfazer limpeza' }))
  await expect(page.getByRole('status').filter({ hasText: 'Limpeza desfeita' })).toBeVisible()
  await expect(grupos(page)).toHaveCount(1)
  await tocar(page.getByRole('button', { name: 'Desfazer limpeza' }))
  await expect(grupos(page)).toHaveCount(2)
  await expect(totalDeMetas(page)).toHaveText('10')
  await expect(page.getByRole('button', { name: 'Desfazer limpeza' })).toHaveCount(0)
  await entrarDeNovo(page)
  await abrirPlanejamento(page)
  await expect(grupos(page)).toHaveCount(2)
  await expect(totalDeMetas(page)).toHaveText('10')

  // Filtros e totais usam a mesma situação dos cartões.
  await navigateInsideApp(page, '/app/evangelismo', page.getByRole('heading', { name: 'Campanhas', exact: true }))
  const total = (rotulo: string) => page.locator('.evangelism-metrics > div').filter({ has: page.locator('small', { hasText: new RegExp(`^${rotulo}$`, 'u') }) }).locator('strong')
  await expect(total('Em andamento')).toHaveText('2')
  await expect(total('Próximas')).toHaveText('1')
  await expect(total('Data não informada')).toHaveText('0')
  await page.getByRole('combobox', { name: 'Situação' }).selectOption({ label: 'Em andamento' })
  await expect(page.locator('.campaign-card')).toHaveCount(2)
  await expect(page.locator('.campaign-card .entity-badge')).toHaveText(['Em andamento', 'Em andamento'])
  await page.getByRole('combobox', { name: 'Situação' }).selectOption({ label: 'Próxima' })
  await expect(page.locator('.campaign-card')).toHaveCount(1)
  await expect(page.locator('.campaign-card')).toContainText(JOVEM)
})
