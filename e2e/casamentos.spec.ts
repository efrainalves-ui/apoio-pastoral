import { expect, test, type Page } from '@playwright/test'
import { agendaDate, isoDateTime } from './dates'
import { navigateInsideApp } from './navigation'

const IGREJA = 'Igreja Fictícia dos Casamentos'

async function registerAndEnter(page: Page, email: string) {
  await page.goto('/acesso')
  await page.getByLabel('E-mail').fill(email)
  await page.getByRole('textbox', { name: 'Senha' }).fill('senha-ficticia-casamentos-2026')
  await page.getByRole('button', { name: 'Criar conta' }).click()
  await page.getByRole('button', { name: 'Já guardei em local seguro' }).click()
  await page.getByLabel('Nome do distrito').fill('Distrito Fictício dos Casamentos')
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByRole('button', { name: 'Cadastrar manualmente' }).click()
  await page.getByRole('link', { name: 'Ir para o início' }).click()
  await navigateInsideApp(page, '/app/distrito/igrejas/nova', page.getByLabel(/Nome da igreja/))
  await page.getByLabel(/Nome da igreja/).fill(IGREJA)
  await page.getByLabel(/Tipo/).selectOption('organized_church')
  await page.getByRole('button', { name: 'Salvar igreja' }).click()
  await expect(page.getByRole('heading', { name: IGREJA })).toBeVisible()
}

async function horarioDaCerimonia(page: Page, hora: number) {
  await page.getByLabel('Data', { exact: true }).fill(isoDateTime(agendaDate(), hora).slice(0, 10))
  await page.getByLabel('Início').fill(`${hora}:00`)
  await page.getByLabel('Término').fill(`${hora + 1}:00`)
}

test('Casamentos, Visitação e Agenda abrem o mesmo acompanhamento', async ({ page }) => {
  page.on('dialog', (dialog) => void dialog.accept())
  await registerAndEnter(page, 'casamentos.tres.entradas.e2e@example.invalid')

  // 1. Pela aba Casamentos, dentro da Visitação, sem data nem Agenda.
  await navigateInsideApp(page, '/app/visitacao', page.getByRole('heading', { name: 'Visitação', exact: true }))
  const aba = page.getByRole('navigation', { name: 'Áreas da visitação' }).getByRole('button', { name: 'Casamentos' })
  await aba.scrollIntoViewIfNeeded()
  await expect(aba).toBeVisible()
  await aba.click()
  await page.getByRole('link', { name: 'Novo casamento' }).click()
  await page.getByLabel('Nome da noiva').fill('Ana Fictícia E2E')
  await page.getByLabel('Nome do noivo').fill('Bruno Fictício E2E')
  await page.getByLabel('Data pretendida').fill('2027-03-15')
  await page.getByRole('button', { name: 'Criar acompanhamento' }).click()
  await expect(page.getByRole('heading', { name: 'Ana Fictícia E2E e Bruno Fictício E2E', level: 1 })).toBeVisible()
  const endereco = page.url()
  await expect(page.getByRole('button', { name: 'Agendar casamento' })).toBeVisible()

  // 2. Pela Visitação: motivo Casamento, vinculada ao que já existe.
  await navigateInsideApp(page, '/app/visitas/nova', page.getByRole('heading', { name: 'Registrar visita pastoral' }))
  await page.getByRole('combobox', { name: /^Igreja(?:$|\s)/ }).selectOption({ label: IGREJA })
  await page.getByRole('combobox', { name: /^Motivo/ }).selectOption({ label: 'Casamento' })
  await page.getByRole('radio', { name: 'Vincular a casamento existente' }).check()
  await page.getByRole('combobox', { name: 'Casamento', exact: true }).selectOption({ label: 'Ana Fictícia E2E e Bruno Fictício E2E · Primeiro contato' })
  await page.getByRole('button', { name: 'Finalizar visita' }).click()
  await expect(page.getByRole('heading', { name: 'Ana Fictícia E2E e Bruno Fictício E2E', level: 1 })).toBeVisible()
  await page.getByRole('link', { name: 'Abrir acompanhamento do casamento' }).click()
  await expect(page).toHaveURL(endereco)
  await expect(page.locator('#visitas').getByRole('link', { name: /Visita/ })).toHaveCount(1)

  // 3. Pela Agenda, a partir do acompanhamento: o compromisso nasce ligado.
  await page.getByRole('button', { name: 'Agendar casamento' }).click()
  await expect(page.getByRole('radio', { name: 'Vincular a casamento existente' })).toBeChecked()
  await expect(page.getByText(/dia todo/i)).toHaveCount(0)
  await page.getByRole('combobox', { name: 'Igreja', exact: true }).selectOption({ label: IGREJA })
  await horarioDaCerimonia(page, 16)
  await page.getByRole('button', { name: 'Salvar compromisso' }).click()
  await expect(page.getByRole('link', { name: /Abrir Casamento de Ana Fictícia E2E e Bruno Fictício E2E/ }).first()).toBeVisible()

  // Recarregar a página trancaria o cofre: volta-se por dentro do aplicativo.
  await navigateInsideApp(page, new URL(endereco).pathname, page.getByRole('heading', { name: 'Ana Fictícia E2E e Bruno Fictício E2E', level: 1 }))
  await expect(page.getByRole('link', { name: 'Abrir compromisso na Agenda' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Agendar casamento' })).toHaveCount(0)
  await expect(page.getByLabel('Horário de início')).toHaveValue('16:00')

  // Os mesmos noivos de novo: aviso, e abrir leva ao mesmo registro.
  await navigateInsideApp(page, '/app/casamentos/novo', page.getByRole('heading', { name: 'Novo casamento' }))
  await page.getByLabel('Nome da noiva').fill('ana ficticia e2e')
  await page.getByLabel('Nome do noivo').fill('Bruno Fictício E2E')
  await page.getByRole('button', { name: 'Criar acompanhamento' }).click()
  await expect(page.getByText('Já existe acompanhamento com estes noivos.')).toBeVisible()
  await page.getByRole('button', { name: 'Abrir casamento existente' }).click()
  await expect(page).toHaveURL(endereco)
})

test('começando pela Agenda: data e local andam juntos, e remover o compromisso preserva o acompanhamento', async ({ page }) => {
  page.on('dialog', (dialog) => void dialog.accept())
  await registerAndEnter(page, 'casamentos.agenda.e2e@example.invalid')

  await navigateInsideApp(page, '/app/agenda/novo', page.getByLabel('Categoria'))
  await page.getByLabel('Categoria').selectOption({ label: 'Casamento' })
  await expect(page.getByLabel('Título')).toHaveCount(0)
  await page.getByRole('radio', { name: 'Criar novo acompanhamento' }).check()
  await page.getByLabel('Nome da noiva').fill('Carla Fictícia E2E')
  await page.getByLabel('Nome do noivo').fill('Davi Fictício E2E')
  await page.getByRole('combobox', { name: 'Igreja', exact: true }).selectOption({ label: IGREJA })
  await page.getByLabel('Local', { exact: true }).fill('Templo Fictício')
  await page.getByLabel('Pastor oficiante').fill('Pastor Oficiante Fictício')
  await horarioDaCerimonia(page, 14)
  await page.getByRole('button', { name: 'Salvar compromisso' }).click()

  const compromisso = page.getByRole('link', { name: /Abrir Casamento de Carla Fictícia E2E e Davi Fictício E2E/ }).first()
  await expect(compromisso).toBeVisible()
  await compromisso.click()
  await page.getByRole('link', { name: 'Abrir acompanhamento do casamento' }).click()
  await expect(page.getByRole('heading', { name: 'Carla Fictícia E2E e Davi Fictício E2E', level: 1 })).toBeVisible()
  await expect(page.getByLabel('Pastor oficiante', { exact: true })).toHaveValue('Pastor Oficiante Fictício')
  await expect(page.getByLabel('Local da cerimônia')).toHaveValue('Templo Fictício')

  // Mudar no acompanhamento muda o compromisso.
  await page.getByLabel('Local da cerimônia').fill('Salão Fictício')
  await page.getByRole('button', { name: 'Salvar acompanhamento' }).click()
  await expect(page.getByText('Acompanhamento salvo.')).toBeVisible()
  await page.getByRole('link', { name: 'Abrir compromisso na Agenda' }).click()
  await expect(page.getByLabel('Local', { exact: true })).toHaveValue('Salão Fictício')

  // Mudar na Agenda muda o acompanhamento.
  await page.getByLabel('Início').fill('15:00')
  await page.getByLabel('Término').fill('16:30')
  await page.getByRole('button', { name: 'Salvar compromisso' }).click()
  await compromisso.click()
  await page.getByRole('link', { name: 'Abrir acompanhamento do casamento' }).click()
  await expect(page.getByLabel('Horário de início')).toHaveValue('15:00')

  // Remover só o compromisso: o acompanhamento e o histórico ficam.
  await page.getByRole('link', { name: 'Abrir compromisso na Agenda' }).click()
  await page.getByRole('button', { name: 'Excluir compromisso' }).click()
  await expect(page).toHaveURL(/\/app\/agenda$/)
  await navigateInsideApp(page, '/app/visitacao?aba=casamentos', page.getByRole('link', { name: 'Novo casamento' }))
  await page.getByRole('link', { name: 'Abrir acompanhamento de Carla Fictícia E2E e Davi Fictício E2E' }).click()
  await expect(page.getByRole('button', { name: 'Agendar casamento' })).toBeVisible()
  await expect(page.getByText('Compromisso da cerimônia removido da Agenda')).toBeVisible()
})
