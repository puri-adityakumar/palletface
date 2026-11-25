import { ditherFace, type StyleSlug } from 'palletface'
import { bayer } from '../../lib/dither'
import { LETTER_STYLES, svgUrl } from '../../lib/faces'

const PX = 512
const MODES = ['raster', 'spiral', 'bayer', 'sweep'] as const
const PASSES = [
  ['raster / east', 'spiral / inward', 'bayer / origin', 'sweep / south'],
  ['raster / south', 'spiral / east', 'bayer / quarter', 'sweep / west'],
  ['raster / west', 'spiral / south', 'bayer / half', 'sweep / north'],
] as const

export function makePlot(seed: string, style: StyleSlug, index: number) {
  const start = performance.now()
  const svg = ditherFace(seed, { style, px: PX, name: LETTER_STYLES.has(style) ? seed : undefined })
  const ms = performance.now() - start
  const native = Number(svg.match(/viewBox="0 0 (\d+) \d+"/)?.[1] ?? 20)
  return {
    ms,
    native,
    grid: Math.min(native, 20),
    url: svgUrl(svg),
    style,
    seed,
    mode: MODES[index % MODES.length]!,
    pass: PASSES[Math.floor(index / MODES.length)]![index % MODES.length]!,
    turn: Math.floor(index / MODES.length),
  }
}

export type Job = ReturnType<typeof makePlot>
export type Cell = { x: number; y: number; hex: string }

function spiralRank(x: number, y: number, size: number) {
  const ring = Math.min(x, y, size - x - 1, size - y - 1)
  const edge = size - 1 - ring
  const length = edge - ring
  const offset = y === ring ? x - ring
    : x === edge ? length + y - ring
    : y === edge ? 2 * length + edge - x
    : 3 * length + edge - y
  return ring * size * 4 + offset
}

function order(job: Job, { x, y }: Cell) {
  const n = job.grid
  for (let r = 0; r < job.turn; r++) [x, y] = [y, n - 1 - x]
  if (job.mode === 'spiral') return spiralRank(x, y, n)
  // Make each Bayer threshold a separate bucket; raster order only breaks ties.
  if (job.mode === 'bayer') return bayer(x, y) * 64 * n * n + y * n + x
  if (job.mode === 'sweep') return x * n + (x % 2 === 0 ? y : n - 1 - y)
  return y * n + x
}

export async function samplePlot(job: Job): Promise<Cell[]> {
  const source = new Image()
  source.src = job.url
  await source.decode()
  const canvas = document.createElement('canvas')
  // Sample the center of each native pixel. Average vector art by drawing it smaller.
  const scale = job.grid === job.native ? 8 : 1
  const size = job.grid * scale
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return []
  ctx.drawImage(source, 0, 0, size, size)
  const data = ctx.getImageData(0, 0, size, size).data
  const cells: Cell[] = []
  for (let y = 0; y < job.grid; y++) {
    for (let x = 0; x < job.grid; x++) {
      const offset = ((y * scale + (scale >> 1)) * size + x * scale + (scale >> 1)) * 4
      if (data[offset + 3]! < 128) continue
      const hex = [data[offset]!, data[offset + 1]!, data[offset + 2]!]
        .map(channel => channel.toString(16).padStart(2, '0')).join('')
      cells.push({ x, y, hex: `#${hex}` })
    }
  }
  return cells.sort((a, b) => order(job, a) - order(job, b))
}
