import { expect, test, type Page } from '@playwright/test'
import { navigateInsideApp } from './navigation'

const email = 'navegacao.inicio.e2e@example.invalid'
const password = 'senha-ficticia-navegacao-2026'

async function register(page: Page) {
  await page.goto('/acesso')
  await page.getByLabel('E-mail').fill(email)
  await page.getByRole('textbox', { name: 'Senha' }).fill(password)
  await page.getByRole('button', { name: 'Criar conta' }).click()
  await page.getByRole('button', { name: 'Já guardei em local seguro' }).click()
  await page.getByLabel('Nome do distrito').fill('Distrito Fictício da Navegação')
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByRole('button', { name: 'Cadastrar manualmente' }).click()
  await page.getByRole('link', { name: 'Ir para o início' }).click()
  await expect(page.getByRole('heading', { name: 'Visão do distrito' })).toBeVisible()
}

interface LeituraDaOpcao { nome: string; texto: number; icone: number; desalinhamento: number }

/** Contraste de texto e ícone de cada opção do menu aberto, contra o fundo que está de fato atrás dela. */
async function lerOpcoesDoMenu(page: Page): Promise<LeituraDaOpcao[]> {
  return page.getByRole('navigation', { name: 'Criar' }).evaluate((menu) => {
    const rgb = (cor: string) => (cor.match(/[\d.]+/g) ?? []).map(Number)
    const luz = ([r = 0, g = 0, b = 0]: number[]) => {
      const canal = (valor: number) => { const c = valor / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
      return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b)
    }
    const contraste = (a: number[], b: number[]) => { const [x, y] = [luz(a), luz(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05) }
    const fundoDe = (elemento: Element | null): number[] => {
      for (let atual = elemento; atual; atual = atual.parentElement) {
        const cor = rgb(getComputedStyle(atual).backgroundColor)
        if (cor.length === 3 || (cor[3] ?? 0) > 0) return cor
      }
      return [255, 255, 255]
    }
    return [...menu.querySelectorAll('a')].map((opcao) => {
      const texto = opcao.querySelector('span')!
      const icone = opcao.querySelector('svg')!
      const fundo = fundoDe(opcao)
      const caixaTexto = texto.getBoundingClientRect()
      const caixaIcone = icone.getBoundingClientRect()
      return {
        nome: texto.textContent ?? '',
        texto: contraste(rgb(getComputedStyle(texto).color), fundo),
        icone: contraste(rgb(getComputedStyle(icone).color), fundo),
        desalinhamento: Math.abs((caixaTexto.top + caixaTexto.height / 2) - (caixaIcone.top + caixaIcone.height / 2)),
      }
    })
  })
}

function conferirLeituras(leituras: LeituraDaOpcao[], situacao: string) {
  expect(leituras, situacao).toHaveLength(11)
  for (const { nome, texto, icone, desalinhamento } of leituras) {
    expect(texto, `${situacao} · texto de ${nome}`).toBeGreaterThanOrEqual(4.5)
    expect(icone, `${situacao} · ícone de ${nome}`).toBeGreaterThanOrEqual(3)
    expect(desalinhamento, `${situacao} · alinhamento de ${nome}`).toBeLessThanOrEqual(2)
  }
}

/** O menu fica dentro do cabeçalho verde: o texto não pode herdar o branco dele, em nenhum tema nem estado. */
async function conferirContrasteDoMenu(page: Page) {
  const temas: ReadonlyArray<{ sistema: 'light' | 'dark'; tema: 'claro' | 'escuro' | null; nome: string }> = [
    { sistema: 'light', tema: null, nome: 'claro do sistema' },
    { sistema: 'dark', tema: null, nome: 'escuro do sistema' },
    { sistema: 'dark', tema: 'claro', nome: 'claro escolhido' },
    { sistema: 'light', tema: 'escuro', nome: 'escuro escolhido' },
  ]
  const menu = page.getByRole('navigation', { name: 'Criar' })
  for (const { sistema, tema, nome } of temas) {
    await page.emulateMedia({ colorScheme: sistema })
    await page.evaluate((escolhido) => {
      if (escolhido) document.documentElement.setAttribute('data-tema', escolhido)
      else document.documentElement.removeAttribute('data-tema')
    }, tema)
    conferirLeituras(await lerOpcoesDoMenu(page), `${nome} · normal`)

    for (const [indice, opcao] of (await menu.getByRole('link').all()).entries()) {
      await opcao.hover()
      conferirLeituras(await lerOpcoesDoMenu(page), `${nome} · passar por cima ${indice + 1}`)
    }

    // Toque: botão pressionado, soltando fora da opção para não navegar.
    const primeira = menu.getByRole('link').first()
    const caixa = (await primeira.boundingBox())!
    await page.mouse.move(caixa.x + caixa.width / 2, caixa.y + caixa.height / 2)
    await page.mouse.down()
    conferirLeituras(await lerOpcoesDoMenu(page), `${nome} · toque`)
    const caixaDoMenu = (await menu.boundingBox())!
    await page.mouse.move(caixaDoMenu.x + 3, caixaDoMenu.y + 3)
    await page.mouse.up()

    // Foco pelo teclado passa por todas as opções.
    await primeira.focus()
    for (let indice = 0; indice < 11; indice += 1) {
      conferirLeituras(await lerOpcoesDoMenu(page), `${nome} · foco ${indice + 1}`)
      await page.keyboard.press('Tab')
    }
    await primeira.focus()
  }
  await page.emulateMedia({ colorScheme: 'light' })
  await page.evaluate(() => document.documentElement.removeAttribute('data-tema'))
  await expect(menu).toBeVisible()
}

test('barra inferior, atalhos do topo e botão de criar funcionam', async ({ page }, testInfo) => {
  await register(page)

  if (testInfo.project.name === 'mobile-chromium') {
    // A Bíblia do Produto define exatamente estas cinco entradas, nesta ordem.
    const bottom = page.getByLabel('Navegação principal móvel')
    await expect(bottom).toBeVisible()
    await expect(bottom.getByRole('link')).toHaveText(['Início', 'Agenda', 'Distrito', 'Visitação'])
    await bottom.getByRole('link', { name: 'Visitação' }).click()
    await expect(page).toHaveURL(/\/app\/visitacao$/)
    await bottom.getByRole('link', { name: 'Início' }).click()
    await expect(page).toHaveURL(/\/app$/)
  }

  // O topo tem só dois atalhos, os dois em ícone.
  await expect(page.getByRole('searchbox', { name: 'Buscar pessoa, família, igreja ou compromisso' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Nova visita' })).toHaveCount(0)

  // As configurações só têm o ícone e não repetem o menu principal.
  await expect(page.getByRole('link', { name: 'Mais' })).toHaveCount(0)
  await navigateInsideApp(page, '/app/configuracoes', page.getByRole('heading', { name: 'Configurações', exact: true }))
  const mais = page.locator('main')
  for (const repetido of ['Visitas e cuidados', 'Pedidos de Oração', 'Famílias', 'Cuidados pastorais', 'Importar pessoas', 'Fidelidade', 'Leitura', 'Orçamento', 'Materiais', 'Relatórios', 'Aniversários', 'Interessados e estudos bíblicos', 'Duplas missionárias', 'Escola Sabatina, PG e UAPG']) {
    await expect(mais.getByRole('link', { name: repetido })).toHaveCount(0)
  }
  await expect(mais.getByRole('link', { name: 'Backup' })).toBeVisible()
  await navigateInsideApp(page, '/app', page.getByRole('heading', { name: 'Visão do distrito' }))

  const create = page.getByRole('button', { name: 'Criar' })
  await expect(create).toHaveAttribute('aria-expanded', 'false')
  await create.click()
  await expect(create).toHaveAttribute('aria-expanded', 'true')

  const quickMenu = page.getByRole('navigation', { name: 'Criar' })
  await expect(quickMenu.getByRole('link', { name: 'Nova pessoa' })).toBeVisible()
  await expect(quickMenu.getByRole('link', { name: 'Novo pedido de oração' })).toBeVisible()
  await conferirContrasteDoMenu(page)
  await quickMenu.getByRole('link', { name: 'Novo compromisso' }).click()

  await expect(page).toHaveURL(/\/app\/agenda\/novo/)
  // A categoria vem primeiro: é ela que decide o que o formulário pergunta.
  await expect(page.getByLabel('Categoria')).toBeVisible()
  await page.getByLabel('Categoria').selectOption({ label: 'Pregação' })
  await expect(page.getByLabel('Título')).toHaveCount(0)
  await expect(page.getByLabel('Local')).toHaveCount(0)
  await expect(page.getByRole('radio', { name: 'Uma igreja do distrito' })).toBeVisible()
  await page.getByLabel('Categoria').selectOption({ label: 'Reunião' })
  await expect(page.getByLabel('Título')).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Criar' })).toHaveCount(0)
})

test('o início mostra os blocos práticos do dia sem classificar ninguém', async ({ page }) => {
  await register(page)

  await expect(page.getByRole('heading', { name: 'Tarefas que pedem atenção', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Resumo de Visitação', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Interessados e estudos', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Igrejas que precisam de atenção', exact: true })).toBeVisible()

  // Cartões curtos: cada um é um caminho inteiro, e a lista fica na página que ele abre.
  await expect(page.getByRole('link', { name: 'Resumo de Visitação' })).toHaveAttribute('href', '/app/visitacao?aba=respostas')
  await expect(page.getByRole('link', { name: 'Tarefas que pedem atenção' })).toHaveAttribute('href', '/app/visitacao?aba=tarefas&filtro=atencao')
  await expect(page.getByRole('link', { name: 'Igrejas que precisam de atenção' })).toHaveAttribute('href', '/app/distrito/atencao')
  await expect(page.getByRole('heading', { name: 'Pessoas por igreja' })).toHaveCount(0)

  const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
  expect(horizontalOverflow).toBe(false)
})

test('a revisão de alterações concorrentes abre e explica a decisão', async ({ page }) => {
  await register(page)

  await navigateInsideApp(page, '/app/sincronizacao/conflitos', page.getByRole('heading', { name: 'Revisar alterações concorrentes' }))
  await expect(page.getByText('Nada foi apagado: escolha o que deve ficar valendo.')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Nenhuma revisão pendente' })).toBeVisible()
})
