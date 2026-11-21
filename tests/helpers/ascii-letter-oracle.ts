/**
 * Test-only reference model for ascii-letter, kept separate from the style so
 * the regression can prove two things without calling the implementation as
 * its own oracle:
 *
 * 1. `legacyModel` reproduces the historical (pre-Q-001) byte output, which
 *    keeps `src/fixtures/baseline.json` as untouched historical evidence.
 * 2. `fixedModel` encodes the approved contract: one dot decision per grid
 *    cell, then the glyph is overlaid. Seeded colors and the glyph shape come
 *    from the same historical stream and are unchanged.
 *
 * The hash/PRNG/pick code below is deliberately duplicated rather than
 * imported from `src/seed.ts`, so a change there cannot silently bless an
 * output change here.
 */
import { asciiGrid, disc, type AsciiCell } from '../../src/grid.js'
import { glyph, initialOf } from '../../src/font.js'

export const REF_PASTEL = [
  '#9fe7a4',
  '#f8e9a9',
  '#f4b8c0',
  '#a9e8eb',
  '#f2cf62',
  '#c9f0f2',
  '#fdf0bd',
] as const
export const REF_DEEP = [
  '#62d96b',
  '#e8553e',
  '#f2cf62',
  '#6fc7cc',
  '#e58a98',
  '#c8402d',
] as const
export const REF_INK = '#2b2a26'
export const REF_CHARS = ['#', '@', '%', '&', '$', '*', 'X', '8'] as const
export const REF_DOTS = ['.', '·', ':', '-'] as const
export const REF_DOT_RATE = 0.3

export function refFnv1a(seed: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

export function refMulberry32(state: number): () => number {
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const pick = <T,>(r: () => number, list: readonly T[]): T => list[Math.floor(r() * list.length)]!

export interface Picks {
  bg: string
  ch: string
  dot: string
  accent: string
  initial: string
}

function picks(seed: string, name?: string): Picks {
  const r = refMulberry32(refFnv1a('alet' + seed))
  return {
    bg: pick(r, REF_PASTEL),
    ch: pick(r, REF_CHARS),
    dot: pick(r, REF_DOTS),
    accent: pick(r, REF_DEEP),
    initial: initialOf(name ?? seed),
  }
}

export interface AsciiModel {
  picks: Picks
  cells: (AsciiCell | null)[][]
  /** Cell keys (`x,y`) covered by the initial's 5x7 glyph at offset (2, 1). */
  glyphCells: Set<string>
}

function build(seed: string, name: string | undefined, consumeForGlyph: boolean): AsciiModel {
  const picked = picks(seed, name)
  const r = refMulberry32(refFnv1a('alet' + seed))
  pick(r, REF_PASTEL)
  pick(r, REF_CHARS)
  pick(r, REF_DOTS)
  pick(r, REF_DEEP)
  const g = glyph(picked.initial)
  const cells: (AsciiCell | null)[][] = []
  const glyphCells = new Set<string>()
  for (let y = 0; y < 9; y++) {
    const row: (AsciiCell | null)[] = []
    for (let x = 0; x < 9; x++) {
      const on = g[y - 1]?.[x - 2] ?? false
      const dotted = consumeForGlyph || !on ? r() < REF_DOT_RATE : false
      if (on) glyphCells.add(`${x},${y}`)
      row.push(on ? picked.ch : dotted ? { ch: picked.dot, color: picked.accent } : null)
    }
    cells.push(row)
  }
  return { picks: picked, cells, glyphCells }
}

/** Historical implementation: the PRNG advances only on non-glyph cells. */
export function legacyModel(seed: string, name?: string): AsciiModel {
  return build(seed, name, false)
}

/** Approved implementation: every grid cell consumes one dot decision. */
export function fixedModel(seed: string, name?: string): AsciiModel {
  return build(seed, name, true)
}

/** Byte-for-byte historical SVG, used only to retain the old baseline hashes. */
export function legacyAsciiLetterSvg(seed: string, px: number, name?: string): string {
  const model = legacyModel(seed, name)
  const cells: AsciiCell[][] = model.cells.map((row) => row.map((cell) => cell ?? ' '))
  const id = 'alet-' + refFnv1a(seed).toString(16)
  return disc(px, 9, `<g shape-rendering="auto">${asciiGrid(9, model.picks.bg, cells, REF_INK, 1.6)}</g>`, id)
}

export function cellsToMap(cells: (AsciiCell | null)[][]): Map<string, { ch: string; color: string }> {
  const map = new Map<string, { ch: string; color: string }>()
  cells.forEach((row, y) =>
    row.forEach((cell, x) => {
      if (cell === null || cell === ' ') return
      map.set(`${x},${y}`, typeof cell === 'object' ? cell : { ch: cell, color: REF_INK })
    }),
  )
  return map
}

export interface ParsedAsciiLetter {
  bg: string | null
  cells: Map<string, { ch: string; color: string }>
  glyphs: Set<string>
  dots: Map<string, { ch: string; color: string }>
}

function unescapeXml(value: string): string {
  return value.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
}

export function parseAsciiLetter(svg: string): ParsedAsciiLetter {
  const bg = svg.match(/<rect width="9" height="9" fill="([^"]*)"\/>/)?.[1] ?? null
  const cells = new Map<string, { ch: string; color: string }>()
  const glyphs = new Set<string>()
  const dots = new Map<string, { ch: string; color: string }>()
  for (const match of svg.matchAll(/<text x="([^"]+)" y="([^"]+)"[^>]*?fill="([^"]+)">([^<]*)<\/text>/g)) {
    const key = `${Number(match[1]) - 0.5},${Number(match[2]) - 0.5}`
    const cell = { ch: unescapeXml(match[4]!), color: match[3]! }
    cells.set(key, cell)
    if (cell.color === REF_INK) glyphs.add(key)
    else dots.set(key, cell)
  }
  return { bg, cells, glyphs, dots }
}

/** Background cells (outside the union of both glyphs) that differ. */
export function outsideGlyphDiffs(a: ParsedAsciiLetter, b: ParsedAsciiLetter): string[] {
  const glyphs = new Set([...a.glyphs, ...b.glyphs])
  const keys = new Set([...a.cells.keys(), ...b.cells.keys()])
  const diffs: string[] = []
  for (const key of keys) {
    if (glyphs.has(key)) continue
    const left = a.cells.get(key)
    const right = b.cells.get(key)
    if (JSON.stringify(left ?? null) !== JSON.stringify(right ?? null)) {
      diffs.push(`${key}: ${JSON.stringify(left ?? null)} != ${JSON.stringify(right ?? null)}`)
    }
  }
  return diffs
}
