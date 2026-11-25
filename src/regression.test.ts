import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { palletface, type StyleSlug } from './index.js'
import {
  cellsToMap,
  fixedModel,
  legacyAsciiLetterSvg,
  legacyModel,
  parseAsciiLetter,
} from '../tests/helpers/ascii-letter-oracle.js'

/** Only IDs/references are canonicalized: every color, glyph and coordinate remains pinned. */
function canonical(svg: string): string {
  const ids = [...svg.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]!)
  const positions = new Map(ids.map((id, i) => [id, `definition-${i}`]))
  return svg.replace(/\bid="([^"]+)"/g, (_, id: string) => `id="${positions.get(id)}"`)
    .replace(/url\(#([^)]+)\)/g, (_, id: string) => `url(#${positions.get(id)})`)
}

const digest = (value: string) => createHash('sha256').update(value).digest('hex')
type Record = { style: StyleSlug; seed: string; name?: string; sha256: string }
type MigrationRecord = Record & { migration?: { previousSha256: string; reason: string } }
const baseline = JSON.parse(readFileSync(new URL('./fixtures/baseline.json', import.meta.url), 'utf8')) as {
  records: Record[]
}

/**
 * Q-001 migration contract. `baseline.json` is historical evidence and stays
 * byte-unchanged. For ascii-letter we therefore assert three separate things
 * instead of the old whole-SVG digest:
 *
 * 1. the test-local legacy oracle (independent PRNG copy) reproduces the old
 *    digest — the historical record remains meaningful;
 * 2. the new output keeps the old seed's background, character, dot, accent
 *    and glyph cells unchanged;
 * 3. every new cell matches the independent "one decision per cell" model.
 *
 * Other styles keep their original exact digest assertion.
 */
function assertAsciiLetterMigration(record: Record, svg: string): void {
  const legacy = legacyAsciiLetterSvg(record.seed, 80, record.name)
  expect(digest(canonical(legacy)), `${record.seed}/${record.name ?? 'seed'}: historical digest`).toBe(record.sha256)

  const before = legacyModel(record.seed, record.name)
  const after = fixedModel(record.seed, record.name)
  const parsed = parseAsciiLetter(svg)

  expect(after.picks, `${record.seed}/${record.name ?? 'seed'}: seed picks`).toEqual(before.picks)
  expect(parsed.bg, `${record.seed}/${record.name ?? 'seed'}: background`).toBe(before.picks.bg)
  const glyphChars = new Set([...parsed.glyphs].map((key) => parsed.cells.get(key)!.ch))
  expect(glyphChars, `${record.seed}/${record.name ?? 'seed'}: glyph character`).toEqual(new Set([before.picks.ch]))
  for (const cell of parsed.dots.values()) {
    expect(cell.color, `${record.seed}/${record.name ?? 'seed'}: dot accent`).toBe(before.picks.accent)
    expect(cell.ch, `${record.seed}/${record.name ?? 'seed'}: dot character`).toBe(before.picks.dot)
  }
  expect(parsed.cells, `${record.seed}/${record.name ?? 'seed'}: independent fixed mask`).toEqual(cellsToMap(after.cells))
  expect(parsed.glyphs, `${record.seed}/${record.name ?? 'seed'}: glyph shape`).toEqual(after.glyphCells)
  expect(digest(canonical(svg)), `${record.seed}/${record.name ?? 'seed'}: approved byte change`).not.toBe(record.sha256)
}

describe('pre-change seeded designs', () => {
  for (const record of baseline.records) {
    it(`preserves ${record.style} ${JSON.stringify(record.seed)} / ${record.name ?? '(seed initial)'}`, () => {
      const svg = palletface(record.seed, { style: record.style, px: 80, name: record.name })
      if (record.style === 'ascii-letter') {
        assertAsciiLetterMigration(record, svg)
      } else {
        expect(digest(canonical(svg))).toBe(record.sha256)
      }
    })
  }
})

const preview = JSON.parse(readFileSync(new URL('./fixtures/preview.json', import.meta.url), 'utf8')) as {
  records: MigrationRecord[]
}
describe('preview exact SVG output', () => {
  for (const record of preview.records) {
    it(`pins ${record.style} bytes for ${JSON.stringify(record.seed)}`, () => {
      const svg = palletface(record.seed, { style: record.style, px: 80, name: record.name })
      if (record.style === 'ascii-letter') {
        const migration = record.migration
        expect(migration?.previousSha256, 'recorded old preview SHA').toMatch(/^[0-9a-f]{64}$/)
        expect(digest(legacyAsciiLetterSvg(record.seed, 80, record.name)), 'historical preview SHA').toBe(migration!.previousSha256)
        expect(digest(svg), 'new preview SHA').toBe(record.sha256)
        expect(record.sha256, 'old and new preview SHA differ').not.toBe(migration!.previousSha256)
        const model = fixedModel(record.seed, record.name)
        const parsed = parseAsciiLetter(svg)
        expect(parsed.cells, 'independently checked preview mask').toEqual(cellsToMap(model.cells))
        expect(parsed.glyphs, 'preview glyph shape').toEqual(model.glyphCells)
      } else {
        expect(digest(svg)).toBe(record.sha256)
      }
    })
  }
})
