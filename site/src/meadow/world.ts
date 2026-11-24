import { bayer, rng } from '../lib/dither'
import { face, svgUrl, type StyleSlug } from '../lib/faces'
import {
  CHAIR_BACK, CLOUDS, CRT_FRONT, CRT_SIDE, CUP, FLOWERS, KEYBOARD, MOON,
  MUSHROOMS, PERSON_ARM, PERSON_HEAD, PERSON_LEGS, PERSON_SWEATER, PINE_TREE, ROUND_TREE,
  STONES, TABLE, TUFTS, type Sprite,
} from './sprites'

export const FIELD_GREEN = '#91a85e'
export const FIELD_NIGHT = '#465566'

const PALETTE = {
  day: {
    sky: ['#3558a6', '#4773b5', '#6c8fc0'],
    cloud: { s: '#91acd0', b: '#c3d4e2', h: '#e6ece6' },
    far: ['#6d91a6', '#60889c'],
    middle: ['#5f8775', '#557e6a'],
    tree: { s: '#416c6c', m: '#4e7977', h: '#608a83' },
    near: ['#55794e', '#6c884f', '#829954', FIELD_GREEN],
    trail: ['#a1a66d', '#b8bc80', '#d7d19a'],
    grass: { s: '#547347', g: '#72904e', h: '#afbd71' },
    stone: { s: '#667661', m: '#92a18b', h: '#c1c4a4' },
    mushroom: { r: '#bc6452', h: '#f5d4a1', s: '#765247', t: '#e0c7a0' },
    shadow: '#5a784c',
  },
  night: {
    sky: ['#19233f', '#253354', '#3a4b6c'],
    cloud: { s: '#3b4d6c', b: '#526788', h: '#687d9a' },
    far: ['#4b6179', '#415770'],
    middle: ['#3d5968', '#344f5d'],
    tree: { s: '#2a4255', m: '#334f60', h: '#436071' },
    near: ['#304b54', '#39525c', '#405862', FIELD_NIGHT],
    trail: ['#53646b', '#65767c', '#7c8990'],
    grass: { s: '#324b57', g: '#49636a', h: '#728581' },
    stone: { s: '#394e5b', m: '#596f7a', h: '#83969b' },
    mushroom: { r: '#825b6d', h: '#bdada5', s: '#494351', t: '#9a9292' },
    shadow: '#314754',
  },
} as const

export const RESIDENTS = [
  { seed: 'poppy', style: 'pixel-sprite', x: 0.19, y: 0.78, mx: 0.14, my: 0.628, size: 12 },
  { seed: 'sorrel', style: 'pixel-flora', x: 0.39, y: 0.84, mx: 0.30, my: 0.875, size: 16 },
  { seed: 'myco', style: 'pixel-emotes', x: 0.34, y: 0.71, mx: 0.42, my: 0.62, size: 16 },
  { seed: 'fern', style: 'pixel-sprite', x: 0.49, y: 0.77, mx: 0.13, my: 0.92, size: 12 },
  { seed: 'ember', style: 'pixel-relic', x: 0.89, y: 0.84, mx: 0.88, my: 0.86, size: 16 },
  { seed: 'mallow', style: 'pixel-flora', x: 0.065, y: 0.88, mx: 0.76, my: 0.92, size: 16 },
] as const satisfies ReadonlyArray<{ seed: string; style: StyleSlug; x: number; y: number; mx: number; my: number; size: number }>

export function worldLayout(width: number, height: number, compact: boolean, footer: boolean) {
  const desk = { x: Math.round(width * (compact ? 0.65 : 0.73)) - 29, y: Math.round(height * (compact ? 0.812 : 0.85)) - 48 }
  const residents = RESIDENTS.map((resident, i) => ({
    x: Math.round(width * (compact ? resident.mx : resident.x)),
    y: Math.round(height * (footer ? ([0.85, 0.94, 0.73, 0.87, 0.91, 0.94][i] ?? 0.9) : compact ? resident.my : resident.y)),
    size: resident.size,
  }))
  return { desk, residents }
}

const clamp = (number: number) => Math.min(1, Math.max(0, number))
const plot = (ctx: CanvasRenderingContext2D, color: string, x: number, y: number, w = 1, h = 1) => {
  ctx.fillStyle = color
  ctx.fillRect(Math.round(x), Math.round(y), w, h)
}

function writeSprite(ctx: CanvasRenderingContext2D, x: number, y: number, rows: Sprite, colors: Readonly<Record<string, string>>) {
  for (let row = 0; row < rows.length; row++) {
    const glyphs = rows[row]!
    for (let col = 0; col < glyphs.length; col++) {
      const color = colors[glyphs[col]!]
      if (color) plot(ctx, color, x + col, y + row)
    }
  }
}

const hillAt = (x: number, height: number, compact: boolean, footer: boolean) => {
  const rise = (compact ? 0.075 : 0.107) * x
  const roll = 0.026 * Math.sin(x * 3.5) - 0.015 * Math.sin(x * 7)
  return (footer ? 0.61 : compact ? 0.524 : 0.52 + (1 - x) * 0.04) * height + (rise + roll) * height
}

const farAt = (x: number, height: number, compact: boolean, footer: boolean) =>
  Math.max(height * (footer ? 0 : compact ? 0.49 : 0.515),
    hillAt(x, height, compact, footer) - height * (0.059 + 0.026 * Math.sin(x * 6.5 + 2.2)))

const middleAt = (x: number, height: number, compact: boolean, footer: boolean) =>
  hillAt(x, height, compact, footer) - height * (0.023 + 0.017 * Math.sin(x * 8.5 + 0.5))

const pathAt = (depth: number, compact: boolean) =>
  (compact ? 0.48 : 0.60) + (compact ? 0.185 : 0.14) * Math.sin(depth * 4.8 - 1.25)

const pathWidth = (depth: number, compact: boolean) =>
  0.003 + depth * depth * (compact ? 0.10 : 0.057)

const hex = (color: string) => [1, 3, 5].map(i => Number.parseInt(color.slice(i, i + 2), 16))

// Dither only at the seam between solid color clusters, never across a fill.
function band(x: number, y: number, value: number, edges: readonly number[], seam: number) {
  let index = 0
  for (const edge of edges) {
    if (value < edge - seam) break
    if (value >= edge + seam) index++
    else {
      index += Number(bayer(x, y) < clamp((value - edge + seam) / (2 * seam)))
      break
    }
  }
  return index
}

export function paintBackdrop(ctx: CanvasRenderingContext2D, width: number, height: number, compact: boolean, night: boolean, footer: boolean) {
  const palette = night ? PALETTE.night : PALETTE.day
  const sky = palette.sky.map(hex)
  const far = palette.far.map(hex)
  const middle = palette.middle.map(hex)
  const near = palette.near.map(hex)
  const trail = palette.trail.map(hex)
  const pixels = ctx.createImageData(width, height)
  for (let x = 0; x < width; x++) {
    const u = x / width
    const hill = Math.round(hillAt(u, height, compact, footer))
    const farHill = Math.round(farAt(u, height, compact, footer))
    const midHill = Math.round(middleAt(u, height, compact, footer))
    for (let y = 0; y < height; y++) {
      const depth = (y - hill) / Math.max(1, height - hill)
      let color: number[]
      if (y < farHill) {
        color = sky[band(x, y, y, [height * 0.47, height * 0.54], 3)]!
      } else if (y < midHill) {
        color = far[band(x, y, y - farHill, [height * 0.024], 2)]!
      } else if (y < hill) {
        color = middle[band(x, y, y - midHill, [height * 0.02], 2)]!
      } else {
        const fold = Math.sin(u * 8 + depth * 3) * 0.065
        color = near[band(x, y, depth + fold, [0.10, 0.37, 0.71], 0.027)]!
        if (!footer && depth > 0.015 && y < height * 0.935) {
          const distance = Math.abs(u - pathAt(depth, compact)) * width
          const radius = Math.max(0.6, pathWidth(depth, compact) * width)
          const fade = clamp((height * 0.935 - y) / 8)
          if (distance <= radius + 1 && bayer(x, y) < fade) {
            const left = u < pathAt(depth, compact)
            color = distance > radius - 0.7 ? trail[left ? 2 : 0]! : trail[1]!
            if (!left && distance > radius * 0.55 && bayer(x, y) < (distance / radius - 0.55) * 0.7) color = trail[0]!
          }
        }
        if (y >= height - 9) {
          if (bayer(x, y) < clamp((y - height + 9) / 5)) color = near[3]!
        }
      }
      const at = (y * width + x) * 4
      pixels.data[at] = color[0]!
      pixels.data[at + 1] = color[1]!
      pixels.data[at + 2] = color[2]!
      pixels.data[at + 3] = 255
    }
  }
  ctx.putImageData(pixels, 0, 0)

  const trees = rng('meadow/tree-line')
  const clusters = compact ? [0.03, 0.19, 0.81, 0.98] : [0.03, 0.14, 0.44, 0.78, 0.94]
  for (const center of clusters) {
    const count = compact ? 4 : 7
    for (let i = 0; i < count; i++) {
      const x = Math.round((center + (i - count / 2) * 0.016 + trees() * 0.011) * width)
      const tree = i % 4 === 0 ? PINE_TREE : ROUND_TREE
      const quietEdge = !footer && x / width < 0.55 ? height * (compact ? 0.49 : 0.515) + tree.length : 0
      const y = Math.round(Math.max(quietEdge, middleAt(x / width, height, compact, footer) + 3))
      writeSprite(ctx, x - 4, y - tree.length, tree, palette.tree)
    }
  }

  const layout = worldLayout(width, height, compact, footer)
  const roomFor = (x: number, y: number) => {
    if (y > height - 10) return false
    if (layout.residents.some(spot => Math.abs(x - spot.x) < 8 && Math.abs(y - spot.y) < 6)) return false
    if (!footer && x > layout.desk.x - 3 && x < layout.desk.x + 76 && y > layout.desk.y + 25 && y < layout.desk.y + 54) return false
    const hill = hillAt(x / width, height, compact, footer)
    const depth = (y - hill) / (height - hill)
    return footer || y > height * 0.935 || Math.abs(x / width - pathAt(depth, compact)) > pathWidth(depth, compact) + 0.012
  }

  const grass = rng('meadow/tuft-gardens')
  const tufts = Math.round(width * height * (compact ? 0.005 : 0.0045))
  const ground: { x: number; y: number; depth: number; variant: number }[] = []
  for (let i = 0; i < tufts; i++) {
    const x = Math.floor(grass() * width)
    const depth = Math.sqrt(grass())
    const hill = hillAt(x / width, height, compact, footer)
    const y = Math.round(hill + 3 + depth * (height - hill - 14))
    const patch = Math.sin(x / width * 24 + depth * 9) + Math.sin(x / width * 39 - depth * 17)
    if (!roomFor(x, y) || patch < -0.6 || depth < 0.12) continue
    const variant = depth < 0.42 ? i % 2 : depth < 0.72 ? 1 + i % 2 : 2 + i % 3
    ground.push({ x, y, depth, variant })
  }
  ground.sort((a, b) => a.y - b.y)
  for (const { x, y, variant } of ground) {
    const sprite = TUFTS[variant]!
    writeSprite(ctx, x, y - sprite.length, sprite, palette.grass)
  }

  const flowers = rng('meadow/flower-beds')
  const gardens = compact ? [[0.02, 0.70], [0.44, 0.76], [0.92, 0.67], [0.58, 0.92]] :
    [[0.08, 0.78], [0.25, 0.88], [0.45, 0.86], [0.84, 0.72], [0.95, 0.90]]
  for (const [u = 0, v = 0] of gardens) {
    for (let i = 0; i < (compact ? 6 : 9); i++) {
      const x = Math.round((u + (flowers() - 0.5) * 0.12) * width)
      const y = Math.round((v + (flowers() - 0.5) * 0.085) * height)
      if (y < hillAt(x / width, height, compact, footer) + 7 || !roomFor(x, y)) continue
      const variant = Math.floor(flowers() * FLOWERS.length)
      const petals = night ? ['#bfc7bf', '#af7886', '#a9ac86', '#879bb5', '#b7b796'] :
        ['#fff3d4', '#e57963', '#f1d071', '#929fd3', '#f6d67b']
      const colors = { ...palette.grass, p: petals[variant]!, c: night ? '#948d76' : '#d6a653', b: petals[3]!, B: night ? '#b8becd' : '#d1c7e2' }
      const sprite = FLOWERS[variant]!
      writeSprite(ctx, x, y - sprite.length, sprite, colors)
    }
  }

  for (const [i, u] of (compact ? [0.05, 0.49, 0.93] : [0.11, 0.29, 0.51, 0.86, 0.96]).entries()) {
    const x = Math.round(u * width)
    const y = Math.round(height * (i % 2 ? 0.89 : 0.76))
    if (!roomFor(x, y)) continue
    const stone = STONES[i % STONES.length]!
    writeSprite(ctx, x, y - stone.length, stone, palette.stone)
    if (i % 2 === 0) {
      const mushroom = MUSHROOMS[i % MUSHROOMS.length]!
      writeSprite(ctx, x + 6, y - mushroom.length + 1, mushroom, palette.mushroom)
    }
  }

  plot(ctx, night ? FIELD_NIGHT : FIELD_GREEN, 0, height - 4, width, 4)
}

export function makeAir(compact: boolean, night: boolean, footer: boolean) {
  const palette = night ? PALETTE.night : PALETTE.day
  const cloudSpecs = compact ? [[0.93, 0.13, 1], [0.96, 0.45, 2]] :
    [[0.79, 0.23, 0], [0.99, 0.39, 1], [0.6, 0.465, 2]]
  const r = rng('meadow/constellations')
  const stars = Array.from({ length: compact ? 35 : 76 }, (_, i) => ({
    x: r(), y: 0.025 + r() * (footer ? 0.55 : 0.47), phase: r() * Math.PI * 2, bright: i % 11 === 0,
  })).filter(star => footer || star.x > 0.57 || star.y > 0.44)
  const flies = rng('meadow/fireflies')
  const fireflies = Array.from({ length: compact ? 8 : 14 }, () => ({
    x: 0.03 + flies() * 0.94, y: 0.67 + flies() * 0.20, phase: flies() * Math.PI * 2,
  }))

  return (ctx: CanvasRenderingContext2D, width: number, height: number, time: number) => {
    if (night) {
      const stackedFooter = footer && (compact || width <= 225)
      const moonX = footer && !stackedFooter ? 0.57 : compact ? 0.83 : 0.90
      const moonY = footer ? stackedFooter ? 0.03 : 0.16 : 0.19
      writeSprite(ctx, Math.round(width * moonX) - 9, Math.round(height * moonY), MOON,
        { h: '#e4e4c7', b: '#b8c6be', c: '#98adb1' })
      for (const { x, y, phase, bright } of stars) {
        const glow = Math.sin(time * 0.0009 + phase)
        const px = Math.round(x * width)
        const py = Math.round(y * height)
        if (bright && glow > -0.1) {
          plot(ctx, '#8295b0', px - 1, py, 3)
          plot(ctx, '#8295b0', px, py - 1, 1, 3)
          plot(ctx, '#eee5c4', px, py)
        } else plot(ctx, glow > 0.3 ? '#bbc9cc' : '#637995', px, py)
      }
      for (const { x, y, phase } of fireflies) {
        const glow = Math.sin(time * 0.0011 + phase)
        if (glow < 0.2) continue
        const px = Math.round(x * width + Math.sin(time * 0.0003 + phase) * 3)
        const py = Math.round(y * height + Math.sin(time * 0.00045 + phase) * 2)
        if (glow > 0.85) plot(ctx, '#758b79', px - 1, py, 3)
        plot(ctx, glow > 0.7 ? '#e0dfa3' : '#aab783', px, py)
      }
    } else if (!footer) {
      for (const [i, [u = 0, v = 0, variant = 0]] of cloudSpecs.entries()) {
        const sprite = CLOUDS[variant]!
        const drift = Math.round(Math.sin(time * 0.000045 + i * 1.7) * (compact ? 4 : 9))
        writeSprite(ctx, Math.round(u * width) - Math.floor(sprite[0]!.length / 2) + drift, Math.round(v * height), sprite, palette.cloud)
      }
      for (let i = 0; i < 2; i++) {
        const x = Math.round(width * (0.77 + i * 0.043) + Math.sin(time * 0.00008 + i) * 3)
        const y = Math.round(height * (0.43 + i * 0.012))
        const wings = Math.floor(time / 650 + i) % 2
        writeSprite(ctx, x, y, wings ? ['.s.s.', '..s..'] : ['s...s', '.sss.'], { s: '#5d7898' })
      }
    }
  }
}

const PIXEL_Z = ['###', '..#', '.#.', '#..', '###']

export function paintResidents(ctx: CanvasRenderingContext2D, positions: ReturnType<typeof worldLayout>['residents'], sprites: readonly (HTMLCanvasElement | null)[], time: number, night: boolean, footer: boolean) {
  for (const [i, spot] of positions.entries()) {
    const resident = RESIDENTS[i]!
    const sprite = sprites[i]
    if (!sprite) continue
    const hopping = resident.style === 'pixel-emotes' || resident.style === 'pixel-sprite'
    const step = Math.round(Math.pow(Math.max(0, Math.sin(time * 0.0025 + i * 1.47)), 9) * (i === 2 ? 3 : 2))
    const lift = hopping && !footer && !night && time > 0 ? step : 0
    const x = spot.x - Math.floor(sprite.width / 2)
    const shadow = night ? PALETTE.night.shadow : PALETTE.day.shadow
    plot(ctx, shadow, x + 1, spot.y, Math.max(2, sprite.width - 2))
    plot(ctx, shadow, x + 3, spot.y + 1, Math.max(2, sprite.width - 6))
    ctx.drawImage(sprite, x, spot.y - sprite.height - lift + 1)
    if ((footer || night) && hopping) {
      const drift = Math.floor((time * 0.0014 + i * 2.5) % 8)
      writeSprite(ctx, spot.x + 3 + Math.floor(drift / 2), spot.y - sprite.height - drift - 3, PIXEL_Z, { '#': '#bacbd3' })
    }
  }
}

export function paintDesk(ctx: CanvasRenderingContext2D, x: number, y: number, sample: HTMLCanvasElement | null, time: number, night: boolean) {
  ctx.save()
  ctx.translate(Math.round(x), Math.round(y))
  const wood = night ? { s: '#4a404b', m: '#8b615b', h: '#bf9275' } :
    { s: '#694b45', m: '#ae714b', h: '#e7b477' }
  const knit = night ? { s: '#653c50', r: '#a45960', h: '#c98672' } :
    { s: '#863f4b', r: '#c96355', h: '#eb9970' }
  const shadow = night ? '#304552' : '#587547'
  plot(ctx, shadow, 1, 48, 71, 2)
  plot(ctx, shadow, 8, 50, 54)

  // The chair legs must sit behind the trousers.
  writeSprite(ctx, 3, 23, CHAIR_BACK, wood)
  for (let row = 0; row < 13; row++) {
    plot(ctx, wood.s, 10 - Math.floor(row / 4), 36 + row, 2)
    plot(ctx, wood.m, 22 + Math.floor(row / 5), 36 + row, 2)
  }
  plot(ctx, wood.s, 10, 44, 15)
  plot(ctx, wood.h, 10, 35, 15)
  plot(ctx, wood.m, 10, 36, 15, 2)

  writeSprite(ctx, 16, 31, PERSON_LEGS, night ?
    { s: '#303a4b', m: '#455367', h: '#63717c', e: '#394150' } :
    { s: '#343747', m: '#495365', h: '#74828a', e: '#3a3947' })
  writeSprite(ctx, 7, 15, PERSON_SWEATER, knit)
  writeSprite(ctx, 20, 19, PERSON_ARM, knit)
  writeSprite(ctx, 10, 1, PERSON_HEAD, night ?
    { e: '#35303e', h: '#564253', l: '#76605f', m: '#413644', a: '#a96d69', f: '#e4b999', g: '#aac6bb', k: '#564955' } :
    { e: '#3f303e', h: '#674858', l: '#8b6067', m: '#523b4b', a: '#c48771', f: '#f0bd91', g: '#d9d4ac', k: '#6a4951' })
  if (Math.floor(time / 180) % 26 === 25) plot(ctx, night ? '#e4b999' : '#f0bd91', 21, 10, 2)

  writeSprite(ctx, 32, 25, TABLE, wood)
  const cabinet = night ? { s: '#645968', m: '#a19a92', h: '#d6ccb0', b: '#4b5667', c: '#33566b', g: '#c3d59d' } :
    { s: '#817577', m: '#c9bea3', h: '#f7e5b8', b: '#59636b', c: '#365c6d', g: '#aacb81' }
  writeSprite(ctx, 60, 2, CRT_SIDE, cabinet)
  plot(ctx, cabinet.s, 48, 20, 9, 4)
  plot(ctx, cabinet.m, 47, 23, 12, 2)
  plot(ctx, cabinet.h, 48, 23, 8)
  writeSprite(ctx, 41, 1, CRT_FRONT, cabinet)
  if (sample) ctx.drawImage(sample, 45, 4)
  plot(ctx, '#98c0bd', 43, 4, 1, 10)
  if (Math.floor(time / 1250) % 5 === 3) plot(ctx, '#84ada6', 44, 14, 13)

  writeSprite(ctx, 33, 21, KEYBOARD, { h: cabinet.h, m: cabinet.m, b: '#8d938c', s: cabinet.s })
  const typing = time > 0 ? Math.floor(time / 310) % 2 : 0
  plot(ctx, night ? '#b88b83' : '#d99979', 35, 22 - typing, 4, 2)
  plot(ctx, night ? '#cdd3ad' : '#f2c8a0', 36, 22 - typing, 3)
  plot(ctx, night ? '#b88b83' : '#d99979', 39, 22, 4)
  plot(ctx, night ? '#cdd3ad' : '#f2c8a0', 40, 21, 3)

  writeSprite(ctx, 65, 19, CUP, { s: '#596367', b: '#6a514b', m: night ? '#99a79b' : '#b8c9a1', h: '#ece4bd' })
  const steam = Math.floor(time / 700) % 3
  plot(ctx, night ? '#849498' : '#c7d2b5', 67, 15 - steam, 1, 2)
  plot(ctx, night ? '#849498' : '#c7d2b5', 68, 12 - steam, 1, 2)
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

      // Key out the flat background, preserving the avatar's native pixel grid.
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
          )) pixels.data[i + 3] = 0
          else {
            minX = Math.min(minX, x)
            minY = Math.min(minY, y)
            maxX = Math.max(maxX, x)
            maxY = Math.max(maxY, y)
          }
        }
      }
      if (maxX >= minX) {
        canvas.width = maxX - minX + 1
        canvas.height = maxY - minY + 1
        brush.putImageData(pixels, -minX, -minY)
      }
      resolve(canvas)
    }
    image.onerror = reject
    image.src = svgUrl(face(seed, style, size))
  })
}
