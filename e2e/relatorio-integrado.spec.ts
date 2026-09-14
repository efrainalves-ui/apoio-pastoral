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

  // O que ficou guardado aparece pelo valor do distrito.
  await expect(page.getByRole('cell', { name: 'Número de Pequenos Grupos da igreja.' })).toBeVisible()

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

  await expect(page.getByText('5 Pequenos Grupos')).toBeVisible()
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
  await expect(page.getByText('Igrejas sem relatório neste trimestre')).toBeVisible()
  await expect(page.getByText('Continua ativa.', { exact: false })).toBeVisible()

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
  await expect(estudos.getByText('Total informado pelo distrito')).toBeVisible()
  await expect(estudos.locator('strong').filter({ hasText: /^15$/u })).toBeVisible()
  await expect(estudos.getByText('Cadastro nominal do aplicativo')).toBeVisible()
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
  await expect(page.getByText('Não envie o formulário vazio.', { exact: false })).toBeVisible()
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
  await expect(page.getByText('4 Pequenos Grupos')).toBeVisible()
})


