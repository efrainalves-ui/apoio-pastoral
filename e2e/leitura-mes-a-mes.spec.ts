import { expect, test, type Page } from '@playwright/test'
import { navigateInsideApp } from './navigation'

const password = 'senha-ficticia-leitura-mes-a-mes-2026'

async function entrar(page: Page) {
  await page.goto('/acesso')
  await page.getByLabel('E-mail').fill('leitura.mes.a.mes.e2e@example.invalid')
  await page.getByRole('textbox', { name: 'Senha' }).fill(password)
  await page.getByRole('button', { name: 'Criar conta' }).click()
  await page.getByRole('button', { name: 'Já guardei em local seguro' }).click()
  await page.getByLabel('Nome do distrito').fill('Distrito Fictício da Leitura Mensal')
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByRole('button', { name: 'Cadastrar manualmente' }).click()
  await page.getByRole('link', { name: 'Ir para o início' }).click()
}

/*
  O registro do pastor: um livro, oitenta páginas, uma hora e meia — tudo no mesmo
  mês. Os três números precisam bater no ano, no relatório do mês e no detalhe do
  mês, sem trocar livro por página pelo caminho.
*/
test('1 livro, 80 páginas e 1h30 aparecem iguais no ano, no mês e no detalhe do mês', async ({ page }) => {
  test.setTimeout(180_000)
  await entrar(page)
  await navigateInsideApp(page, '/app/leitura', page.getByRole('heading', { name: 'Leitura', exact: true }))
  const { hoje, mes } = await page.evaluate(() => {
    const data = new Date()
    const dois = (numero: number) => String(numero).padStart(2, '0')
    return {
      hoje: `${data.getFullYear()}-${dois(data.getMonth() + 1)}-${dois(data.getDate())}`,
      mes: new Intl.DateTimeFormat('pt-BR', { month: 'long' }).format(data),
    }
  })

  await page.getByRole('button', { name: 'Adicionar livro' }).first().click()
  await page.getByLabel('Título').fill('Livro Fictício de Oitenta Páginas')
  await page.getByLabel('Autor').fill('Autora Fictícia')
  await page.getByLabel('Total de páginas (opcional)').fill('80')
  await page.getByLabel('Data de conclusão').fill(hoje)
  await page.getByLabel('Páginas lidas').fill('80')
  await page.getByLabel('Tempo de leitura (minutos)').fill('90')
  await page.getByRole('button', { name: 'Salvar livro' }).click()
  await expect(page.getByText('Livro e leitura registrados.')).toBeVisible()

  // No ano: uma hora e meia de leitura e as oitenta páginas, sem meta definida.
  await expect(page.getByText('80 páginas', { exact: true })).toBeVisible()
  await expect(page.getByText('1h 30min de leitura no ano', { exact: true })).toBeVisible()

  // No relatório do mês: 1 livro concluído, 80 páginas, 1h 30min.
  const relatorio = page.getByRole('region', { name: /^Resultado de / })
  await expect(relatorio.getByText('80', { exact: true })).toBeVisible()
  await expect(relatorio.getByText('1h 30min', { exact: true })).toBeVisible()

  // No mês a mês: cada número junto do seu rótulo, e os outros meses recolhidos.
  const linhaDoMes = page.getByRole('button', { name: new RegExp(`${mes}\\s+1 livro · 80 páginas · 1h 30min`) })
  await expect(linhaDoMes).toBeVisible()
  await expect(page.getByText('Sem leitura', { exact: true })).toBeVisible()

  /*
    E o mês abre os livros e as leituras dele. A conferência é dentro do detalhe:
    o relatório mensal, acima, lista o mesmo livro concluído.
  */
  await linhaDoMes.click()
  const detalhe = page.locator('.mes-detalhe')
  await expect(detalhe.getByText('Livro Fictício de Oitenta Páginas · concluído')).toBeVisible()
  await expect(detalhe.getByText('80 páginas · 1h 30min', { exact: true })).toBeVisible()

  // No celular, os dados descem na vertical: a página não rola para o lado.
  const sobra = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(sobra).toBeLessThanOrEqual(1)

  // No tema escuro a linha continua legível, com a barra separada do fundo.
  await page.evaluate(() => { document.documentElement.dataset.tema = 'escuro' })
  await expect(linhaDoMes).toBeVisible()
  const cores = await linhaDoMes.evaluate((elemento) => {
    const barra = elemento.querySelector('.mes-linha__barra')
    const preenchida = barra?.firstElementChild
    return {
      texto: getComputedStyle(elemento).color,
      fundo: getComputedStyle(elemento.closest('.mes-linha')!).backgroundColor,
      trilho: barra ? getComputedStyle(barra).backgroundColor : '',
      preenchimento: preenchida ? getComputedStyle(preenchida).backgroundColor : '',
    }
  })
  expect(cores.texto).not.toBe(cores.fundo)
  expect(cores.preenchimento).not.toBe(cores.trilho)

  // Todos os meses, quando ele quiser: os doze, e de volta ao destaque.
  await page.evaluate(() => { document.documentElement.dataset.tema = 'claro' })
  await page.getByRole('button', { name: 'Mostrar todos os meses' }).click()
  await expect(page.getByRole('button', { name: /janeiro\s+Sem leitura registrada/ })).toBeVisible()
  await page.getByRole('button', { name: 'Mostrar só os meses com leitura' }).click()
  await expect(page.getByRole('button', { name: /janeiro/ })).toHaveCount(0)
})
