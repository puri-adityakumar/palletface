import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { ditherFace, STYLES } from '../../src/index.js'

test('loads all eight styles with valid SVGs, local references and no external requests', async ({ page }, testInfo) => {
  const errors: string[] = []
  const external: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('request', request => {
    if (!request.url().startsWith('http://127.0.0.1:4173/')) external.push(request.url())
  })
  await page.goto('/')
  await expect(page.getByRole('button', { name: /^Select / })).toHaveCount(8)
  await expect(page.locator('#preview svg')).toHaveCount(1)
  expect(await page.locator('#gallery svg').count()).toBe(8)
  expect(await page.locator('#gallery svg').evaluateAll(elements => elements.every(svg => {
    const ids = [...svg.querySelectorAll('[id]')].map(element => element.id)
    const refs = [...svg.outerHTML.matchAll(/url\(#([^)]+)\)/g)].map(match => match[1])
    return svg.getAttribute('xmlns') === 'http://www.w3.org/2000/svg' && refs.every(id => ids.includes(id!))
  }))).toBe(true)
  expect(errors).toEqual([])
  expect(external).toEqual([])
  const screenshot = testInfo.outputPath('playground.png')
  await page.screenshot({ path: screenshot, fullPage: true })
  await testInfo.attach('playground', { path: screenshot, contentType: 'image/png' })
})

test('restores empty seed, name, style and size from a shared URL', async ({ page }) => {
  await page.goto('/?seed=&name=%C3%89lodie&style=pixel-letter&size=128')
  await expect(page.getByLabel('Seed', { exact: true })).toHaveValue('')
  await expect(page.getByLabel('Display name', { exact: false })).toHaveValue('Élodie')
  await expect(page.getByLabel('Size', { exact: true })).toHaveValue('128')
  await expect(page.getByRole('button', { name: 'Select pixel letter', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('#svg-source')).toHaveValue(ditherFace('', { style: 'pixel-letter', px: 128, name: 'Élodie' }))
  await page.reload()
  await expect(page.locator('#svg-source')).toHaveValue(ditherFace('', { style: 'pixel-letter', px: 128, name: 'Élodie' }))
})

test('blank display name falls back to the seed and name changes the letter only', async ({ page }) => {
  await page.goto('/?seed=Zeke&style=pixel-letter')
  await expect(page.locator('#svg-source')).toHaveValue(ditherFace('Zeke', { style: 'pixel-letter', px: 80 }))
  await page.getByLabel('Display name', { exact: false }).fill('Ada')
  await expect(page.locator('#svg-source')).toHaveValue(ditherFace('Zeke', { style: 'pixel-letter', px: 80, name: 'Ada' }))
  await page.getByLabel('Display name', { exact: false }).fill('')
  await expect(page.locator('#svg-source')).toHaveValue(ditherFace('Zeke', { style: 'pixel-letter', px: 80 }))
})

test('seed updates all gallery entries and each engine agrees with the Node renderer', async ({ page }) => {
  await page.goto('/')
  const before = await page.locator('#gallery .thumb').evaluateAll(elements => elements.map(element => element.innerHTML))
  await page.getByLabel('Seed', { exact: true }).fill('東京 / luna & 7')
  const after = await page.locator('#gallery .thumb').evaluateAll(elements => elements.map(element => element.innerHTML))
  expect(after.every((svg, index) => svg !== before[index])).toBe(true)
  for (const style of STYLES) {
    await page.getByRole('button', { name: `Select ${style.title}`, exact: true }).click()
    await expect(page.locator('#svg-source')).toHaveValue(ditherFace('東京 / luna & 7', { style: style.slug, px: 80 }))
  }
})

test('rejects invalid URL settings and treats HTML-looking input as data', async ({ page }) => {
  await page.goto('/?style=not-real&size=-1')
  await expect(page.locator('#size')).toHaveValue('80')
  await expect(page.locator('#selected-title')).toHaveText('pixel sprite')
  const seed = '"><script>window.bad=1</script>&\n'
  await page.getByLabel('Seed', { exact: true }).fill(seed)
  await page.getByLabel('Display name', { exact: false }).fill('<img src=x onerror=alert(1)>')
  expect(await page.locator('#gallery script, #gallery img, #preview script, #preview img').count()).toBe(0)
  expect(await page.locator('#usage').textContent()).toContain(JSON.stringify(seed.replace(/\n/g, '')))
  const url = new URL(page.url())
  expect(url.searchParams.get('seed')).toBe(seed.replace(/\n/g, ''))
})

test('downloads the exact selected standalone SVG bytes', async ({ page }) => {
  await page.goto('/?seed=download&name=7even&style=pixelify-letter&size=192')
  const expected = ditherFace('download', { style: 'pixelify-letter', px: 192, name: '7even' })
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download SVG', exact: true }).click(),
  ])
  expect(download.suggestedFilename()).toBe('dither-face.svg')
  const path = await download.path()
  expect(await readFile(path!, 'utf8')).toBe(expected)
  expect(await page.evaluate(svg => new DOMParser().parseFromString(svg, 'image/svg+xml').querySelector('parsererror') === null, expected)).toBe(true)
})

test('copies actual SVG, executable usage code and current share link', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'Clipboard read permission differs by browser; fallback is tested separately on all engines')
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('/?seed=copy-test&name=Ada&style=ascii-letter')
  await page.getByRole('button', { name: 'Copy SVG', exact: true }).click()
  await expect(page.getByRole('status')).toHaveText('SVG copied.')
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(ditherFace('copy-test', { style: 'ascii-letter', name: 'Ada', px: 80 }))
  await page.getByRole('button', { name: 'Copy usage', exact: true }).click()
  await expect(page.getByRole('status')).toHaveText('Usage code copied.')
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(await page.locator('#usage').textContent())
  await page.getByRole('button', { name: 'Copy link', exact: true }).click()
  await expect(page.getByRole('status')).toHaveText('Share link copied.')
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(page.url())
})

test('offers selected text when clipboard access fails', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async () => { throw new Error('denied') } }, configurable: true })
  })
  await page.goto('/?seed=fallback')
  await page.getByRole('button', { name: 'Copy SVG', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Clipboard unavailable')
  await expect(page.getByLabel('Text to copy', { exact: true })).toHaveValue(ditherFace('fallback'))
  await expect(page.getByLabel('Text to copy', { exact: true })).toBeFocused()
})

test('has keyboard-operable selection and fits a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 })
  await page.goto('/')
  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: 'Skip to playground' })).toBeFocused()
  const button = page.getByRole('button', { name: 'Select ascii face', exact: true })
  await button.focus()
  await page.keyboard.press('Enter')
  await expect(button).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('#selected-title')).toHaveText('ascii face')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('serves correct metadata/assets and refuses unsupported server methods', async ({ request }) => {
  const index = await request.get('/')
  expect(index.headers()['content-type']).toContain('text/html')
  expect(await index.text()).toContain('https://ditherface.palletism.art/')
  expect((await request.get('/favicon.svg')).headers()['content-type']).toContain('image/svg+xml')
  expect((await request.get('/missing-file')).status()).toBe(404)
  expect((await request.get('/_headers')).status()).toBe(404)
  expect((await request.post('/')).status()).toBe(405)
  expect((await request.get('/%2e%2e%2fpackage.json')).status()).not.toBe(200)
})
