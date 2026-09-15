import { expect, test, type Locator, type Page } from '@playwright/test'
import { navigateInsideApp } from './navigation'

/*
  Evangelismo é a fonte das campanhas; Planejamento Anual, Calendário Anual e
  Próximos eventos mostram a mesma campanha, uma vez, com o período dela.

  O dia é simulado (15/09/2026, em Brasília) para o cenário não depender de quando
  a suíte roda; o aplicativo continua usando o relógio e o fuso do aparelho.
*/
test.use({ timezoneId: 'America/Sao_Paulo' })

const email = 'campanhas.planejamento.e2e@example.invalid'
const password = 'senha-ficticia-campanhas-2026'
const IGREJA = 'Igreja Modelo Fictícia'

async function tocar(alvo: Locator) {
  // No celular o topo fixo cobre o que fica rente a ele.
  await alvo.evaluate((elemento) => elemento.scrollIntoView({ block: 'center' }))
  await alvo.click()
}

async function registrar(page: Page) {
  await page.goto('/acesso')
  await page.getByLabel('E-mail').fill(email)
  await page.getByRole('textbox', { name: 'Senha' }).fill(password)
  await page.getByRole('button', { name: 'Criar conta' }).click()
  await page.getByRole('button', { name: 'Já guardei em local seguro' }).click()
  await page.getByLabel('Nome do distrito').fill('Distrito Fictício das Campanhas')
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

interface NovaCampanha { nome: string; inicio: string; fim: string; comIgreja?: boolean }
async function preencherCampanha(page: Page, { nome, inicio, fim }: NovaCampanha) {
  await page.getByLabel('Nome da campanha').fill(nome)
  await page.getByLabel('Data de início').fill(inicio)
  await page.getByLabel('Data de término').fill(fim)
  await page.getByLabel('Responsável geral').fill('Responsável Fictício')
  await page.getByLabel('Meta de estudos bíblicos').fill('30')
  await page.getByLabel('Meta de batismos').fill('5')
}

async function criarCampanha(page: Page, campanha: NovaCampanha) {
  await navigateInsideApp(page, '/app/evangelismo/nova', page.getByLabel('Nome da campanha'))
  await preencherCampanha(page, campanha)
  await tocar(page.getByRole('button', { name: IGREJA, exact: true }))
  await tocar(page.getByRole('button', { name: 'Salvar campanha e Agenda' }))
  await expect(page.getByRole('heading', { name: campanha.nome, level: 1 })).toBeVisible()
}

const cartao = (page: Page, titulo: string) => page.locator('section.card').filter({ has: page.getByRole('heading', { name: titulo, exact: true }) })

async function abrirPlanejamento(page: Page) {
  await navigateInsideApp(page, '/app/planejamento', page.getByRole('heading', { name: 'Calendário Anual' }))
}

test('campanha única entre Evangelismo e Planejamento Anual, com período, situação, edição, exclusão e virada do dia', async ({ page }) => {
  test.setTimeout(240_000)
  await page.clock.install({ time: new Date('2026-09-15T10:00:00-03:00') })
  await registrar(page)

  // Uma tentativa recusada (sem igreja) não pode deixar metas repetidas no Planejamento.
  await navigateInsideApp(page, '/app/evangelismo/nova', page.getByLabel('Nome da campanha'))
  await preencherCampanha(page, { nome: 'Primavera Fictícia', inicio: '2026-09-11', fim: '2026-09-20' })
  await tocar(page.getByRole('button', { name: 'Salvar campanha e Agenda' }))
  await expect(page.getByText('Escolha ao menos uma igreja envolvida.')).toBeVisible()
  await tocar(page.getByRole('button', { name: IGREJA, exact: true }))
  await tocar(page.getByRole('button', { name: 'Salvar campanha e Agenda' }))
  await expect(page.getByRole('heading', { name: 'Primavera Fictícia', level: 1 })).toBeVisible()
  await expect(page.locator('.dashboard-metrics')).toContainText('Em andamento')
  await expect(page.locator('.dashboard-metrics')).toContainText('11–20 de set.')

  await criarCampanha(page, { nome: 'Semana de Colheita Fictícia', inicio: '2026-09-13', fim: '2026-09-19' })
  await criarCampanha(page, { nome: 'Campanha Futura Fictícia', inicio: '2026-10-04', fim: '2026-10-10' })

  // Evangelismo: em andamento separado dos próximos.
  await navigateInsideApp(page, '/app/evangelismo', page.getByRole('heading', { name: 'Campanhas', exact: true }))
  await expect(cartao(page, 'Em andamento agora')).toContainText('Primavera Fictícia')
  await expect(cartao(page, 'Em andamento agora')).toContainText('Semana de Colheita Fictícia')
  await expect(cartao(page, 'Próximos eventos')).toContainText('Campanha Futura Fictícia')
  await expect(cartao(page, 'Próximos eventos')).not.toContainText('Primavera')
  await expect(page.locator('.campaign-card').filter({ hasText: 'Primavera Fictícia' })).toContainText('11–20 de set.')

  // Planejamento Anual: uma linha por campanha, metas dentro dela, nada em dezembro.
  await abrirPlanejamento(page)
  const conferirPlanejamento = async (primavera: string, periodo: string) => {
    await expect(page.locator('.planning-goal-list .task-attention-row').filter({ hasText: primavera })).toHaveCount(1)
    const linha = page.locator('.planning-campaign-row').filter({ hasText: primavera })
    await expect(linha).toContainText(periodo)
    await expect(linha).toContainText('Em andamento')
    await expect(linha).toContainText('Estudos 0 de 30')
    await expect(linha).not.toContainText('Alcançada')
    await expect(cartao(page, 'Em andamento agora')).toContainText(primavera)
    await expect(cartao(page, 'Próximos eventos')).not.toContainText(primavera)
    const setembro = page.getByRole('region', { name: 'Calendário de Set' })
    await expect(setembro.locator('.calendario-item').filter({ hasText: primavera })).toHaveCount(1)
    await expect(setembro.locator('.calendario-item').filter({ hasText: primavera })).toContainText(periodo)
    await expect(page.locator('.annual-calendar .calendario-item').filter({ hasText: primavera })).toHaveCount(1)
    await expect(page.getByRole('region', { name: 'Calendário de Dez' })).not.toContainText(primavera)
    await expect(page.locator('#conteudo')).not.toContainText('31/12')
  }
  await conferirPlanejamento('Primavera Fictícia', '11–20 de set.')
  await expect(page.locator('.planning-goal-list .task-attention-row').filter({ hasText: 'Semana de Colheita Fictícia' })).toHaveCount(1)
  const setembro = page.getByRole('region', { name: 'Calendário de Set' })
  await expect(setembro.locator('.calendario-item').filter({ hasText: 'Semana de Colheita Fictícia' })).toContainText('13–19 de set.')
  await expect(setembro.locator('.calendario-item').filter({ hasText: 'Semana de Colheita Fictícia' })).toContainText(`Em andamento · Série bíblica · ${IGREJA}`)
  await expect(cartao(page, 'Próximos eventos')).toContainText('Campanha Futura Fictícia')
  await expect(page.getByRole('region', { name: 'Calendário de Out' }).locator('.calendario-item').filter({ hasText: 'Campanha Futura Fictícia' })).toContainText('Próxima')

  // Editar no Evangelismo muda todas as telas.
  await tocar(page.locator('.planning-campaign-row').filter({ hasText: 'Primavera Fictícia' }))
  await tocar(page.getByRole('button', { name: 'Editar campanha' }))
  await page.getByLabel('Nome da campanha').fill('Primavera Renovada Fictícia')
  await page.getByLabel('Data de início').fill('2026-09-12')
  await page.getByLabel('Data de término').fill('2026-09-21')
  await tocar(page.getByRole('button', { name: 'Salvar campanha e Agenda' }))
  await expect(page.getByRole('heading', { name: 'Primavera Renovada Fictícia', level: 1 })).toBeVisible()
  await abrirPlanejamento(page)
  await conferirPlanejamento('Primavera Renovada Fictícia', '12–21 de set.')
  await expect(page.locator('#conteudo')).not.toContainText('Primavera Fictícia')

  // Recarregar continua igual.
  await entrarDeNovo(page)
  await abrirPlanejamento(page)
  await conferirPlanejamento('Primavera Renovada Fictícia', '12–21 de set.')

  // Virada do dia no fuso do aparelho: às 23h30 de 19/09 em Brasília (já 20/09 em UTC) a colheita ainda está em andamento.
  await page.clock.setSystemTime(new Date('2026-09-19T23:30:00-03:00'))
  await entrarDeNovo(page)
  await abrirPlanejamento(page)
  await expect(page.locator('.planning-campaign-row').filter({ hasText: 'Semana de Colheita Fictícia' })).toContainText('Em andamento')
  await page.clock.setSystemTime(new Date('2026-09-20T00:10:00-03:00'))
  await entrarDeNovo(page)
  await abrirPlanejamento(page)
  await expect(page.locator('.planning-campaign-row').filter({ hasText: 'Semana de Colheita Fictícia' })).toContainText('Encerrada')
  await expect(cartao(page, 'Em andamento agora')).not.toContainText('Semana de Colheita Fictícia')
  await expect(cartao(page, 'Em andamento agora')).toContainText('Primavera Renovada Fictícia')

  // Excluir retira a campanha e o que derivava dela de todas as telas.
  // Depois do salto do relógio simulado, a animação do menu do celular não assenta: abre pelo endereço.
  await page.evaluate(() => { window.history.pushState({}, '', '/app/evangelismo'); window.dispatchEvent(new PopStateEvent('popstate')) })
  await expect(page.getByRole('heading', { name: 'Campanhas', exact: true })).toBeVisible()
  await tocar(page.locator('.campaign-card').filter({ hasText: 'Semana de Colheita Fictícia' }))
  await expect(page.getByRole('heading', { name: 'Semana de Colheita Fictícia', level: 1 })).toBeVisible()
  page.once('dialog', (dialogo) => { void dialogo.accept() })
  await tocar(page.getByRole('button', { name: 'Excluir campanha' }))
  await expect(page.getByRole('heading', { name: 'Campanhas', exact: true })).toBeVisible()
  await expect(page.locator('.campaign-card')).toHaveCount(2)
  await abrirPlanejamento(page)
  await expect(page.locator('#conteudo')).not.toContainText('Semana de Colheita Fictícia')
  await entrarDeNovo(page)
  await abrirPlanejamento(page)
  await expect(page.locator('#conteudo')).not.toContainText('Semana de Colheita Fictícia')
  await expect(page.locator('.planning-goal-list .task-attention-row')).toHaveCount(2)
  const horizontal = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
  expect(horizontal).toBe(false)
})
