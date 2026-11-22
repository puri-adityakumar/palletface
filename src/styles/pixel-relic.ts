import { disc, rect } from '../grid.js'
import { fnv1a, mulberry32 } from '../seed.js'
import { validateRenderArgs } from '../validation.js'

function key(r: () => number): string {
  const palettes = [
    ['#cfdfb0', '#60452e', '#e9a84f', '#fff0b5'],
    ['#bcd7dc', '#494c63', '#9caabb', '#f0f4ef'],
    ['#e4c5d3', '#64433e', '#d68c5e', '#ffe0a0'],
  ] as const
  const [sky, edge, metal, shine] = palettes[Math.floor(r() * palettes.length)]!
  const wide = Math.floor(r() * 2)
  const teeth = r() < 0.5 ? 1 : 2

  return rect(0, 0, sky, 16, 16) +
    rect(6, 2, edge, 4 + wide) + rect(5, 3, edge, 6 + wide, 4) +
    rect(6, 7, edge, 4 + wide) +
    rect(6, 3, metal, 4 + wide, 4) + rect(6, 3, shine, 2) +
    rect(7, 4, edge, 2 + wide, 2) + rect(7, 4, sky, 1 + wide, 2) +
    rect(7, 8, edge, 2, 6) + rect(7, 8, metal, 1, 5) +
    rect(9, 10, edge, teeth) + rect(9, 12, edge, 1) +
    rect(8, 10, metal, teeth) + rect(8, 12, metal)
}

function lantern(r: () => number): string {
  const palettes = [
    ['#accbdf', '#283d51', '#c37a41', '#fbe2a3'],
    ['#cac1da', '#443959', '#c88354', '#ffecab'],
    ['#c7d8b2', '#364d47', '#b66d42', '#fae8a9'],
  ] as const
  const [sky, iron, glass, glow] = palettes[Math.floor(r() * palettes.length)]!
  const handle = 6 + Math.floor(r() * 2)
  const tall = Math.floor(r() * 2)
  const spark = 6 + Math.floor(r() * 2)

  return rect(0, 0, sky, 16, 16) +
    rect(handle, 2, iron, 3) + rect(handle, 3, iron) + rect(handle + 2, 3, iron) +
    rect(5, 4, iron, 6, 2) + rect(6, 5, glass, 4) +
    rect(4, 6, iron, 8, 5 + tall) + rect(5, 6, glass, 6, 4 + tall) +
    rect(spark, 7, glow, 3, 3 + tall) + rect(spark + 1, 6, glow) +
    rect(5, 11 + tall, iron, 6) + rect(4, 12 + tall, iron, 8)
}

function potion(r: () => number): string {
  const palettes = [
    ['#e3bcdb', '#4d3c69', '#f1dff4', '#a75b9a', '#725caf'],
    ['#bfded6', '#305568', '#e5f5e6', '#489995', '#417991'],
    ['#ecd2ad', '#663c49', '#ffefd5', '#c76d55', '#a24a62'],
  ] as const
  const [sky, edge, glass, liquid, shade] = palettes[Math.floor(r() * palettes.length)]!
  const wide = Math.floor(r() * 2)
  const level = 8 + Math.floor(r() * 2)
  const bubble = 7 + Math.floor(r() * 2)

  return rect(0, 0, sky, 16, 16) +
    rect(6, 2, edge, 4, 2) + rect(7, 3, glass, 2) +
    rect(7, 4, edge, 2, 2) + rect(8, 4, glass, 1, 2) +
    rect(6, 6, edge, 4 + wide) + rect(5 - wide, 7, edge, 6 + wide * 2, 5) +
    rect(6, 12, edge, 4) +
    rect(6 - wide, 7, glass, 4 + wide * 2, level - 7) +
    rect(6 - wide, level, liquid, 4 + wide * 2, 12 - level) +
    rect(9, 10, shade, 1 + wide, 2) + rect(6 - wide, 8, glass, 1, 2) +
    rect(bubble, 10, glass)
}

/** Render a seeded 16×16 inventory key, lantern, or potion. */
export function pixelRelic(seed: string, px: number): string {
  validateRenderArgs(seed, px)
  const hash = fnv1a('pixel-relic:' + seed)
  const r = mulberry32(hash)
  const draw = [key, lantern, potion][Math.floor(r() * 3)]!
  return disc(px, 16, draw(r), 'pixel-relic-' + hash.toString(36))
}
