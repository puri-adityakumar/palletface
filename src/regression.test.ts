import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ditherFace, type StyleSlug } from './index.js'

/** Only IDs/references are canonicalized: every color, glyph and coordinate remains pinned. */
function canonical(svg: string): string {
  const ids = [...svg.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]!)
  const positions = new Map(ids.map((id, i) => [id, `definition-${i}`]))
  return svg.replace(/\bid="([^"]+)"/g, (_, id: string) => `id="${positions.get(id)}"`)
    .replace(/url\(#([^)]+)\)/g, (_, id: string) => `url(#${positions.get(id)})`)
}

const digest = (value: string) => createHash('sha256').update(value).digest('hex')
const baseline = JSON.parse(readFileSync(new URL('./fixtures/baseline.json', import.meta.url), 'utf8')) as {
  records: { style: StyleSlug; seed: string; name?: string; sha256: string }[]
}

describe('pre-change seeded designs', () => {
  for (const record of baseline.records) {
    it(`preserves ${record.style} ${JSON.stringify(record.seed)} / ${record.name ?? '(seed initial)'}`, () => {
      const svg = ditherFace(record.seed, { style: record.style, px: 80, name: record.name })
      expect(digest(canonical(svg))).toBe(record.sha256)
    })
  }
})

const preview = JSON.parse(readFileSync(new URL('./fixtures/preview.json', import.meta.url), 'utf8')) as typeof baseline
describe('preview exact SVG output', () => {
  for (const record of preview.records) {
    it(`pins ${record.style} bytes, including namespaced IDs and numeric initial`, () => {
      expect(digest(ditherFace(record.seed, { style: record.style, px: 80, name: record.name }))).toBe(record.sha256)
    })
  }
})
