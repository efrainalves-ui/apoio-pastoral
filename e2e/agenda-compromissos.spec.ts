import { expect, test, type Page } from '@playwright/test'
import { agendaDate, isoDateTime } from './dates'
import { navigateInsideApp } from './navigation'

async function registerAndEnter(page: Page, email: string) {
  await page.goto('/acesso')
  await page.getByLabel('E-mail').fill(email)
  await page.getByRole('textbox', { name: 'Senha' }).fill('senha-ficticia-agenda-2026')
  await page.getByRole('button', { name: 'Criar conta' }).click()
  await page.getByRole('button', { name: 'Já guardei em local seguro' }).click()
  await page.getByLabel('Nome do distrito').fill('Distrito Fictício da Agenda')
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByRole('button', { name: 'Cadastrar manualmente' }).click()
  await page.getByRole('link', { name: 'Ir para o início' }).click()
}

async function criarIgreja(page: Page, nome: string) {
  await navigateInsideApp(page, '/app/distrito/igrejas/nova', page.getByLabel(/Nome da igreja/))
  await page.getByLabel(/Nome da igreja/).fill(nome)
  await page.getByLabel(/Tipo/).selectOption('organized_church')
  await page.getByRole('button', { name: 'Salvar igreja' }).click()
  await expect(page.getByRole('heading', { name: nome })).toBeVisible()
}

async function novoCompromisso(page: Page, categoria: string) {
  await navigateInsideApp(page, '/app/agenda/novo', page.getByLabel('Categoria'))
  await page.getByLabel('Categoria').selectOption({ label: categoria })
}

async function preencherHorario(page: Page, hora: number) {
  const doisDigitos = (valor: number) => String(valor).padStart(2, '0')
  await page.getByLabel('Data', { exact: true }).fill(isoDateTime(agendaDate(), hora).slice(0, 10))
  await page.getByLabel('Início').fill(`${doisDigitos(hora)}:00`)
  await page.getByLabel('Término').fill(`${doisDigitos(hora + 1)}:00`)
}

const IGREJA = 'Igreja Fictícia da Agenda'

test('o campo de data tem botão de calendário, nos dois temas, e continua aceitando a data digitada', async ({ page }) => {
  await registerAndEnter(page, 'agenda.calendario.e2e@example.invalid')
  await novoCompromisso(page, 'Reunião')

  // O calendário é o do navegador: aqui só se confere que o botão o chama.
  await page.evaluate(() => {
    const janela = window as unknown as { aberturas: number }
    janela.aberturas = 0
    ;(HTMLInputElement.prototype as unknown as { showPicker: () => void }).showPicker = () => { janela.aberturas += 1 }
  })
  const botao = page.getByRole('button', { name: 'Abrir calendário' })
  await expect(botao).toBeVisible()
  const caixa = (await botao.boundingBox())!
  expect(caixa.width, 'largura do toque').toBeGreaterThanOrEqual(40)
  expect(caixa.height, 'altura do toque').toBeGreaterThanOrEqual(40)
  await botao.click()
  expect(await page.evaluate(() => (window as unknown as { aberturas: number }).aberturas)).toBe(1)
  // Tocar no próprio campo também abre.
  await page.getByLabel('Data', { exact: true }).click()
  expect(await page.evaluate(() => (window as unknown as { aberturas: number }).aberturas)).toBe(2)

  // A data digitada continua valendo, e o botão continua visível no tema escuro.
  const dia = isoDateTime(agendaDate(), 9).slice(0, 10)
  await page.getByLabel('Data', { exact: true }).fill(dia)
  await expect(page.getByLabel('Data', { exact: true })).toHaveValue(dia)
  for (const tema of ['claro', 'escuro']) {
    await page.evaluate((valor) => { document.documentElement.dataset.tema = valor }, tema)
    await expect(botao, tema).toBeVisible()
  }
  // Os demais campos não ganharam botão: é só o de data.
  await expect(page.getByRole('button', { name: /^Abrir calendário/ })).toHaveCount(1)
})

test('comissão marcada na Agenda abre no módulo com a data, o horário e o local de lá', async ({ page }) => {
  page.on('dialog', (dialog) => void dialog.accept())
  await registerAndEnter(page, 'agenda.comissao.e2e@example.invalid')
  await criarIgreja(page, IGREJA)

  await novoCompromisso(page, 'Comissão')
  await expect(page.getByText(/dia todo/i)).toHaveCount(0)
  await page.getByRole('radio', { name: 'Diretiva' }).check()
  await page.getByRole('combobox', { name: 'Igreja', exact: true }).selectOption({ label: IGREJA })
  await page.getByLabel('Local', { exact: true }).fill('Sala Fictícia')
  await preencherHorario(page, 19)
  await page.getByRole('button', { name: 'Salvar compromisso' }).click()

  const compromisso = page.getByRole('link', { name: /Abrir Comissão Diretiva/ }).first()
  await expect(compromisso).toBeVisible()
  await compromisso.click()
  await page.getByRole('link', { name: 'Abrir comissão' }).click()

  // Na reunião, data, horário e local são os da Agenda, e é lá que se mudam.
  await expect(page.getByRole('link', { name: 'Editar data, horário e local na Agenda' })).toBeVisible()
  await expect(page.getByLabel('Horário')).toHaveValue('19:00')
  await expect(page.getByLabel('Local', { exact: true })).toHaveValue('Sala Fictícia')
  await expect(page.getByLabel('Local', { exact: true })).toBeDisabled()
})

test('a finalidade chega à Visitação, e Nomeações pendente se liga ao criar o processo', async ({ page }) => {
  page.on('dialog', (dialog) => void dialog.accept())
  await registerAndEnter(page, 'agenda.pendencias.e2e@example.invalid')
  await criarIgreja(page, IGREJA)

  await novoCompromisso(page, 'Visita')
  await page.getByLabel('Finalidade da visita').selectOption({ label: 'Enfermidade' })
  await page.getByRole('combobox', { name: 'Igreja', exact: true }).selectOption({ label: IGREJA })
  await preencherHorario(page, 8)
  await page.getByRole('button', { name: 'Salvar compromisso' }).click()
  await page.getByRole('tab', { name: 'Lista' }).click()
  await page.getByRole('link', { name: /Registrar visita/ }).first().click()
  await expect(page.getByLabel('Motivo')).toHaveValue('illness')

  await novoCompromisso(page, 'Comissão')
  await page.getByRole('radio', { name: 'Nomeações' }).check()
  await page.getByRole('combobox', { name: 'Igreja', exact: true }).selectOption({ label: IGREJA })
  await preencherHorario(page, 19)
  await expect(page.getByText(/Sem processo de nomeações aberto nesta igreja/)).toBeVisible()
  // O botão salva o compromisso antes de sair, e Nomeações abre com a igreja escolhida.
  await page.getByRole('button', { name: 'Abrir ou criar processo em Nomeações' }).click()
  await expect(page.getByRole('heading', { name: 'Novo processo de nomeações' })).toBeVisible()
  await page.getByRole('button', { name: 'Criar processo' }).click()
  await expect(page).toHaveURL(/comissoes\/nomeacoes\/[0-9a-f-]+/)

  const compromisso = page.getByRole('link', { name: /Abrir Comissão de Nomeações/ }).first()
  await navigateInsideApp(page, '/app/agenda', compromisso)
  await compromisso.click()
  await expect(page.getByRole('link', { name: 'Abrir comissão' })).toBeVisible()
  await expect(page.getByText(/Sem processo de nomeações/)).toHaveCount(0)
})

test('alcance conforme a categoria: Associação/Missão/União nos encontros, e Concílio sem alcance', async ({ page }) => {
  page.on('dialog', (dialog) => void dialog.accept())
  await registerAndEnter(page, 'agenda.alcance.e2e@example.invalid')
  await criarIgreja(page, IGREJA)
  const salvar = async () => {
    await page.getByRole('button', { name: 'Salvar compromisso' }).click()
    await expect(page.getByRole('heading', { name: 'Agenda', level: 1 })).toBeVisible()
  }

  // Reunião online da Associação: o departamento escolhido antes some ao trocar de alcance.
  await novoCompromisso(page, 'Reunião')
  await page.getByLabel('Título').fill('Reunião Fictícia da Associação')
  await page.getByRole('radio', { name: 'Online' }).check()
  await expect(page.getByRole('group', { name: 'Alcance' }).getByRole('radio')).toHaveCount(4)
  await page.getByRole('radio', { name: 'Departamento', exact: true }).check()
  await page.getByRole('combobox', { name: 'Departamento' }).fill('Músi')
  await page.keyboard.press('Enter')
  await page.getByRole('radio', { name: 'Associação/Missão/União' }).check()
  await expect(page.getByRole('combobox', { name: 'Departamento' })).toHaveCount(0)
  await expect(page.getByRole('combobox', { name: 'Igreja', exact: true })).toHaveCount(0)
  await page.getByRole('radio', { name: 'Associação', exact: true }).check()
  await page.getByLabel('Nome da instituição').fill('Associação Fictícia Central')
  await preencherHorario(page, 8)
  await salvar()

  await novoCompromisso(page, 'Treinamento')
  await page.getByLabel('Título').fill('Treinamento Fictício do Departamento')
  await page.getByRole('radio', { name: 'Presencial' }).check()
  await page.getByLabel('Local', { exact: true }).fill('Salão Fictício')
  await page.getByRole('radio', { name: 'Departamento', exact: true }).check()
  await page.getByRole('combobox', { name: 'Departamento' }).fill('Músi')
  await page.keyboard.press('Enter')
  await preencherHorario(page, 11)
  await salvar()

  await novoCompromisso(page, 'Evento')
  await page.getByLabel('Título').fill('Evento Fictício da União')
  await page.getByRole('radio', { name: 'Presencial' }).check()
  await page.getByLabel('Local', { exact: true }).fill('Ginásio Fictício')
  await page.getByRole('radio', { name: 'Associação/Missão/União' }).check()
  await page.getByRole('radio', { name: 'União', exact: true }).check()
  await preencherHorario(page, 14)
  await salvar()

  // Concílio: tipo e formato, sem nenhuma opção de alcance.
  await novoCompromisso(page, 'Concílio')
  await expect(page.getByRole('group', { name: 'Alcance' })).toHaveCount(0)
  await expect(page.getByRole('radio', { name: 'Distrital' })).toHaveCount(0)
  await page.getByRole('radio', { name: 'PGP' }).check()
  await page.getByRole('radio', { name: 'Presencial' }).check()
  await page.getByLabel('Local', { exact: true }).fill('Sede Fictícia')
  await page.getByLabel('Observações').fill('Observação fictícia do PGP')
  await preencherHorario(page, 17)
  await salvar()

  await novoCompromisso(page, 'Concílio')
  await page.getByRole('radio', { name: 'Concílio', exact: true }).check()
  await page.getByRole('radio', { name: 'Online' }).check()
  await expect(page.getByLabel('Local', { exact: true })).toHaveCount(0)
  await preencherHorario(page, 20)
  await salvar()

  const abrirLista = async () => {
    await page.getByRole('tab', { name: 'Lista' }).click()
    await expect(page.locator('.linha-compromisso')).toHaveCount(5)
  }
  const linha = (titulo: string) => page.locator('.linha-compromisso').filter({ has: page.getByRole('link', { name: `Abrir ${titulo},`, exact: false }) })
  await abrirLista()
  await expect(linha('Reunião Fictícia da Associação').locator('.linha-compromisso__alcance')).toHaveText('Reunião · Associação · Associação Fictícia Central')
  await expect(linha('Treinamento Fictício do Departamento').locator('.linha-compromisso__alcance')).toHaveText('Treinamento · Departamento de Música')
  await expect(linha('Evento Fictício da União').locator('.linha-compromisso__alcance')).toHaveText('Evento · União')
  await expect(linha('PGP').locator('.linha-compromisso__alcance')).toHaveCount(0)
  await expect(linha('Concílio').locator('.linha-compromisso__alcance')).toHaveCount(0)

  // Editar: a reunião passa a ser da Missão, sem o nome da Associação.
  await linha('Reunião Fictícia da Associação').getByRole('link', { name: /Abrir Reunião Fictícia da Associação/ }).click()
  await expect(page.locator('.resumo-do-alcance')).toHaveText('Reunião · Associação · Associação Fictícia Central')
  await page.getByRole('radio', { name: 'Missão', exact: true }).check()
  await page.getByLabel('Nome da instituição').fill('')
  await salvar()
  await abrirLista()
  await expect(linha('Reunião Fictícia da Associação').locator('.linha-compromisso__alcance')).toHaveText('Reunião · Missão')

  // O PGP reabre sem alcance, com o local e as observações.
  await linha('PGP').getByRole('link', { name: /Abrir PGP/ }).click()
  await expect(page.getByRole('radio', { name: 'PGP' })).toBeChecked()
  await expect(page.getByRole('group', { name: 'Alcance' })).toHaveCount(0)
  await expect(page.getByLabel('Local', { exact: true })).toHaveValue('Sede Fictícia')
  await expect(page.getByLabel('Observações')).toHaveValue('Observação fictícia do PGP')
})

test('reunião, Ceia do Senhor e dedicação mostram só o que a escolha pede', async ({ page }) => {
  page.on('dialog', (dialog) => void dialog.accept())
  await registerAndEnter(page, 'agenda.escolhas.e2e@example.invalid')
  await criarIgreja(page, IGREJA)

  await novoCompromisso(page, 'Reunião')
  await page.getByLabel('Título').fill('Reunião Fictícia da Agenda')
  await page.getByRole('radio', { name: 'Presencial' }).check()
  await expect(page.getByLabel('Local', { exact: true })).toBeVisible()
  await page.getByRole('radio', { name: 'Online' }).check()
  await expect(page.getByLabel('Local', { exact: true })).toHaveCount(0)
  await page.getByRole('radio', { name: 'Distrital' }).check()
  await page.getByRole('radio', { name: 'Outro público' }).check()
  await expect(page.getByLabel('Qual público?')).toBeVisible()
  await page.getByRole('radio', { name: 'Departamento', exact: true }).check()
  await expect(page.getByLabel('Qual público?')).toHaveCount(0)
  // O departamento é achado digitando, e o teclado escolhe.
  await page.getByRole('combobox', { name: 'Departamento' }).fill('Músi')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('button', { name: 'Remover Música' })).toBeVisible()
  await preencherHorario(page, 9)
  await page.getByRole('button', { name: 'Salvar compromisso' }).click()
  await expect(page.getByRole('link', { name: /Abrir Reunião Fictícia da Agenda/ }).first()).toBeVisible()

  await novoCompromisso(page, 'Ceia do Senhor')
  await page.getByRole('combobox', { name: 'Igreja', exact: true }).selectOption({ label: IGREJA })
  // Sem diaconato registrado, os dois cargos ficam pendentes para digitar.
  await expect(page.locator('.ceia-responsaveis').getByText('Pendente')).toHaveCount(2)
  await page.getByLabel('Primeiro diácono').fill('Diácono Digitado Fictício')
  await page.getByRole('group', { name: 'Materiais completos?' }).getByRole('radio', { name: 'Não' }).check()
  await page.getByRole('group', { name: 'Precisa providenciar?' }).getByRole('radio', { name: 'Sim' }).check()
  await page.getByRole('checkbox', { name: 'Pão' }).check()
  await page.getByLabel('Quantidade de pão').fill('2')
  await preencherHorario(page, 14)
  await page.getByRole('button', { name: 'Salvar compromisso' }).click()
  await expect(page.getByRole('link', { name: /Abrir Ceia do Senhor/ }).first()).toBeVisible()

  await novoCompromisso(page, 'Dedicação de criança')
  await page.getByRole('combobox', { name: 'Igreja', exact: true }).selectOption({ label: IGREJA })
  await page.getByLabel('Nome da criança').fill('Criança Fictícia da Agenda')
  await page.getByRole('button', { name: 'Não é membro' }).click()
  await page.getByLabel('Nome de quem não é membro').fill('Responsável Fictício')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('list', { name: 'Pais ou responsáveis: escolhidos' }).getByText('Não é membro')).toBeVisible()
  await preencherHorario(page, 16)
  await page.getByRole('button', { name: 'Salvar compromisso' }).click()
  await expect(page.getByRole('link', { name: /Abrir Dedicação — Criança Fictícia da Agenda/ }).first()).toBeVisible()
})
