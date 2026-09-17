import { expect, test, type Locator, type Page } from '@playwright/test'
import { navigateInsideApp } from './navigation'
import { relatorioIntegradoFicticio } from './pdfFicticio'

/*
  Plano Estratégico na tela inicial: quatro cartões com números do Relatório
  Integrado, detalhe por área e a visitação reduzida a um resumo.
  Só dados fictícios. A soma por classe de Novas Gerações é coberta nos testes
  de unidade: o PDF fictício deste teste não produz a linha por classe.
*/
const email = 'plano.estrategico.e2e@example.invalid'
const password = 'senha-ficticia-plano-2026'
const DISTRITO = 'Distrito Fictício do Relatório'
const NORTE = 'Fictícia do Norte'
const SUL = 'Fictícia do Sul'
/** Igreja sem nenhum relatório: é ela que prova a mensagem de "sem informação". */
const LESTE = 'Fictícia do Leste'
const AREAS = ['Identidade Adventista', 'Liderança', 'Novas Gerações', 'Discipulado']
const ALUNOS = ['0', '2', '4', '4', '3', '6', '6', '9', '2', '2', '38']

async function tocar(alvo: Locator) {
  await alvo.evaluate((elemento) => elemento.scrollIntoView({ block: 'center' }))
  await alvo.click()
}

async function entrar(page: Page) {
  await page.goto('/acesso')
  await page.getByLabel('E-mail').fill(email)
  await page.getByRole('textbox', { name: 'Senha' }).fill(password)
  await page.getByRole('button', { name: 'Criar conta' }).click()
  await page.getByRole('button', { name: 'Já guardei em local seguro' }).click()
  await page.getByLabel('Nome do distrito').fill(DISTRITO)
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByRole('button', { name: 'Cadastrar manualmente' }).click()
  await page.getByRole('link', { name: 'Ir para o início' }).click()
  await expect(page.getByRole('heading', { name: 'Visão do distrito' })).toBeVisible()
}

async function cadastrarIgreja(page: Page, nome: string) {
  await navigateInsideApp(page, '/app/distrito', page.getByRole('heading', { name: DISTRITO }))
  await page.getByRole('link', { name: 'Nova igreja' }).click()
  await page.getByLabel(/Nome da igreja/).fill(nome)
  await page.getByLabel(/Tipo/).selectOption('organized_church')
  await page.getByRole('button', { name: 'Salvar igreja' }).click()
  await expect(page.getByRole('heading', { name: nome, exact: true })).toBeVisible()
}

async function enviarEGravar(page: Page, arquivo: string, trimestre: number, conteudo: Buffer) {
  await navigateInsideApp(page, '/app/metas/relatorio-integrado', page.getByRole('heading', { name: 'Relatório Integrado', exact: true }))
  await page.getByLabel('Arquivo').setInputFiles({ name: arquivo, mimeType: 'application/pdf', buffer: conteudo })
  await expect(page.getByRole('heading', { name: new RegExp(`${trimestre}º trimestre de 2026 · `) })).toBeVisible()
  await page.getByRole('checkbox', { name: /Conferi os números/ }).check()
  await page.getByRole('button', { name: new RegExp(`Gravar ${trimestre}º trimestre de 2026`) }).click()
  await expect(page.getByText(`${trimestre}º trimestre de 2026 gravado`, { exact: false })).toBeVisible()
}

const irAoInicio = (page: Page) => navigateInsideApp(page, '/app', page.getByRole('heading', { name: 'Plano Estratégico da Divisão Sul-Americana — 2026–2030' }))
const cartao = (page: Page, nome: string) => page.getByRole('link', { name: new RegExp(`^${nome}: `, 'u') })
const numeroDo = (page: Page, nome: string) => cartao(page, nome).locator('.plano-card__numero')

/** Menor contraste (WCAG) entre o texto e o fundo real do elemento, no tema aplicado. */
async function menorContraste(page: Page, seletorDoTexto: string): Promise<number> {
  return page.evaluate((seletor) => {
    const canais = (cor: string) => (cor.match(/[\d.]+/gu) ?? []).slice(0, 3).map(Number)
    const luz = (cor: string) => {
      const [r, g, b] = canais(cor).map((valor) => { const c = valor / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 })
      return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0)
    }
    const fundo = (elemento: Element | null): string => {
      for (let atual = elemento; atual; atual = atual.parentElement) {
        const cor = getComputedStyle(atual).backgroundColor
        if (cor && cor !== 'transparent' && !cor.startsWith('rgba(0, 0, 0, 0')) return cor
      }
      return getComputedStyle(document.body).backgroundColor
    }
    const razoes = [...document.querySelectorAll(seletor)].map((elemento) => {
      const [a, b] = [luz(getComputedStyle(elemento).color), luz(fundo(elemento))].sort((x, y) => y - x)
      return ((a ?? 0) + 0.05) / ((b ?? 0) + 0.05)
    })
    return razoes.length ? Math.min(...razoes) : 0
  }, seletorDoTexto)
}

test('Plano Estratégico: cartões com o Relatório Integrado, detalhe da área e visitação em resumo', async ({ page }) => {
  test.setTimeout(300_000)
  await entrar(page)
  await cadastrarIgreja(page, NORTE)
  await cadastrarIgreja(page, SUL)
  await cadastrarIgreja(page, LESTE)

  // Sem relatório: os quatro cartões aparecem, com nome e símbolo, sem número inventado.
  await irAoInicio(page)
  await expect(page.locator('.plano-card')).toHaveCount(4)
  await expect(page.locator('.plano-card__nome')).toHaveText(AREAS)
  await expect(page.locator('.plano-card__numero')).toHaveText(['—', '—', '—', '—'])
  await expect(page.locator('.plano-card .simbolo-area')).toHaveCount(4)

  // A visitação ficou num cartão; as respostas completas estão na Visitação.
  await expect(page.getByRole('heading', { name: 'Respostas das visitas' })).toHaveCount(0)
  await tocar(page.getByRole('link', { name: 'Resumo de Visitação' }))
  await expect(page).toHaveURL(/\/app\/visitacao\?aba=respostas$/)
  await expect(page.getByRole('heading', { name: 'Respostas das visitas' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Respostas' })).toHaveAttribute('aria-current', 'page')

  // Um trimestre, só a igreja do Norte.
  await enviarEGravar(page, 'primeiro-plano-ficticio.pdf', 1, relatorioIntegradoFicticio(1, [
    { nome: NORTE, pequenosGrupos: '3', campanhas: '1', alunos: ALUNOS, membrosEmIdentidade: '12', ministrandoEstudos: '4' },
  ]))
  await irAoInicio(page)
  await expect(numeroDo(page, 'Identidade Adventista')).toHaveText('12')
  await expect(numeroDo(page, 'Discipulado')).toHaveText('4')
  await expect(numeroDo(page, 'Liderança')).toHaveText('—')
  // No cartão ficam só símbolo, nome, número, propósito e "Ver detalhes".
  await expect(cartao(page, 'Discipulado')).toContainText('Viver o discipulado')
  await expect(cartao(page, 'Discipulado')).not.toContainText('Pessoas ministrando estudos bíblicos')
  await expect(cartao(page, 'Discipulado')).not.toContainText('tri')
  await expect(cartao(page, 'Identidade Adventista')).not.toContainText('2026')

  // Teclado: o cartão é um link e abre com Enter.
  await cartao(page, 'Discipulado').focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/app\/plano-estrategico\/discipulado$/)
  await expect(page.getByRole('heading', { name: 'Discipulado', level: 1 })).toBeVisible()
  await expect(page.locator('.plano-resultado__numero')).toHaveText('4')
  await expect(page.locator('.plano-resultado__titulo')).toHaveText('Resultado do distrito')
  await expect(page.locator('.plano-resultado__dados')).toContainText('Ano de 2026')
  // Um trimestre só: não há base de comparação, nem no resultado nem na tabela.
  await expect(page.locator('.plano-variacao')).toHaveText(['—', '—'])
  const pagina = page.locator('.plano-area-page')
  for (const removido of ['Igrejas que responderam', 'Responderam', 'Não responderam', 'Situação', 'Informado', 'Sem relatório', 'Sem informação neste período', 'Igrejas que informaram']) {
    await expect(pagina, removido).not.toContainText(removido)
  }
  // O indicador mostra só nome, número e o detalhe da área: nada de seção, pergunta, cálculo ou arquivo.
  await expect(page.locator('.plano-indicador--principal')).toContainText('Pessoas dando estudos')
  await expect(page.locator('.plano-indicador--principal .plano-indicador__numero')).toHaveText('4')
  await expect(page.locator('.plano-indicador').filter({ hasText: 'Estudos bíblicos (gerais)' })).toHaveCount(1)
  const area = page.locator('.plano-area-page')
  for (const tecnico of ['Seção', 'Pergunta', 'Cálculo', 'Arquivos', '.pdf', 'pág.', 'Soma dos trimestres', 'igreja(s)', 'Igrejas que informaram']) {
    await expect(area, tecnico).not.toContainText(tecnico)
  }

  // Dois trimestres, as duas igrejas.
  await enviarEGravar(page, 'segundo-plano-ficticio.pdf', 2, relatorioIntegradoFicticio(2, [
    { nome: NORTE, pequenosGrupos: '3', campanhas: '0', alunos: ALUNOS, membrosEmIdentidade: '8', ministrandoEstudos: '6' },
    { nome: SUL, pequenosGrupos: '1', campanhas: '0', alunos: ALUNOS, membrosEmIdentidade: '5', ministrandoEstudos: '3' },
  ]))
  await irAoInicio(page)
  // Identidade soma os trimestres (12 + 8 + 5); Discipulado vale o último de cada igreja (6 + 3).
  await expect(numeroDo(page, 'Identidade Adventista')).toHaveText('25')
  await expect(numeroDo(page, 'Discipulado')).toHaveText('9')

  // Terceiro trimestre: o distrito cai, a igreja do Norte cai e a do Sul fica igual.
  await enviarEGravar(page, 'terceiro-plano-ficticio.pdf', 3, relatorioIntegradoFicticio(3, [
    { nome: NORTE, pequenosGrupos: '3', campanhas: '0', alunos: ALUNOS, ministrandoEstudos: '3' },
    { nome: SUL, pequenosGrupos: '1', campanhas: '0', alunos: ALUNOS, ministrandoEstudos: '3' },
  ]))
  await irAoInicio(page)
  await expect(numeroDo(page, 'Discipulado')).toHaveText('6')
  await tocar(cartao(page, 'Discipulado'))

  // Distrito: variação só em porcentagem, e nenhum trimestre futuro vazio na tabela.
  await expect(page.locator('.plano-resultado__numero')).toHaveText('6')
  await expect(page.locator('.plano-resultado__dados')).toContainText('2º tri → 3º tri')
  await expect(page.locator('.plano-resultado__dados .plano-variacao')).toHaveText('−33,3%')
  await expect(page.getByRole('row', { name: /1º trimestre de 2026/ })).toContainText('—')
  await expect(page.getByRole('row', { name: /2º trimestre de 2026/ })).toContainText('+125%')
  await expect(page.getByRole('row', { name: /3º trimestre de 2026/ })).toContainText('−33,3%')
  await expect(page.getByRole('row', { name: /4º trimestre de 2026/ })).toHaveCount(0)
  await expect(page.locator('.plano-area-page')).not.toContainText('+5 (')
  await expect(page.locator('.plano-serie')).toHaveAttribute('aria-label', /Discipulado em 2026\. 1º trimestre de 2026: 4; 2º trimestre de 2026: 9; 3º trimestre de 2026: 6\./)

  // Uma igreja de cada vez, na mesma página: com dados, com variação zerada e sem nenhum dado.
  const seletor = page.getByLabel('Visualizar resultado de')
  await expect(seletor).toHaveValue('distrito')
  await seletor.selectOption({ label: NORTE })
  await expect(page.locator('.plano-resultado__titulo')).toHaveText(NORTE)
  await expect(page.locator('.plano-resultado__numero')).toHaveText('3')
  await expect(page.locator('.plano-resultado__dados .plano-variacao')).toHaveText('−50%')
  await seletor.selectOption({ label: SUL })
  await expect(page.locator('.plano-resultado__numero')).toHaveText('3')
  await expect(page.locator('.plano-resultado__dados .plano-variacao')).toHaveText('0%')
  await expect(page.getByRole('row', { name: /1º trimestre de 2026/ })).toHaveCount(0)
  await seletor.selectOption({ label: LESTE })
  await expect(page.getByText('Sem informação neste período')).toBeVisible()
  await expect(page.locator('.plano-resultado__numero')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Comparação entre trimestres' })).toHaveCount(0)
  await seletor.selectOption({ label: 'Distrito — resultado geral' })
  await expect(page.locator('.plano-resultado__numero')).toHaveText('6')

  await tocar(page.getByRole('button', { name: '1º tri' }))
  await expect(page.getByRole('button', { name: '1º tri' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.plano-resultado__numero')).toHaveText('4')

  // Contraste nos dois temas: rótulo colorido e aba escolhida no detalhe; rótulo, número, texto e ação nos cartões.
  await tocar(page.getByRole('button', { name: 'Ano' }))
  for (const tema of ['claro', 'escuro']) {
    await page.evaluate((valor) => { document.documentElement.dataset.tema = valor }, tema)
    expect(await menorContraste(page, '.plano-resultado__numero, .plano-periodo__aba--ativa, .plano-serie strong, .plano-variacao, .plano-escopo .field__label'), `detalhe ${tema}`).toBeGreaterThanOrEqual(4.5)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), `detalhe ${tema}`).toBe(true)
  }
  await irAoInicio(page)
  for (const tema of ['claro', 'escuro']) {
    await page.evaluate((valor) => { document.documentElement.dataset.tema = valor }, tema)
    expect(await menorContraste(page, '.plano-card__acao, .plano-card__numero, .plano-card__texto, .plano-card__nome'), `início ${tema}`).toBeGreaterThanOrEqual(4.5)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), `início ${tema}`).toBe(true)
  }

  // Cada área abre a própria página, com nome e símbolo; Identidade compara 12 com 13,
  // e Novas Gerações soma os alunos de bebês a jovens das duas igrejas, iguais nos dois últimos trimestres.
  for (const [nome, slug, numero, variacao] of [['Identidade Adventista', 'identidade', '25', '+8,3%'], ['Liderança', 'lideranca', '', ''], ['Novas Gerações', 'novas-geracoes', '50', '0%']] as const) {
    await irAoInicio(page)
    await tocar(cartao(page, nome))
    await expect(page).toHaveURL(new RegExp(`/app/plano-estrategico/${slug}$`))
    await expect(page.getByRole('heading', { name: nome, level: 1 })).toBeVisible()
    await expect(page.locator('.plano-area-hero .simbolo-area')).toHaveCount(1)
    await expect(page.getByLabel('Visualizar resultado de')).toBeVisible()
    if (numero) {
      await expect(page.locator('.plano-resultado__numero')).toHaveText(numero)
      await expect(page.locator('.plano-resultado__dados .plano-variacao')).toHaveText(variacao)
    } else {
      await expect(page.locator('.plano-resultado__vazio')).toHaveText('Sem informação neste período')
    }
  }
})
