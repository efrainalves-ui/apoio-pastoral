import { expect, test, type Page } from '@playwright/test'
import { navigateInsideApp } from './navigation'

const MATERIAL = 'Lição da Escola Sabatina do Quarto Trimestre Fictícia'
const email = 'pastor.materiais@example.invalid'
const password = 'senha-ficticia-segura-2026'

async function entrar(page: Page) {
  await page.goto('/acesso')
  await page.getByLabel('E-mail').fill(email)
  await page.getByRole('textbox', { name: 'Senha' }).fill(password)
  await page.getByRole('button', { name: 'Criar conta' }).click()
  await page.getByRole('button', { name: 'Já guardei em local seguro' }).click()
  await page.getByLabel('Nome do distrito').fill('Distrito Fictício dos Materiais')
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByRole('button', { name: 'Cadastrar manualmente' }).click()
  await page.getByRole('link', { name: 'Ir para o início' }).click()
  await expect(page.getByRole('heading', { name: 'Visão do distrito' })).toBeVisible()
}

async function cadastrarIgreja(page: Page, nome: string, tipo: string) {
  await navigateInsideApp(page, '/app/distrito', page.getByRole('heading', { name: 'Distrito Fictício dos Materiais' }))
  await page.getByRole('link', { name: 'Nova igreja' }).click()
  await page.getByLabel(/Nome da igreja/).fill(nome)
  await page.getByLabel(/Tipo/).selectOption(tipo)
  await page.getByRole('button', { name: 'Salvar igreja' }).click()
  await expect(page.getByRole('heading', { name: nome, exact: true })).toBeVisible()
}

async function registrarMaterial(page: Page, nome: string, quantidade: string) {
  await page.getByRole('button', { name: 'Registrar material recebido' }).click()
  await page.getByLabel('Nome', { exact: true }).fill(nome)
  await page.getByLabel('Quantidade', { exact: true }).fill(quantidade)
  await page.getByRole('button', { name: 'Salvar material' }).click()
  await expect(page.getByText('Material registrado.')).toBeVisible()
}

/*
  O caminho que o pastor percorreu: cadastrar o material, dividir entre as
  igrejas e entregar. Cada passo foi relatado como quebrado — o ícone da lixeira
  por cima do texto, a prévia aparecendo zerada e o botão de entregar sem
  resposta.
*/
test('o material é dividido entre as igrejas e entregue, sem passar por zero', async ({ page }) => {
  test.setTimeout(240_000)
  await entrar(page)
  /*
    Seis igrejas e um nome longo. Com duas igrejas e um nome curto nada quebra —
    e foi assim que o defeito passou despercebido. O distrito tem treze.
  */
  await cadastrarIgreja(page, 'Fictícia Central', 'organized_church')
  await cadastrarIgreja(page, 'Fictícia do Ponto', 'preaching_point')
  await cadastrarIgreja(page, 'Fictícia de Monte Alto', 'organized_church')
  await cadastrarIgreja(page, 'Fictícia da Beira do Rio', 'group')
  await cadastrarIgreja(page, 'Fictícia do Sertão de Cima', 'organized_church')
  await cadastrarIgreja(page, 'Fictícia da Vila Nova do Norte', 'preaching_point')

  await navigateInsideApp(page, '/app/materiais', page.getByRole('heading', { name: 'Materiais' }))
  await registrarMaterial(page, MATERIAL, '120')

  /*
    A linha do estoque tem nome, números e três ações. Cada ação precisa ser
    alcançável pelo seu próprio rótulo: foi uma lixeira por cima do texto que
    fez o pastor abrir a edição pensando que apagava.
  */
  const linha = page.locator('.entity-row').filter({ hasText: MATERIAL })
  await expect(linha.getByRole('button', { name: 'Distribuir' })).toBeVisible()
  await expect(linha.getByRole('button', { name: 'Editar' })).toBeVisible()
  await expect(linha.getByRole('button', { name: /Apagar material/ })).toBeVisible()

  /*
    Nenhuma ação pode cobrir o nome. Antes eram seis filhos numa grade de quatro
    colunas: os dois últimos botões caíam por cima do texto, e mirando a lixeira
    acertava-se o Editar.
  */
  const caixaDoNome = await linha.getByText(MATERIAL).boundingBox()
  expect(caixaDoNome).not.toBeNull()
  for (const acao of ['Distribuir', 'Editar', 'Apagar material']) {
    const caixa = await linha.getByRole('button', { name: new RegExp(acao) }).boundingBox()
    expect(caixa, acao).not.toBeNull()
    const cobreNaHorizontal = caixa!.x < caixaDoNome!.x + caixaDoNome!.width && caixa!.x + caixa!.width > caixaDoNome!.x
    const cobreNaVertical = caixa!.y < caixaDoNome!.y + caixaDoNome!.height && caixa!.y + caixa!.height > caixaDoNome!.y
    expect(cobreNaHorizontal && cobreNaVertical, `${acao} cobre o nome do material`).toBe(false)
  }

  /*
    Dividir já chega dividido. O pastor disse quanto recebeu ao cadastrar e a
    regra já está guardada: pedir de novo os dois antes de mostrar qualquer
    número é pedir o que já foi dito.
  */
  await linha.getByRole('button', { name: 'Distribuir' }).click()
  await expect(page.getByRole('heading', { name: 'Dividir 120 de ' + MATERIAL })).toBeVisible()

  const daCentral = page.getByLabel('Quantidade para Fictícia Central')
  await expect(daCentral).not.toHaveValue('0')
  await expect(page.getByRole('button', { name: 'Confirmar divisão' })).toBeEnabled()

  // A regra fica recolhida — quase nunca muda.
  await expect(page.getByLabel('Igreja organizada recebe')).toBeHidden()

  // Corrigir uma igreja não abandona a regra para as outras.
  const doPonto = page.getByLabel('Quantidade para Fictícia do Ponto')
  const antesDoPonto = await doPonto.inputValue()
  await daCentral.fill('10')
  await expect(doPonto).toHaveValue(antesDoPonto)

  await page.getByRole('button', { name: 'Confirmar divisão' }).click()
  await expect(page.getByText('Distribuição registrada.', { exact: false })).toBeVisible()

  /*
    Entregar. O formulário abre abaixo da lista; se ele nascer fora da tela, o
    pastor conclui que o botão não fez nada — foi exatamente o que aconteceu.
  */
  const entrega = page.locator('.entity-row').filter({ hasText: 'Fictícia Central' }).first()
  await entrega.getByRole('button', { name: 'Entregar' }).click()
  await expect(page.getByRole('heading', { name: 'Entregar em Fictícia Central' })).toBeInViewport()

  /*
    Entregar pergunta uma coisa só: com quem ficou. A data e a hora são as de
    agora — pedir que ele confirme isso é pedir confirmação do óbvio.
  */
  await expect(page.getByLabel('Data')).toHaveCount(0)
  await page.getByLabel('Nome de quem recebeu').fill('Pessoa Fictícia da Recepção')
  await page.getByRole('button', { name: 'Confirmar entrega' }).click()
  await expect(page.getByText('Entrega confirmada.')).toBeVisible()

  // E depois de entregue, fica no histórico.
  await expect(page.getByRole('heading', { name: 'Entregues' })).toBeVisible()
  await expect(page.locator('.entity-row').filter({ hasText: 'Pessoa Fictícia da Recepção' })).toBeVisible()
})

/*
  Botão desligado sem motivo é indistinguível de botão quebrado. Quando não dá
  para confirmar, o motivo precisa estar onde o pastor está olhando.
*/
test('quando não dá para dividir, a tela diz por quê em vez de só desligar o botão', async ({ page }) => {
  test.setTimeout(240_000)
  await entrar(page)
  await cadastrarIgreja(page, 'Fictícia Central', 'organized_church')

  await navigateInsideApp(page, '/app/materiais', page.getByRole('heading', { name: 'Materiais' }))
  await registrarMaterial(page, MATERIAL, '10')

  const linha = page.locator('.entity-row').filter({ hasText: MATERIAL })
  await linha.getByRole('button', { name: 'Distribuir' }).click()

  // Pedir mais do que há: o motivo aparece, e o botão continua desligado.
  await page.getByLabel('Quantidade para Fictícia Central').fill('40')
  await expect(page.getByText(/Faltam \d+ para esta divisão/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Confirmar divisão' })).toBeDisabled()

  // Nada para ninguém: também tem motivo escrito.
  await page.getByLabel('Quantidade para Fictícia Central').fill('0')
  await expect(page.getByText(/Nenhuma igreja recebeu nada/)).toBeVisible()

  // Um valor que cabe: o motivo some e o botão liga.
  await page.getByLabel('Quantidade para Fictícia Central').fill('4')
  await expect(page.getByText(/Faltam \d+ para esta divisão/)).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Confirmar divisão' })).toBeEnabled()
})

/*
  Depois de dividir tudo, não sobra saldo — e o botão Distribuir ficava morto e
  calado, que é indistinguível de botão quebrado. Dividir errado acontece, e
  desfazer exigia cancelar igreja por igreja, treze vezes.
*/
test('com tudo dividido, dá para refazer a divisão em vez de ficar travado', async ({ page }) => {
  test.setTimeout(240_000)
  await entrar(page)
  await cadastrarIgreja(page, 'Fictícia Central', 'organized_church')
  await cadastrarIgreja(page, 'Fictícia do Ponto', 'preaching_point')

  await navigateInsideApp(page, '/app/materiais', page.getByRole('heading', { name: 'Materiais' }))
  await registrarMaterial(page, MATERIAL, '30')

  const linha = page.locator('.entity-row').filter({ hasText: MATERIAL })
  await linha.getByRole('button', { name: 'Distribuir' }).click()
  await page.getByRole('button', { name: 'Confirmar divisão' }).click()
  await expect(page.getByText('Distribuição registrada.', { exact: false })).toBeVisible()

  // Sem saldo, o Distribuir some e entra o caminho de volta.
  await navigateInsideApp(page, '/app/materiais?aba=estoque', page.getByRole('heading', { name: 'Estoque' }))
  const noEstoque = page.locator('.entity-row').filter({ hasText: MATERIAL })
  await expect(noEstoque.getByRole('button', { name: 'Distribuir', exact: true })).toHaveCount(0)

  page.once('dialog', (dialog) => void dialog.accept())
  await noEstoque.getByRole('button', { name: 'Refazer divisão' }).click()

  // O que não foi entregue volta ao estoque e a divisão reabre com os 30.
  await expect(page.getByText('30 devolvido(s) ao estoque.', { exact: false })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Dividir 30 de ' + MATERIAL })).toBeVisible()
  await expect(page.getByText('Nada esperando entrega.')).toBeVisible()
})

