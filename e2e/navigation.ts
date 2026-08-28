import { expect, type Locator, type Page } from '@playwright/test'

export async function navigateInsideApp(page: Page, path: string, ready: Locator) {
  await page.evaluate((nextPath) => {
    window.history.pushState({}, '', nextPath)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, path)
  const expectedPath = path.split('?')[0]
  await expect.poll(() => new URL(page.url()).pathname).toBe(expectedPath)
  await expect(ready).toBeVisible()
}
