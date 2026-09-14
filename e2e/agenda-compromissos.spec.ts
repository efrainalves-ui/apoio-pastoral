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
