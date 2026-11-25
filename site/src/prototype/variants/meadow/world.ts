import { bayer, rng } from '../../lib/dither'
import { face, svgUrl, type StyleSlug } from '../../lib/faces'

export const FIELD_GREEN = '#91a85e'
export const FIELD_NIGHT = '#465566'

const PALETTE = {
  day: {
    sky: ['#244098', '#294ca4', '#3158ae', '#3b63b7', '#4973c3'],
    cloud: ['#7697d3', '#a2bcdf', '#c5d5e7'],
    far: ['#426982', '#4a7886', '#517d80'],
    near: ['#3a674d', '#4c7751', '#64884e', '#769951', '#91a85e'],
    trail: ['#799b52', '#a0ae66', '#b7bb74'],
    grass: ['#395f40', '#507344', '#64874b', '#a0b365', '#bdc47d'],
    petal: ['#f9ebae', '#fbf4d9', '#e6a1a1'],
  },
  night: {
    sky: ['#161d3b', '#1d264a', '#252d56', '#2c3a65', '#3a4874'],
    cloud: ['#475781', '#596b97', '#687ca0'],
    far: ['#2e3d62', '#334362', '#364964'],
    near: ['#2d4059', '#33485a', '#3b505e', '#415465', '#465566'],
    trail: ['#415361', '#516371', '#63717c'],
    grass: ['#2c3d54', '#36495a', '#415465', '#516670', '#6f7a7c'],
    petal: ['#a8ac9d', '#c7c4b4', '#ab889c'],
  },
} as const

const RESIDENTS = [
  { seed: 'poppy', style: 'pixel-sprite', x: 0.19, y: 0.78, mx: 0.14, my: 0.628, size: 20 },
  { seed: 'sorrel', style: 'pixel-flora', x: 0.39, y: 0.84, mx: 0.30, my: 0.875, size: 20 },
  { seed: 'myco', style: 'pixel-emotes', x: 0.34, y: 0.71, mx: 0.42, my: 0.62, size: 17 },
  { seed: 'fern', style: 'pixel-sprite', x: 0.49, y: 0.77, mx: 0.13, my: 0.92, size: 19 },
  { seed: 'ember', style: 'pixel-relic', x: 0.89, y: 0.84, mx: 0.88, my: 0.86, size: 17 },
  { seed: 'mallow', style: 'pixel-flora', x: 0.065, y: 0.88, mx: 0.76, my: 0.92, size: 23 },
] as const satisfies ReadonlyArray<{ seed: string; style: StyleSlug; x: number; y: number; mx: number; my: number; size: number }>

export { RESIDENTS }

export function worldLayout(width: number, height: number, compact: boolean, footer: boolean) {
  const desk = { x: Math.round(width * (compact ? 0.65 : 0.73)) - 29, y: Math.round(height * (compact ? 0.812 : 0.85)) - 48 }
  const residents = RESIDENTS.map((resident, i) => ({
    x: Math.round(width * (compact ? resident.mx : resident.x)),
    y: Math.round(height * (footer ? ([0.85, 0.96, 0.73, 0.87, 0.93, 0.97][i] ?? 0.9) : compact ? resident.my : resident.y)),
    size: compact ? Math.round(resident.size * 0.85) : resident.size,
  }))
  return { desk, residents }
}

const clamp = (number: number) => Math.min(1, Math.max(0, number))
const plot = (ctx: CanvasRenderingContext2D, color: string, x: number, y: number, w = 1, h = 1) => {
  ctx.fillStyle = color
  ctx.fillRect(Math.round(x), Math.round(y), w, h)
}

function line(ctx: CanvasRenderingContext2D, color: string, x: number, y: number, dx: number, dy: number, thickness = 1) {
  const length = Math.max(Math.abs(dx), Math.abs(dy), 1)
  for (let i = 0; i <= length; i++) plot(ctx, color, x + dx * i / length, y + dy * i / length, thickness, thickness)
}

function writeSprite(ctx: CanvasRenderingContext2D, x: number, y: number, rows: readonly string[], colors: Record<string, string>) {
  for (const [row, glyphs] of rows.entries()) {
    for (const [col, glyph] of [...glyphs].entries()) {
      const color = colors[glyph]
      if (color) plot(ctx, color, x + col, y + row)
    }
  }
}

const HILLS = (x: number, height: number, compact: boolean, footer: boolean) => {
  const rise = (compact ? 0.075 : 0.107) * x
  const roll = 0.026 * Math.sin(x * 3.5) - 0.015 * Math.sin(x * 7)
  return (footer ? 0.61 : compact ? 0.524 : 0.52 + (1 - x) * 0.04) * height + (rise + roll) * height
}

const hex = (color: string) => [1, 3, 5].map(i => Number.parseInt(color.slice(i, i + 2), 16))
const ditherIndex = (x: number, y: number, value: number, length: number) => {
  const p = clamp(value) * (length - 1)
  const lower = Math.floor(p)
  return Math.min(length - 1, lower + Number(bayer(x, y) < p - lower))
}

export function paintBackdrop(ctx: CanvasRenderingContext2D, width: number, height: number, compact: boolean, night: boolean, footer: boolean) {
  const palette = night ? PALETTE.night : PALETTE.day
  const [sky, far, near, trail] = [palette.sky, palette.far, palette.near, palette.trail].map(colors => colors.map(hex))
  const noise = rng('meadow/field-print')
  const pixels = ctx.createImageData(width, height)

  for (let x = 0; x < width; x++) {
    const u = x / width
    const hill = HILLS(u, height, compact, footer)
    const farHill = hill - height * (0.02 + 0.021 * Math.sin(u * 10 + 4))
    const middleHill = hill - height * (0.008 + 0.007 * Math.sin(u * 15 + 1))
    for (let y = 0; y < height; y++) {
      const grain = (noise() - 0.5) * 0.12
      const deep = (y - hill) / Math.max(1, height - hill)
      let color: number[]
      if (y < Math.min(hill, farHill, middleHill)) {
        const t = Math.pow(y / height / 0.72, 1.13) + grain * 0.26
        color = sky![ditherIndex(x, y, t, palette.sky.length)]!
      } else if (y < hill) {
        const ridge = (y - farHill) / (height * 0.029) + grain - (y >= middleHill ? 0.5 : 0)
        color = far![ditherIndex(x, y, ridge, palette.far.length)]!
      } else {
        const contour = (Math.sin(u * 13 - deep * 10) + Math.sin(u * 26 + deep * 14) * 0.45) * 0.045
        const ground = deep * 0.77 + 0.16 + contour + grain
        const pathX = (compact ? 0.48 : 0.60) + (compact ? 0.185 : 0.14) * Math.sin(deep * 4.8 - 1.25)
        const pathWidth = 0.006 + deep * deep * (compact ? 0.22 : 0.106)
        const pathDist = Math.abs(u - pathX) / pathWidth
        const pathFade = clamp((1.22 - pathDist) * 1.75) * clamp(deep * 5) * (1 - clamp((y / height - 0.87) * 7.7))
        color = near![ditherIndex(x, y, ground, palette.near.length)]!
        if (!footer && bayer(x + 2, y + 3) < pathFade * 0.82) {
          color = trail![ditherIndex(x + 1, y + 1, deep * 0.9 + contour + grain, palette.trail.length)]!
        }
        if (y >= height - 8 && bayer(x, y) < 1 - (height - y - 1) / 8) color = near![near!.length - 1]!
      }
      const at = (y * width + x) * 4
      pixels.data[at] = color[0]!
      pixels.data[at + 1] = color[1]!
      pixels.data[at + 2] = color[2]!
      pixels.data[at + 3] = 255
    }
  }
  ctx.putImageData(pixels, 0, 0)

  // A scrubby line of trees follows the far ridge, not the foreground.
  const trees = rng('meadow/ridge')
  for (const center of [0.107, 0.52, 0.87, 0.92]) {
    for (let i = 0; i < 15; i++) {
      const x = Math.round((center + (trees() - 0.5) * (compact ? 0.09 : 0.065)) * width)
      const y = Math.round(HILLS(x / width, height, compact, footer) - height * (0.014 + 0.021 * Math.sin(x / width * 10 + 4)))
      const h = 1 + Math.round(trees() * (compact ? 2 : 4))
      plot(ctx, palette.far[0], x, y - h + 1, 1, h)
      if (h > 2) plot(ctx, palette.far[0], x - 1, y - h + 2, 3, 1)
    }
  }

  const blades = rng('meadow/near-grass')
  const tufts = Math.round(width * height * (footer ? 0.009 : 0.015))
  for (let i = 0; i < tufts; i++) {
    const x = Math.floor(blades() * width)
    const t = Math.sqrt(blades())
    const hill = HILLS(x / width, height, compact, footer)
    const y = hill + t * (height - hill - 8)
    const tint = palette.grass[Math.floor(blades() * palette.grass.length)]!
    const spread = Math.sin(x / width * 21 + t * 18) + Math.sin(x / width * 37 - t * 17)
    if (!footer && Math.abs(x / width - ((compact ? 0.48 : 0.60) + (compact ? 0.185 : 0.14) * Math.sin(t * 4.8 - 1.25))) < t * t * 0.06 && blades() < 0.63) continue
    if (spread > -1.3) plot(ctx, tint, x, y, 1 + Math.round(t * blades() * 3))
    if (blades() < t * 0.23) {
      const lean = blades() > 0.5 ? 1 : -1
      plot(ctx, tint, x, y - 1, 1, 2)
      plot(ctx, tint, x + lean, y - 2)
      if (t > 0.7 && blades() > 0.4) plot(ctx, tint, x + lean, y - 3)
    }
  }

  const blooms = rng('meadow/wildflowers')
  for (let i = 0; i < (compact ? 56 : 132); i++) {
    const x = Math.floor(blooms() * width)
    const t = Math.pow(blooms(), 0.6)
    const dim = Math.sin(x / width * 48) + Math.cos(t * 15 + x / width * 10)
    if (dim < -0.2) continue
    const hill = HILLS(x / width, height, compact, footer)
    const y = Math.round(hill + t * (height - hill - 11))
    const stem = t > 0.75 ? 4 : t > 0.38 ? 2 : 1
    const bud = palette.petal[Math.floor(blooms() * palette.petal.length)]!
    plot(ctx, palette.grass[1], x, y - stem, 1, stem + 1)
    if (stem >= 2) plot(ctx, palette.grass[3], x + 1, y - 1)
    plot(ctx, bud, x, y - stem, stem > 2 ? 2 : 1)
    if (stem > 2) {
      plot(ctx, bud, x - 1, y - stem - 1)
      plot(ctx, bud, x + 1, y - stem - 1)
      plot(ctx, palette.petal[0], x, y - stem - 1)
    }
  }
}

type Cloud = { x: number; y: number; points: [number, number, number, string][] }

export function makeAir(compact: boolean, night: boolean, footer: boolean) {
  const cloudTint = night ? PALETTE.night.cloud : PALETTE.day.cloud
  const cloudSpecs = compact ? [[0.91, 0.09, 29, 4], [0.96, 0.46, 25, 3], [0.22, 0.53, 20, 3]]
    : [[0.76, 0.24, 65, 8], [0.93, 0.38, 47, 6], [0.51, 0.47, 45, 3], [0.14, 0.44, 25, 3]]
  const clouds: Cloud[] = []
  if (!footer && !night) {
    for (const [x = 0, y = 0, rx = 0, ry = 0] of cloudSpecs) {
      const points: Cloud['points'] = []
      for (let row = -ry * 2; row < ry * 2; row++) {
        for (let col = -rx; col < rx; col++) {
          const distance = (px: number, py: number, w: number, h: number) => Math.hypot((col - px) / w, (row - py) / h)
          const d = Math.min(
            distance(0, 0, rx, ry * 0.65),
            distance(rx * 0.17, -ry * 0.45, rx * 0.45, ry * 0.8),
            distance(-rx * 0.28, -ry * 0.08, rx * 0.49, ry * 0.64),
            distance(-rx * 0.58, ry * 1.05, rx * 0.4, ry * 0.28),
          )
          const density = clamp((1.08 - d) * 0.83)
          if (density > bayer(col, row)) points.push([col, row, 1, cloudTint[density > 0.62 && row > -ry * 0.55 ? 1 : 0]!])
        }
      }
      clouds.push({ x, y, points })
    }
  }
  const r = rng('meadow/constellations')
  const stars = Array.from({ length: compact ? 32 : 78 }, (_, i) => ({
    x: r(), y: 0.02 + r() * (footer ? 0.56 : 0.51), phase: r() * 8, bright: i % 13 === 0,
  }))

  return (ctx: CanvasRenderingContext2D, width: number, height: number, time: number) => {
    if (night) {
      for (const { x, y, phase, bright } of stars) {
        const glow = Math.sin(time * 0.0014 + phase)
        const px = Math.round(x * width)
        const py = Math.round(y * height)
        plot(ctx, glow > 0.25 ? '#a6b6d0' : '#657aa5', px, py)
        if (bright && glow > 0.45) {
          plot(ctx, '#687ca0', px - 1, py, 3)
          plot(ctx, '#687ca0', px, py - 1, 1, 3)
          plot(ctx, '#f5e7bc', px, py)
        }
      }
    }
    for (const [i, cloud] of clouds.entries()) {
      const x = Math.round(cloud.x * width + Math.sin(time * 0.00009 + i * 2) * (compact ? 9 : 19))
      const y = Math.round(cloud.y * height)
      for (const [col, row, length, color] of cloud.points) plot(ctx, color, x + col, y + row, length)
    }
  }
}

const HAIR = [
  '.....hhhhh....',
  '...hHHHHHHh...',
  '..hHHllHHHHh..',
  '.hHHlHHHHHHHh.',
  '.hHHHHHHHHHhh.',
  'hHHHHHHHHHhs..',
  '.hHHHHHHHHhS..',
  '.hHHHHHHHhSss.',
  '..hhhhHHhSsss.',
  '.....hHhssss..',
  '.....hhssss...',
  '......SsSs....',
  '......SsS.....',
]

const SWEATER = [
  '.......DDDDDD.......',
  '.....DDrrrrrDD......',
  '...DDrRrRRRRrDD.....',
  '..DrRRRRRRRRRrDD....',
  '.DrRRRRrrrRRRRrD....',
  '.DRRRRrrrRRRRRrDD...',
  'DRRRRRRRRRRrRRRrDD..',
  'DRRRRRRRRRDDRRRRrD..',
  'DRrRRRRRRrDDDrRRrDD.',
  'DRrRRRRRrDD..DrRRrD.',
  'DRRRRRRRrD....DRRRD.',
  '.DrrRRRRrD....DrrrDD',
  '.DrRRRRRrDD....DDrrr',
  '..DrrrrrrrDD.....DDD',
  '..DDDDDDDDDD........',
]

const COMPUTER_SIDE = [
  'tttttttss.........',
  'tcccccccss........',
  'tccccccccss.......',
  'tcccccccccss......',
  'tccccssssscs......',
  'tcccsssssccss.....',
  'tcccssssscccss....',
  'tccccssssscccss...',
  'tcccccccccccccss..',
  'tccccccccccccccss.',
  'tcccccccccccccccs.',
  'sccccccccccccccss.',
  'scccccccbbbbccss..',
  'sbbbbbbbbbbbsss...',
  '.ssssssssssss.....',
]

const spriteGround = (ctx: CanvasRenderingContext2D, x: number, y: number, size: number, night: boolean) => {
  plot(ctx, night ? '#354653' : '#5c7648', x - size / 2, y, size, 2)
  plot(ctx, night ? '#354653' : '#5c7648', x - size / 2 + 2, y + 2, size - 4)
}

const PIXEL_Z = ['###', '..#', '.#.', '#..', '###']

export function paintResidents(ctx: CanvasRenderingContext2D, positions: ReturnType<typeof worldLayout>['residents'], sprites: readonly (HTMLCanvasElement | null)[], time: number, night: boolean, footer: boolean) {
  for (const [i, spot] of positions.entries()) {
    const resident = RESIDENTS[i]!
    const sprite = sprites[i]
    if (!sprite) continue
    const hopping = resident.style === 'pixel-emotes' || resident.style === 'pixel-sprite'
    const step = Math.round(Math.pow(Math.max(0, Math.sin(time * 0.0025 + i * 1.47)), 9) * (i === 2 ? 4 : 3))
    const lift = hopping && !footer && !night && time > 0 ? step : 0
    const size = footer ? Math.round(spot.size * 0.85) : spot.size
    spriteGround(ctx, spot.x + 1, spot.y, Math.round(size * 0.84), night)
    ctx.globalAlpha = footer ? 0.83 : 1
    ctx.drawImage(sprite, Math.round(spot.x - size / 2), spot.y - size - lift + 1, size, size)
    ctx.globalAlpha = 1
    if ((footer || night) && hopping) {
      const drift = Math.floor((time * 0.003 + i * 2.5) % 8)
      writeSprite(ctx, spot.x + 3 + Math.floor(drift / 2), spot.y - size - drift, PIXEL_Z, { '#': '#becce1' })
    }
  }
}

export function paintDesk(ctx: CanvasRenderingContext2D, x: number, y: number, sample: HTMLCanvasElement | null, time: number, night: boolean) {
  ctx.save()
  ctx.translate(x, y)
  const wood = night ? '#674d4a' : '#a45636'
  const darkWood = night ? '#493c43' : '#654430'
  const rim = night ? '#947765' : '#e1a16b'
  const shadow = night ? '#2c3b51' : '#405b39'
  // The ground shadow, table and chair legs.
  plot(ctx, shadow, 2, 46, 70, 2)
  plot(ctx, shadow, 8, 48, 57, 2)
  plot(ctx, shadow, 13, 50, 39)
  line(ctx, darkWood, 42, 24, -2, 23, 2)
  line(ctx, darkWood, 64, 25, 1, 21, 2)
  line(ctx, wood, 66, 24, 1, 24, 2)
  line(ctx, rim, 66, 25, 1, 21)
  line(ctx, darkWood, 34, 27, -1, 17)
  line(ctx, darkWood, 8, 35, -5, 13)
  line(ctx, darkWood, 24, 37, 3, 10)
  line(ctx, darkWood, 15, 39, -3, 7)
  line(ctx, darkWood, 19, 43, 6, 0)
  line(ctx, '#625949', 66, 41, 4, 6)
  plot(ctx, '#625949', 69, 47, 7)
  // Desktop, warm-lit edge and a small enamel cup.
  plot(ctx, darkWood, 34, 23, 37, 4)
  plot(ctx, wood, 32, 22, 39, 3)
  plot(ctx, rim, 34, 21, 35, 2)
  plot(ctx, '#f1bc84', 36, 21, 26)
  plot(ctx, darkWood, 51, 24, 10)
  plot(ctx, '#5c4e52', 65, 15, 3, 6)
  plot(ctx, '#b2c3a0', 65, 17, 4, 4)
  plot(ctx, '#e8dfb0', 65, 17)
  plot(ctx, '#a3a07a', 68, 15, 1, 2)
  // Legs and chair.
  plot(ctx, '#30313a', 15, 29, 19, 6)
  line(ctx, '#33353d', 26, 32, 8, 1, 3)
  line(ctx, '#414753', 34, 33, 3, 11, 3)
  line(ctx, '#2a2833', 36, 36, 2, 8, 2)
  plot(ctx, '#282832', 36, 45, 8, 2)
  plot(ctx, '#27262c', 37, 47, 8)
  plot(ctx, '#48515d', 25, 33, 11)
  writeSprite(ctx, 2, 25, [
    'eeee.........', 'eooee........', '.eooee.......', '.eoooee......', '..eoooee.....',
    '..eooooee....', '...eooooee...', '...eooooeee..', '....eoooooee.',
    '.....eeeeeeee', '.......eeeeee',
  ], { e: darkWood, o: wood })
  plot(ctx, rim, 4, 27, 2)
  plot(ctx, wood, 9, 35, 13, 2)
  plot(ctx, rim, 12, 35, 9)
  // Knit back, hands, dark hair and the rim light of the monitor.
  writeSprite(ctx, 6, 13, SWEATER, { D: '#613e3c', r: night ? '#935949' : '#ad5647', R: night ? '#ac6b51' : '#cf7256' })
  line(ctx, '#613e3c', 24, 25, 9, -3, 2)
  plot(ctx, '#c88166', 30, 20, 5, 2)
  plot(ctx, '#e6a77d', 33, 20, 4)
  plot(ctx, '#e8aa82', 34, 19, 2)
  writeSprite(ctx, 9, 2, HAIR, { h: '#2b292f', H: '#37303b', l: '#4c3a42', s: '#d68c67', S: '#a76856' })
  plot(ctx, '#eaab7b', 20, 10)
  plot(ctx, '#f0bb88', 20, 12)
  // Keyboard and monitor side, then bevel and 19×14 phosphor window.
  plot(ctx, '#584656', 37, 19, 18, 3)
  plot(ctx, '#d7a887', 38, 19, 16, 2)
  for (let i = 40; i < 53; i += 2) plot(ctx, '#887376', i, 19)
  plot(ctx, '#634d58', 48, 17, 13, 3)
  plot(ctx, '#a27b72', 49, 18, 11, 2)
  writeSprite(ctx, 52, 1, COMPUTER_SIDE, { t: '#e8be9d', c: '#b8897d', s: '#7d6166', b: '#9a7373' })
  plot(ctx, '#725966', 39, 1, 22, 17)
  plot(ctx, '#ebbe9d', 38, 2, 22, 14)
  plot(ctx, '#f8d3af', 39, 1, 20, 2)
  plot(ctx, '#c99282', 38, 16, 22, 2)
  plot(ctx, '#e3ab92', 59, 3, 2, 12)
  plot(ctx, '#463950', 40, 3, 18, 13)
  plot(ctx, '#1c3458', 41, 4, 16, 11)
  plot(ctx, '#28466d', 41, 4, 4, 11)
  if (sample) ctx.drawImage(sample, 43, 3, 12, 12)
  for (let row = 5; row < 15; row += 2) {
    plot(ctx, 'rgb(18 33 49 / 17%)', 41, row, 16)
  }
  if (time > 0) {
    const scan = 4 + Math.floor(time / 177) % 11
    plot(ctx, 'rgb(188 235 217 / 25%)', 41, scan, 16)
  }
  plot(ctx, '#b4e393', 57, 16)
  plot(ctx, '#f9e3b4', 39, 2, 19)
  ctx.restore()
}

export function rasterAvatar(seed: string, style: StyleSlug, size: number, extractSprite: boolean): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = size
      const brush = canvas.getContext('2d', { willReadFrequently: extractSprite })
      if (!brush) return reject(new Error('Canvas not available'))
      brush.imageSmoothingEnabled = false
      brush.drawImage(image, 0, 0)
      if (!extractSprite) return resolve(canvas)

      // World's residents use the exact native avatar pixels with just the
      // flat avatar background keyed out, then crop to the visible sprite.
      const pixels = brush.getImageData(0, 0, size, size)
      const bg = (size + Math.floor(size / 2)) * 4
      let minX = size, minY = size, maxX = -1, maxY = -1
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const i = (y * size + x) * 4
          if (pixels.data[i + 3]! < 245 || (
            pixels.data[i] === pixels.data[bg] &&
            pixels.data[i + 1] === pixels.data[bg + 1] &&
            pixels.data[i + 2] === pixels.data[bg + 2]
          )) {
            pixels.data[i + 3] = 0
          } else {
            minX = Math.min(minX, x)
            minY = Math.min(minY, y)
            maxX = Math.max(maxX, x)
            maxY = Math.max(maxY, y)
          }
        }
      }
      if (maxX >= minX) {
        const width = maxX - minX + 1
        const height = maxY - minY + 1
        const edge = Math.max(width, height)
        canvas.width = canvas.height = edge
        brush.putImageData(pixels, Math.floor((edge - width) / 2) - minX, edge - height - minY)
      }
      resolve(canvas)
    }
    image.onerror = reject
    image.src = svgUrl(face(seed, style, size))
  })
}
