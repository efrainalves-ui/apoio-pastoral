import { expect, test, type Page } from '@playwright/test'
import { agendaDate, isoDateTime } from './dates'
import { navigateInsideApp } from './navigation'

const email = 'v1.cuidado.e2e@example.invalid'
const password = 'senha-ficticia-cuidado-2026'

async function foundation(page: Page) {
  await page.goto('/acesso')
  await page.getByLabel('E-mail').fill(email)
  await page.getByRole('textbox', { name: 'Senha' }).fill(password)
  await page.getByRole('button', { name: 'Criar conta' }).click()
  await page.getByRole('button', { name: 'Já guardei em local seguro' }).click()
  await page.getByLabel('Nome do distrito').fill('Distrito Cuidado Fictício')
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByRole('button', { name: 'Cadastrar manualmente' }).click()
  await page.getByRole('link', { name: 'Ir para o início' }).click()
  await navigateInsideApp(page, '/app/distrito', page.getByRole('heading', { name: 'Distrito Cuidado Fictício' }))
  await page.getByRole('link', { name: 'Nova igreja' }).click()
  await page.getByLabel(/Nome da igreja/).fill('Igreja Esperança Fictícia')
  await page.getByLabel(/Tipo/).selectOption('organized_church')
  await page.getByRole('button', { name: 'Salvar igreja' }).click()
  await expect(page.getByRole('heading', { name: 'Igreja Esperança Fictícia', exact: true })).toBeVisible()
  await navigateInsideApp(page, '/app/pessoas/nova', page.getByLabel(/Nome completo/))
  await page.getByLabel(/Nome completo/).fill('Pessoa Cuidado Fictícia')
  await page.getByLabel(/Igreja/).selectOption({ label: 'Igreja Esperança Fictícia' })
  await page.getByRole('button', { name: 'Salvar pessoa' }).click()
  await expect(page.getByRole('heading', { name: 'Pessoa Cuidado Fictícia', exact: true })).toBeVisible()
  await navigateInsideApp(page, '/app/familias/nova', page.getByLabel(/Nome da família/))
  await page.getByLabel(/Nome da família/).fill('Família Cuidado Fictícia')
  await page.getByLabel(/Igreja principal/).selectOption({ label: 'Igreja Esperança Fictícia' })
  await page.getByText('Pessoa Cuidado Fictícia').click()
  await page.getByRole('button', { name: 'Salvar família' }).click()
  await expect(page.getByRole('heading', { name: 'Família Cuidado Fictícia', exact: true })).toBeVisible()
}

test('agenda, visita versionada e cuidado funcionam no armazenamento offline', async ({ page, context }) => {
  await foundation(page)
  const appointment = agendaDate()
  await navigateInsideApp(page, '/app/agenda/novo', page.getByLabel('Categoria'))
  await page.getByLabel('Título').fill('Visita Agendada Fictícia')
  await page.getByLabel('Início').fill(isoDateTime(appointment, 14))
  await page.getByLabel('Término').fill(isoDateTime(appointment, 15))
  await page.getByRole('button', { name: 'Salvar compromisso' }).click()
  await expect(page.getByRole('link', { name: /Abrir Visita Agendada Fictícia/ })).toBeVisible()
  await navigateInsideApp(page, '/app/visitacao', page.getByRole('heading', { name: 'Visitação', exact: true }))
  const visitChurch = page.getByRole('combobox', { name: /^Igreja(?:$|\s)/ })
  // A tela de destino é reconhecida pelo título: o seletor de igreja também
  // existe em Visitação, e escolher antes da troca de tela perde o clique.
  await navigateInsideApp(page, '/app/visitas/nova', page.getByRole('heading', { name: 'Igreja e quem você visitou' }))
  await expect(visitChurch.locator('option', { hasText: 'Igreja Esperança Fictícia' })).toHaveCount(1)
  await visitChurch.selectOption({ label: 'Igreja Esperança Fictícia' })
  await expect(visitChurch).not.toHaveValue('')
  // Primeiro se registra quem foi visitado; as perguntas só aparecem depois.
  await expect(page.locator('.question-card')).toHaveCount(0)
  // O membro é achado pela busca, como o pastor o procura.
  await page.getByLabel('Buscar membro').fill('Pessoa Cuidado')
  await page.locator('.visit-members__results').getByRole('button', { name: 'Pessoa Cuidado Fictícia' }).click()
  await expect(page.locator('.question-card').first()).toBeVisible()
  await page.getByLabel('Agendamento vinculado').selectOption({ label: 'Visita Agendada Fictícia' })
  // A pergunta é achada pelo texto, como o pastor a lê: o código interno não
  // aparece mais na tela, e responder é tocar no botão.
  const question = page.locator('.question-card').filter({ hasText: 'Você estudou a Bíblia hoje?' })
  await expect(question.getByText('1. Comunhão')).toBeVisible()
  await question.getByRole('button', { name: 'Sim', exact: true }).click()
  await expect(question.getByRole('button', { name: 'Sim', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.getByLabel('Pedido', { exact: true }).fill('Pedido de oração inteiramente fictício')
  await page.getByRole('button', { name: 'Finalizar visita' }).click()
  // A visita abre no detalhe, com editar e excluir. A cerimônia de versão saiu:
  // corrigir o que se escreveu é corrigir, não criar um retrato novo.
  await expect(page.getByRole('heading', { name: 'Pessoa Cuidado Fictícia', level: 1 })).toBeVisible()
  await expect(page.getByText('Retrato imutável')).toHaveCount(0)
  // Corrigir abre a própria tela de registro, com o que já foi respondido no
  // lugar — e não um formulário reduzido só com o que já tinha resposta.
  await page.getByRole('link', { name: 'Editar' }).click()
  await expect(page.getByRole('heading', { name: 'Corrigir visita' })).toBeVisible()
  await expect(question.getByRole('button', { name: 'Sim', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.getByLabel('Observações pastorais').fill('Ajuste fictício')
  await page.getByRole('button', { name: 'Salvar correção' }).click()
  await expect(page.getByText('Ajuste fictício')).toBeVisible()
  await navigateInsideApp(page, '/app/visitacao', page.getByRole('heading', { name: 'Visitação', exact: true }))

  /*
    A lista de visitas agrupada por igreja, com busca e filtro.

    A etiqueta de cada linha não é campo gravado na visita — `status` é sempre
    `completed`. Ela é lida do que ficou em aberto depois: o acompanhamento
    pendente e a tarefa de prioridade alta. Aqui a visita não tem nada em
    aberto, então nenhum filtro de atenção pode alcançá-la, e "Todos" tem de
    trazê-la de volta.
  */
  const grupo = page.getByRole('button', { name: /Igreja Esperança Fictícia/ })
  const linha = page.getByRole('link', { name: /Pessoa Cuidado Fictícia/ }).first()
  await expect(linha).toBeVisible()

  await page.getByRole('button', { name: 'Urgentes' }).click()
  await expect(page.getByText('Nenhuma visita encontrada')).toBeVisible()
  await page.getByRole('button', { name: 'Todos' }).click()
  await expect(linha).toBeVisible()

  await page.getByLabel('Buscar pessoa ou igreja').fill('esperanca')
  await expect(linha).toBeVisible()
  await page.getByLabel('Buscar pessoa ou igreja').fill('ninguem com esse nome')
  await expect(page.getByText('Nenhuma visita encontrada')).toBeVisible()
  await page.getByLabel('Buscar pessoa ou igreja').fill('')

  // Recolher a igreja esconde as linhas sem tirar a igreja da tela.
  await grupo.click()
  await expect(grupo).toHaveAttribute('aria-expanded', 'false')
  await expect(linha).toBeHidden()
  await grupo.click()
  await expect(linha).toBeVisible()

  // Tocar na linha abre a visita; editar e excluir moraram para o detalhe.
  await linha.click()
  await expect(page.getByRole('heading', { name: 'Pessoa Cuidado Fictícia', level: 1 })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Editar' })).toBeVisible()
  await navigateInsideApp(page, '/app/visitacao', page.getByRole('heading', { name: 'Visitação', exact: true }))
  await context.setOffline(true)
  await page.reload()
  await page.getByRole('textbox', { name: 'Senha' }).fill(password)
  await page.getByRole('button', { name: 'Entrar' }).click()
  // A visita passou a ser registrada por membro, então a lista mostra a pessoa.
  // A visita passou a ser registrada por membro, então a lista mostra a pessoa.
  const linhasDaPessoa = page.getByRole('link', { name: /Pessoa Cuidado Fictícia/ })
  await navigateInsideApp(page, '/app/visitacao', linhasDaPessoa.first())
  await expect(linhasDaPessoa).toHaveCount(1)
})
