import { BAYER, disc, rect } from '../grid.js'
import { fnv1a, mulberry32 } from '../seed.js'
import { validateRenderArgs } from '../validation.js'

const SIZE = 16
const OFFSET = 2
const PALETTES = [
  ['#f8e5a0', '#f5b670', '#c94651', '#792f4b'],
  ['#b9e5e8', '#79c9ce', '#526ccd', '#2b375d'],
  ['#c9edac', '#88ce9b', '#279078', '#225756'],
  ['#f6d4e3', '#eba4b9', '#a64d9e', '#643261'],
] as const

const MOTIFS = [
  // Heart
  [
    '...........',
    '..##...##..',
    '.####.####.',
    '###########',
    '###########',
    '.#########.',
    '..#######..',
    '...#####...',
    '....###....',
    '.....#.....',
    '...........',
  ],
  // Lightning
  [
    '......###..',
    '.....###...',
    '....###....',
    '...###.....',
    '..#######..',
    '.########..',
    '.....###...',
    '....###....',
    '...###.....',
    '..##.......',
    '..#........',
  ],
  // Sparkle
  [
    '.....#.....',
    '....###....',
    '....###....',
    '...#####...',
    '.#########.',
    '###########',
    '.#########.',
    '...#####...',
    '....###....',
    '....###....',
    '.....#.....',
  ],
  // Mushroom
  [
    '....###....',
    '..#######..',
    '.#########.',
    '.#########.',
    '###########',
    '###########',
    '.#########.',
    '....###....',
    '....###....',
    '...#####...',
    '...#####...',
  ],
  // Flame
  [
    '......##...',
    '.....###...',
    '....###....',
    '....###.#..',
    '..####.###.',
    '.#########.',
    '.##########',
    '.#####.####',
    '..###...##.',
    '...######..',
    '.....##....',
  ],
] as const

/** Draw a seeded emoji-like silhouette with ordered dither and a pixel shadow. */
export function pixelEmotes(seed: string, px: number): string {
  validateRenderArgs(seed, px)
  const hash = fnv1a('emote:' + seed)
  const random = mulberry32(hash)
  const motif = MOTIFS[Math.floor(random() * MOTIFS.length)]!
  const [paper, light, body, ink] = PALETTES[Math.floor(random() * PALETTES.length)]!
  const reflected = random() < .5
  const hasPixel = (x: number, y: number) => {
    const column = x - OFFSET
    return motif[y - OFFSET]?.[reflected ? motif[0].length - 1 - column : column] === '#'
  }

  let artwork = rect(0, 0, paper, SIZE, SIZE)
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      if (hasPixel(x, y)) {
        const lightness = (13 - y) * .085 + (7 - x) * .028
        artwork += rect(x, y, BAYER[y % 4]![x % 4]! < lightness ? light : body)
      } else if (hasPixel(x - 1, y - 1)) {
        artwork += rect(x, y, ink)
      }
    }
  }
  return disc(px, SIZE, artwork, 'pixel-emotes-' + hash.toString(36))
}
