import { test, expect } from '@playwright/test'
import { executeCommand, openCommandPalette } from './helpers'

test.describe('Contribute modal', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const openedUrls: string[] = []
      Object.defineProperty(window, '__hsHubOpenedUrls', { configurable: true, value: openedUrls })
      window.open = ((url?: string | URL | undefined) => {
        openedUrls.push(String(url ?? ''))
        return null
      }) as typeof window.open

      const copiedBundles: string[] = []
      Object.defineProperty(window, '__hsHubCopiedBundles', { configurable: true, value: copiedBundles })
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: async (text: string) => { copiedBundles.push(text) } },
      })
    })

    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('[data-testid="sidebar-top-nav"]')).toBeVisible({ timeout: 10_000 })
  })

  test('Cmd+K opens local feedback diagnostics and Escape restores the opener @smoke', async ({ page }) => {
    await openCommandPalette(page)
    await executeCommand(page, 'Contribute')

    await expect(page.getByTestId('feedback-dialog')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Help improve HS-Hub' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Copy sanitized diagnostics' })).toBeFocused()

    await page.keyboard.press('Space')
    await expect.poll(async () => page.evaluate(() => (window as typeof window & { __hsHubCopiedBundles: string[] }).__hsHubCopiedBundles.length)).toBe(1)
    await expect.poll(async () => page.evaluate(() => (window as typeof window & { __hsHubOpenedUrls: string[] }).__hsHubOpenedUrls.length)).toBe(0)

    await page.keyboard.press('Escape')
    await expect(page.getByTestId('feedback-dialog')).not.toBeVisible()
    await expect(page.locator('input[placeholder="Type a command..."]')).toBeVisible()
    await expect(page.locator('input[placeholder="Type a command..."]')).toBeFocused()
  })
})
