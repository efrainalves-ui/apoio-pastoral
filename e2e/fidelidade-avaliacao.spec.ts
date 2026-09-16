import { expect, test, type Page } from '@playwright/test'
import { navigateInsideApp } from './navigation'

const password = 'senha-ficticia-avaliacao-2026'

async function entrar(page: Page) {
  await page.goto('/acesso')
  await page.getByLabel('E-mail').fill('fidelidade.avaliacao.e2e@example.invalid')
  await page.getByRole('textbox', { name: 'Senha' }).fill(password)
  await page.getByRole('button', { name: 'Criar conta' }).click()
  await page.getByRole('button', { name: 'Já guardei em local seguro' }).click()
  await page.getByLabel('Nome do distrito').fill('Distrito Fictício da Avaliação')
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByRole('button', { name: 'Cadastrar manualmente' }).click()
  await page.getByRole('link', { name: 'Ir para o início' }).click()
  await expect(page.getByRole('heading', { name: 'Visão do distrito' })).toBeVisible()
}

/*
  O caso que o pastor descreveu: uma letra a menos no sobrenome criou dois
  cadastros da mesma pessoa, e a leitura de dizimista caiu só num deles. O outro
  fica na fila de avaliação para sempre.

  Os nomes aqui são escolhidos para a importação fictícia distribuir as leituras
  em ordem alfabética: "Nacimento" vem antes de "Nascimento", recebe a faixa de
  dizimista, e "Nascimento" fica como não sistemática — ou seja, a avaliar.
*/
test('a avaliação pergunta a situação, oferece confirmar dizimista e avisa sobre cadastro repetido', async ({ page }) => {
  test.setTimeout(180_000)
  await entrar(page)

  await navigateInsideApp(page, '/app/distrito', page.getByRole('heading', { name: 'Distrito Fictício da Avaliação' }))
  await page.getByRole('link', { name: 'Nova igreja' }).click()
  await page.getByLabel(/Nome da igreja/).fill('Igreja Aurora Fictícia')
  await page.getByLabel(/Tipo/).selectOption('organized_church')
  await page.getByRole('button', { name: 'Salvar igreja' }).click()
  await expect(page.getByRole('heading', { name: 'Igreja Aurora Fictícia' })).toBeVisible()

  await page.getByRole('button', { name: 'Membros' }).click()
  await page.getByRole('button', { name: 'Importar lista de membros' }).click()
  await page.getByRole('textbox', { name: /Lista de membros/ }).fill([
    'Ana Paula Nacimento; 02/04/1970',
    'Ana Paula Nascimento; 02/04/1970',
    'Bruno Fictício Horizonte; 10/05/1985',
  ].join('\n'))
  await page.getByRole('button', { name: 'Conferir lista colada' }).click()
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Confirmar e aplicar' }).click()
  await expect(page.getByRole('heading', { name: 'Importação concluída' })).toBeVisible()

  await navigateInsideApp(page, '/app/fidelidade', page.getByRole('heading', { name: 'Fidelidade nos dízimos' }))
  await page.getByRole('button', { name: 'Usar importação fictícia simulada' }).click()
  await expect(page.getByRole('heading', { name: 'Conferir fidelidade' })).toBeVisible()
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Confirmar e aplicar' }).click()
  await expect(page.getByRole('heading', { name: 'Fidelidade atualizada' })).toBeVisible()

  // A pessoa a avaliar é a do nome completo; a quase igual ficou como dizimista.
  const avaliar = page.locator('.card').filter({ hasText: 'Pessoas para avaliar' }).first()
  await expect(avaliar.getByText('Ana Paula Nascimento')).toBeVisible()
  await avaliar.getByRole('button', { name: 'Avaliar Ana Paula Nascimento' }).click()

  /*
    A fila tem mais de uma pessoa — a importação fictícia também deixa a terceira
    sem leitura de dizimista. As conferências são dentro do bloco dela.
  */
  const bloco = page.locator('.avaliacao').filter({ hasText: 'Ana Paula Nascimento' }).first()
  await expect(bloco.getByRole('group', { name: 'Qual é a situação desta pessoa?' })).toBeVisible()
  for (const rotulo of ['É dizimista', 'Não dizimista com renda', 'Não dizimista sem renda', 'Avaliar depois']) {
    await expect(bloco.getByRole('button', { name: `${rotulo}: Ana Paula Nascimento` })).toBeVisible()
  }

  // O aviso de cadastro repetido, com o outro registro e a situação dele.
  const aviso = bloco.getByRole('group', { name: 'Possíveis cadastros da mesma pessoa' })
  await expect(aviso.getByText('Encontramos possíveis cadastros da mesma pessoa')).toBeVisible()
  await expect(aviso.getByText('Ana Paula Nacimento')).toBeVisible()
  await expect(aviso.getByText('Dizimista', { exact: true })).toBeVisible()

  // Vincular é decisão do pastor: depois dela, ela sai da fila e a outra pessoa fica.
  await aviso.getByRole('button', { name: 'É a mesma pessoa — vincular cadastros' }).click()
  await expect(page.getByText('Cadastros vinculados como a mesma pessoa.')).toBeVisible()
  await expect(page.locator('.avaliacao').filter({ hasText: 'Ana Paula Nascimento' })).toHaveCount(0)
  await expect(page.locator('.avaliacao').filter({ hasText: 'Bruno Fictício Horizonte' })).toHaveCount(1)

  // E na tela de fidelidade ela conta uma vez só, como dizimista.
  await page.getByRole('link', { name: 'Voltar à fidelidade' }).click()
  const porIgreja = page.locator('.card').filter({ hasText: 'Fidelidade por igreja' }).first()
  await expect(porIgreja.getByRole('button', { name: /Igreja Aurora Fictícia/ })).toHaveAccessibleName(/1 Fiéis 0 Em acompanhamento 1 A avaliar/)
})
