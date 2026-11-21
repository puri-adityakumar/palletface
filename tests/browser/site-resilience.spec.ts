import { expect, test, type Page } from '@playwright/test'

type Rgb = [number, number, number, number]

function parseColor(value: string): Rgb {
  const match = value.match(/rgba?\(([^)]+)\)/)
  if (!match) return [0, 0, 0, 0]
  const parts = match[1]!.split(/[,/ ]+/).filter(Boolean).map(Number)
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0, parts[3] ?? 1]
}

function composite(foreground: Rgb, background: Rgb): Rgb {
  const alpha = Number.isFinite(foreground[3]) ? foreground[3] : 1
  return [
    foreground[0] * alpha + background[0] * (1 - alpha),
    foreground[1] * alpha + background[1] * (1 - alpha),
    foreground[2] * alpha + background[2] * (1 - alpha),
    1,
  ]
}

function luminance(rgb: Rgb): number {
  const channels = rgb.slice(0, 3).map((value) => {
    const channel = value / 255
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!
}

function contrast(left: Rgb, right: Rgb): number {
  const first = luminance(left)
  const second = luminance(right)
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05)
}

async function placeholderContrast(page: Page, selector: string) {
  return page.evaluate((target) => {
    const element = document.querySelector<HTMLInputElement>(target)
    if (!element) return null
    const style = getComputedStyle(element, '::placeholder')
    const inputStyle = getComputedStyle(element)
    return {
      color: style.color,
      opacity: style.opacity,
      background: inputStyle.backgroundColor,
    }
  }, selector)
}

async function boundaryContrast(page: Page, selector: string) {
  return page.evaluate((target) => {
    function parse(value: string): [number, number, number, number] {
      const match = value.match(/rgba?\(([^)]+)\)/)
      if (!match) return [0, 0, 0, 0]
      const parts = match[1]!.split(/[,/ ]+/).filter(Boolean).map(Number)
      return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0, parts[3] ?? 1]
    }
    function composite(foreground: [number, number, number, number], background: [number, number, number, number]): [number, number, number, number] {
      const alpha = Number.isFinite(foreground[3]) ? foreground[3] : 1
      return [
        foreground[0] * alpha + background[0] * (1 - alpha),
        foreground[1] * alpha + background[1] * (1 - alpha),
        foreground[2] * alpha + background[2] * (1 - alpha),
        1,
      ]
    }
    function luminance(rgb: [number, number, number, number]): number {
      const channels = rgb.slice(0, 3).map((value) => {
        const channel = value / 255
        return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
      })
      return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!
    }
    function ratio(left: [number, number, number, number], right: [number, number, number, number]): number {
      const first = luminance(left)
      const second = luminance(right)
      return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05)
    }
    function backgroundColor(element: Element | null): [number, number, number, number] {
      const layers: Array<[number, number, number, number]> = []
      let current: Element | null = element
      while (current) {
        const color = parse(getComputedStyle(current).backgroundColor)
        if (color[3] > 0) layers.push(color)
        current = current.parentElement
      }
      let background: [number, number, number, number] = [255, 255, 255, 1]
      for (let index = layers.length - 1; index >= 0; index -= 1) background = composite(layers[index]!, background)
      return background
    }
    const element = document.querySelector(target)
    if (!element) return null
    const style = getComputedStyle(element)
    const background = backgroundColor(element)
    const parentBackground = backgroundColor(element.parentElement)
    const border = composite(parse(style.borderTopColor), parentBackground)
    return {
      borderStyle: style.borderTopStyle,
      borderWidth: Number.parseFloat(style.borderTopWidth) || 0,
      borderColor: style.borderTopColor,
      background: `rgb(${background.slice(0, 3).map((value) => Math.round(value)).join(', ')})`,
      parentBackground: `rgb(${parentBackground.slice(0, 3).map((value) => Math.round(value)).join(', ')})`,
      borderContrast: ratio(border, parentBackground),
      backgroundContrast: ratio(background, parentBackground),
      best: Math.max(ratio(border, parentBackground), ratio(background, parentBackground)),
    }
  }, selector)
}

function boundaryPass(record: Awaited<ReturnType<typeof boundaryContrast>>, label: string) {
  expect(record, `${label} exists`).not.toBeNull()
  expect(record!.borderStyle, `${label} has a border`).not.toBe('none')
  expect(record!.borderWidth, `${label} border width`).toBeGreaterThan(0)
  expect(record!.best, `${label} boundary contrast`).toBeGreaterThanOrEqual(3)
}

test('meets AA contrast for placeholders and control boundaries in normal, hover and selected states', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('#preview svg')).toHaveCount(1)
  await page.evaluate(() => document.querySelectorAll('details').forEach((details) => { (details as HTMLDetailsElement).open = true }))

  for (const selector of ['#seed', '#name']) {
    const placeholder = await placeholderContrast(page, selector)
    expect(placeholder, `${selector} placeholder exists`).not.toBeNull()
    const background = parseColor(placeholder!.background)
    const foreground = composite(parseColor(placeholder!.color), background)
    expect(placeholder!.opacity, `${selector} placeholder opacity`).toBe('1')
    expect(contrast(foreground, background), `${selector} placeholder contrast`).toBeGreaterThanOrEqual(4.6)
  }

  const fieldSelectors = ['#seed', '#name', '#size', '#manual-copy', '#svg-source', '#download-svg', '#copy-code', '#share']
  for (const selector of fieldSelectors) {
    boundaryPass(await boundaryContrast(page, selector), `${selector} normal`)
    await page.hover(selector)
    boundaryPass(await boundaryContrast(page, selector), `${selector} hover`)
  }

  const cards = page.locator('#gallery .style-card')
  await expect(cards).toHaveCount(8)
  for (let index = 1; index <= 8; index += 1) {
    const selector = `#gallery .style-card:nth-child(${index})`
    boundaryPass(await boundaryContrast(page, selector), `${selector} normal`)
    await page.hover(selector)
    boundaryPass(await boundaryContrast(page, selector), `${selector} hover`)
  }

  const selected = page.locator('#gallery .style-card[data-style="ascii-letter"]')
  await selected.click()
  const selectedSelector = '#gallery .style-card[aria-pressed="true"]'
  boundaryPass(await boundaryContrast(page, selectedSelector), 'selected style card')
  await page.hover(selectedSelector)
  boundaryPass(await boundaryContrast(page, selectedSelector), 'selected style card hover')
})

test('keeps the playground loading until the app is ready', async ({ page }) => {
  let release!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  await page.route('**/assets/app.js', async (route) => {
    await gate
    await route.continue()
  })
  const navigation = page.goto('/')
  await expect(page.locator('#status')).toHaveAttribute('data-state', 'loading')
  await expect(page.locator('#status')).toContainText('Loading the interactive playground')
  await expect(page.locator('#seed')).toBeDisabled()
  release()
  await navigation
  await expect(page.locator('#preview svg')).toHaveCount(1)
  await expect(page.locator('#status')).toHaveText('')
  await expect(page.locator('#status')).not.toHaveAttribute('data-state', 'loading')
  await expect(page.locator('#seed')).toBeEnabled()
  await expect(page.locator('#gallery button')).toHaveCount(8)
  await expect(page.locator('.playground')).toHaveAttribute('aria-busy', 'false')
  await expect(page.locator('html')).toHaveAttribute('data-app-ready', 'true')
})

test('shows an accessible failure state when the app script is blocked', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/assets/app.js', (route) => route.abort())
  await page.goto('/')

  const status = page.getByRole('status')
  await expect(status).toBeVisible()
  await expect(status).toHaveAttribute('data-state', 'failed')
  await expect(status).toContainText('could not start')
  await expect(page.getByLabel('Seed', { exact: true })).toBeDisabled()
  await expect(page.getByLabel('Display name', { exact: false })).toBeDisabled()
  await expect(page.getByLabel('Size', { exact: true })).toBeDisabled()
  await expect(page.getByLabel('Text to copy', { exact: true })).toHaveCount(1)
  await expect(page.getByLabel('SVG source', { exact: true })).toHaveCount(1)
  await expect(page.getByRole('group', { name: 'All eight styles', exact: true })).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Download SVG', exact: true })).toBeDisabled()
  await expect(page.locator('#gallery button')).toHaveCount(0)
  await expect(page.locator('#preview svg')).toHaveCount(0)
  await expect(page.locator('h1')).toContainText('One seed')
  await expect(page.locator('.playground')).toHaveAttribute('aria-busy', 'true')
  expect(errors).toEqual([])
})

test('shows a readable failure status when the app throws during boot', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/assets/app.js', (route) => route.fulfill({
    status: 200,
    contentType: 'text/javascript; charset=utf-8',
    body: 'throw new Error("bounded boot regression")',
  }))
  await page.goto('/')

  await expect(page.locator('#status')).toHaveAttribute('data-state', 'failed')
  await expect(page.locator('#status')).toContainText('could not start')
  await expect(page.locator('#seed')).toBeDisabled()
  await expect(page.locator('#gallery button')).toHaveCount(0)
  await expect(page.locator('#preview svg')).toHaveCount(0)
  expect(errors.some((message) => message.includes('bounded boot regression'))).toBe(true)
})

test('keeps labels and gallery group semantics when the app is ready', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByLabel('Seed', { exact: true })).toBeVisible()
  await expect(page.getByLabel('Display name', { exact: false })).toBeVisible()
  await expect(page.getByLabel('Size', { exact: true })).toBeVisible()
  await expect(page.getByRole('group', { name: 'All eight styles', exact: true })).toHaveCount(1)
  await expect(page.getByRole('img', { name: 'pixel sprite avatar preview', exact: true })).toHaveCount(1)
  await expect(page.getByRole('status')).toHaveCount(1)
})

test('reports createObjectURL failure and revokes when the download click throws', async ({ browser }) => {
  const baseURL = 'http://127.0.0.1:4173'

  const createContext = await browser.newContext()
  const createPage = await createContext.newPage()
  const createErrors: string[] = []
  createPage.on('pageerror', (error) => createErrors.push(error.message))
  await createPage.addInitScript(() => {
    URL.createObjectURL = () => { throw new Error('bounded blob failure') }
  })
  await createPage.goto(baseURL)
  await createPage.getByRole('button', { name: 'Download SVG', exact: true }).click()
  await expect(createPage.locator('#status')).toContainText('Download unavailable')
  expect(createErrors).toEqual([])
  await createContext.close()

  const clickContext = await browser.newContext()
  const clickPage = await clickContext.newPage()
  const clickErrors: string[] = []
  clickPage.on('pageerror', (error) => clickErrors.push(error.message))
  await clickPage.addInitScript(() => {
    const revoked: string[] = []
    ;(window as unknown as { __revoked: string[] }).__revoked = revoked
    const original = URL.revokeObjectURL.bind(URL)
    URL.revokeObjectURL = (url: string) => {
      revoked.push(url)
      original(url)
    }
    HTMLAnchorElement.prototype.click = () => { throw new Error('bounded click failure') }
  })
  await clickPage.goto(baseURL)
  await clickPage.getByRole('button', { name: 'Download SVG', exact: true }).click()
  await expect(clickPage.locator('#status')).toContainText('Download unavailable')
  await clickPage.waitForFunction(() => (window as unknown as { __revoked: string[] }).__revoked.length === 1)
  expect(await clickPage.evaluate(() => (window as unknown as { __revoked: string[] }).__revoked.length)).toBe(1)
  expect(clickErrors).toEqual([])
  await clickContext.close()
})
