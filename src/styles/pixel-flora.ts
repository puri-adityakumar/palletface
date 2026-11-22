import { disc, rect } from '../grid.js'
import { fnv1a, mulberry32 } from '../seed.js'
import { validateRenderArgs } from '../validation.js'

function fern(r: () => number): string {
  const palettes = [
    ['#eedf9d', '#2e6246', '#52783d'],
    ['#d1e1b1', '#255c4b', '#4a7858'],
    ['#f5cc9f', '#365a45', '#61763d'],
  ] as const
  const [sky, leaf, tip] = palettes[Math.floor(r() * palettes.length)]!
  const short = r() < 0.5 ? 1 : 0
  const top = 2 + short
  const reach = r() < 0.5 ? 0 : 1

  // A bent stem and alternating fronds, wider near the base.
  const plant = rect(7, 8, tip, 1, 6) + rect(8, 5, tip, 1, 4) + rect(9, top, leaf, 1, 6 - top) +
    rect(10, top, leaf) + rect(8, top + 1, leaf) + rect(10, top + 1, tip) +
    rect(6, 4, leaf, 1, 2) + rect(7, 5, leaf) + rect(7, 6, leaf) +
    rect(9, 6, leaf, 3 - short) + rect(9, 7, tip) +
    rect(4 + reach, 7, leaf, 2) + rect(5 + reach, 8, leaf, 2 - reach) +
    rect(8, 9, leaf, 3 - reach) + rect(8, 10, tip, 2 - reach) +
    rect(4, 10, leaf, 2) + rect(5, 11, leaf, 2)
  const direction = r() < 0.5 ? 'translate(16 0) scale(-1 1)' : 'translate(0 0)'
  return rect(0, 0, sky, 16, 16) + `<g transform="${direction}">${plant}</g>`
}

function cactus(r: () => number): string {
  const palettes = [
    ['#edb6ab', '#35664f', '#628e57', '#a55a47', '#f7d398'],
    ['#f2d49f', '#285f51', '#528656', '#996049', '#edb982'],
    ['#e5c3d5', '#315952', '#558365', '#94604d', '#f2c58b'],
  ] as const
  const [sky, shade, green, pot, rim] = palettes[Math.floor(r() * palettes.length)]!
  const crown = 2 + Math.floor(r() * 2)
  const left = 5 + Math.floor(r() * 3)
  const right = 5 + Math.floor(r() * 3)
  const speck = r() < 0.5 ? 7 : 8

  return rect(0, 0, sky, 16, 16) +
    rect(7, crown, green, 2) + rect(6, crown + 1, green, 4, 12 - crown - 1) +
    rect(9, crown + 2, shade, 1, 10 - crown) +
    rect(4, left, green, 1, 9 - left) + rect(5, left + 1, shade, 1, 8 - left) +
    rect(5, 8, green, 2) +
    rect(11, right, green, 1, 10 - right) + rect(10, right + 1, shade, 1, 9 - right) +
    rect(9, 9, green, 2) +
    rect(speck, crown + 2, shade) + rect(7, 10, shade) +
    rect(5, 12, rim, 6) + rect(6, 13, pot, 4)
}

function wildflower(r: () => number): string {
  const palettes = [
    ['#bedce5', '#a84060', '#f5ce60', '#31634d', '#4b8460'],
    ['#f2d6a4', '#8c488c', '#f8d86e', '#356048', '#54824b'],
    ['#dfd1e9', '#af4547', '#ffe18a', '#326456', '#4c8774'],
  ] as const
  const [sky, petal, pollen, stem, leaf] = palettes[Math.floor(r() * palettes.length)]!
  const x = r() < 0.5 ? 7 : 8
  const side = x === 7 ? 1 : -1
  const broad = r() < 0.5 ? 1 : 0
  const left = 8 + Math.floor(r() * 2)
  const right = 9 + Math.floor(r() * 2)

  return rect(0, 0, sky, 16, 16) +
    rect(x - 1, 2, petal, 3) + rect(x - 2, 3, petal, 5, 3) +
    rect(x - 3, 4, petal, 5 + broad * 2) + rect(x - 1, 6, petal, 3) +
    rect(x - 1, 4, pollen, 2, 2) +
    rect(x, 7, stem, 1, 4) + rect(Math.min(x, x + side), 10, stem, 2) +
    rect(x + side, 11, stem, 1, 3) +
    rect(x - 3, left, leaf, 2) + rect(x - 2, left + 1, stem, 2) +
    rect(x + 2, right, leaf, 2) + rect(x + side, right + 1, stem, 3 - side)
}

/** Render a seeded 16×16 fern, cactus, or wildflower. */
export function pixelFlora(seed: string, px: number): string {
  validateRenderArgs(seed, px)
  const hash = fnv1a('pixel-flora:' + seed)
  const r = mulberry32(hash)
  const draw = [fern, cactus, wildflower][Math.floor(r() * 3)]!
  return disc(px, 16, draw(r), 'pixel-flora-' + hash.toString(36))
}
