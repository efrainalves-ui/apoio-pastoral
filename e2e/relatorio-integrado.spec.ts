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

async function enviarEGravar(page: Page, arquivo: string, trimestre: number, conteudo: Buffer) {
  await page.getByLabel('Arquivo').setInputFiles({ name: arquivo, mimeType: 'application/pdf', buffer: conteudo })
  await expect(page.getByRole('heading', { name: new RegExp(`${trimestre}º trimestre de 2026 · `) })).toBeVisible()
  await page.getByRole('checkbox', { name: /Conferi os números/ }).check()
  await page.getByRole('button', { name: new RegExp(`Gravar ${trimestre}º trimestre de 2026`) }).click()
  await expect(page.getByText(`${trimestre}º trimestre de 2026 gravado`, { exact: false })).toBeVisible()
}

const abrirRelatorio = (page: Page) => navigateInsideApp(page, '/app/metas/relatorio-integrado', page.getByRole('heading', { name: 'Relatório Integrado', exact: true }))

const NORTE = { nome: 'Fictícia do Norte', alunos: ['0', '2', '4', '4', '3', '6', '6', '9', '2', '2', '38'] }
const SUL = { nome: 'Fictícia do Sul', alunos: ['0', '1', '1', '2', '2', '3', '4', '5', '1', '0', '19'] }

/*
  O relatório é o registro do que a igreja respondeu. O 45 onde havia 5 entra
  como 45, com um asterisco discreto; o zero depois de um 1 é zero, sem marca.
*/
test('o relatório entra como veio: o valor extremo recebe asterisco e continua valendo, e zero é zero', async ({ page }) => {
  test.setTimeout(240_000)
  await entrar(page)
  await cadastrarIgreja(page, NORTE.nome)
  await abrirRelatorio(page)

  await enviarEGravar(page, 'primeiro-ficticio.pdf', 1, relatorioIntegradoFicticio(1, [{ ...NORTE, pequenosGrupos: '5', campanhas: '1', estudos: '4', estudosAsa: '1' }]))

  await page.getByLabel('Arquivo').setInputFiles({ name: 'segundo-ficticio.pdf', mimeType: 'application/pdf', buffer: relatorioIntegradoFicticio(2, [{ ...NORTE, pequenosGrupos: '45', campanhas: '0', estudos: '6', estudosAsa: '1' }]) })
  await expect(page.getByRole('heading', { name: /2º trimestre de 2026 · segundo-ficticio\.pdf/ })).toBeVisible()
  // Nenhuma decisão a tomar sobre número algum.
  for (const nome of ['Aprovar 45', 'Recusar', 'Decidir depois']) await expect(page.getByRole('button', { name: nome })).toHaveCount(0)
  await expect(page.locator('.ri-envio__resumo > div').filter({ hasText: 'Possíveis erros de digitação' }).locator('strong')).toHaveText('1')
  await page.getByRole('checkbox', { name: /Conferi os números/ }).check()
  await page.getByRole('button', { name: /Gravar 2º trimestre de 2026/ }).click()
  await expect(page.getByText('2º trimestre de 2026 gravado', { exact: false })).toBeVisible()

  await expect(page.getByRole('tab', { name: '2º trimestre', selected: true })).toBeVisible()
  await expect(page.locator('article.ri-destaque--grupos .ri-destaque__numero')).toHaveText('45')
  await expect(page.locator('article.ri-destaque--campanhas .ri-destaque__numero')).toHaveText('0')

  // O asterisco abre a comparação, e diz que o valor foi mantido.
  const tabela = page.locator('.ri-tabela--completa')
  // No celular o cabeçalho fixo cobre a borda de cima: o toque é feito com a linha no meio da tela.
  const tocar = async (nome: RegExp) => { const botao = tabela.getByRole('button', { name: nome }); await botao.evaluate((elemento) => elemento.scrollIntoView({ block: 'center' })); await botao.click() }
  await tocar(/^Pequenos Grupos/)
  await tabela.locator('.ri-detalhe').getByRole('button', { name: 'Possível erro de digitação' }).first().click()
  const nota = page.getByRole('note')
  await expect(nota).toContainText('Possível erro de digitação. O valor foi mantido como informado pela igreja.')
  await expect(nota).toContainText(NORTE.nome)
  await expect(nota).toContainText('5')
  await expect(nota).toContainText('45')
  // A queda de campanhas para zero não recebe asterisco.
  await tocar(/^Pequenos Grupos/)
  await tocar(/^Campanhas evangelísticas/)
  await expect(tabela.locator('.ri-detalhe').last().getByRole('button', { name: 'Possível erro de digitação' })).toHaveCount(0)

  // O relatório da igreja, para abrir na visita.
  await page.locator('.ri-filtros select').first().selectOption({ label: NORTE.nome })
  const daIgreja = page.getByRole('region', { name: `Relatório de ${NORTE.nome}` })
  await expect(daIgreja.getByRole('heading', { name: 'Indicadores que avançaram' })).toBeVisible()
  await expect(daIgreja.getByRole('heading', { name: 'Indicadores que diminuíram' })).toBeVisible()
  await expect(daIgreja.getByRole('heading', { name: 'Possíveis erros de digitação' })).toBeVisible()
  await expect(daIgreja.getByText('* Possível erro de digitação.')).toBeVisible()
  await expect(daIgreja.getByText('Campos sem informação')).toBeVisible()
  await daIgreja.getByRole('button', { name: 'Voltar ao distrito' }).click()
  await expect(page.getByRole('heading', { name: 'Visão geral' })).toBeVisible()
})

test('igreja sem relatório não é zerada, e o traço não vira zero', async ({ page }) => {
  test.setTimeout(240_000)
  await entrar(page)
  await cadastrarIgreja(page, NORTE.nome)
  await cadastrarIgreja(page, SUL.nome)
  await abrirRelatorio(page)
  await page.getByLabel('Arquivo').setInputFiles({ name: 'apenas-norte-ficticio.pdf', mimeType: 'application/pdf', buffer: relatorioIntegradoFicticio(1, [{ ...NORTE, pequenosGrupos: '5', campanhas: '1' }]) })

  const semRelatorio = page.locator('.issue-list').filter({ hasText: 'Igrejas sem relatório neste trimestre' })
  await expect(semRelatorio.getByText(SUL.nome)).toBeVisible()
  await page.locator('details.ri-dobra > summary').filter({ hasText: NORTE.nome }).click()
  await expect(page.getByText('Número de Classes Bíblicas em funcionamento.')).toBeVisible()
})

/* Reenviar o mesmo relatório não pode dobrar o progresso da meta. */
test('os estudos bíblicos alimentam a meta, e reenviar não duplica o progresso', async ({ page }) => {
  test.setTimeout(240_000)
  await entrar(page)
  await cadastrarIgreja(page, NORTE.nome)
  await abrirRelatorio(page)
  const pdf = relatorioIntegradoFicticio(1, [{ ...NORTE, pequenosGrupos: '5', campanhas: '1', estudos: '12', estudosAsa: '3' }])

  await page.getByLabel('Arquivo').setInputFiles({ name: 'primeiro-ficticio.pdf', mimeType: 'application/pdf', buffer: pdf })
  await expect(page.getByText('O que vai para as Metas')).toBeVisible()
  await expect(page.getByText(`${NORTE.nome} · Estudos Bíblicos`)).toBeVisible()
  await page.getByRole('checkbox', { name: /Conferi os números/ }).check()
  await page.getByRole('button', { name: /Gravar 1º trimestre de 2026/ }).click()
  await expect(page.getByText('Estudos Bíblicos: 15 no distrito.', { exact: false })).toBeVisible()

  await enviarEGravar(page, 'primeiro-ficticio.pdf', 1, pdf)
  await expect(page.getByText('Estudos Bíblicos: 15 no distrito.', { exact: false })).toBeVisible()
  await expect(page.getByText('Estudos Bíblicos: 30 no distrito.', { exact: false })).toHaveCount(0)

  const tituloDosEstudos = page.getByRole('heading', { name: 'Estudos Bíblicos informados no Relatório Integrado' })
  await navigateInsideApp(page, '/app/metas/bible_studies', tituloDosEstudos)
  const estudos = page.locator('section.card').filter({ has: tituloDosEstudos })
  await expect(estudos.getByText('Resultado oficial do relatório')).toBeVisible()
  await expect(estudos.locator('strong').filter({ hasText: /^15$/u })).toBeVisible()
  await expect(page.locator('.manchete__num')).toHaveText('15')

  const tituloDaEscola = page.getByRole('heading', { name: 'Dados do Relatório Integrado' })
  await navigateInsideApp(page, '/app/metas/uapg', tituloDaEscola)
  const escola = page.locator('section.card').filter({ has: tituloDaEscola })
  // A linha leva a marca da própria prioridade: Pequenos Grupos é Discipulado.
  await expect(escola.getByRole('row', { name: 'Pequenos Grupos Discipulado 0 5' })).toBeVisible()
})

/*
  Na página da igreja, Unidades e Pequenos Grupos vêm do relatório daquela
  igreja no trimestre do distrito: cada uma com o seu número, o zero informado
  como zero, e a igreja que não enviou sem informação — nunca zero.
*/
test('Escola Sabatina e Pequenos Grupos da igreja vêm do relatório do trimestre, sem somar e sem fingir zero', async ({ page }) => {
  test.setTimeout(300_000)
  await entrar(page)
  const ZERO = { nome: 'Fictícia do Zero', alunos: ['0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0'] }
  const AUSENTE = 'Fictícia Ausente'
  for (const nome of [NORTE.nome, SUL.nome, ZERO.nome, AUSENTE]) await cadastrarIgreja(page, nome)
  await abrirRelatorio(page)
  await enviarEGravar(page, 'escola-ficticia.pdf', 2, relatorioIntegradoFicticio(2, [
    { ...NORTE, pequenosGrupos: '5', campanhas: '0', unidades: ['0', '0', '0', '0', '0', '0', '1', '3', '0', '0', '4'] },
    { ...SUL, pequenosGrupos: '2', campanhas: '0', unidades: ['0', '0', '0', '0', '0', '0', '1', '2', '0', '0', '3'] },
    { ...ZERO, pequenosGrupos: '0', campanhas: '0', unidades: ['0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0'] },
  ]))

  const abrirIgreja = async (nome: string) => {
    await navigateInsideApp(page, '/app/distrito', page.getByRole('heading', { name: 'Distrito Fictício do Relatório' }))
    await page.getByRole('link', { name: new RegExp(nome) }).first().click()
    await expect(page.getByRole('heading', { name: nome, exact: true })).toBeVisible()
    const cartao = page.locator('section.card').filter({ has: page.getByRole('heading', { name: 'Escola Sabatina e Pequenos Grupos' }) })
    await expect(cartao.getByText('Dados do 2º trimestre de 2026')).toBeVisible()
    return cartao
  }
  const valor = (cartao: ReturnType<Page['locator']>, rotulo: string) => cartao.locator('.private-summary > div').filter({ has: page.getByText(rotulo, { exact: true }) })

  const norte = await abrirIgreja(NORTE.nome)
  await expect(valor(norte, 'Unidades da Escola Sabatina').locator('strong')).toHaveText('4/0')
  await expect(valor(norte, 'Pequenos Grupos').locator('strong')).toHaveText('5/0')
  await expect(valor(norte, 'Pequenos Grupos').getByText('Relatório Integrado')).toBeVisible()
  await expect(valor(norte, 'Integração').locator('strong')).toHaveText('Sem informação')

  const sul = await abrirIgreja(SUL.nome)
  await expect(valor(sul, 'Unidades da Escola Sabatina').locator('strong')).toHaveText('3/0')
  await expect(valor(sul, 'Pequenos Grupos').locator('strong')).toHaveText('2/0')

  const zero = await abrirIgreja(ZERO.nome)
  await expect(valor(zero, 'Unidades da Escola Sabatina').locator('strong')).toHaveText('0/0')
  await expect(valor(zero, 'Pequenos Grupos').locator('strong')).toHaveText('0/0')

  const ausente = await abrirIgreja(AUSENTE)
  await expect(valor(ausente, 'Unidades da Escola Sabatina').locator('strong')).toHaveText('Sem informação neste trimestre')
  await expect(valor(ausente, 'Pequenos Grupos').locator('strong')).toHaveText('Sem informação neste trimestre')
  await expect(ausente.getByText('Relatório Integrado')).toHaveCount(0)

  await ausente.getByRole('link', { name: 'Abrir' }).click()
  await expect(page).toHaveURL(/\/app\/metas\/uapg\?trimestre=2026-2/u)
  const metas = page.locator('section.card').filter({ has: page.getByRole('heading', { name: 'Metas por igreja' }) })
  await expect(metas.getByText('Dados do 2º trimestre de 2026')).toBeVisible()
  const linha = (nome: string) => metas.getByRole('row').filter({ has: page.getByRole('rowheader', { name: nome, exact: true }) })
  await expect(linha(NORTE.nome).locator('td strong')).toHaveText(['4/0', '5/0', 'Sem informação'])
  await expect(linha(ZERO.nome).locator('td strong')).toHaveText(['0/0', '0/0', 'Sem informação'])
  await expect(linha(AUSENTE).locator('td strong')).toHaveText(['Sem informação neste trimestre', 'Sem informação neste trimestre', 'Sem informação'])
  // O distrito soma só quem informou no trimestre: 4 + 3 + 0 e 5 + 2 + 0.
  await expect(linha('Distrito').locator('td strong')).toHaveText(['7/0', '7/0', 'Sem informação'])
  await expect(linha('Distrito').getByText('1 sem informação')).toHaveCount(2)
})

test('os cartões de Metas ficam limpos, e o arquivo que não é PDF pede conversão', async ({ page }) => {
  test.setTimeout(240_000)
  await entrar(page)

  const cartao = page.getByRole('heading', { name: 'Relatório Integrado do trimestre' })
  await navigateInsideApp(page, '/app/metas', cartao)
  await expect(page.getByText(/% alcançado/u)).toHaveCount(0)
  await expect(page.getByText('Defina a meta do ano para acompanhar')).toHaveCount(0)
  await expect(page.getByText(/Um de cada para cada 12 membros · \d+ no distrito/u)).toBeVisible()
  await page.getByRole('link', { name: 'Enviar Relatório Integrado em PDF' }).click()
  await expect(page.getByRole('heading', { name: 'Relatório Integrado', exact: true })).toBeVisible()

  await page.getByLabel('Arquivo').setInputFiles({ name: 'relatorio-respondido.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: Buffer.from('conteúdo fictício') })
  await expect(page.getByRole('alert')).toHaveText('Converta o Relatório Integrado respondido para PDF e tente novamente.')
})

/*
  A campanha que a igreja informou vira cadastro de verdade no Evangelismo: com
  nome provisório, sem data inventada, e sem duplicar ao tocar de novo, reabrir
  ou importar o mesmo PDF.
*/
test('as campanhas informadas viram cadastro no Evangelismo, com Semana Santa, sem data e sem duplicar', async ({ page }) => {
  test.setTimeout(240_000)
  await entrar(page)
  await cadastrarIgreja(page, NORTE.nome)
  await cadastrarIgreja(page, SUL.nome)
  await abrirRelatorio(page)
  const pdf = relatorioIntegradoFicticio(1, [
    { ...NORTE, pequenosGrupos: '5', campanhas: '2', semanaSanta: '30' },
    { ...SUL, pequenosGrupos: '2', campanhas: '1' },
  ])
  await enviarEGravar(page, 'campanhas-ficticio.pdf', 1, pdf)

  const acoes = page.locator('section').filter({ has: page.getByRole('heading', { name: /^Ações de cadastro/ }) })
  const norte = acoes.locator('details.ri-dobra').filter({ hasText: NORTE.nome })
  await expect(norte.locator('summary')).toContainText('2 campanhas para cadastrar')
  await norte.locator('summary').click()
  await expect(norte.getByText('2 campanhas informadas e ainda não cadastradas')).toBeVisible()
  await norte.getByRole('button', { name: 'Cadastrar campanhas' }).click()
  const confirmacao = norte.getByRole('group', { name: `Cadastrar campanha de ${NORTE.nome}` })
  await expect(confirmacao).toContainText(`Semana Santa · Campanha 2 — ${NORTE.nome}`)
  await expect(confirmacao).toContainText('1º trimestre de 2026')
  await expect(confirmacao).toContainText('Relatório Integrado')
  await confirmacao.getByRole('button', { name: 'Confirmar cadastro' }).click()

  const cadastradas = page.getByRole('status').filter({ hasText: '2 campanhas cadastradas no Evangelismo' })
  await expect(cadastradas).toContainText('Semana Santa')
  await expect(cadastradas).toContainText(`Campanha 2 — ${NORTE.nome}`)
  await expect(cadastradas.getByText('Cadastrada', { exact: true })).toHaveCount(2)
  await expect(cadastradas.getByRole('link', { name: 'Editar informações' }).first()).toHaveAttribute('href', /\/app\/evangelismo\/.+\?editar=1$/u)
  // A campanha sai das ações; os Pequenos Grupos a cadastrar continuam, porque são outra coisa.
  await expect(norte.getByRole('button', { name: /^Cadastrar campanha/ })).toHaveCount(0)
  await expect(norte.locator('summary')).not.toContainText('campanha')
  await expect(norte.locator('summary')).toContainText('5 cadastros para completar')

  const sul = acoes.locator('details.ri-dobra').filter({ hasText: SUL.nome })
  await sul.locator('summary').click()
  await sul.getByRole('button', { name: 'Cadastrar campanha' }).click()
  await sul.getByRole('button', { name: 'Confirmar cadastro' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Campanha cadastrada no Evangelismo' })).toContainText(`Campanha — ${SUL.nome}`)
  await expect(page.getByRole('button', { name: /^Cadastrar campanha/ })).toHaveCount(0)

  // No Evangelismo: sem data inventada, com o trimestre do relatório no lugar dela.
  await navigateInsideApp(page, '/app/evangelismo', page.getByRole('heading', { name: 'Campanhas', exact: true }))
  const cartoes = page.locator('.campaign-card')
  await expect(cartoes).toHaveCount(3)
  await expect(cartoes.filter({ hasText: 'Semana Santa' })).toContainText('Data não informada · 1º trimestre de 2026')
  await expect(cartoes.filter({ hasText: 'Semana Santa' })).not.toContainText('Em andamento')
  await expect(page.locator('.evangelism-metrics > div').filter({ hasText: 'Data não informada' }).locator('strong')).toHaveText('3')
  await expect(page.locator('section.card').filter({ has: page.getByRole('heading', { name: 'Próximos eventos', exact: true }) })).not.toContainText('Semana Santa')
  await page.evaluate(() => { window.history.pushState({}, '', '/app/planejamento'); window.dispatchEvent(new PopStateEvent('popstate')) })
  await expect(page.getByRole('heading', { name: 'Calendário Anual' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Campanhas sem data definida' })).toContainText('Data não informada · 1º trimestre de 2026')
  await expect(page.locator('.annual-calendar .calendario-item').filter({ hasText: 'Semana Santa' })).toHaveCount(0)

  // Reabrir e importar o mesmo PDF de novo não cria outra.
  await abrirRelatorio(page)
  await expect(page.getByRole('button', { name: /^Cadastrar campanha/ })).toHaveCount(0)
  await enviarEGravar(page, 'campanhas-ficticio.pdf', 1, pdf)
  await expect(page.locator('details.ri-dobra').filter({ hasText: /campanhas? para cadastrar/u })).toHaveCount(0)
  await navigateInsideApp(page, '/app/evangelismo', page.getByRole('heading', { name: 'Campanhas', exact: true }))
  await expect(page.locator('.campaign-card')).toHaveCount(3)

  // A campanha abre sem exigir data, e pode ser editada depois.
  await page.locator('.campaign-card').filter({ hasText: SUL.nome }).click()
  await expect(page.getByText('Informada no Relatório Integrado · 1º trimestre de 2026')).toBeVisible()
  await page.getByRole('button', { name: 'Editar campanha' }).click()
  await page.getByLabel('Nome da campanha').fill('Evangelismo Fictício do Sul')
  await page.getByRole('button', { name: /Salvar campanha/ }).click()
  await expect(page.getByRole('heading', { name: 'Evangelismo Fictício do Sul', level: 1 })).toBeVisible()
})
