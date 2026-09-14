import { expect, test, type Page } from '@playwright/test'
import { navigateInsideApp } from './navigation'
import { relatorioIntegradoFicticio } from './pdfFicticio'

const email = 'pastor.relatorio@example.invalid'
const password = 'senha-ficticia-segura-2026'

async function entrar(page: Page) {
  await page.goto('/acesso')
  await page.getByLabel('E-mail').fill(email)
  await page.getByRole('textbox', { name: 'Senha' }).fill(password)
  await page.getByRole('button', { name: 'Criar conta' }).click()
  await page.getByRole('button', { name: 'Já guardei em local seguro' }).click()
  await page.getByLabel('Nome do distrito').fill('Distrito Fictício do Relatório')
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByRole('button', { name: 'Cadastrar manualmente' }).click()
  await page.getByRole('link', { name: 'Ir para o início' }).click()
  await expect(page.getByRole('heading', { name: 'Visão do distrito' })).toBeVisible()
}

async function cadastrarIgreja(page: Page, nome: string) {
  await navigateInsideApp(page, '/app/distrito', page.getByRole('heading', { name: 'Distrito Fictício do Relatório' }))
  await page.getByRole('link', { name: 'Nova igreja' }).click()
  await page.getByLabel(/Nome da igreja/).fill(nome)
  await page.getByLabel(/Tipo/).selectOption('organized_church')
  await page.getByRole('button', { name: 'Salvar igreja' }).click()
  await expect(page.getByRole('heading', { name: nome, exact: true })).toBeVisible()
}

async function enviarPdf(page: Page, arquivo: string, conteudo: Buffer) {
  await page.getByLabel('Arquivo').setInputFiles({ name: arquivo, mimeType: 'application/pdf', buffer: conteudo })
}

const NORTE = { nome: 'Fictícia do Norte', alunos: ['0', '2', '4', '4', '3', '6', '6', '9', '2', '2', '38'] }

test('o Relatório Integrado entra trimestre a trimestre, e o número fora do padrão espera confirmação', async ({ page }) => {
  test.setTimeout(240_000)
  await entrar(page)
  await cadastrarIgreja(page, NORTE.nome)

  await navigateInsideApp(page, '/app/metas/relatorio-integrado', page.getByRole('heading', { name: 'Relatório Integrado' }))

  /*
    Primeiro trimestre. Nada com que comparar ainda, então nada interrompe: os
    números entram como vieram.
  */
  await enviarPdf(page, 'primeiro-ficticio.pdf', relatorioIntegradoFicticio(1, [
    { ...NORTE, pequenosGrupos: '5', campanhas: '1' },
  ]))
  await expect(page.getByRole('heading', { name: /1º trimestre de 2026 · primeiro-ficticio\.pdf/ })).toBeVisible()
  await page.getByRole('checkbox', { name: /Conferi os números/ }).check()
  await page.getByRole('button', { name: /Gravar 1º trimestre de 2026/ }).click()
  await expect(page.getByText('1º trimestre de 2026 gravado para 1 igreja(s).')).toBeVisible()

  // O que ficou guardado aparece no painel do trimestre.
  await expect(page.getByRole('tab', { name: '1º trimestre', selected: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Número de Pequenos Grupos da igreja.' })).toBeVisible()

  /*
    Segundo trimestre com 45 onde havia 5. É erro de digitação típico, e gravá-lo
    em silêncio estragaria o total do distrito sem deixar rastro.
  */
  await enviarPdf(page, 'segundo-ficticio.pdf', relatorioIntegradoFicticio(2, [
    { ...NORTE, pequenosGrupos: '45', campanhas: '2' },
  ]))
  await expect(page.getByRole('heading', { name: /2º trimestre de 2026/ })).toBeVisible()
  await expect(page.getByText('Valores fora do padrão')).toBeVisible()
  await expect(page.getByText('1º trimestre de 2026: 5 · agora: 45')).toBeVisible()

  // Recusar o número: ele não é gravado, e o indicador segue valendo o trimestre anterior.
  await page.getByRole('button', { name: 'Recusar' }).click()
  await page.getByRole('checkbox', { name: /Conferi os números/ }).check()
  await page.getByRole('button', { name: /Gravar 2º trimestre de 2026/ }).click()
  await expect(page.getByText('2º trimestre de 2026 gravado para 1 igreja(s).')).toBeVisible()

  // No ano, Pequenos Grupos é fotografia: vale o último trimestre confirmado, e o recusado não apaga o 5.
  await page.getByRole('tab', { name: 'Ano completo' }).click()
  const pequenosGrupos = page.locator('article.ri-destaque').filter({ hasText: 'Pequenos Grupos' })
  await expect(pequenosGrupos.locator('strong')).toHaveText('5')
  await expect(pequenosGrupos).toContainText('Último trimestre · 1º tri')
})

test('igreja sem relatório não é zerada, e o traço não vira zero', async ({ page }) => {
  test.setTimeout(240_000)
  await entrar(page)
  await cadastrarIgreja(page, NORTE.nome)
  await cadastrarIgreja(page, 'Fictícia do Sul')

  await navigateInsideApp(page, '/app/metas/relatorio-integrado', page.getByRole('heading', { name: 'Relatório Integrado' }))
  await enviarPdf(page, 'apenas-norte-ficticio.pdf', relatorioIntegradoFicticio(1, [
    { ...NORTE, pequenosGrupos: '5', campanhas: '1' },
  ]))

  // A do Sul não entregou: continua ativa, e não passa a ter zero.
  const semRelatorio = page.locator('.issue-list').filter({ hasText: 'Igrejas sem relatório neste trimestre' })
  await expect(semRelatorio.getByText('Fictícia do Sul')).toBeVisible()

  /*
    "Classes Bíblicas em funcionamento" veio com traço: fica sem informação, e
    não como zero. O resumo é um <summary>, que o navegador não expõe como
    botão — por texto é como se chega nele.
  */
  await page.getByText(/indicador\(es\) sem informação/).click()
  await expect(page.getByText('Número de Classes Bíblicas em funcionamento.')).toBeVisible()
})

/*
  A ponte até as Metas. Um número que entra em meta muda o progresso do ano, e
  reenviar o mesmo relatório não pode dobrar esse progresso.
*/
test('os estudos bíblicos alimentam a meta, e reenviar não duplica o progresso', async ({ page }) => {
  test.setTimeout(240_000)
  await entrar(page)
  await cadastrarIgreja(page, NORTE.nome)

  await navigateInsideApp(page, '/app/metas/relatorio-integrado', page.getByRole('heading', { name: 'Relatório Integrado' }))
  await enviarPdf(page, 'primeiro-ficticio.pdf', relatorioIntegradoFicticio(1, [
    { ...NORTE, pequenosGrupos: '5', campanhas: '1', estudos: '12', estudosAsa: '3' },
  ]))

  // A prévia diz qual meta recebe o quê, antes de gravar.
  await expect(page.getByText('O que vai para as Metas')).toBeVisible()
  await expect(page.getByText(`${NORTE.nome} · Estudos Bíblicos`)).toBeVisible()
  await expect(page.getByText('15 · ', { exact: false })).toBeVisible()

  await page.getByRole('checkbox', { name: /Conferi os números/ }).check()
  await page.getByRole('button', { name: /Gravar 1º trimestre de 2026/ }).click()
  await expect(page.getByText('Estudos Bíblicos: 15 no distrito.', { exact: false })).toBeVisible()

  /*
    Reenviar o mesmo relatório substitui o lançamento em vez de somar. O total do
    distrito continua 15 — se duplicasse, seria 30. A prova de que o lançamento
    chegou ao cofre está no teste de integração das metas; aqui prova-se que a
    tela recalcula a partir do que foi gravado, e não do que estava na memória.
  */
  await enviarPdf(page, 'primeiro-ficticio.pdf', relatorioIntegradoFicticio(1, [
    { ...NORTE, pequenosGrupos: '5', campanhas: '1', estudos: '12', estudosAsa: '3' },
  ]))
  await page.getByRole('checkbox', { name: /Conferi os números/ }).check()
  await page.getByRole('button', { name: /Gravar 1º trimestre de 2026/ }).click()
  await expect(page.getByText('Estudos Bíblicos: 15 no distrito.', { exact: false })).toBeVisible()
  await expect(page.getByText('Estudos Bíblicos: 30 no distrito.', { exact: false })).toHaveCount(0)

  // O mesmo relatório, resumido onde o pastor procura, com a fonte de cada número.
  const tituloDosEstudos = page.getByRole('heading', { name: 'Estudos Bíblicos informados no Relatório Integrado' })
  await navigateInsideApp(page, '/app/metas/bible_studies', tituloDosEstudos)
  const estudos = page.locator('section.card').filter({ has: tituloDosEstudos })
  await expect(estudos.getByText('Resultado oficial do relatório')).toBeVisible()
  await expect(estudos.locator('strong').filter({ hasText: /^15$/u })).toBeVisible()
  await expect(estudos.getByText('Cadastro nominal')).toBeVisible()
  // O número do relatório é o alcançado da meta, e não um número ao lado.
  await expect(page.locator('.manchete__num')).toHaveText('15')
  await expect(estudos.getByRole('link', { name: 'Abrir o relatório completo' })).toHaveAttribute('href', '/app/metas/relatorio-integrado')

  const tituloDaEscola = page.getByRole('heading', { name: 'Dados do Relatório Integrado' })
  await navigateInsideApp(page, '/app/metas/uapg', tituloDaEscola)
  const escola = page.locator('section.card').filter({ has: tituloDaEscola })
  await expect(escola.getByRole('columnheader', { name: 'Cadastro atual do aplicativo' })).toBeVisible()
  await expect(escola.getByRole('columnheader', { name: 'Informado no Relatório Integrado do trimestre' })).toBeVisible()
  await expect(escola.getByRole('row', { name: 'Pequenos Grupos 0 5' })).toBeVisible()
  await escola.getByRole('link', { name: 'Consultar os detalhes' }).click()
  await expect(page.getByRole('heading', { name: 'Relatório Integrado', exact: true })).toBeVisible()
})

test('quem abre Metas encontra o Relatório Integrado, e o arquivo que não é PDF pede conversão', async ({ page }) => {
  test.setTimeout(240_000)
  await entrar(page)

  const cartao = page.getByRole('heading', { name: 'Relatório Integrado do trimestre' })
  await navigateInsideApp(page, '/app/metas', cartao)
  await expect(page.getByText('Envie o Relatório Integrado respondido pelas igrejas e convertido para PDF.')).toBeVisible()
  await expect(page.getByText('Não envie o formulário vazio.', { exact: false })).toHaveCount(0)
  await page.getByRole('link', { name: 'Enviar Relatório Integrado em PDF' }).click()
  await expect(page.getByRole('heading', { name: 'Relatório Integrado', exact: true })).toBeVisible()

  await page.getByLabel('Arquivo').setInputFiles({ name: 'relatorio-respondido.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: Buffer.from('conteúdo fictício') })
  await expect(page.getByRole('alert')).toHaveText('Converta o Relatório Integrado respondido para PDF e tente novamente.')
})

/* Valor bloqueado na conferência não pode chegar à meta. */
test('o valor recusado não alimenta a meta', async ({ page }) => {
  test.setTimeout(240_000)
  await entrar(page)
  await cadastrarIgreja(page, NORTE.nome)

  await navigateInsideApp(page, '/app/metas/relatorio-integrado', page.getByRole('heading', { name: 'Relatório Integrado' }))
  await enviarPdf(page, 'primeiro-ficticio.pdf', relatorioIntegradoFicticio(1, [
    { ...NORTE, pequenosGrupos: '5', campanhas: '1', estudos: '4', estudosAsa: '1' },
  ]))
  await page.getByRole('checkbox', { name: /Conferi os números/ }).check()
  await page.getByRole('button', { name: /Gravar 1º trimestre de 2026/ }).click()
  await expect(page.getByText('Estudos Bíblicos: 5 no distrito.', { exact: false })).toBeVisible()

  // Segundo trimestre com salto de 4 para 40: a conferência para.
  await enviarPdf(page, 'segundo-ficticio.pdf', relatorioIntegradoFicticio(2, [
    { ...NORTE, pequenosGrupos: '5', campanhas: '1', estudos: '40', estudosAsa: '1' },
  ]))
  await expect(page.getByText('Valores fora do padrão')).toBeVisible()

  // Recusado, ele sai também da prévia das metas: sobra só a ASA.
  await page.getByRole('button', { name: 'Recusar' }).click()
  await expect(page.getByText('1 · ', { exact: false }).first()).toBeVisible()

  await page.getByRole('checkbox', { name: /Conferi os números/ }).check()
  await page.getByRole('button', { name: /Gravar 2º trimestre de 2026/ }).click()
  await expect(page.getByText('Estudos Bíblicos: 1 no distrito.', { exact: false })).toBeVisible()
})

/*
  Os quatro destinos de um valor que destoa. Pendente é o estado em que ele
  nasce: não grava, não alimenta meta, e continua à vista para não ser esquecido.
*/
test('o valor que destoa pode ser aprovado, corrigido, recusado ou deixado para depois', async ({ page }) => {
  test.setTimeout(240_000)
  await entrar(page)
  await cadastrarIgreja(page, NORTE.nome)

  await navigateInsideApp(page, '/app/metas/relatorio-integrado', page.getByRole('heading', { name: 'Relatório Integrado' }))
  await enviarPdf(page, 'primeiro-ficticio.pdf', relatorioIntegradoFicticio(1, [
    { ...NORTE, pequenosGrupos: '5', campanhas: '1', estudos: '4', estudosAsa: '1' },
  ]))
  await page.getByRole('checkbox', { name: /Conferi os números/ }).check()
  await page.getByRole('button', { name: /Gravar 1º trimestre de 2026/ }).click()
  await expect(page.getByText('Estudos Bíblicos: 5 no distrito.', { exact: false })).toBeVisible()

  // 5 vira 45: a conferência para e o valor nasce pendente.
  await enviarPdf(page, 'segundo-ficticio.pdf', relatorioIntegradoFicticio(2, [
    { ...NORTE, pequenosGrupos: '45', campanhas: '1', estudos: '4', estudosAsa: '1' },
  ]))
  await expect(page.getByText('Valores fora do padrão')).toBeVisible()
  const decisao = page.getByRole('group', { name: /Decisão sobre Número de Pequenos Grupos/ })
  await expect(decisao.getByRole('button', { name: 'Aprovar 45' })).toBeVisible()
  await expect(decisao.getByRole('button', { name: 'Recusar' })).toBeVisible()
  await expect(decisao.getByRole('button', { name: 'Decidir depois' })).toBeVisible()

  // Corrigir para 4: é o número que fica.
  await page.getByLabel(/Valor corrigido de Número de Pequenos Grupos/).fill('4')
  await page.getByRole('checkbox', { name: /Conferi os números/ }).check()
  await page.getByRole('button', { name: /Gravar 2º trimestre de 2026/ }).click()
  await expect(page.getByText('2º trimestre de 2026 gravado', { exact: false })).toBeVisible()
  await expect(page.locator('article.ri-destaque').filter({ hasText: 'Pequenos Grupos' }).locator('strong')).toHaveText('4')
})

/*
  "Decidir depois" guarda o valor como pendente: não alimenta nada até o pastor
  confirmar, e não obriga a enviar o PDF de novo. As campanhas declaradas e não
  cadastradas viram rascunhos a completar, só depois da confirmação, sem duplicar.
*/
test('o pendente fica guardado para confirmar depois, e as campanhas que faltam viram rascunhos', async ({ page }) => {
  test.setTimeout(240_000)
  await entrar(page)
  await cadastrarIgreja(page, NORTE.nome)

  await navigateInsideApp(page, '/app/metas/relatorio-integrado', page.getByRole('heading', { name: 'Relatório Integrado' }))
  await enviarPdf(page, 'primeiro-ficticio.pdf', relatorioIntegradoFicticio(1, [
    { ...NORTE, pequenosGrupos: '5', campanhas: '3', estudos: '4', estudosAsa: '1' },
  ]))
  await page.getByRole('checkbox', { name: /Conferi os números/ }).check()
  await page.getByRole('button', { name: /Gravar 1º trimestre de 2026/ }).click()
  await expect(page.getByText('1º trimestre de 2026 gravado', { exact: false })).toBeVisible()

  await expect(page.getByText('Relatório: 3 campanhas — Cadastradas: 0 — Faltam registrar: 3')).toBeVisible()
  await page.getByRole('button', { name: 'Cadastrar as que faltam' }).click()
  await page.getByRole('button', { name: 'Confirmar 3 a completar' }).click()
  await expect(page.getByText('3 campanha(s) a completar criada(s) no Evangelismo.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Cadastrar as que faltam' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Completar' })).toHaveCount(3)

  await enviarPdf(page, 'segundo-ficticio.pdf', relatorioIntegradoFicticio(2, [
    { ...NORTE, pequenosGrupos: '45', campanhas: '3', estudos: '4', estudosAsa: '1' },
  ]))
  await expect(page.getByText('Valores fora do padrão')).toBeVisible()
  await page.getByRole('checkbox', { name: /Conferi os números/ }).check()
  await page.getByRole('button', { name: /Gravar 2º trimestre de 2026/ }).click()
  await expect(page.getByText('2º trimestre de 2026 gravado', { exact: false })).toBeVisible()

  const pequenosGrupos = page.locator('article.ri-destaque').filter({ hasText: 'Pequenos Grupos' })
  await expect(pequenosGrupos).toContainText('Aguardando confirmação')
  await expect(page.getByText('Valores aguardando confirmação')).toBeVisible()
  await page.getByRole('button', { name: 'Confirmar 45' }).click()
  await expect(page.getByText('Valor confirmado.')).toBeVisible()
  await expect(pequenosGrupos.locator('strong')).toHaveText('45')
  await expect(page.getByText('Valores aguardando confirmação')).toHaveCount(0)

  // O relatório diz 45 e o cadastro tem 0: os dois aparecem, não somam, e a diferença espera conferência.
  await expect(page.getByText('Relatório (2º tri): 45 · Cadastro: 0')).toBeVisible()
  await page.getByRole('button', { name: 'Conferido' }).click()
  await expect(page.getByText('Nenhuma pendência')).toBeVisible()

  await navigateInsideApp(page, '/app/evangelismo', page.getByRole('heading', { name: 'A completar' }))
  await expect(page.locator('section.card').filter({ has: page.getByRole('heading', { name: 'A completar' }) }).getByRole('link')).toHaveCount(3)
})


