import type { Page } from '@playwright/test'

export async function navigateInsideApp(page: Page, path: string) {
  await page.evaluate((nextPath) => {
    window.history.pushState({}, '', nextPath)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, path)
  await page.waitForURL((url) => url.pathname === path.split('?')[0])
}
