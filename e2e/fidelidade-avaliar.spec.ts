import { expect, test, type Page } from '@playwright/test'
import { navigateInsideApp } from './navigation'

const password = 'senha-ficticia-fidelidade-2026'
const IGREJA_LONGA = 'Igreja Fictícia do Bairro Nossa Senhora das Graças de Cima'

async function entrar(page: Page) {
  await page.goto('/acesso')
  await page.getByLabel('E-mail').fill('fidelidade.avaliar.e2e@example.invalid')
  await page.getByRole('textbox', { name: 'Senha' }).fill(password)
  await page.getByRole('button', { name: 'Criar conta' }).click()
  await page.getByRole('button', { name: 'Já guardei em local seguro' }).click()
  await page.getByLabel('Nome do distrito').fill('Distrito Fictício da Fidelidade')
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByRole('button', { name: 'Cadastrar manualmente' }).click()
  await page.getByRole('link', { name: 'Ir para o início' }).click()
  await expect(page.getByRole('heading', { name: 'Visão do distrito' })).toBeVisible()
}

async function criarIgreja(page: Page, nome: string) {
  await navigateInsideApp(page, '/app/distrito', page.getByRole('heading', { name: 'Distrito Fictício da Fidelidade' }))
  await page.getByRole('link', { name: 'Nova igreja' }).click()
  await page.getByLabel(/Nome da igreja/).fill(nome)
  await page.getByLabel(/Tipo/).selectOption('organized_church')
  await page.getByRole('button', { name: 'Salvar igreja' }).click()
  await expect(page.getByRole('heading', { name: nome })).toBeVisible()
}

/*
  As duas seções refeitas, na tela de verdade: o resumo do distrito, os cartões
  de igreja e a lista de avaliação que eles recortam. A paginação de vinte e
  cinco em vinte e cinco é provada no teste do componente, com trinta nomes —
  aqui o que se prova é que as peças conversam na página inteira.
*/
test('os cartões de igreja recortam as pessoas para avaliar, com nome longo, busca e sem rolagem lateral', async ({ page }) => {
  test.setTimeout(180_000)
  await entrar(page)
  await criarIgreja(page, 'Igreja Aurora Fictícia')
  await criarIgreja(page, IGREJA_LONGA)

  // Membros pela lista colada: é o caminho rápido de cadastrar gente de verdade.
  await navigateInsideApp(page, '/app/distrito', page.getByRole('heading', { name: 'Distrito Fictício da Fidelidade' }))
  await page.getByRole('link', { name: /Igreja Aurora Fictícia/ }).click()
  await page.getByRole('button', { name: 'Membros' }).click()
  await page.getByRole('button', { name: 'Importar lista de membros' }).click()
  await page.getByRole('textbox', { name: /Lista de membros/ }).fill([
    'Pessoa Fictícia Aurora; 21/08/1990',
    'Pessoa Fictícia Horizonte; 10/05/1985',
    'Maria Aparecida Fictícia dos Santos Nascimento Silva; 03/02/1952',
  ].join('\n'))
  await page.getByRole('button', { name: 'Conferir lista colada' }).click()
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Confirmar e aplicar' }).click()
  await expect(page.getByRole('heading', { name: 'Importação concluída' })).toBeVisible()

  // A fidelidade simulada dá leitura às três pessoas.
  await navigateInsideApp(page, '/app/fidelidade', page.getByRole('heading', { name: 'Fidelidade nos dízimos' }))
  await page.getByRole('button', { name: 'Usar importação fictícia simulada' }).click()
  await expect(page.getByRole('heading', { name: 'Conferir fidelidade' })).toBeVisible()
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Confirmar e aplicar' }).click()
  await expect(page.getByRole('heading', { name: 'Fidelidade atualizada' })).toBeVisible()

  const porIgreja = page.locator('.card').filter({ hasText: 'Fidelidade por igreja' }).first()
  const avaliar = page.locator('.card').filter({ hasText: 'Pessoas para avaliar' }).first()

  // O resumo do distrito vem antes dos cartões, com os três totais.
  const resumo = porIgreja.locator('.fidelidade-resumo')
  for (const rotulo of ['Fiéis', 'Em acompanhamento', 'A avaliar']) {
    await expect(resumo.getByText(rotulo, { exact: true })).toBeVisible()
  }

  // O nome comprido aparece inteiro no cartão, sem cortar.
  const cartaoLongo = porIgreja.getByRole('button', { name: new RegExp(IGREJA_LONGA) })
  await expect(cartaoLongo.getByText(IGREJA_LONGA)).toBeVisible()

  // Tocar no cartão recorta a lista de avaliação naquela igreja.
  const cartaoAurora = porIgreja.getByRole('button', { name: /Igreja Aurora Fictícia/ })
  await expect(cartaoAurora).toHaveAttribute('aria-pressed', 'false')
  await cartaoAurora.click()
  await expect(cartaoAurora).toHaveAttribute('aria-pressed', 'true')
  await expect(avaliar.getByLabel('Igreja')).toHaveValue(/.+/)

  // Igreja sem ninguém a avaliar diz isso, em vez de mostrar lista vazia.
  await cartaoLongo.click()
  await expect(avaliar.getByText('Nenhuma pessoa pendente de avaliação')).toBeVisible()
  await expect(avaliar.getByText('0 pessoas')).toBeVisible()

  // De volta a todas as igrejas, a busca por nome recorta e a contagem acompanha.
  await cartaoLongo.click()
  await avaliar.getByRole('searchbox', { name: 'Buscar pessoa' }).fill('zzz não existe')
  await expect(avaliar.getByText('Nenhuma pessoa com esse nome')).toBeVisible()
  await avaliar.getByRole('searchbox', { name: 'Buscar pessoa' }).fill('')

  // Chegar ao cartão pelo teclado e escolher com Enter.
  await cartaoAurora.focus()
  await page.keyboard.press('Enter')
  await expect(cartaoAurora).toHaveAttribute('aria-pressed', 'true')

  /*
    Nada de rolagem lateral, no computador e no celular. Quando sobra, a falha
    precisa dizer qual elemento passou da largura: "scrollWidth maior que
    clientWidth" manda procurar agulha no palheiro.
  */
  const excesso = await page.evaluate(() => {
    const limite = document.documentElement.clientWidth
    const largos = [...document.querySelectorAll<HTMLElement>('body *')].filter((elemento) => elemento.getBoundingClientRect().right > limite + 1)
    /*
      Não basta dizer quem passou: quase todo elemento de largura total passa
      junto. O que resolve é a cadeia de larguras até o corpo da página, que
      mostra em qual ancestral a medida errada nasce.
    */
    const cadeia = (elemento: HTMLElement | null) => {
      const partes: string[] = []
      for (let atual = elemento; atual && atual !== document.body; atual = atual.parentElement) {
        partes.push(`${atual.tagName.toLowerCase()}.${atual.getAttribute('class') ?? ''}=${Math.round(atual.getBoundingClientRect().width)}`)
      }
      return partes.join(' < ')
    }
    const culpado = largos.find((elemento) => elemento.tagName === 'SELECT') ?? largos[0] ?? null
    return { quantos: largos.length, limite, cadeia: cadeia(culpado) }
  })
  expect(excesso, `cadeia de larguras: ${excesso.cadeia}`).toMatchObject({ quantos: 0 })
  const sobra = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(sobra).toBeLessThanOrEqual(1)

  // No tema escuro as duas seções continuam legíveis.
  await page.evaluate(() => { document.documentElement.dataset.tema = 'escuro' })
  await expect(cartaoAurora).toBeVisible()
  const cores = await cartaoAurora.evaluate((elemento) => ({
    texto: getComputedStyle(elemento).color,
    fundo: getComputedStyle(elemento).backgroundColor,
  }))
  expect(cores.texto).not.toBe(cores.fundo)
})
