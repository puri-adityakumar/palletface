import { writeFile } from 'node:fs/promises'
import { STYLES } from '../dist/index.js'

// A checked-in, self-contained SVG for the README; generated from the library.
// One row per style: its name, the same style for several seeds, then one seed
// at smaller display sizes. Each avatar is drawn once into <defs> and reused.
const SEEDS = ['aditya', 'zeke', 'marcus', 'élodie', 'kai', 'rhea']
const SIZES = [48, 32, 24, 16]

const PAD_X = 48
const HEAD_H = 64
const PAD_BOTTOM = 28
const NAME_W = 220
const AVATAR = 64
const AVATAR_GAP = 16
const SIZE_COL = 48
const SIZE_GAP = 16
const ROW_H = 100

const seedsX = PAD_X + NAME_W + 24
const sizesX = seedsX + SEEDS.length * AVATAR + (SEEDS.length - 1) * AVATAR_GAP + 56
const width = sizesX + SIZES.length * SIZE_COL + (SIZES.length - 1) * SIZE_GAP + PAD_X
const height = HEAD_H + STYLES.length * ROW_H + PAD_BOTTOM

const INK = '#1d1d1b'
const MUTED = '#64645f'
const FAINT = '#93938d'
const MONO = "ui-monospace,SFMono-Regular,Menlo,Consolas,monospace"
const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif"

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const sizeX = (k) => sizesX + k * (SIZE_COL + SIZE_GAP)
const seedX = (j) => seedsX + j * (AVATAR + AVATAR_GAP)

const defs = []
const body = []

const labelY = HEAD_H - 22
body.push(`<text x="${PAD_X}" y="${labelY}">style</text>`)
SEEDS.forEach((seed, j) => body.push(`<text x="${seedX(j) + AVATAR / 2}" y="${labelY}" text-anchor="middle">${esc(seed)}</text>`))
SIZES.forEach((px, k) => body.push(`<text x="${sizeX(k) + SIZE_COL / 2}" y="${labelY}" text-anchor="middle">${px}px</text>`))

STYLES.forEach((style, i) => {
  const top = HEAD_H + i * ROW_H
  const mid = top + ROW_H / 2
  body.push(`<line x1="${PAD_X}" y1="${top}" x2="${width - PAD_X}" y2="${top}" stroke="${INK}" stroke-opacity="0.1"/>`)
  body.push(
    `<text x="${PAD_X}" y="${mid - 4}" font-family="${SANS}" font-size="17" fill="${INK}"><tspan font-family="${MONO}" font-size="12" fill="${FAINT}">${String(i + 1).padStart(2, '0')}</tspan><tspan dx="10">${esc(style.title)}</tspan></text>`,
    `<text x="${PAD_X + 30}" y="${mid + 17}" fill="${MUTED}">${style.slug}</text>`,
  )
  SEEDS.forEach((seed, j) => {
    const id = `s${i}-${j}`
    defs.push(style.draw(seed, AVATAR).replace('<svg ', `<svg id="${id}" `))
    body.push(`<use href="#${id}" x="${seedX(j)}" y="${mid - AVATAR / 2}" width="${AVATAR}" height="${AVATAR}"/>`)
  })
  SIZES.forEach((px, k) => {
    body.push(`<use href="#s${i}-0" x="${sizeX(k) + (SIZE_COL - px) / 2}" y="${mid - px / 2}" width="${px}" height="${px}"/>`)
  })
})

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title"><title id="title">All ${STYLES.length} palletface styles, each drawn for ${SEEDS.length} seeds and at ${SIZES.length} smaller sizes</title><defs>${defs.join('')}</defs><rect width="${width}" height="${height}" rx="16" fill="#f2f2ef"/><g font-family="${MONO}" font-size="12" fill="${FAINT}">${body.join('')}</g></svg>\n`
await writeFile(new URL('../.github/preview.svg', import.meta.url), svg)
console.log(`Wrote .github/preview.svg from the built library (${width}x${height}, ${Math.round(svg.length / 1024)} KB)`)
