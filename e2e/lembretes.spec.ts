import { expect, test, type Page } from '@playwright/test'
import { navigateInsideApp } from './navigation'

const email = 'pastor.lembretes@example.invalid'
const password = 'senha-ficticia-segura-2026'
const RELATORIO = 'Fazer o relatório mensal'

async function entrar(page: Page) {
  await page.goto('/acesso')
  await page.getByLabel('E-mail').fill(email)
  await page.getByRole('textbox', { name: 'Senha' }).fill(password)
  await page.getByRole('button', { name: 'Criar conta' }).click()
  await page.getByRole('button', { name: 'Já guardei em local seguro' }).click()
  await page.getByLabel('Nome do distrito').fill('Distrito Fictício dos Lembretes')
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByRole('button', { name: 'Cadastrar manualmente' }).click()
  await page.getByRole('link', { name: 'Ir para o início' }).click()
  await expect(page.getByRole('heading', { name: 'Visão do distrito' })).toBeVisible()
}

const hojeNoNavegador = (page: Page) => page.evaluate(() => {
  const agora = new Date()
  return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(agora.getDate()).padStart(2, '0')}`
})

/*
  O caminho de um mês do pastor: o relatório que se repete todo mês, concluído
  sem virar duas pendências; a lista excluída sem levar a tarefa embora; e as
  listas iniciais, que não podem nascer de novo a cada vez que a tela abre.
*/
test('Central de Lembretes: série mensal, listas e pesquisa sem acento', async ({ page }) => {
  test.setTimeout(240_000)
  await entrar(page)
  await navigateInsideApp(page, '/app/lembretes', page.getByRole('heading', { name: 'Lembretes', exact: true }))

  for (const bloco of ['Hoje', 'Próximos', 'Todos', 'Sinalizados', 'Urgentes', 'Concluídos']) {
    await expect(page.getByRole('link', { name: `${bloco}: 0` })).toBeVisible()
  }
  for (const lista of ['Pessoal', 'Rotinas', 'Compras']) await expect(page.getByRole('link', { name: new RegExp(`^${lista}`) })).toHaveCount(1)
  await expect(page.getByRole('region', { name: 'Áreas do aplicativo' }).getByRole('link', { name: /^Visitação/ })).toBeVisible()

  // Novo lembrete que se repete todo mês, na lista Rotinas.
  const hoje = await hojeNoNavegador(page)
  await page.getByRole('link', { name: 'Novo lembrete' }).click()
  await page.getByLabel('O que devo lembrar?').fill(RELATORIO)
  await page.getByLabel('Data', { exact: true }).fill(hoje)
  await page.getByLabel('Horário', { exact: true }).fill('08:00')
  await page.getByRole('combobox', { name: 'Lista', exact: true }).selectOption({ label: 'Rotinas' })
  await page.getByRole('combobox', { name: 'Repetição' }).selectOption('mensal')
  await expect(page.getByText(/^Todo mês, no dia/)).toBeVisible()
  await page.getByRole('button', { name: 'Salvar' }).click()

  await expect(page.getByRole('link', { name: 'Hoje: 1' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Todos: 1' })).toBeVisible()

  // Concluir a ocorrência de hoje: ela vai para Concluídos e a próxima aparece uma vez só.
  await page.getByRole('link', { name: /^Rotinas/ }).click()
  await expect(page.getByRole('heading', { name: 'Rotinas' })).toBeVisible()
  await page.getByRole('checkbox', { name: `Concluir ${RELATORIO}` }).click()
  await expect(page.getByRole('heading', { name: /Próximos dias/ })).toBeVisible()
  await expect(page.getByRole('checkbox', { name: `Concluir ${RELATORIO}` })).toHaveCount(1)
  await expect(page.getByText('Concluídos (1)')).toBeVisible()

  // Excluir a lista com a tarefa dentro: a tarefa vai para Pessoal.
  await page.getByRole('button', { name: 'Excluir lista' }).click()
  const exclusao = page.getByRole('dialog', { name: 'Excluir Rotinas' })
  await expect(exclusao.getByText('1 tarefa nesta lista')).toBeVisible()
  await exclusao.getByRole('button', { name: 'Excluir lista' }).click()
  await expect(page.getByRole('heading', { name: 'Lembretes', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: /^Rotinas/ })).toHaveCount(0)
  await expect(page.getByRole('link', { name: /^Pessoal.*1 em aberto/ })).toBeVisible()

  // Nova lista.
  await page.getByRole('button', { name: 'Adicionar lista' }).click()
  const novaLista = page.getByRole('dialog', { name: 'Nova lista' })
  await novaLista.getByLabel('Nome').fill('Igreja Fictícia Central')
  await novaLista.getByLabel('Verde').check()
  await novaLista.getByRole('button', { name: 'Salvar' }).click()
  await expect(page.getByRole('link', { name: /^Igreja Fictícia Central/ })).toBeVisible()

  // Pesquisa sem acento.
  await page.getByRole('button', { name: 'Pesquisar lembretes' }).click()
  await page.getByRole('searchbox', { name: 'Pesquisar por título, lista, área ou igreja' }).fill('relatorio')
  await expect(page.getByRole('checkbox', { name: `Concluir ${RELATORIO}` })).toBeVisible()
  await page.getByRole('button', { name: 'Fechar pesquisa' }).click()

  // Abrir de novo não recria as listas iniciais nem a lista excluída.
  await page.reload()
  await page.getByRole('textbox', { name: 'Senha' }).fill(password)
  await page.getByRole('button', { name: 'Entrar' }).click()
  // Recarregou dentro dos Lembretes: depois de entrar, volta para eles.
  await expect(page).toHaveURL(/\/app\/lembretes$/u)
  await expect(page.getByRole('heading', { name: 'Lembretes', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Concluídos: 1' })).toBeVisible()
  await expect(page.getByRole('link', { name: /^Pessoal/ })).toHaveCount(1)
  await expect(page.getByRole('link', { name: /^Compras/ })).toHaveCount(1)
  await expect(page.getByRole('link', { name: /^Rotinas/ })).toHaveCount(0)
})

const LIGAR = 'Ligar para o ancião fictício'

/*
  O que acontece na hora do lembrete: o aviso dentro do aplicativo, sem
  internet, uma vez só e sem mexer na tarefa; e o caminho de uma notificação
  aberta com o cofre fechado, que precisa sobreviver à tela de acesso.
*/
test('Lembretes: aviso na hora sem internet, uma vez só; destino da notificação depois de entrar; área do sistema sem editar nem excluir', async ({ page, context }) => {
  test.setTimeout(240_000)
  await entrar(page)
  await navigateInsideApp(page, '/app/lembretes', page.getByRole('heading', { name: 'Lembretes', exact: true }))

  // Área do aplicativo é lista do sistema: não se renomeia nem se exclui.
  await page.getByRole('region', { name: 'Áreas do aplicativo' }).getByRole('link', { name: /^Visitação/ }).click()
  await expect(page.getByRole('heading', { name: 'Visitação' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Editar lista' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Excluir lista' })).toHaveCount(0)
  await page.locator('.lembretes-voltar').click()

  // Um lembrete para agora, criado sem internet.
  await page.getByRole('link', { name: 'Novo lembrete' }).click()
  await expect(page.getByLabel('O que devo lembrar?')).toBeVisible()
  await context.setOffline(true)
  const agora = await page.evaluate(() => {
    const d = new Date()
    const dois = (n: number) => String(n).padStart(2, '0')
    return { data: `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`, hora: `${dois(d.getHours())}:${dois(d.getMinutes())}` }
  })
  await page.getByLabel('O que devo lembrar?').fill(LIGAR)
  await page.getByLabel('Data', { exact: true }).fill(agora.data)
  await page.getByLabel('Horário', { exact: true }).fill(agora.hora)
  await page.getByLabel('Notificar no horário').check()
  await page.getByRole('button', { name: 'Salvar' }).click()

  const aviso = page.getByRole('alert').filter({ hasText: LIGAR })
  await expect(aviso).toBeVisible()
  await expect(aviso).toHaveCount(1)
  await aviso.getByRole('button', { name: `Dispensar aviso de ${LIGAR}` }).click()
  await expect(aviso).toHaveCount(0)
  // Dispensar não conclui: o lembrete continua em Hoje.
  await expect(page.getByRole('link', { name: 'Hoje: 1' })).toBeVisible()
  await context.setOffline(false)

  // Abrir de novo: a mesma ocorrência não avisa outra vez.
  await page.reload()
  await page.getByRole('textbox', { name: 'Senha' }).fill(password)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page.getByRole('link', { name: 'Hoje: 1' })).toBeVisible()
  await page.waitForTimeout(1_500)
  await expect(page.getByRole('alert').filter({ hasText: LIGAR })).toHaveCount(0)

  // Notificação aberta com o cofre fechado: a tela de acesso guarda só o caminho e devolve depois de entrar.
  const caminho = `/app/lembretes/aviso/${'0'.repeat(64)}`
  await page.goto(caminho)
  await expect(page).toHaveURL(/\/acesso$/u)
  const guardado = await page.evaluate(() => sessionStorage.getItem('apoio-pastoral:destino-apos-entrar') ?? '')
  expect(guardado).toContain(caminho)
  expect(guardado).not.toContain(LIGAR)
  await page.getByRole('textbox', { name: 'Senha' }).fill(password)
  await page.getByRole('button', { name: 'Entrar' }).click()
  // Chave que este cofre não reconhece: abre Hoje, sem erro.
  await expect(page).toHaveURL(/\/app\/lembretes\/bloco\/hoje$/u)
  await expect(page.getByRole('heading', { name: 'Hoje' })).toBeVisible()
  await expect(page.getByRole('checkbox', { name: `Concluir ${LIGAR}` })).toBeVisible()
})
