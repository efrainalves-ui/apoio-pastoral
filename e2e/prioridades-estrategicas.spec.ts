import { expect, test, type Locator, type Page } from '@playwright/test'
import { agendaDate, isoDateTime } from './dates'
import { navigateInsideApp } from './navigation'

/*
  Prioridades estratégicas: um símbolo pequeno nos compromissos com ligação
  clara, sem mudar as cores das categorias, e a marca da área nas páginas
  relacionadas. Só dados fictícios.
*/
const IGREJA = 'Igreja Fictícia das Prioridades'

async function tocar(alvo: Locator) {
  await alvo.evaluate((elemento) => elemento.scrollIntoView({ block: 'center' }))
  await alvo.click()
}

async function entrar(page: Page) {
  await page.goto('/acesso')
  await page.getByLabel('E-mail').fill('prioridades.e2e@example.invalid')
  await page.getByRole('textbox', { name: 'Senha' }).fill('senha-ficticia-prioridades-2026')
  await page.getByRole('button', { name: 'Criar conta' }).click()
  await page.getByRole('button', { name: 'Já guardei em local seguro' }).click()
  await page.getByLabel('Nome do distrito').fill('Distrito Fictício das Prioridades')
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByRole('button', { name: 'Cadastrar manualmente' }).click()
  await page.getByRole('link', { name: 'Ir para o início' }).click()
  await navigateInsideApp(page, '/app/distrito/igrejas/nova', page.getByLabel(/Nome da igreja/))
  await page.getByLabel(/Nome da igreja/).fill(IGREJA)
  await page.getByLabel(/Tipo/).selectOption('organized_church')
  await page.getByRole('button', { name: 'Salvar igreja' }).click()
  await expect(page.getByRole('heading', { name: IGREJA })).toBeVisible()
}

async function abrir(page: Page, caminho: string, pronto: Locator) {
  await page.evaluate((destino) => { window.history.pushState({}, '', destino); window.dispatchEvent(new PopStateEvent('popstate')) }, caminho)
  await expect(pronto).toBeVisible()
}

async function novo(page: Page, categoria: string, hora: number) {
  await navigateInsideApp(page, '/app/agenda/novo', page.getByLabel('Categoria'))
  await page.getByLabel('Categoria').selectOption({ label: categoria })
  const doisDigitos = (valor: number) => String(valor).padStart(2, '0')
  await page.getByLabel('Data', { exact: true }).fill(isoDateTime(agendaDate(), hora).slice(0, 10))
  await page.getByLabel('Início').fill(`${doisDigitos(hora)}:00`)
  await page.getByLabel('Término').fill(`${doisDigitos(hora + 1)}:00`)
}

async function salvar(page: Page) {
  await page.getByRole('button', { name: 'Salvar compromisso' }).click()
  await expect(page.getByRole('heading', { name: 'Agenda', level: 1 })).toBeVisible()
}

async function reuniao(page: Page, titulo: string, hora: number, prioridade?: string) {
  await novo(page, 'Reunião', hora)
  await page.getByLabel('Título').fill(titulo)
  await page.getByRole('radio', { name: 'Online' }).check()
  await page.getByRole('radio', { name: 'Distrital' }).check()
  await page.getByRole('radio', { name: 'Todos os líderes' }).check()
  if (prioridade) await page.getByLabel('Prioridade estratégica').selectOption({ label: prioridade })
  await salvar(page)
}

test('Agenda com símbolo estratégico só onde há ligação clara, e marca da área nas páginas relacionadas', async ({ page }, info) => {
  test.setTimeout(300_000)
  const celular = info.project.name.startsWith('mobile')
  await entrar(page)

  await novo(page, 'Pregação', 7)
  await page.getByRole('radio', { name: 'Uma igreja do distrito' }).check()
  await page.getByRole('combobox', { name: 'Igreja', exact: true }).selectOption({ label: IGREJA })
  await salvar(page)

  await novo(page, 'Visita', 9)
  await page.getByLabel('Finalidade da visita').selectOption({ label: 'Enfermidade' })
  await salvar(page)

  await novo(page, 'Ceia do Senhor', 11)
  await page.getByRole('combobox', { name: 'Igreja', exact: true }).selectOption({ label: IGREJA })
  await salvar(page)

  await novo(page, 'Dedicação de criança', 13)
  await page.getByRole('combobox', { name: 'Igreja', exact: true }).selectOption({ label: IGREJA })
  await page.getByLabel('Nome da criança').fill('Criança Fictícia')
  await salvar(page)

  await reuniao(page, 'Reunião Fictícia de Líderes', 15, 'Liderança')
  await reuniao(page, 'Reunião Fictícia de Jovens', 17)

  await page.getByRole('tab', { name: 'Lista' }).click()
  await expect(page.locator('.linha-compromisso')).toHaveCount(6)
  const linha = (inicio: string) => page.locator('.linha-compromisso').filter({ has: page.getByRole('link', { name: new RegExp(`^Abrir ${inicio}`, 'u') }) })
  const esperado: Array<[string, string | null]> = [
    ['Pregação', 'Identidade'], ['Visita', 'Discipulado'], ['Ceia do Senhor', null], ['Dedicação — Criança Fictícia', 'Novas Gerações'],
    ['Reunião Fictícia de Líderes', 'Liderança'], ['Reunião Fictícia de Jovens', null],
  ]
  for (const [inicio, prioridade] of esperado) {
    const alvo = linha(inicio)
    await expect(alvo, inicio).toHaveCount(1)
    if (prioridade) {
      await expect(alvo.getByRole('img', { name: `Prioridade estratégica: ${prioridade}` })).toBeVisible()
      await expect(alvo.getByRole('link', { name: new RegExp(`prioridade estratégica ${prioridade}$`, 'u') })).toHaveCount(1)
      // No celular só o símbolo fica na linha; no computador, símbolo e nome.
      await expect(alvo.locator('.prioridade-agenda__nome')).toBeVisible({ visible: !celular })
    } else {
      await expect(alvo.locator('.prioridade-agenda')).toHaveCount(0)
    }
  }
  // A categoria continua pintando a linha: o símbolo não troca o fundo nem a faixa.
  const visita = linha('Visita')
  expect(await visita.evaluate((elemento) => getComputedStyle(elemento).backgroundColor)).toBe(await visita.evaluate((elemento) => {
    const amostra = document.createElement('span'); amostra.style.background = getComputedStyle(elemento).getPropertyValue('--cat-fundo-atual'); document.body.append(amostra)
    const cor = getComputedStyle(amostra).backgroundColor; amostra.remove(); return cor
  }))

  // Legenda das categorias e, abaixo, a das prioridades.
  if (celular) {
    await expect(page.getByText('Prioridades estratégicas')).toBeHidden()
    await page.getByRole('button', { name: 'Legenda' }).click()
  }
  await expect(page.getByRole('list', { name: 'Legenda das categorias' })).toBeVisible()
  await expect(page.getByRole('list', { name: 'Prioridades estratégicas' }).getByRole('listitem')).toHaveText(['Identidade', 'Liderança', 'Novas Gerações', 'Discipulado'])
  await expect(page.locator('.legenda-prioridades .simbolo-area')).toHaveCount(4)

  // Páginas ligadas a uma área: marca no cabeçalho. As neutras continuam sem marca.
  const marca = page.locator('.cabecalho-da-area .marca-da-area')
  await abrir(page, '/app/sermoes', page.getByRole('heading', { name: 'Sermões', level: 1 }))
  await expect(marca).toHaveText('Identidade Adventista')
  await abrir(page, '/app/comissoes', page.getByRole('heading', { name: 'Comissões', level: 1 }))
  await expect(marca).toHaveText('Liderança')
  await abrir(page, '/app/visitacao', page.getByRole('heading', { name: 'Visitação', level: 1 }))
  await expect(marca).toHaveText('Discipulado')
  await tocar(page.getByRole('button', { name: 'Pedidos de oração' }))
  await expect(marca).toHaveCount(0)
  await abrir(page, '/app/evangelismo', page.getByRole('heading', { name: 'Evangelismo', level: 1 }))
  await expect(marca).toHaveText('Discipulado')
  // Escola Sabatina reúne as quatro prioridades: cabeçalho neutro, marca em cada informação.
  await abrir(page, '/app/metas/uapg', page.getByRole('heading', { name: 'Escola Sabatina e Pequenos Grupos', level: 1 }))
  await expect(marca).toHaveCount(0)
  await expect(page.locator('.quadro-grupos thead .marca-da-area')).toHaveText(['Discipulado', 'Discipulado', 'Discipulado'])
  await abrir(page, '/app/metas', page.getByRole('heading', { name: 'Metas', level: 1 }))
  await expect(marca).toHaveCount(0)
  await expect(page.locator('.goal-cards .marca-da-area--compacta')).toHaveText(['Discipulado', 'Discipulado'])
  for (const [caminho, titulo] of [['/app/distrito', 'Distrito Fictício das Prioridades'], ['/app/lembretes', 'Lembretes'], ['/app/fidelidade', 'Fidelidade']]) {
    await abrir(page, caminho, page.getByRole('heading', { name: titulo, level: 1 }))
    await expect(page.locator('.marca-da-area')).toHaveCount(0)
  }
})
