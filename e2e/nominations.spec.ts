import { expect, test, type Page } from '@playwright/test'
import { navigateInsideApp } from './navigation'

const PERIODO = 'Nomeações Fictícias'

/**
 * No celular a barra inferior fica sobre o rodapé da página, então a opção é
 * centralizada antes do clique. O estado só volta depois de gravar no cofre.
 */
async function marcarOpcao(page: Page, nome: string) {
  const opcao = page.locator('label.choice-card').filter({ hasText: nome }).first()
  await opcao.evaluate((elemento) => elemento.scrollIntoView({ block: 'center' }))
  await opcao.click()
  await expect(page.getByRole('checkbox', { name: nome }).first()).toBeChecked()
}

async function prepare(page: Page) {
  await page.goto('/acesso')
  await page.getByRole('tab', { name: 'Criar conta' }).click()
  await page.getByLabel('E-mail').fill('nomeacoes.e2e@example.invalid')
  await page.getByRole('textbox', { name: 'Senha' }).fill('senha-ficticia-nomeacoes-2027')
  await page.getByRole('button', { name: 'Criar conta' }).click()
  await page.getByRole('button', { name: 'Já guardei em local seguro' }).click()
  await page.getByLabel('Nome do distrito').fill('Distrito Fictício de Nomeações')
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByRole('button', { name: 'Cadastrar manualmente' }).click()
  await page.getByRole('link', { name: 'Revisar igrejas' }).click()
  await page.getByRole('link', { name: 'Nova igreja' }).click()
  await page.getByLabel('Nome da igreja *').fill('Igreja Fictícia de Nomeações')
  await page.getByLabel('Tipo *').selectOption('organized_church')
  await page.getByRole('button', { name: 'Salvar igreja' }).click()
  await expect(page.getByRole('heading', { name: 'Igreja Fictícia de Nomeações', exact: true })).toBeVisible()

  for (const name of ['Pessoa Fictícia Alfa', 'Pessoa Fictícia Beta']) {
    await navigateInsideApp(page, '/app/pessoas/nova', page.getByLabel('Nome completo *'))
    await page.getByLabel('Nome completo *').fill(name)
    await page.getByRole('button', { name: 'Salvar pessoa' }).click()
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible()
  }
}

async function abrirProcesso(page: Page) {
  await navigateInsideApp(page, '/app/comissoes', page.getByRole('heading', { name: 'Comissões', exact: true }))
  const nominationsChurch = page.getByRole('combobox', { name: /^Igreja(?:$|\s)/ })
  await expect(nominationsChurch).toContainText('Igreja Fictícia de Nomeações')
  await page.getByRole('link', { name: 'Abrir Nomeações' }).click()
  await expect(nominationsChurch).toContainText('Igreja Fictícia de Nomeações')

  await page.getByRole('button', { name: 'Novo processo' }).click()
  await page.getByLabel('Período').fill(PERIODO)
  await page.getByRole('button', { name: 'Criar processo' }).click()
  await expect(page.getByRole('heading', { name: PERIODO })).toBeVisible()
}

test('cargos e associados da Comissão de Nomeações, sem nenhuma demonstração', async ({ page }) => {
  await prepare(page)
  await navigateInsideApp(page, '/app/comissoes', page.getByRole('heading', { name: 'Comissões', exact: true }))
  await page.getByRole('link', { name: 'Abrir Nomeações' }).click()

  // Nada de demonstração aparece para o pastor.
  await expect(page.getByText('Apenas para teste')).toHaveCount(0)
  await expect(page.getByText('Exemplo fictício de Nomeações')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Preparar demonstração fictícia de Nomeações' })).toHaveCount(0)

  await page.getByRole('button', { name: 'Novo processo' }).click()
  await page.getByLabel('Período').fill(PERIODO)
  await page.getByRole('button', { name: 'Criar processo' }).click()
  await expect(page.getByRole('heading', { name: PERIODO })).toBeVisible()

  // O catálogo traz o diaconato separado e não tem mais Coordenador(a) de Missão.
  await page.getByRole('button', { name: 'Cargos' }).click()
  const catalogo = page.locator('.entity-row')
  for (const office of ['Ancião', 'Diácono chefe', 'Diaconisa chefe', 'Primeiro diácono', 'Primeira diaconisa', 'Diáconos', 'Diaconisas', 'Secretários dos departamentos', 'Ministério da Mulher', 'Ministério dos Homens', 'Patrimônio', 'Sonoplastia', 'Mídia', 'Adolescentes', 'Diretor de Desbravadores', 'Diretor de Aventureiros', 'Diretor de Escola Sabatina']) {
    await expect(catalogo.filter({ hasText: office }).first()).toBeVisible()
  }
  await expect(catalogo.filter({ hasText: 'Coordenador(a) de Missão' })).toHaveCount(0)
  await expect(catalogo.filter({ hasText: 'Diácono/Diaconisa' })).toHaveCount(0)

  await catalogo.filter({ hasText: 'Ancião' }).first().getByRole('button', { name: 'Editar' }).click()
  await expect(page.getByText('Ancião, diácono chefe, diaconisa chefe, primeiro diácono, primeira diaconisa, diáconos e diaconisas não têm associados.')).toBeVisible()
  await expect(page.getByRole('checkbox', { name: 'Pode ter associado(a)' })).toHaveCount(0)

  // Associado só onde o cargo aceita.
  await page.getByRole('button', { name: 'Indicações' }).click()
  await page.getByLabel('Cargo').selectOption({ label: 'Ancião' })
  await expect(page.getByRole('checkbox', { name: 'Indicar como associado(a)' })).toHaveCount(0)
  await page.getByLabel('Cargo').selectOption({ label: 'Patrimônio' })
  await page.getByRole('checkbox', { name: 'Indicar como associado(a)' }).check()
  await page.getByLabel('Pessoa da igreja').selectOption({ label: 'Pessoa Fictícia Beta' })
  await page.getByRole('button', { name: 'Adicionar indicação' }).click()
  await expect(page.getByText('Pessoa Fictícia Beta · Patrimônio (associado)')).toBeVisible()
})

test('jornada completa e confidencial da Comissão de Nomeações', async ({ page }) => {
  await prepare(page)
  await abrirProcesso(page)

  await page.getByRole('button', { name: 'Formação' }).click()
  await page.getByLabel('Quórum').fill('2')
  await page.getByLabel('Pastor ou líder distrital').selectOption({ label: 'Pessoa Fictícia Alfa' })
  await page.getByLabel('Presidente').selectOption({ label: 'Pessoa Fictícia Alfa' })
  await page.getByLabel('Secretário(a)').selectOption({ label: 'Pessoa Fictícia Beta' })
  await page.getByRole('checkbox', { name: 'Pessoa Fictícia Beta' }).nth(1).check()
  await page.getByRole('button', { name: 'Salvar formação' }).click()
  await expect(page.getByText('Formação da comissão salva.')).toBeVisible()

  await page.getByRole('button', { name: 'Indicações' }).click()
  await page.getByLabel('Cargo').selectOption({ label: 'Patrimônio' })
  await page.getByRole('checkbox', { name: 'Indicar como associado(a)' }).check()
  await page.getByLabel('Pessoa da igreja').selectOption({ label: 'Pessoa Fictícia Beta' })
  await page.getByRole('button', { name: 'Adicionar indicação' }).click()
  await expect(page.getByText('Pessoa Fictícia Beta · Patrimônio (associado)')).toBeVisible()
  await expect(page.getByText(/não consta como dizimista regular/)).toBeVisible()

  await marcarOpcao(page, 'Consentiu em servir')
  await page.getByRole('button', { name: 'Elegibilidade confirmada' }).click()
  await expect(page.getByText('Elegibilidade confirmada').first()).toBeVisible()

  await page.getByRole('button', { name: 'Reuniões' }).click()
  await page.getByRole('button', { name: 'Nova reunião' }).click()
  await expect(page.getByText('Registro confidencial', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Adicionar à Agenda' }).click()
  await expect(page.getByRole('button', { name: 'Na Agenda' })).toBeVisible()

  await page.getByRole('button', { name: 'Indicações' }).click()
  await page.getByLabel('Favoráveis').fill('2')
  await page.getByLabel('Reunião').selectOption({ index: 1 })
  await page.getByRole('button', { name: 'Votar recomendação' }).click()
  await expect(page.getByText('Recomendação aprovada')).toBeVisible()

  await page.getByRole('button', { name: 'Relatório e objeções' }).click()
  await page.getByRole('button', { name: 'Gerar nova versão' }).click()
  await expect(page.getByText(/versão 1/)).toBeVisible()
  // Por padrão o relatório mostra os cargos e não quem foi indicado.
  await expect(page.locator('.public-report')).not.toContainText('Pessoa Fictícia Beta')
  await page.getByRole('checkbox', { name: /Incluir nomes/u }).check()
  await expect(page.locator('.public-report')).toContainText('Patrimônio (associado): Pessoa Fictícia Beta')
  await expect(page.locator('.public-report')).not.toContainText('dizimista')
  await expect(page.locator('.public-report')).not.toContainText('favoráveis')

  // Cada cargo pode ser votado sozinho pela igreja.
  await page.getByRole('button', { name: 'Votação oficial' }).click()
  const preparar = page.locator('.card').filter({ hasText: 'Preparar votação oficial' })
  await preparar.getByLabel('Forma da votação').selectOption('by_office')
  await preparar.getByLabel(/^Cargo/).selectOption({ label: 'Patrimônio' })
  await page.getByRole('button', { name: 'Preparar votação' }).click()
  await expect(page.getByText('Votação oficial preparada.')).toBeVisible()

  await page.getByLabel('Quórum').fill('2')
  for (const name of ['Pessoa Fictícia Alfa', 'Pessoa Fictícia Beta']) {
    await marcarOpcao(page, name)
  }
  await page.getByLabel('Favoráveis').fill('2')
  await page.getByRole('button', { name: 'Registrar votação oficial' }).click()
  await expect(page.getByText('Relatório aprovado')).toBeVisible()
})
