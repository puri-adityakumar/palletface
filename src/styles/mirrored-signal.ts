import { disc, rect } from '../grid.js'
import { fnv1a, mulberry32 } from '../seed.js'
import { validateRenderArgs } from '../validation.js'

const SIZE = 20
const CELLS = 7
const CELL = 2
const INSET = (SIZE - CELLS * CELL) / 2
const MIDDLE = Math.floor(CELLS / 2)
const PALETTES = [
  ['#f8e5a0', '#f5b670', '#792f4b'],
  ['#b9e5e8', '#79c9ce', '#2b375d'],
  ['#c9edac', '#88ce9b', '#225756'],
  ['#f6d4e3', '#eba4b9', '#643261'],
] as const

/** Draw an identicon-inspired 7×7 signal with a mirrored pair of hollow terminals. */
export function mirroredSignal(seed: string, px: number): string {
  validateRenderArgs(seed, px)
  // Keep the same palette assignment as the original Pixel Signal draft.
  const paletteRandom = mulberry32(fnv1a('pixel-signal:' + seed))
  const [bright, mid, dark] = PALETTES[Math.floor(paletteRandom() * PALETTES.length)]!
  const hash = fnv1a('mirrored-signal:' + seed)
  const random = mulberry32(hash)
  const rows = Array.from({ length: CELLS }, (_, y) => {
    const sideDensity = y === 0 || y === CELLS - 1 ? .33 : .48
    return Array.from({ length: MIDDLE + 1 }, (_, x) => random() < (x === MIDDLE ? .49 : sideDensity))
  })
  rows[MIDDLE]![MIDDLE] = true
  const terminalRow = Math.floor(random() * CELLS)
  const terminalColumn = Math.floor(random() * MIDDLE)
  rows[terminalRow]![terminalColumn] = true

  let artwork = rect(0, 0, dark, SIZE, SIZE)
  rows.forEach((row, y) => row.forEach((on, x) => {
    if (!on) return
    const terminal = y === terminalRow && x === terminalColumn
    const fill = terminal || random() < .19 ? bright : mid
    const columns = x === MIDDLE ? [x] : [x, CELLS - 1 - x]
    for (const column of columns) {
      const left = INSET + column * CELL
      const top = INSET + y * CELL
      artwork += rect(left, top, fill, CELL, CELL)
      if (terminal) artwork += rect(left + .5, top + .5, dark)
    }
  }))
  return disc(px, SIZE, artwork, 'mirrored-signal-' + hash.toString(36))
}
