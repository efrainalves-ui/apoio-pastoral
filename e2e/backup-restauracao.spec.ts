import { expect, test, type Page } from '@playwright/test'
import { navigateInsideApp } from './navigation'

/*
  Todos os dados aqui são fictícios. Nenhum nome, igreja ou valor real do
  distrito entra em teste automatizado.
*/
const password = 'senha-ficticia-backup-2026'
const CODIGO = 'codigo-ficticio-de-backup-2026'

async function entrar(page: Page, email: string, distrito: string) {
  await page.goto('/acesso')
  await page.getByLabel('E-mail').fill(email)
  await page.getByRole('textbox', { name: 'Senha' }).fill(password)
  await page.getByRole('button', { name: 'Criar conta' }).click()
  await page.getByRole('button', { name: 'Já guardei em local seguro' }).click()
  await page.getByLabel('Nome do distrito').fill(distrito)
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByRole('button', { name: 'Cadastrar manualmente' }).click()
  await page.getByRole('link', { name: 'Ir para o início' }).click()
}

/**
 * Esvazia os cofres sem tocar na conta, na chave nem no aparelho.
 *
 * É exatamente o que um aparelho novo tem depois da primeira entrada: a conta
 * existe, a chave abre, e não há um único registro dentro. Apagar a conta junto
 * testaria outra coisa — restaurar em conta diferente é recusado de propósito.
 */
async function esvaziarOsCofres(page: Page) {
  await page.evaluate(async () => {
    const limpar = (nome: string, tabelas: string[]) => new Promise<void>((resolve, reject) => {
      const pedido = indexedDB.open(nome)
      pedido.onerror = () => reject(new Error(`não abriu ${nome}`))
      pedido.onsuccess = () => {
        const banco = pedido.result
        const existentes = tabelas.filter((tabela) => banco.objectStoreNames.contains(tabela))
        if (!existentes.length) { banco.close(); resolve(); return }
        const transacao = banco.transaction(existentes, 'readwrite')
        existentes.forEach((tabela) => transacao.objectStore(tabela).clear())
        transacao.oncomplete = () => { banco.close(); resolve() }
        transacao.onerror = () => { banco.close(); reject(new Error(`não limpou ${nome}`)) }
      }
    })
    await limpar('apoio-pastoral', ['vaultRecords', 'outbox', 'pendingActions', 'corruptedRecords'])
    await limpar('apoio-pastoral-personal-reading', ['records'])
    await limpar('apoio-pastoral-family-budget', ['records'])
  })
}

test('o backup sai como arquivo e volta num cofre vazio', async ({ page }) => {
  test.setTimeout(180_000)
  await entrar(page, 'backup.volta.e2e@example.invalid', 'Distrito Fictício do Backup')

  // Um pedaço de cada banco: distrito no cofre pastoral, orçamento no pessoal.
  await navigateInsideApp(page, '/app/distrito', page.getByRole('heading', { name: 'Distrito Fictício do Backup' }))
  await page.getByRole('link', { name: 'Nova igreja' }).click()
  await page.getByLabel(/Nome da igreja/).fill('Igreja Fictícia da Restauração')
  await page.getByLabel(/Tipo/).selectOption('preaching_point')
  await page.getByLabel(/Endereço/).fill('Rua Fictícia, 10')
  await page.getByRole('button', { name: 'Adicionar horário' }).click()
  await page.getByRole('button', { name: 'Salvar igreja' }).click()
  await expect(page.getByRole('heading', { name: 'Igreja Fictícia da Restauração' })).toBeVisible()

  await navigateInsideApp(page, '/app/orcamento/resumo', page.getByRole('heading', { name: 'Pessoal' }))
  await page.getByRole('link', { name: 'Metas e Planejamento' }).click()
  await page.getByRole('button', { name: 'Metas e sonhos' }).click()
  await page.getByRole('button', { name: 'Nova meta' }).click()
  await page.getByLabel('Nome *').fill('Meta Fictícia do Backup')
  await page.getByLabel('Valor da meta *').fill('2.500,00')
  await page.locator('#conteudo').getByRole('button', { name: 'Criar' }).click()
  await expect(page.getByText('Meta Fictícia do Backup')).toBeVisible()

  // O arquivo de verdade: baixado pelo navegador, lido do disco, reenviado.
  await navigateInsideApp(page, '/app/backup', page.getByRole('heading', { name: 'Backup seguro' }))
  await page.locator('#backup-code').fill(CODIGO)
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Criar e salvar backup' }).click()
  const arquivo = await (await download).path()
  expect(arquivo).toBeTruthy()
  await expect(page.getByText('Backup criado neste dispositivo.')).toBeVisible()

  /*
    Esvaziar e recarregar é o estado de um aparelho novo: a conta existe, a
    chave abre, e não há um único registro dentro.
  */
  await esvaziarOsCofres(page)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Entre na sua conta' })).toBeVisible()
  await page.getByRole('textbox', { name: 'Senha' }).fill(password)
  await page.getByRole('button', { name: 'Entrar' }).click()

  /*
    Sem distrito, o aplicativo convida a criar um. Quem tem o arquivo não quer
    criar nada — quer o distrito que já existe de volta, e precisa de uma porta
    daqui. Sem ela, o único caminho seria inventar um distrito e restaurar por
    cima dele.
  */
  await expect(page.getByRole('heading', { name: 'Vamos organizar seu distrito' })).toBeVisible()
  await page.getByRole('link', { name: 'Já tenho um backup' }).click()
  await expect(page.getByRole('heading', { name: 'Restaurar seu distrito' })).toBeVisible()

  await page.locator('#restaurar-codigo').fill(CODIGO)
  await page.getByLabel('Arquivo de backup').setInputFiles(arquivo)
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Restaurar este backup' }).click()
  await expect(page.getByText(/Backup restaurado/u)).toBeVisible({ timeout: 60_000 })

  // E os dois bancos voltaram, sem o pastor ter cadastrado nada de novo.
  await page.goto('/app/distrito')
  await expect(page.getByRole('heading', { name: 'Entre na sua conta' })).toBeVisible()
  await page.getByRole('textbox', { name: 'Senha' }).fill(password)
  await page.getByRole('button', { name: 'Entrar' }).click()

  await navigateInsideApp(page, '/app/distrito', page.getByRole('heading', { name: 'Distrito Fictício do Backup' }))
  await page.getByRole('link', { name: /Igreja Fictícia da Restauração/u }).first().click()
  await expect(page.getByRole('heading', { name: 'Igreja Fictícia da Restauração' })).toBeVisible()

  await navigateInsideApp(page, '/app/orcamento/planejamento', page.getByRole('heading', { name: 'Pessoal' }))
  await page.getByRole('button', { name: 'Metas e sonhos' }).click()
  await expect(page.getByText('Meta Fictícia do Backup')).toBeVisible()
})

/**
 * Enche o banco pessoal com registros fictícios.
 *
 * Eles viajam no backup como estão — o backup não abre registro pessoal, só o
 * carrega. Servem para dar volume: a restauração precisa demorar o bastante
 * para que uma interrupção de verdade caia no meio dela, como cairia no
 * aparelho do pastor com um distrito inteiro dentro.
 */
async function encherDeRegistros(page: Page, quantidade: number) {
  await page.evaluate(async (total) => {
    const abrir = (nome: string) => new Promise<IDBDatabase>((resolve, reject) => {
      const pedido = indexedDB.open(nome)
      pedido.onsuccess = () => resolve(pedido.result)
      pedido.onerror = () => reject(new Error(`não abriu ${nome}`))
    })

    const principal = await abrir('apoio-pastoral')
    const accountId = await new Promise<string>((resolve, reject) => {
      const pedido = principal.transaction('accounts', 'readonly').objectStore('accounts').getAll()
      pedido.onsuccess = () => resolve((pedido.result[0] as { id: string }).id)
      pedido.onerror = () => reject(new Error('sem conta'))
    })
    principal.close()

    const pessoal = await abrir('apoio-pastoral-family-budget')
    await new Promise<void>((resolve, reject) => {
      const transacao = pessoal.transaction('records', 'readwrite')
      const loja = transacao.objectStore('records')
      for (let indice = 0; indice < total; indice += 1) {
        loja.put({
          id: `ficticio-${indice}`, accountId, recordType: 'pessoal_ficticio',
          createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
          ciphertext: `ciphertext-ficticio-${indice}`, iv: 'iv-ficticio',
          aad: `aad-ficticio-${indice}`, keyVersion: 1, algorithm: 'AES-GCM-256',
        })
      }
      transacao.oncomplete = () => resolve()
      transacao.onerror = () => reject(new Error('não gravou'))
    })
    pessoal.close()
  }, quantidade)
}

test('a restauração interrompida deixa a pendência e é concluída depois', async ({ page }) => {
  test.setTimeout(240_000)
  await entrar(page, 'backup.retomada.e2e@example.invalid', 'Distrito Fictício da Retomada')

  await navigateInsideApp(page, '/app/distrito', page.getByRole('heading', { name: 'Distrito Fictício da Retomada' }))
  await page.getByRole('link', { name: 'Nova igreja' }).click()
  await page.getByLabel(/Nome da igreja/).fill('Igreja Fictícia da Retomada')
  await page.getByLabel(/Tipo/).selectOption('preaching_point')
  await page.getByRole('button', { name: 'Adicionar horário' }).click()
  await page.getByRole('button', { name: 'Salvar igreja' }).click()
  await expect(page.getByRole('heading', { name: 'Igreja Fictícia da Retomada' })).toBeVisible()

  // Uma meta cria o banco pessoal; sem ele não há onde semear.
  await navigateInsideApp(page, '/app/orcamento/planejamento', page.getByRole('heading', { name: 'Pessoal' }))
  await page.getByRole('button', { name: 'Metas e sonhos' }).click()
  await page.getByRole('button', { name: 'Nova meta' }).click()
  await page.getByLabel('Nome *').fill('Meta Fictícia da Retomada')
  await page.getByLabel('Valor da meta *').fill('1.000,00')
  await page.locator('#conteudo').getByRole('button', { name: 'Criar' }).click()
  await expect(page.getByText('Meta Fictícia da Retomada')).toBeVisible()

  await encherDeRegistros(page, 900)

  await navigateInsideApp(page, '/app/backup', page.getByRole('heading', { name: 'Backup seguro' }))
  await page.locator('#backup-code').fill(CODIGO)
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Criar e salvar backup' }).click()
  const arquivo = await (await download).path()
  await expect(page.getByText('Backup criado neste dispositivo.')).toBeVisible({ timeout: 60_000 })

  await esvaziarOsCofres(page)
  await page.reload()
  await page.getByRole('textbox', { name: 'Senha' }).fill(password)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await page.getByRole('link', { name: 'Já tenho um backup' }).click()
  await expect(page.getByRole('heading', { name: 'Restaurar seu distrito' })).toBeVisible()

  await page.locator('#restaurar-codigo').fill(CODIGO)
  await page.getByLabel('Arquivo de backup').setInputFiles(arquivo)
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Restaurar este backup' }).click()

  /*
    A interrupção: o navegador fecha no meio da gravação. É o que acontece
    quando o aparelho descarrega, a aba é fechada ou o sistema mata o aplicativo
    em segundo plano.
  */
  await expect(page.getByRole('button', { name: 'Restaurando…' })).toBeVisible()
  await page.waitForTimeout(1200)
  await page.reload()

  await page.getByRole('textbox', { name: 'Senha' }).fill(password)
  await page.getByRole('button', { name: 'Entrar' }).click()

  /*
    Parte do distrito já entrou, então o aplicativo abre normalmente. É aqui que
    o pastor ficaria com metade de um distrito sem saber: o aviso existe para
    que ninguém precise adivinhar que há algo pela metade.
  */
  await expect(page.getByText(/Restauração pela metade: \d+ de \d+ registros entraram/u)).toBeVisible()
  await page.getByRole('link', { name: 'Concluir restauração' }).click()

  await expect(page.getByRole('heading', { name: 'Restauração pela metade' })).toBeVisible()
  await expect(page.getByText(/de \d+ registros já entraram/u)).toBeVisible()

  await page.locator('#restaurar-codigo-pendente').fill(CODIGO)
  await page.getByRole('button', { name: 'Concluir restauração' }).click()
  await expect(page.getByText(/Restauração concluída/u)).toBeVisible({ timeout: 120_000 })

  // Concluída, a pendência some e o distrito está de volta por inteiro.
  await expect(page.getByRole('heading', { name: 'Restauração pela metade' })).toHaveCount(0)
  await navigateInsideApp(page, '/app/distrito', page.getByRole('heading', { name: 'Distrito Fictício da Retomada' }))
  await page.getByRole('link', { name: /Igreja Fictícia da Retomada/u }).first().click()
  await expect(page.getByRole('heading', { name: 'Igreja Fictícia da Retomada' })).toBeVisible()
})
