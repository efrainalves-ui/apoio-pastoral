import { expect, test, type Page } from '@playwright/test'
import { navigateInsideApp } from './navigation'

const email = 'trabalho.orcamento.e2e@example.invalid'
const password = 'senha-ficticia-trabalho-2026'

async function entrar(page: Page) {
  await page.goto('/acesso')
  await page.getByLabel('E-mail').fill(email)
  await page.getByRole('textbox', { name: 'Senha' }).fill(password)
  await page.getByRole('button', { name: 'Criar conta' }).click()
  await page.getByRole('button', { name: 'Já guardei em local seguro' }).click()
  await page.getByLabel('Nome do distrito').fill('Distrito Fictício do Trabalho')
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByRole('button', { name: 'Cadastrar manualmente' }).click()
  await page.getByRole('link', { name: 'Ir para o início' }).click()
}

/*
  Todos os valores deste teste são inventados. Nenhum FPE, percentual ou
  documento real de nenhum obreiro entra aqui.
*/
test('o Trabalho calcula o reembolso a partir dos parâmetros configurados', async ({ page }) => {
  test.setTimeout(120_000)
  await entrar(page)

  const cartao = (titulo: string) => page.locator('.card').filter({ has: page.getByRole('heading', { name: titulo }) })
  const base = cartao('Base de subsistência')
  await navigateInsideApp(page, '/app/orcamento/trabalho/configuracao', page.getByRole('heading', { name: 'Base de subsistência' }))

  // Sem parâmetro, a tela diz que falta configurar em vez de mostrar zero.
  await expect(base.getByText('Ainda não configurado').first()).toBeVisible()

  await page.locator('#config-fpe').fill('7000')
  await page.locator('#config-fpe-inicio').fill('2026-01-01')
  await page.locator('#config-fpe-ref').fill('Comunicado fictício 01/2026')
  await page.getByRole('button', { name: 'Acrescentar' }).first().click()

  await page.locator('#config-audit').fill('80')
  await page.locator('#config-audit-inicio').fill('2026-01-01')
  await page.getByRole('button', { name: 'Acrescentar' }).nth(1).click()

  // 7.000 × 80% = 5.600. O aplicativo calcula; ninguém digita a subsistência.
  await expect(base.getByText('R$ 5.600,00')).toBeVisible()

  await page.locator('#config-nova-regra').selectOption('energia')
  await page.locator('#regra-energia-resp').selectOption('reembolso_parcial')
  await page.locator('#regra-energia-perc').fill('30')
  await page.getByRole('button', { name: 'Salvar configuração' }).click()
  await expect(page.getByText('Configuração salva.')).toBeVisible()

  await navigateInsideApp(page, '/app/orcamento/trabalho/lancamentos', page.getByRole('button', { name: 'Novo lançamento' }))
  await page.getByRole('button', { name: 'Novo lançamento' }).click()
  await page.locator('#lancamento-categoria').selectOption('energia')
  await page.locator('#lancamento-descricao').fill('Conta de energia da casa pastoral')
  await page.locator('#lancamento-pago').fill('400')
  await page.getByRole('button', { name: 'Calcular previsto' }).click()

  // 30% de 400 = 120, e a memória guarda o FPE e o percentual que valiam.
  await expect(page.locator('#lancamento-previsto')).toHaveValue('120')
  const memoria = page.locator('.memoria-do-calculo').first()
  await expect(memoria.getByText('R$ 7.000,00')).toBeVisible()
  await expect(memoria.getByText('30%')).toBeVisible()

  await page.getByRole('button', { name: 'Salvar lançamento' }).click()
  await expect(page.getByText('Lançamento registrado.')).toBeVisible()

  /*
    Enquanto o reembolso não cai, os 400 inteiros estão fora do bolso do pastor.
    Descontar o previsto antes da hora mostraria uma folga que não existe.
  */
  const resumo = page.getByLabel('Resumo dos lançamentos do mês')
  await expect(resumo.getByText('R$ 400,00')).toHaveCount(2)
  await expect(resumo.getByText('R$ 120,00')).toBeVisible()

  // O LETRA cobre até o limite do item; o que passa fica com o pastor.
  await navigateInsideApp(page, '/app/orcamento/trabalho/letra', page.getByRole('button', { name: 'Novo item' }))
  await page.locator('#letra-total').fill('6000')
  await page.locator('#letra-reserva').fill('2000')
  await page.getByRole('button', { name: 'Salvar orçamento' }).click()
  await expect(page.getByText('Orçamento do LETRA salvo.')).toBeVisible()

  await page.getByRole('button', { name: 'Novo item' }).click()
  await page.locator('#letra-item-nome').fill('Notebook fictício')
  await page.locator('#letra-item-limite').fill('4000')
  await page.locator('#letra-item-intervalo').fill('48')
  await page.getByRole('button', { name: 'Salvar item' }).click()
  await expect(page.getByText('Item salvo.')).toBeVisible()

  await page.getByRole('button', { name: 'Registrar' }).first().click()
  await page.locator('#letra-compra-valor').fill('4600')
  const compra = cartao('Nova aquisição')
  await expect(compra.getByText('R$ 4.000,00').first()).toBeVisible()
  await expect(compra.getByText('R$ 600,00')).toBeVisible()

  await page.getByRole('button', { name: 'Salvar aquisição' }).click()
  await expect(page.getByText('Aquisição registrada.')).toBeVisible()

  // Comprado agora, o item fica bloqueado pelo intervalo de renovação.
  await expect(page.getByText(/Libera em \d{2}\/\d{2}\/\d{4}/u)).toBeVisible()

  // A visão do mês mostra os mesmos números, sem o pastor ter de somar de novo.
  await navigateInsideApp(page, '/app/orcamento/trabalho/resumo', page.getByRole('heading', { name: 'Base de subsistência' }))
  await expect(base.getByText('R$ 5.600,00')).toBeVisible()
  await expect(page.getByLabel('Reembolsos do mês').getByText('R$ 400,00')).toHaveCount(2)
})

test('o orçamento pessoal não vê nada do Trabalho', async ({ page }) => {
  test.setTimeout(120_000)
  await entrar(page)

  await navigateInsideApp(page, '/app/orcamento/trabalho/configuracao', page.getByRole('heading', { name: 'Base de subsistência' }))
  await page.locator('#config-campo').fill('Campo Fictício do Norte')
  await page.getByRole('button', { name: 'Salvar configuração' }).click()
  await expect(page.getByText('Configuração salva.')).toBeVisible()

  /*
    Os dois orçamentos vivem em bancos separados. Se o Campo do obreiro
    aparecesse na tela da família, a separação seria só de nome.
  */
  await navigateInsideApp(page, '/app/orcamento/resumo', page.getByRole('heading', { name: 'Pessoal' }))
  await expect(page.getByText('Campo Fictício do Norte')).toHaveCount(0)
})

test('a parcela pessoal atravessa uma vez só para o orçamento da família', async ({ page }) => {
  test.setTimeout(120_000)
  await entrar(page)

  await navigateInsideApp(page, '/app/orcamento/trabalho/lancamentos', page.getByRole('button', { name: 'Novo lançamento' }))
  await page.getByRole('button', { name: 'Novo lançamento' }).click()
  await page.locator('#lancamento-categoria').selectOption('combustivel')
  await page.locator('#lancamento-descricao').fill('Combustível do distrito')
  await page.locator('#lancamento-pago').fill('400')
  await page.getByRole('button', { name: 'Salvar lançamento' }).click()
  await expect(page.getByText('Lançamento registrado.')).toBeVisible()

  await page.getByRole('button', { name: 'Levar ao pessoal' }).click()
  await expect(page.getByText('Parcela pessoal lançada no orçamento pessoal.')).toBeVisible()

  /*
    Reembolso de 120 depois: os 400 viram 280 no bolso. O lançamento da família
    é corrigido, não somado de novo — somar de novo dobraria a despesa do mês.
  */
  await page.getByRole('button', { name: 'Editar' }).first().click()
  await page.locator('#lancamento-recebido').fill('120')
  await page.locator('#lancamento-situacao').selectOption('recebido')
  await page.getByRole('button', { name: 'Salvar lançamento' }).click()
  await expect(page.getByText('Lançamento registrado.')).toBeVisible()
  await page.getByRole('button', { name: 'Atualizar no pessoal' }).click()
  await expect(page.getByText('Parcela pessoal atualizada no orçamento pessoal.')).toBeVisible()

  await navigateInsideApp(page, '/app/orcamento/despesas', page.getByRole('heading', { name: 'Pessoal' }))
  const saidas = page.getByText('Combustível do distrito')
  await expect(saidas).toHaveCount(1)
  await expect(page.getByText('R$ 280,00').first()).toBeVisible()
  await expect(page.getByText('R$ 400,00')).toHaveCount(0)
})

test('a base informativa do contracheque fica fora do líquido', async ({ page }) => {
  test.setTimeout(120_000)
  await entrar(page)

  await navigateInsideApp(page, '/app/orcamento/trabalho/contracheques', page.getByRole('button', { name: 'Novo contracheque' }))
  await page.getByRole('button', { name: 'Novo contracheque' }).click()

  await page.locator('#rubrica-0-descricao').fill('Subsistência básica')
  await page.locator('#rubrica-0-tipo').selectOption('provento')
  await page.locator('#rubrica-0-valor').fill('5600')
  await page.locator('#rubrica-0-item').selectOption('subsistencia_basica')

  await page.getByRole('button', { name: 'Nova rubrica' }).click()
  await page.locator('#rubrica-1-descricao').fill('Previdência')
  await page.locator('#rubrica-1-tipo').selectOption('desconto')
  await page.locator('#rubrica-1-valor').fill('600')

  await page.getByRole('button', { name: 'Nova rubrica' }).click()
  await page.locator('#rubrica-2-descricao').fill('Base de cálculo da previdência')
  await page.locator('#rubrica-2-tipo').selectOption('informativa')
  await page.locator('#rubrica-2-valor').fill('5600')

  /*
    5.600 de provento menos 600 de desconto dá 5.000. A base informativa de
    5.600 aparece à parte: somá-la mostraria uma renda que não caiu na conta, e
    o pastor planejaria o mês em cima dela.
  */
  const totais = page.locator('.estrato').first()
  await expect(totais.getByText('R$ 5.000,00')).toBeVisible()
  await expect(page.locator('.memoria-do-calculo').getByText('R$ 5.600,00')).toBeVisible()

  await page.getByRole('button', { name: 'Salvar contracheque' }).click()
  await expect(page.getByText('Contracheque guardado.')).toBeVisible()
  await expect(page.getByText('A conferir')).toBeVisible()

  // Reimportar o mesmo mês avisa antes de dobrar a renda do mês.
  await page.getByRole('button', { name: 'Novo contracheque' }).click()
  await expect(page.getByText(/Já há um contracheque de \d{4}-\d{2} guardado/u)).toBeVisible()
})

test('a quota-pais vira no mês seguinte ao nono aniversário', async ({ page }) => {
  test.setTimeout(120_000)
  await entrar(page)

  await navigateInsideApp(page, '/app/orcamento/trabalho/configuracao?mes=2026-04', page.getByRole('button', { name: 'Novo dependente' }))
  await page.getByRole('button', { name: 'Novo dependente' }).click()
  await page.locator('#dependente-nome').fill('Dependente Fictício')
  await page.locator('#dependente-nascimento').fill('2017-05-10')
  await page.getByRole('button', { name: 'Salvar dependente' }).click()
  await expect(page.getByText('Dependente salvo.')).toBeVisible()

  // Abril de 2026: ainda não fez nove anos, vale o percentual menor.
  const linha = page.locator('.entity-row').filter({ hasText: 'Dependente Fictício' })
  await expect(linha.getByText('3%')).toBeVisible()

  // Junho: o mês seguinte ao nono aniversário, e o percentual sobe.
  await navigateInsideApp(page, '/app/orcamento/trabalho/configuracao?mes=2026-06', page.getByRole('button', { name: 'Novo dependente' }))
  await expect(page.locator('.entity-row').filter({ hasText: 'Dependente Fictício' }).getByText('5%')).toBeVisible()
})

test('o deslocamento entra no ciclo do reembolso, e só uma vez', async ({ page }) => {
  test.setTimeout(120_000)
  await entrar(page)

  await navigateInsideApp(page, '/app/orcamento/trabalho/configuracao', page.getByRole('heading', { name: 'Base de subsistência' }))
  await page.locator('#config-nova-regra').selectOption('quilometragem')
  await page.locator('#regra-quilometragem-fixo').fill('1,50')
  await page.getByRole('button', { name: 'Salvar configuração' }).click()
  await expect(page.getByText('Configuração salva.')).toBeVisible()

  await navigateInsideApp(page, '/app/orcamento/trabalho/quilometragem', page.getByRole('button', { name: 'Novo deslocamento' }))
  await page.getByRole('button', { name: 'Novo deslocamento' }).click()
  await page.getByLabel('Quilômetros').fill('120')
  await page.getByRole('button', { name: 'Salvar deslocamento' }).click()
  await expect(page.getByText('Deslocamento registrado.')).toBeVisible()

  // 120 km × R$ 1,50 = R$ 180,00, calculado pela regra e não digitado.
  const linha = page.locator('.entity-row').filter({ hasText: '120 km' })
  await expect(linha.getByText('R$ 180,00')).toBeVisible()

  await linha.getByRole('button', { name: 'Lançar' }).click()
  await expect(page.getByText('Deslocamento lançado no ciclo do reembolso.')).toBeVisible()

  /*
    Lançado uma vez, o botão sai. Sem isso, cada visita à tela ofereceria lançar
    os mesmos quilômetros de novo e o mês fecharia pedindo duas vezes o mesmo
    trajeto.
  */
  await expect(page.locator('.entity-row').filter({ hasText: '120 km' }).getByText('No ciclo')).toBeVisible()
  await expect(page.locator('.entity-row').filter({ hasText: '120 km' }).getByRole('button', { name: 'Lançar' })).toHaveCount(0)

  // E ele aparece nos lançamentos, com o previsto vindo dos quilômetros.
  await navigateInsideApp(page, '/app/orcamento/trabalho/lancamentos', page.getByRole('button', { name: 'Novo lançamento' }))
  await expect(page.getByText('120 km')).toBeVisible()
  // O Intl emite espaço inquebrável depois de "R$".
  await expect(page.getByText(/Previsto R\$.180,00/u)).toBeVisible()
})
