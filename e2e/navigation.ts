import { expect, type Locator, type Page } from '@playwright/test'

async function isInsideViewport(page: Page, locator: Locator): Promise<boolean> {
  const [box, viewport] = await Promise.all([locator.boundingBox(), Promise.resolve(page.viewportSize())])
  if (!box || !viewport) return false

  const centerX = box.x + box.width / 2
  const centerY = box.y + box.height / 2
  return centerX >= 0 && centerX <= viewport.width && centerY >= 0 && centerY <= viewport.height
}

async function clickVisibleLink(page: Page, path: string): Promise<boolean> {
  const links = page.locator(`a[href="${path}"]`)
  for (let index = 0; index < await links.count(); index += 1) {
    const link = links.nth(index)
    if (await link.isVisible() && await isInsideViewport(page, link)) {
      await link.click()
      return true
    }
  }

  const openMenu = page.getByRole('button', { name: 'Abrir menu' })
  const sidebar = page.getByLabel('Navegação principal', { exact: true })
  const sidebarLink = sidebar.locator(`a[href="${path}"]`)
  if (await sidebarLink.count() > 0 && await openMenu.isVisible()) {
    await openMenu.click()
    await expect(sidebar).toHaveClass(/sidebar--open/)
    await expect(sidebarLink.first()).toBeInViewport({ ratio: 1 })
    await sidebarLink.first().click()
    return true
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
