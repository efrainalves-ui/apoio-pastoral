import { expect, type Locator, type Page } from '@playwright/test'

async function clickVisibleLink(page: Page, path: string): Promise<boolean> {
  const links = page.locator(`a[href="${path}"]`)
  for (let index = 0; index < await links.count(); index += 1) {
    const link = links.nth(index)
    if (await link.isVisible()) {
      await link.click()
      return true
    }
  }

  const openMenu = page.getByRole('button', { name: 'Abrir menu' })
  const sidebarLink = page.getByLabel('Navegação principal', { exact: true }).locator(`a[href="${path}"]`)
  if (await sidebarLink.count() > 0 && await openMenu.isVisible()) {
    await openMenu.click()
    for (let index = 0; index < await sidebarLink.count(); index += 1) {
      const link = sidebarLink.nth(index)
      if (await link.isVisible()) {
        await link.click()
        return true
      }
    }
  }

  return false
}

export async function navigateInsideApp(page: Page, path: string, ready: Locator) {
  await expect(page.locator('.app-shell')).toBeVisible()
  await expect(page.locator('#conteudo')).toBeVisible()

  const usedInterfaceLink = await clickVisibleLink(page, path)
  if (!usedInterfaceLink) {
    await page.evaluate((nextPath) => {
      window.history.pushState({}, '', nextPath)
      window.dispatchEvent(new PopStateEvent('popstate'))
    }, path)
  }

  const expected = new URL(path, 'http://apoio-pastoral.local')
  await expect(page).toHaveURL((url) => url.pathname === expected.pathname && url.search === expected.search)
  await expect(page.locator('.app-shell')).toBeVisible()
  await expect(ready).toBeVisible()
}
