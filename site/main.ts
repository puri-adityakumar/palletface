import { ditherFace, STYLES, type DitherFaceOptions, type StyleSlug } from '../src/index.js'

function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id)
  if (!element) throw new Error(`Missing site element: ${id}`)
  return element as T
}

const seed = byId<HTMLInputElement>('seed')
const name = byId<HTMLInputElement>('name')
const size = byId<HTMLSelectElement>('size')
const gallery = byId<HTMLDivElement>('gallery')
const preview = byId<HTMLDivElement>('preview')
const status = byId<HTMLParagraphElement>('status')
const usage = byId<HTMLElement>('usage')
const source = byId<HTMLTextAreaElement>('svg-source')
const manualCopy = byId<HTMLTextAreaElement>('manual-copy')
const manualPanel = byId<HTMLDetailsElement>('manual-panel')
const sizes = new Set(['48', '80', '128', '192'])
let selected: StyleSlug = 'pixel-sprite'
let currentSvg = ''

function restoreState() {
  const params = new URLSearchParams(location.search)
  seed.value = params.get('seed') ?? 'dither-face'
  name.value = params.get('name') ?? ''
  selected = STYLES.find(style => style.slug === params.get('style'))?.slug ?? 'pixel-sprite'
  const requestedSize = params.get('size') ?? '80'
  size.value = sizes.has(requestedSize) ? requestedSize : '80'
}

function options(style: StyleSlug, px: number): DitherFaceOptions {
  return { style, px, ...(name.value === '' ? {} : { name: name.value }) }
}

function stateUrl(): string {
  const params = new URLSearchParams({ seed: seed.value, style: selected, size: size.value })
  if (name.value !== '') params.set('name', name.value)
  return `${location.pathname}?${params}${location.hash}`
}

function render() {
  const style = STYLES.find(style => style.slug === selected)!
  currentSvg = ditherFace(seed.value, options(selected, Number(size.value)))
  // Only library-generated SVG enters HTML; raw user input always uses text/value APIs.
  preview.innerHTML = currentSvg
  preview.setAttribute('aria-label', `${style.title} avatar preview`)
  preview.querySelector('svg')?.setAttribute('aria-hidden', 'true')
  byId('selected-title').textContent = style.title
  byId('selected-note').textContent = style.note
  source.value = currentSvg
  usage.textContent = `import { ditherFace } from 'dither-face'\n\nconst svg = ditherFace(${JSON.stringify(seed.value)}, ${JSON.stringify(options(selected, Number(size.value)), null, 2)})`
  for (const button of gallery.querySelectorAll<HTMLButtonElement>('button')) {
    button.setAttribute('aria-pressed', String(button.dataset.style === selected))
  }
  status.textContent = ''
  manualPanel.open = false
  history.replaceState(null, '', stateUrl())
}

function refresh() {
  for (const [index, style] of STYLES.entries()) {
    gallery.children[index]!.querySelector('.thumb')!.innerHTML = ditherFace(seed.value, options(style.slug, 64))
  }
  render()
}

restoreState()
for (const style of STYLES) {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'style-card'
  button.dataset.style = style.slug
  button.setAttribute('aria-label', `Select ${style.title}`)
  const thumbnail = document.createElement('span')
  thumbnail.className = 'thumb'
  thumbnail.setAttribute('aria-hidden', 'true')
  const title = document.createElement('span')
  title.className = 'style-name'
  title.textContent = style.title
  const note = document.createElement('span')
  note.className = 'style-note'
  note.textContent = style.note
  button.append(thumbnail, title, note)
  button.addEventListener('click', () => { selected = style.slug; render() })
  gallery.append(button)
}

seed.addEventListener('input', refresh)
name.addEventListener('input', refresh)
size.addEventListener('change', render)
window.addEventListener('popstate', () => { restoreState(); refresh() })

async function copy(text: string, message: string) {
  try {
    await navigator.clipboard.writeText(text)
    status.textContent = message
  } catch {
    manualCopy.value = text
    manualPanel.open = true
    manualCopy.focus()
    manualCopy.select()
    status.textContent = 'Clipboard unavailable. Copy the selected text below.'
  }
}

byId('copy-svg').addEventListener('click', () => { void copy(currentSvg, 'SVG copied.') })
byId('copy-code').addEventListener('click', () => { void copy(usage.textContent ?? '', 'Usage code copied.') })
byId('share').addEventListener('click', () => { void copy(location.href, 'Share link copied.') })
byId('download-svg').addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob([currentSvg], { type: 'image/svg+xml;charset=utf-8' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'dither-face.svg'
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  // Revoking synchronously can race the download in some engines.
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
  status.textContent = 'SVG downloaded.'
})

refresh()
