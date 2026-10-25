#!/usr/bin/env node
/**
 * Renders every registered avatar style x the eight reference users into one
 * sheet.svg: one numbered row per style ("01 pixel sprite" … "08 pixelify
 * letter"), 80px per user, plus the real nav (30px) and profile (56px) sizes
 * on the right. The geometry mirrors the reference mockup
 * (mockups/avatars/index.html) so the two sheets can be laid side by side and
 * compared cell for cell.
 *
 * Usage: node scripts/render-sheet.mjs [outDir]    (default: out-sheet)
 *
 * Exports `renderSheet(lib, styles, users)` so the layout can be exercised
 * without a build; run as a script it imports the built dist/.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

/** The reference users, in reference order (élodie keeps the accent). */
export const USERS = ['aditya', 'zeke', 'marcus', 'élodie', 'kai', 'rhea', 'quinn', 'yuki']

// Sheet geometry, lifted from the mockup's css (.sheet / .row / .grid / .sizes).
const W = 1340
const PAD_X = 56
const PAD_TOP = 48
const PAD_BOTTOM = 56
const COL_NAME = 230
const COL_SIZES = 160
const GAP = 24
const AVATAR = 80
const AVATAR_GAP = 14
const WHO_GAP = 6
const WHO_TEXT = 14
const ROW_PAD = 18
const ROW_H = 2 * ROW_PAD + AVATAR + WHO_GAP + WHO_TEXT
const NAV_PX = 30
const PROFILE_PX = 56
const PILL_W = 84
const PILL_H = 44

// Ink-on-paper chrome, from the mockup's css tokens.
const SERIF = 'Lora, Georgia, serif'
const SANS = 'Manrope, system-ui, sans-serif'
const MUTED = '#75736b'
const FAINT = '#a9a79c'
const BODY = '#5f5e56'
const CORAL = '#e8553e'
const EYEBROW = 'PROFILE · GENERATED AVATARS'
const TITLE = 'pixel and ascii, seeded'
const LEDE =
  "every look is picked from the user's id, so it is random per person and never changes. 8 users per style at 80px, then the real nav (30px) and profile (56px) sizes on the right."

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Word-wrap to a character budget (~0.55em per char is generous for Manrope). */
const wrap = (text, maxChars) => {
  const lines = []
  let line = ''
  for (const word of text.split(' ')) {
    if (line && line.length + 1 + word.length > maxChars) {
      lines.push(line)
      line = word
    } else {
      line = line ? line + ' ' + word : word
    }
  }
  if (line) lines.push(line)
  return lines
}

const text = (x, y, attrs, content) =>
  `<text x="${x}" y="${y}"${Object.entries(attrs)
    .map(([k, v]) => ` ${k}="${v}"`)
    .join('')}>${content}</text>`

/** Place a standalone avatar svg string at (x, y) inside the sheet. */
const place = (svg, x, y) => `<g transform="translate(${x},${y})">${svg}</g>`

/**
 * Build the sheet svg. `lib` is the built dither-face module (INK, PAPER);
 * `styles` is the registry; `users` defaults to the reference eight.
 */
export function renderSheet(lib, styles, users = USERS) {
  const contentX = PAD_X
  const contentW = W - 2 * PAD_X
  const gridX = PAD_X + COL_NAME + GAP
  const parts = []

  // — header, mirroring the mockup's eyebrow / h1 / lede
  parts.push(text(contentX, PAD_TOP + 12, { 'font-size': 12, 'font-weight': 700, 'letter-spacing': 0.96, fill: MUTED }, EYEBROW))
  const h1Y = PAD_TOP + 12 + 6 + 44
  parts.push(
    `<text x="${contentX}" y="${h1Y}" font-family="${SERIF}" font-size="44" letter-spacing="-0.88" fill="${lib.INK}">${esc(TITLE)}<tspan fill="${CORAL}">.</tspan></text>`,
  )
  let y = h1Y + 4 + 14
  for (const line of wrap(LEDE, Math.floor(contentW / (0.55 * 14)))) {
    parts.push(text(contentX, y, { 'font-size': 14, fill: BODY }, esc(line)))
    y += 20
  }
  y += 28 // the lede's margin-bottom

  // — one row per registered style
  styles.forEach((style, i) => {
    const top = y + ROW_PAD
    const center = top + (AVATAR + WHO_GAP + WHO_TEXT) / 2
    const hairline = `<line x1="${contentX}" y1="${y}" x2="${W - PAD_X}" y2="${y}" stroke="${lib.INK}" stroke-opacity="0.1"/>`
    const num = String(i + 1).padStart(2, '0')
    const name = `<text x="${contentX}" y="${top + 17}"><tspan font-size="12" font-weight="700" fill="${FAINT}">${num}</tspan><tspan dx="8" font-family="${SERIF}" font-size="20" fill="${lib.INK}">${esc(style.title)}</tspan></text>`
    const note = wrap(style.note, Math.floor(COL_NAME / (0.55 * 12.5)))
      .map((line, k) => text(contentX, top + 17 + 8 + 13 + k * 18, { 'font-size': 12.5, fill: MUTED }, esc(line)))
      .join('')
    const people = users
      .map((user, j) => {
        const x = gridX + j * (AVATAR + AVATAR_GAP)
        return (
          place(style.render('user-' + j, user, AVATAR), x, top) +
          text(x + AVATAR / 2, top + AVATAR + WHO_GAP + 10, { 'font-size': 10.5, fill: FAINT, 'text-anchor': 'middle' }, esc(user))
        )
      })
      .join('')
    // the real nav and profile sizes, right-aligned
    const navX = W - PAD_X - PROFILE_PX - 10 - PILL_W
    const navY = center - PILL_H / 2
    const pill =
      `<rect x="${navX}" y="${navY}" width="${PILL_W}" height="${PILL_H}" rx="${PILL_H / 2}" fill="#ffffff" stroke="${lib.INK}" stroke-opacity="0.1"/>` +
      place(style.render('user-0', users[0], NAV_PX), navX + 11, navY + 7) +
      text(navX + 11 + NAV_PX + 8, center + 4, { 'font-size': 11, fill: MUTED }, 'nav')
    const profile = place(style.render('user-1', users[1], PROFILE_PX), W - PAD_X - PROFILE_PX, center - PROFILE_PX / 2)
    parts.push(hairline + name + note + people + pill + profile)
    y += ROW_H
  })

  const height = Math.round(y + PAD_BOTTOM)
  const head = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${height}" viewBox="0 0 ${W} ${height}" font-family="${SANS}">`
  return head + `<rect width="${W}" height="${height}" fill="${lib.PAPER}"/>` + parts.join('') + '</svg>\n'
}

async function main() {
  const outDir = process.argv[2] ?? 'out-sheet'
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const lib = await import(pathToFileURL(path.join(root, 'dist', 'index.js')).href)
  const svg = renderSheet(lib, lib.STYLES, USERS)
  await mkdir(outDir, { recursive: true })
  const file = path.join(outDir, 'sheet.svg')
  await writeFile(file, svg)
  console.log(`sheet: ${lib.STYLES.length} style(s), ${USERS.length} users -> ${path.resolve(file)}`)
}

const isMain =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
if (isMain) await main()
