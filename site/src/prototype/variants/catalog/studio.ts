type RGB = [number, number, number]
type Sample = { color: RGB; count: number }

export type Studio = { wall: string; floor: string; shade: string; swatches: string[] }

const asCss = (color: RGB) => `rgb(${color.join(' ')})`
const luminance = ([r, g, b]: RGB) => .2126 * r + .7152 * g + .0722 * b
const distance = ([r, g, b]: RGB, [rr, gg, bb]: RGB) => Math.hypot(r - rr, g - gg, b - bb)

/** Read the actual rendered colors, not a second set of hand-picked tile palettes. */
export async function readStudio(src: string): Promise<Studio | undefined> {
  const image = new Image()
  image.src = src
  try {
    await image.decode()
  } catch {
    return
  }

  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 40
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.drawImage(image, 0, 0, 40, 40)
  const { data } = ctx.getImageData(0, 0, 40, 40)
  const colors = new Map<string, Sample>()

  for (let p = 0; p < data.length; p += 4) {
    if (data[p + 3]! < 245) continue // Skip the transparent edge.
    const color: RGB = [data[p]!, data[p + 1]!, data[p + 2]!]
    const key = color.map((value) => value >> 4).join(':')
    const sample = colors.get(key)
    if (sample) sample.count++
    else colors.set(key, { color, count: 1 })
  }

  const sorted = [...colors.values()].sort((a, b) => b.count - a.count)
  const base = sorted[0]?.color
  if (!base) return

  const accent = sorted.find(({ color, count }) => count > 8 && distance(color, base) > 60)?.color ?? base
  const wall = asCss(base)
  const floor = asCss(accent)

  return {
    wall: `color-mix(in srgb, ${wall} ${luminance(base) < 115 ? 39 : 72}%, #fbf9f4)`,
    floor: `color-mix(in srgb, ${floor} ${luminance(accent) < 115 ? 28 : 57}%, #f8eddb)`,
    shade: `color-mix(in srgb, ${floor} 35%, #27271c)`,
    swatches: [...new Set([wall, floor, ...sorted.filter(({ count }) => count > 10).slice(0, 3).map(({ color }) => asCss(color))])].slice(0, 3),
  }
}
