/**
 * The footer scene: two knights duel on a castle rampart over a moonlit sea
 * cliff. Everything is painted into a grid of cells, then drawn as a halftone
 * on the night, each cell a square sized by its brightness. The stars, clouds
 * and mountains grow from the seed; the castle and the duel stay put.
 */
import { useEffect, useRef, type RefObject } from 'react'
import { hash, rng } from '../lib/dither'
import { useReducedMotion } from '../lib/hooks'

const rgb = (hex: string) => {
  const n = Number.parseInt(hex.slice(1), 16)
  return (0xff000000 | ((n & 0xff) << 16) | (n & 0xff00) | (n >>> 16)) >>> 0
}
const pack = (r: number, g: number, b: number) => (0xff000000 | (b << 16) | (g << 8) | r) >>> 0
const mix = (a: number, b: number, t: number) => {
  if (t <= 0) return a
  if (t >= 1) return b
  const ar = a & 0xff
  const ag = (a >>> 8) & 0xff
  const ab = (a >>> 16) & 0xff
  return pack(Math.round(ar + ((b & 0xff) - ar) * t), Math.round(ag + (((b >>> 8) & 0xff) - ag) * t), Math.round(ab + (((b >>> 16) & 0xff) - ab) * t))
}

/** The night behind the squares. Cells this color are left empty. */
const NIGHT = rgb('#070a12')
const NIGHT_CSS = '#070a12'
const PAPER = rgb('#e7e7e3')
const SKY = { top: rgb('#0a1530'), mid: rgb('#0e2044'), low: rgb('#1b3b6c') }
const STAR = [rgb('#f3f6ff'), rgb('#a9c3ff'), rgb('#5a78b8')] as const
const MOON = { face: rgb('#eef3b8'), crater: rgb('#cdd690'), glow: rgb('#2f5a8e') }
const CLOUD = { hi: rgb('#86a8d4'), mid: rgb('#33547f'), low: rgb('#203d66') }
const FAR = { lit: rgb('#22406f'), shade: rgb('#183159'), snow: rgb('#b4cbee'), snowShade: rgb('#5a7cae') }
const NEAR = { lit: rgb('#16294c'), shade: rgb('#112140') }
const SEA = { top: rgb('#18355f'), deep: rgb('#0b1a35'), glint: rgb('#5e82b8'), shine: rgb('#f0f4c8'), shineDim: rgb('#93b2da'), foam: rgb('#a7bfe0') }
const ROCK = { lit: rgb('#7298bd'), mid: rgb('#335477'), base: rgb('#253f60'), dark: rgb('#1a2e49'), crack: rgb('#101e33') }
const STONE = { lit: rgb('#9cc0dc'), mid: rgb('#45698d'), base: rgb('#325574'), dark: rgb('#213b56'), joint: rgb('#172b42') }
const SPIRE = { body: rgb('#16294a'), lit: rgb('#2d4d77'), roof: rgb('#10203b') }
const MOSS = { hi: rgb('#4f7a5c'), mid: rgb('#355a46'), dark: rgb('#223d33') }
const WINDOW = rgb('#ffc760')
const WARM = rgb('#ff9b45')
const FLAME = [rgb('#fff3b8'), rgb('#ffc24d'), rgb('#ff7a2e')] as const
const FLAG = { cloth: rgb('#d0404a'), shade: rgb('#8f2a33'), pole: rgb('#4c6585') }
const BLADE = { face: rgb('#f2f6ff'), edge: rgb('#8ea6c6') }
const HILT = rgb('#e0b04a')
const GRIP = rgb('#6a4a2c')
const SPARK = { core: rgb('#ffffff'), ray: rgb('#ffd36b'), glow: rgb('#ffb347') }

type Kit = { a: number; b: number; c: number; v: number; p: number; o: number; rim: number }
const WHITE: Kit = { a: rgb('#dfe6ee'), b: rgb('#8fa3bb'), c: rgb('#ffffff'), v: NIGHT, p: rgb('#5770ff'), o: rgb('#05070d'), rim: rgb('#05070d') }
const BLACK: Kit = { a: rgb('#2a3850'), b: rgb('#192233'), c: rgb('#4f6788'), v: rgb('#ff4b55'), p: rgb('#e0434c'), o: rgb('#05070d'), rim: rgb('#9cc0e6') }

type Body = 'stand' | 'lunge'
type Pose = { body: Body; sword: number; dx: number }

/** Knight bodies facing right, without the sword arm. a armor, b shade, c light, v visor, p plume. */
const BODIES: Record<Body, readonly string[]> = {
  stand: [
    'pp........',
    '.ppaaa....',
    '..aaaaa...',
    '..acaaa...',
    '..aavvv...',
    '..baaaa...',
    '.ccaaab...',
    '.caaaab...',
    '.caaaab...',
    '..bbbb....',
    '..aa.aa...',
    '.aa...aa..',
    '.aa...aa..',
    '.aa....aa.',
    'aaa....aaa',
  ],
  lunge: [
    '..........',
    '.pp.......',
    '..ppaaa...',
    '...aaaaa..',
    '...acaaa..',
    '...aavvv..',
    '...baaaa..',
    '..ccaaab..',
    '..caaaab..',
    '..caaab...',
    '..bbbb....',
    '.aa..aaa..',
    'aa....aaa.',
    'a......aa.',
    'a.......aa',
  ],
}
const SHOULDER: Record<Body, readonly [number, number]> = { stand: [5, 6], lunge: [6, 7] }

// sprites are drawn at double resolution so outlines, blades and rim light get finer than the body
const SCALE = 2
// the sprite buffer leaves room around the body for a raised or thrust sword
const KW = 32
const KH = 30
const OX = 10
const OY = 11
const FW = KW * SCALE
const FH = KH * SCALE
/** Cells a knight needs above its feet with the sword raised. */
const REACH = 54

type Key = readonly [ms: number, body: Body, sword: number, dx: number]
const LOOP = 4400
const WHITE_KEYS: readonly Key[] = [
  [0, 'stand', 40, 0],
  [700, 'stand', 40, 0],
  [950, 'stand', 135, -1],
  [1100, 'lunge', 18, 2],
  [1350, 'lunge', 22, 1],
  [1750, 'stand', 40, 0],
  [2600, 'stand', 40, 0],
  [2760, 'stand', 85, 0],
  [2950, 'stand', 85, -2],
  [3200, 'stand', 80, -2],
  [3600, 'stand', 40, 0],
  [LOOP, 'stand', 40, 0],
]
const BLACK_KEYS: readonly Key[] = [
  [0, 'stand', 40, 0],
  [900, 'stand', 40, 0],
  [1080, 'stand', 85, 0],
  [1250, 'stand', 85, -2],
  [1400, 'stand', 80, -2],
  [1750, 'stand', 40, 0],
  [2350, 'stand', 40, 0],
  [2600, 'stand', 135, -1],
  [2750, 'lunge', 18, 2],
  [3000, 'lunge', 22, 1],
  [3400, 'stand', 40, 0],
  [LOOP, 'stand', 40, 0],
]
const CLASHES = [
  [1100, 1300],
  [2750, 2950],
] as const

function poseAt(keys: readonly Key[], t: number, phase: number): Pose {
  let i = 0
  while (i < keys.length - 2 && keys[i + 1]![0] <= t) i++
  const [t0, , s0, d0] = keys[i]!
  const [t1, body, s1, d1] = keys[i + 1]!
  const f = Math.min(1, Math.max(0, (t - t0) / (t1 - t0)))
  const e = 1 - (1 - f) * (1 - f)
  const sway = Math.abs(s1 - s0) < 1 ? Math.sin(t * 0.006 + phase) * 4 : 0
  return { body, sword: s0 + (s1 - s0) * e + sway, dx: Math.round(d0 + (d1 - d0) * e) }
}

type Seg = { x0: number; y0: number; x1: number; y1: number }

function line(buf: Uint32Array, w: number, h: number, x0: number, y0: number, x1: number, y1: number, c: number) {
  let x = Math.round(x0)
  let y = Math.round(y0)
  const xe = Math.round(x1)
  const ye = Math.round(y1)
  const dx = Math.abs(xe - x)
  const dy = -Math.abs(ye - y)
  const sx = x < xe ? 1 : -1
  const sy = y < ye ? 1 : -1
  let err = dx + dy
  for (;;) {
    if (x >= 0 && y >= 0 && x < w && y < h) buf[y * w + x] = c
    if (x === xe && y === ye) return
    const e2 = 2 * err
    if (e2 >= dy) {
      err += dy
      x += sx
    }
    if (e2 <= dx) {
      err += dx
      y += sy
    }
  }
}

/** Scale2x: doubles a sprite and rounds its diagonal steps. */
function scale2x(src: Uint32Array, w: number, h: number, dst: Uint32Array) {
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : src[y * w + x]!)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = at(x, y)
      const a = at(x, y - 1)
      const b = at(x + 1, y)
      const c = at(x - 1, y)
      const d = at(x, y + 1)
      const o = y * 2 * w * 2 + x * 2
      dst[o] = c === a && c !== d && a !== b ? a : p
      dst[o + 1] = a === b && a !== c && b !== d ? b : p
      dst[o + w * 2] = d === c && d !== b && c !== a ? c : p
      dst[o + w * 2 + 1] = b === d && b !== a && d !== c ? d : p
    }
  }
}

/**
 * Draws one knight facing right into `fb` and returns its blade in buffer cells.
 * `moonRight` puts the lit edges on the buffer's right, for a knight drawn mirrored.
 */
function drawKnight(sb: Uint32Array, fb: Uint32Array, kit: Kit, pose: Pose, moonRight: boolean): Seg {
  sb.fill(0)
  const colors: Record<string, number> = { a: kit.a, b: kit.b, c: kit.c, v: kit.v, p: kit.p }
  BODIES[pose.body].forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const c = colors[row[x]!]
      if (c) sb[(OY + y) * KW + OX + x] = c
    }
  })
  scale2x(sb, KW, KH, fb)
  const body = fb.slice()
  const toMoon = moonRight ? 1 : -1
  for (let y = 0; y < FH; y++) {
    for (let x = 0; x < FW; x++) {
      if (body[y * FW + x] !== kit.a) continue
      if (!body[y * FW + x + toMoon] || !body[(y - 1) * FW + x]) fb[y * FW + x] = kit.c
      else if (!body[y * FW + x - toMoon] || !body[(y + 1) * FW + x]) fb[y * FW + x] = kit.b
    }
  }
  const [sx, sy] = SHOULDER[pose.body]
  const ax = (OX + sx) * SCALE + 1
  const ay = (OY + sy) * SCALE + 1
  const arm = (Math.min(110, Math.max(-45, pose.sword - 35)) * Math.PI) / 180
  const hx = ax + Math.cos(arm) * 8
  const hy = ay - Math.sin(arm) * 8
  line(fb, FW, FH, ax, ay - 1, hx, hy - 1, kit.c)
  line(fb, FW, FH, ax, ay, hx, hy, kit.a)
  line(fb, FW, FH, ax, ay + 1, hx, hy + 1, kit.a)
  line(fb, FW, FH, ax, ay + 2, hx, hy + 2, kit.b)
  const a = (pose.sword * Math.PI) / 180
  const ux = Math.cos(a)
  const uy = -Math.sin(a)
  const px = -uy
  const py = ux
  line(fb, FW, FH, hx - ux, hy - uy, hx + ux * 2, hy + uy * 2, GRIP)
  for (let s = -4; s <= 4; s++) {
    const x = Math.round(hx + ux * 3 + px * s)
    const y = Math.round(hy + uy * 3 + py * s)
    if (x >= 0 && y >= 0 && x < FW && y < FH) fb[y * FW + x] = HILT
  }
  const blade = { x0: hx + ux * 4, y0: hy + uy * 4, x1: hx + ux * 24, y1: hy + uy * 24 }
  line(fb, FW, FH, blade.x0, blade.y0, blade.x1, blade.y1, BLADE.face)
  line(fb, FW, FH, blade.x0 + px, blade.y0 + py, blade.x1 - ux + px, blade.y1 - uy + py, BLADE.edge)
  const pommel = Math.round(hy - uy * 2) * FW + Math.round(hx - ux * 2)
  if (pommel >= 0 && pommel < fb.length) fb[pommel] = HILT
  for (let dy = 0; dy < 2; dy++) {
    for (let dx = 0; dx < 2; dx++) {
      const i = Math.round(hy + dy - 0.5) * FW + Math.round(hx + dx - 0.5)
      if (i >= 0 && i < fb.length) fb[i] = kit.b
    }
  }
  const edge: number[] = []
  const rim: number[] = []
  for (let y = 0; y < FH; y++) {
    for (let x = 0; x < FW; x++) {
      if (fb[y * FW + x]) continue
      const l = x > 0 && fb[y * FW + x - 1]
      const r = x < FW - 1 && fb[y * FW + x + 1]
      const u = y > 0 && fb[(y - 1) * FW + x]
      const d = y < FH - 1 && fb[(y + 1) * FW + x]
      if (!(l || r || u || d)) continue
      // the moon lights the edge whose body lies away from it
      if ((moonRight ? l : r) || d) rim.push(y * FW + x)
      else edge.push(y * FW + x)
    }
  }
  for (const i of edge) fb[i] = kit.o
  for (const i of rim) fb[i] = kit.rim
  return blade
}

function cross(a: Seg, b: Seg) {
  const d = (a.x1 - a.x0) * (b.y1 - b.y0) - (a.y1 - a.y0) * (b.x1 - b.x0)
  if (!d) return null
  const t = ((b.x0 - a.x0) * (b.y1 - b.y0) - (b.y0 - a.y0) * (b.x1 - b.x0)) / d
  const u = ((b.x0 - a.x0) * (a.y1 - a.y0) - (b.y0 - a.y0) * (a.x1 - a.x0)) / d
  if (t < 0 || t > 1 || u < 0 || u > 1) return null
  return { x: a.x0 + t * (a.x1 - a.x0), y: a.y0 + t * (a.y1 - a.y0) }
}

/** Smooth 1D value noise over a seeded ring of values. */
function noise1(r: () => number, period = 64) {
  const v = Array.from({ length: period }, r)
  const at = (i: number) => v[((i % period) + period) % period]!
  return (x: number) => {
    const i = Math.floor(x)
    const f = x - i
    return at(i) + (at(i + 1) - at(i)) * f * f * (3 - 2 * f)
  }
}

/** Smooth 2D value noise on the shared cell hash. */
function noise2(x: number, y: number, s: number) {
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const fx = x - x0
  const fy = y - y0
  const sx = fx * fx * (3 - 2 * fx)
  const sy = fy * fy * (3 - 2 * fy)
  const a = hash(x0, y0, s)
  const b = hash(x0 + 1, y0, s)
  const c = hash(x0, y0 + 1, s)
  const d = hash(x0 + 1, y0 + 1, s)
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy
}

type Peak = { x: number; h: number; s: number }

/** Heights and lit sides for a mountain range made of overlapping seeded peaks. */
function range(r: () => number, W: number, count: number, minH: number, maxH: number, minS: number, maxS: number) {
  const peaks: Peak[] = Array.from({ length: count }, () => ({ x: r() * (W + 40) - 20, h: minH + r() * (maxH - minH), s: minS + r() * (maxS - minS) }))
  const jag = noise1(r)
  const height = new Float32Array(W)
  const lit = new Uint8Array(W)
  const peakOf: Peak[] = []
  for (let x = 0; x < W; x++) {
    let best = peaks[0]!
    let top = -Infinity
    for (const p of peaks) {
      const v = p.h - Math.abs(x - p.x) * p.s
      if (v > top) {
        top = v
        best = p
      }
    }
    height[x] = Math.max(0, top + (jag(x / 3) - 0.5) * 2.5)
    lit[x] = x < best.x ? 1 : 0
    peakOf.push(best)
  }
  return { height, lit, peakOf }
}

/** Blends `col` into the cells around (cx, cy), strongest at the center. */
function glow(px: Uint32Array, W: number, H: number, cx: number, cy: number, r: number, col: number, k: number) {
  for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(H - 1, Math.ceil(cy + r)); y++) {
    for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(W - 1, Math.ceil(cx + r)); x++) {
      const d = Math.hypot(x - cx, y - cy)
      if (d >= r) continue
      const f = 1 - d / r
      px[y * W + x] = mix(px[y * W + x]!, col, f * f * k)
    }
  }
}

type Layout = {
  W: number
  H: number
  c: number
  narrow: boolean
  left: number
  right: number
  fade: number
  /** Rows over which the scene dissolves into the dark ground. */
  fadeB: number
  horizon: number
  ground: number
  /** The rampart walk the knights stand on. */
  top: number
  /** Where the rampart meets the cliff. */
  base: number
  cliff: number
  rampX: number
  towerX: number
  towerW: number
  spireX: number
  spireW: number
  spireTop: number
  fight: number
  moonX: number
  moonY: number
  moonR: number
  torchX: number
  torchY: number
}

function layout(W: number, H: number, c: number, groundRow: number, left: number, right: number): Layout {
  const narrow = W * c < 640
  const u = (v: number) => Math.max(1, Math.round(v / c))
  const fade = Math.round(H * 0.11)
  const ground = Math.min(H - 4, Math.max(Math.round(H * 0.45), groundRow))
  const horizon = ground - Math.max(u(26), Math.round(H * 0.07))
  const top = Math.max(fade + REACH + u(8), ground - (narrow ? u(78) : u(170)))
  const towerW = narrow ? u(54) : u(100)
  const towerX = Math.round(right) - towerW + (narrow ? u(14) : u(24))
  const cliff = Math.round(left + (right - left) * (narrow ? 0.36 : 0.54))
  const rampX = cliff + u(narrow ? 10 : 18)
  const fight = Math.round(Math.min(rampX + 28 + u(narrow ? 6 : 60), towerX - 30 - u(narrow ? 30 : 90)))
  const spireW = narrow ? u(18) : u(30)
  const base = top + (narrow ? u(28) : u(52))
  // the bottom blend must stay below the rampart, however little room is left
  const fadeB = Math.max(6, Math.min(Math.round(H * 0.16), Math.round((ground - base) * 0.6)))
  return {
    W,
    H,
    c,
    narrow,
    left,
    right,
    fade,
    fadeB,
    horizon,
    ground,
    top,
    base,
    cliff,
    rampX,
    towerX,
    towerW,
    spireX: Math.round((fight + 27 + towerX) / 2 - spireW / 2),
    spireW,
    spireTop: fade + (narrow ? u(40) : u(70)),
    fight,
    moonX: cliff - u(narrow ? 40 : 70),
    moonY: fade + u(narrow ? 34 : 64),
    moonR: narrow ? u(18) : u(34),
    torchX: towerX - 1,
    torchY: top - u(narrow ? 18 : 28),
  }
}

type Sprite = { w: number; h: number; px: Uint32Array; x: number; y: number; speed: number }
type Scene = { sky: Uint32Array; fg: Uint32Array; sea: Uint8Array; foam: number[]; twinkle: number[]; clouds: Sprite[] }

/** A thin, flat-bottomed cloud lit from above by the moon. */
function makeCloud(r: () => number, size: number): Omit<Sprite, 'x' | 'y' | 'speed'> {
  const n = 3 + Math.floor(r() * 3)
  const puffs: { x: number; y: number; r: number }[] = []
  let x = size * 0.2
  for (let i = 0; i < n; i++) {
    const rad = size * (0.4 + 0.6 * Math.sin((Math.PI * (i + 0.5)) / n)) * (0.8 + r() * 0.35)
    x += rad * 0.8
    puffs.push({ x, y: rad * 0.2, r: rad })
    x += rad * 0.6
  }
  const w = Math.ceil(x + size * 0.3) + 2
  const h = Math.ceil(Math.max(...puffs.map((p) => p.y + p.r * 0.6))) + 2
  const base = h - 1
  for (const p of puffs) p.y = base - p.y
  const inside = (px: number, py: number) => py <= base && puffs.some((p) => ((px - p.x) / p.r) ** 2 + ((py - p.y) / (p.r * 0.6)) ** 2 <= 1)
  const out = new Uint32Array(w * h)
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      if (!inside(px, py)) continue
      let c = (base - py) / h > 0.45 ? CLOUD.mid : CLOUD.low
      if (!inside(px, py - 1) || !inside(px - 1, py - 1)) c = CLOUD.hi
      out[py * w + px] = c
    }
  }
  return { w, h, px: out }
}

function buildScene(L: Layout, seed: string): Scene {
  const { W, H } = L
  const u = (v: number) => Math.max(1, Math.round(v / L.c))
  const sky = new Uint32Array(W * H)
  const fg = new Uint32Array(W * H)
  const sea = new Uint8Array(W * H)
  const ss = Math.floor(rng(`${seed}/stars`)() * 0xffffffff)
  const set = (x: number, y: number, c: number) => {
    if (x >= 0 && y >= 0 && x < W && y < H) fg[y * W + x] = c
  }

  for (let y = 0; y < H; y++) {
    const t = Math.min(1, Math.max(0, (y - L.fade * 0.5) / Math.max(1, L.horizon - L.fade * 0.5)))
    const col = t < 0.5 ? mix(SKY.top, SKY.mid, t / 0.5) : mix(SKY.mid, SKY.low, (t - 0.5) / 0.5)
    for (let x = 0; x < W; x++) sky[y * W + x] = col
  }
  const R = L.moonR
  glow(sky, W, H, L.moonX, L.moonY, R * 3.6, MOON.glow, 0.85)
  const twinkle: number[] = []
  for (let y = L.fade; y < L.horizon - u(8); y++) {
    for (let x = 0; x < W; x++) {
      if (Math.hypot(x - L.moonX, y - L.moonY) < R * 2.4 || hash(x, y, ss) > 0.0045) continue
      const kind = hash(x, y, ss + 1)
      const i = y * W + x
      sky[i] = kind < 0.15 ? STAR[0] : kind < 0.5 ? STAR[1] : STAR[2]
      if (kind < 0.5) twinkle.push(i)
      if (kind < 0.03) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) if (x + dx >= 0 && x + dx < W) sky[(y + dy) * W + x + dx] = STAR[2]
    }
  }
  for (let y = Math.floor(L.moonY - R); y <= L.moonY + R; y++) {
    for (let x = Math.floor(L.moonX - R); x <= L.moonX + R; x++) {
      const d = Math.hypot(x - L.moonX, y - L.moonY)
      if (d > R || x < 0 || y < 0 || x >= W || y >= H) continue
      let c = noise2(x / (R * 0.32), y / (R * 0.32), ss + 2) > 0.62 ? MOON.crater : MOON.face
      if (d > R - 1.2) c = mix(c, MOON.crater, 0.6)
      sky[y * W + x] = c
    }
  }

  const far = range(rng(`${seed}/far`), W, Math.max(3, Math.round(W / 60)), H * 0.07, H * 0.2, 0.55, 0.95)
  const near = range(rng(`${seed}/near`), W, Math.max(3, Math.round(W / 36)), H * 0.02, H * 0.06, 0.25, 0.45)
  for (let x = 0; x < W; x++) {
    const hf = Math.round(far.height[x]!)
    const peak = far.peakOf[x]!
    // snow sits on the tall peaks and thins out down their flanks
    const snow = peak.h > H * 0.13 ? Math.round(peak.h * 0.3 - Math.abs(x - peak.x) * 0.25 + hash(x, 0, 41) * 2) : 0
    for (let y = L.horizon - hf; y <= L.horizon; y++) {
      const depth = y - (L.horizon - hf)
      set(x, y, depth < snow ? (far.lit[x] ? FAR.snow : FAR.snowShade) : far.lit[x] ? FAR.lit : FAR.shade)
    }
    const hn = Math.round(near.height[x]!)
    for (let y = L.horizon - hn; y <= L.horizon; y++) set(x, y, near.lit[x] ? NEAR.lit : NEAR.shade)
  }

  for (let y = L.horizon + 1; y < H; y++) {
    const col = mix(SEA.top, SEA.deep, Math.min(1, (y - L.horizon) / Math.max(1, L.ground - L.horizon)))
    for (let x = 0; x < W; x++) {
      fg[y * W + x] = col
      sea[y * W + x] = 1
    }
  }

  // the far spire, half hidden behind the rampart
  const sx0 = L.spireX
  const roof = L.narrow ? u(34) : u(56)
  for (let y = L.spireTop - roof; y < L.base; y++) {
    for (let x = sx0 - 1; x <= sx0 + L.spireW; x++) {
      const lx = x - sx0
      if (y < L.spireTop) {
        const half = ((y - (L.spireTop - roof)) / roof) * (L.spireW / 2 + 1)
        if (Math.abs(lx + 0.5 - L.spireW / 2) > half) continue
        set(x, y, lx < L.spireW / 2 ? SPIRE.lit : SPIRE.roof)
      } else if (lx >= 0 && lx < L.spireW) set(x, y, lx === 0 ? SPIRE.lit : SPIRE.body)
    }
  }
  for (let y = L.spireTop + u(14); y < L.spireTop + u(26); y++) set(sx0 + Math.floor(L.spireW / 2), y, WINDOW)
  glow(fg, W, H, sx0 + L.spireW / 2, L.spireTop + u(20), u(10), WARM, 0.25)

  // the rampart: a stone wall on the cliff, arched openings, merlons kept clear of the duel
  const bh = u(12)
  const bw = u(24)
  for (let y = L.top; y < L.base; y++) {
    for (let x = L.rampX; x < L.towerX + 2; x++) {
      const ly = y - L.top
      const row = Math.floor(ly / bh)
      const brick = Math.floor((x - L.rampX + (row % 2) * (bw >> 1)) / bw)
      let c = hash(brick, row, 151) < 0.3 ? STONE.mid : STONE.base
      if (ly % bh === 0 || (x - L.rampX + (row % 2) * (bw >> 1)) % bw === 0) c = STONE.joint
      if (ly < u(4)) c = ly === 0 ? STONE.lit : STONE.mid
      if (x === L.rampX) c = STONE.lit
      if (ly > u(4) && hash(x, y, 157) < 0.04) c = MOSS.dark
      set(x, y, c)
    }
  }
  const aw = u(14)
  const archTop = L.top + u(12)
  const archH = Math.min(L.base - archTop - u(8), u(30))
  let lit = 0
  for (let cx = L.rampX + u(26); cx < L.towerX - aw; cx += u(48)) {
    const glowing = hash(cx, 0, 163) < 0.35
    for (let y = archTop; y < archTop + archH; y++) {
      for (let x = cx - (aw >> 1); x <= cx + (aw >> 1); x++) {
        const dx = x - cx
        const dy = y - archTop
        if (dy < aw / 2 && dx * dx + (dy - aw / 2) ** 2 > (aw / 2) ** 2) continue
        set(x, y, glowing ? mix(WINDOW, WARM, (y - archTop) / archH) : NIGHT)
      }
    }
    if (glowing) {
      glow(fg, W, H, cx, archTop + archH / 2, u(22), WARM, 0.3)
      lit++
    }
  }
  void lit
  const mw = u(14)
  const mg = u(10)
  const mh = u(12)
  for (let x = L.rampX; x < L.towerX; x++) {
    if (Math.abs(x - L.fight) < 36) continue
    if ((x - L.rampX) % (mw + mg) >= mw) continue
    for (let y = L.top - mh; y < L.top; y++) set(x, y, y === L.top - mh ? STONE.lit : x === L.rampX || (x - L.rampX) % (mw + mg) === 0 ? STONE.lit : STONE.base)
  }

  // the round tower: bricks bunch up toward its edges, the moon side lit
  const tw = L.towerW
  const ledge = L.top - (L.narrow ? u(44) : u(80))
  for (let y = 0; y < L.ground; y++) {
    const row = Math.floor(y / bh)
    for (let x = L.towerX; x < L.towerX + tw; x++) {
      const t = (x - L.towerX + 0.5) / tw
      const turn = (Math.asin(2 * t - 1) / Math.PI + 0.5) * 9 + (row % 2) * 0.5
      let c = t < 0.08 ? STONE.lit : t < 0.32 ? STONE.mid : t < 0.78 ? STONE.base : STONE.dark
      if (y % bh === 0 || turn % 1 < 0.1) c = STONE.joint
      if (hash(x, y, 167) < 0.03) c = MOSS.dark
      set(x, y, c)
    }
    if (Math.abs(y - ledge) < u(6)) {
      const lip = u(5)
      for (let x = L.towerX - lip; x < L.towerX + tw + lip; x++) set(x, y, y - ledge === -u(6) + 1 ? STONE.lit : y - ledge === u(6) - 1 ? STONE.joint : x < L.towerX + tw * 0.3 ? STONE.mid : STONE.base)
    }
  }
  const windows = [
    [0.42, ledge - u(60)],
    [0.5, ledge + u(26)],
    [0.36, L.top + u(40)],
  ] as const
  for (const [fx, wy] of windows) {
    const cx = Math.round(L.towerX + tw * fx)
    const ww = u(9)
    const wh = u(20)
    if (wy < L.fade) continue
    for (let y = wy; y < wy + wh; y++) for (let x = cx - (ww >> 1); x <= cx + (ww >> 1); x++) if (y > wy + 1 || Math.abs(x - cx) < ww / 3) set(x, y, mix(WINDOW, WARM, (y - wy) / wh))
    glow(fg, W, H, cx, wy + wh / 2, u(26), WARM, 0.3)
  }
  for (let y = L.torchY; y < L.torchY + u(10); y++) set(L.torchX, y, FLAG.pole)
  set(L.torchX - 1, L.torchY, FLAG.pole)

  // the cliff under the rampart: irregular facets, lit along the sea face
  const rough = noise1(rng('cliff/face'))
  const steps = noise1(rng('cliff/steps'))
  const faceX = (y: number) => L.cliff - Math.round((y - L.base) * 0.3 + (rough(y / u(24)) - 0.5) * u(36) + Math.floor(steps(y / u(9)) * u(12)))
  const rock = (x: number, y: number) => y >= L.base && x >= faceX(y)
  const GX = u(30)
  const GY = u(26)
  const facet = (x: number, y: number) => {
    const gx = Math.floor(x / GX)
    const gy = Math.floor(y / GY)
    let best = 0
    let dist = Infinity
    for (let j = gy - 1; j <= gy + 1; j++) {
      for (let i = gx - 1; i <= gx + 1; i++) {
        const px = (i + 0.15 + hash(i, j, 71) * 0.7) * GX
        const py = (j + 0.15 + hash(i, j, 73) * 0.7) * GY
        const dd = ((x - px) * 1.15) ** 2 + ((y - py) * 0.8) ** 2
        if (dd < dist) {
          dist = dd
          best = (j & 0xffff) * 65536 + (i & 0xffff)
        }
      }
    }
    return best + 1
  }
  const ids = new Float64Array(W * H)
  for (let y = L.base; y < H; y++) for (let x = Math.max(0, faceX(y)); x < W; x++) ids[y * W + x] = facet(x, y)
  for (let y = L.base; y < H; y++) {
    const fx = faceX(y)
    for (let x = Math.max(0, fx); x < W; x++) {
      if (fg[y * W + x] && !sea[y * W + x]) continue
      const d = x - fx
      const id = ids[y * W + x]!
      const depth = (y - L.base) / Math.max(1, L.ground - L.base)
      const tone = hash(id, 0, 79) * 0.7 + (d < u(30) ? 0.2 : 0) + 0.45 - depth * 0.75
      let c = tone > 0.75 ? ROCK.mid : tone > 0.3 ? ROCK.base : ROCK.dark
      const other = (dx: number, dy: number) => {
        const v = ids[(y + dy) * W + x + dx]
        return v !== undefined && v !== 0 && v !== id
      }
      const lighter = c === ROCK.dark ? ROCK.base : c === ROCK.base ? ROCK.mid : ROCK.lit
      if (other(0, -1) || (other(-1, 0) && hash(id, 2, 89) < 0.5)) c = lighter
      else if (other(1, 0) || other(0, 1)) c = hash(id, 1, 83) < 0.45 ? ROCK.crack : ROCK.dark
      if (d <= 1) c = d === 0 ? ROCK.lit : ROCK.mid
      if (!rock(x, y - 1)) c = x < L.rampX ? MOSS.hi : ROCK.lit
      else if (y - L.base < u(10) && d < u(10) && hash(x, y, 3) < 0.4) c = MOSS.mid
      fg[y * W + x] = c
      sea[y * W + x] = 0
    }
  }
  const foam: number[] = []
  for (let y = L.ground - u(12); y < L.ground + u(4); y++) {
    const fx = faceX(y)
    for (let x = fx - u(12); x < fx; x++) if (x >= 0 && y >= 0 && y < H && sea[y * W + x]) foam.push(y * W + x)
  }

  // the near shore everything stands behind; the name sits on it
  const shore = noise1(rng('ground'))
  for (let x = 0; x < W; x++) {
    const gt = L.ground + Math.round((shore(x / u(16)) - 0.5) * u(6))
    for (let y = Math.max(0, gt); y < H; y++) {
      fg[y * W + x] = y === gt ? MOSS.dark : NIGHT
      sea[y * W + x] = 0
    }
    if (hash(x, 1, 13) < 0.3) set(x, gt - 1, MOSS.dark)
  }

  const r = rng(`${seed}/clouds`)
  const clouds: Sprite[] = []
  const count = 2 + Math.round((W * L.c) / 520)
  for (let i = 0; i < count; i++) {
    const c = makeCloud(r, H * (0.045 + r() * 0.035))
    const y = Math.round(L.fade + u(10) + r() * Math.max(1, L.horizon - L.fade - c.h - u(90)))
    clouds.push({ ...c, x: r() * (W + c.w), y, speed: (0.004 + r() * 0.005) / L.c })
  }
  return { sky, fg, sea, foam, twinkle, clouds }
}

function paint(px: Uint32Array, L: Layout, S: Scene, t: number, sb: Uint32Array, fb: Uint32Array) {
  const { W, H } = L
  const u = (v: number) => Math.max(1, Math.round(v / L.c))
  const put = (x: number, y: number, c: number) => {
    const xi = Math.round(x)
    const yi = Math.round(y)
    if (xi >= 0 && yi >= 0 && xi < W && yi < H) px[yi * W + xi] = c
  }
  px.set(S.sky)

  const tw = Math.floor(t / 420)
  for (const i of S.twinkle) if (hash(i, tw, 101) < 0.3) px[i] = STAR[2]

  // a shooting star every few seconds
  const cycle = Math.floor(t / 7000)
  const phase = t - cycle * 7000
  if (phase < 650) {
    const p = phase / 650
    const x0 = L.left + (L.right - L.left) * (0.25 + hash(cycle, 1, 97) * 0.4)
    const y0 = L.fade + u(10) + hash(cycle, 2, 97) * (L.horizon - L.fade) * 0.25
    const len = u(240) * p
    for (let k = 0; k < u(48); k++) {
      const d = len - k
      if (d < 0) break
      put(x0 - d * 0.86, y0 + d * 0.5, mix(STAR[0], SKY.mid, k / u(48)))
    }
  }

  for (const c of S.clouds) {
    const span = W + c.w
    const x0 = Math.round((((c.x + t * c.speed) % span) + span) % span) - c.w
    for (let y = 0; y < c.h; y++) {
      const sy = c.y + y
      if (sy < 0 || sy >= H) continue
      for (let x = 0; x < c.w; x++) {
        const v = c.px[y * c.w + x]
        const sx = x0 + x
        if (v && sx >= 0 && sx < W) px[sy * W + sx] = v
      }
    }
  }

  const tick = Math.floor(t / 220)
  for (let i = 0; i < px.length; i++) {
    const f = S.fg[i]
    if (!f) continue
    if (S.sea[i]) {
      const x = i % W
      px[i] = hash(x >> 2, (i / W) | 0, tick + ((x >> 4) & 3)) < 0.006 ? SEA.glint : f
    } else px[i] = f
  }
  // the moon's path on the water, in short broken dashes
  for (let y = L.horizon + 1; y < L.ground + u(8) && y < H; y++) {
    const hw = L.moonR * 0.5 + (y - L.horizon) * 0.5
    for (let x = Math.max(0, Math.floor(L.moonX - hw)); x <= Math.min(W - 1, L.moonX + hw); x++) {
      const i = y * W + x
      if (!S.sea[i]) continue
      const k = 1 - Math.abs(x - L.moonX) / hw
      if (hash(Math.floor(x / 3), y, tick) < k * 0.55) px[i] = hash(x, y, tick + 7) < 0.45 ? SEA.shine : SEA.shineDim
    }
  }
  const surf = Math.floor(t / 180)
  for (const i of S.foam) if (hash(i % W, (i / W) | 0, surf) < 0.4) px[i] = SEA.foam

  // a pennant on the spire
  const pole = L.spireX + Math.floor(L.spireW / 2)
  const roof = L.narrow ? u(34) : u(56)
  const tip = L.spireTop - roof
  const fh = u(14)
  for (let y = tip - fh - u(8); y < tip; y++) put(pole, y, FLAG.pole)
  const fl = u(26)
  for (let i = 1; i <= fl; i++) {
    const wave = Math.round(Math.sin(i * 0.35 - t * 0.008) * u(3) * (i / fl))
    const half = Math.max(1, Math.round((fh / 2) * (1 - i / (fl + 4))))
    for (let j = -half; j < half; j++) put(pole + i, tip - fh - u(8) + fh / 2 + j + wave, j >= half - 1 ? FLAG.shade : FLAG.cloth)
  }

  const time = ((t % LOOP) + LOOP) % LOOP
  const bufTop = L.top - (OY + 15) * SCALE
  const blades: Seg[] = []
  const knights = [
    { kit: WHITE, pose: poseAt(WHITE_KEYS, time, 0), mirror: false },
    { kit: BLACK, pose: poseAt(BLACK_KEYS, time, 2.1), mirror: true },
  ]
  for (const k of knights) {
    // the moon is to the left of both, so the mirrored knight keeps its lit edge on its back
    const seg = drawKnight(sb, fb, k.kit, k.pose, k.mirror)
    const left = k.mirror ? L.fight + 27 - k.pose.dx * SCALE - FW + 1 + OX * SCALE : L.fight - 28 + k.pose.dx * SCALE - OX * SCALE
    const mapX = (bx: number) => (k.mirror ? left + (FW - 1 - bx) : left + bx)
    for (let by = 0; by < FH; by++) {
      const y = bufTop + by
      if (y < 0 || y >= H) continue
      for (let bx = 0; bx < FW; bx++) {
        const v = fb[by * FW + bx]
        const x = mapX(bx)
        if (v && x >= 0 && x < W) px[y * W + x] = v
      }
    }
    blades.push({ x0: mapX(seg.x0), y0: bufTop + seg.y0, x1: mapX(seg.x1), y1: bufTop + seg.y1 })
  }
  if (CLASHES.some(([a, b]) => time >= a && time < b)) {
    const hit = cross(blades[0]!, blades[1]!) ?? { x: (blades[0]!.x1 + blades[1]!.x1) / 2, y: (blades[0]!.y1 + blades[1]!.y1) / 2 }
    glow(px, W, H, hit.x, hit.y, u(70), SPARK.glow, 0.5)
    const diag = Math.floor(t / 70) % 2
    for (let s = 2; s <= 7; s++) {
      const rays = diag
        ? [
            [s, s],
            [-s, s],
            [s, -s],
            [-s, -s],
          ]
        : [
            [0, s],
            [0, -s],
            [s, 0],
            [-s, 0],
          ]
      for (const [dx, dy] of rays) put(hit.x + dx! * 0.8, hit.y + dy! * 0.8, s > 5 ? SPARK.glow : SPARK.ray)
    }
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) put(hit.x + dx, hit.y + dy, SPARK.core)
  }

  // the torch on the tower: a flickering flame, its light, and a few embers
  const flick = 0.75 + 0.25 * Math.sin(t * 0.017) * Math.sin(t * 0.031 + 1)
  glow(px, W, H, L.torchX - 1, L.torchY - u(6), u(80), WARM, 0.32 * flick)
  const fhgt = u(14) + Math.round(flick * 2)
  for (let j = 0; j < fhgt; j++) {
    const half = Math.max(0, Math.round((u(4) + 0.5) * Math.sin((Math.PI * (j + 1)) / (fhgt + 1))))
    const sway = Math.round(Math.sin(t * 0.02 + j * 0.6) * (j / fhgt) * 1.5)
    for (let x = -half; x <= half; x++) put(L.torchX - 1 + x + sway, L.torchY - 1 - j, j > fhgt * 0.6 ? FLAME[2] : Math.abs(x) < half ? FLAME[0] : FLAME[1])
  }
  for (let e = 0; e < 4; e++) {
    const age = ((t / 1000 + e * 0.37) % 1.4) / 1.4
    put(L.torchX - 1 + Math.sin(age * 7 + e) * u(6), L.torchY - fhgt - age * u(70), mix(FLAME[1], NIGHT, age))
  }

  // both edges dissolve instead of ending on a line: a smoothstep mix, with
  // per-cell grain so the squares trail off one by one, halftone-style
  const grain = 0.7
  for (let y = 0; y < Math.min(H, Math.round(L.fade * (1 + grain))); y++) {
    for (let x = 0; x < W; x++) {
      const k = Math.min(1, Math.max(0, (y + 0.5 + (hash(x, y, 211) - 0.5) * L.fade * grain) / L.fade))
      px[y * W + x] = mix(PAPER, px[y * W + x]!, k * k * (3 - 2 * k))
    }
  }
  const start = L.ground - L.fadeB
  for (let y = Math.max(0, Math.round(start - L.fadeB * grain)); y < H; y++) {
    for (let x = 0; x < W; x++) {
      const k = Math.min(1, Math.max(0, (y - start + (hash(x, y, 223) - 0.5) * L.fadeB * grain) / L.fadeB))
      px[y * W + x] = mix(px[y * W + x]!, NIGHT, k * k * (3 - 2 * k))
    }
  }
}

type Props = {
  seed: string
  /** The element the ground has to sit behind; the ground starts just above it. */
  ground: RefObject<HTMLElement | null>
}

export function CliffScene({ seed, ground }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const reduced = useReducedMotion()
  const seedRef = useRef(seed)
  seedRef.current = seed
  const reseed = useRef<() => void>(() => {})

  useEffect(() => {
    const canvas = canvasRef.current
    const host = canvas?.parentElement
    const ctx = canvas?.getContext('2d')
    if (!canvas || !host || !ctx) return
    const sb = new Uint32Array(KW * KH)
    const fb = new Uint32Array(FW * FH)
    let L: Layout | null = null
    let S: Scene | null = null
    let px = new Uint32Array(0)
    let shown = new Uint32Array(0)
    let cd = 1
    let full = true
    let visible = false
    let raf = 0
    let last = -Infinity
    const looks = new Map<number, readonly [string, number]>()
    const lookOf = (col: number) => {
      let v = looks.get(col)
      if (!v) {
        const r = col & 0xff
        const g = (col >>> 8) & 0xff
        const b = (col >>> 16) & 0xff
        // half luma, half brightest channel, so deep blues still show
        const l = ((0.299 * r + 0.587 * g + 0.114 * b) / 255 + Math.max(r, g, b) / 255) / 2
        const f = Math.min(1, Math.max(0, (l - 0.05) / 0.7)) ** 0.7
        v = [`rgb(${r},${g},${b})`, Math.round(f * cd)] as const
        looks.set(col, v)
      }
      return v
    }

    const flush = () => {
      if (!L) return
      const W = L.W
      if (full) {
        ctx.fillStyle = NIGHT_CSS
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        shown.fill(NIGHT)
        full = false
      }
      const clear: number[] = []
      const groups = new Map<number, number[]>()
      for (let i = 0; i < px.length; i++) {
        const v = px[i]!
        if (v === shown[i]) continue
        if (shown[i] !== NIGHT) clear.push(i)
        shown[i] = v
        if (v === NIGHT) continue
        const list = groups.get(v)
        if (list) list.push(i)
        else groups.set(v, [i])
      }
      ctx.fillStyle = NIGHT_CSS
      for (const i of clear) {
        const x = i % W
        const y = (i / W) | 0
        const x0 = Math.round(x * cd)
        const y0 = Math.round(y * cd)
        ctx.fillRect(x0, y0, Math.round((x + 1) * cd) - x0, Math.round((y + 1) * cd) - y0)
      }
      for (const [col, list] of groups) {
        const [style, size] = lookOf(col)
        if (!size) continue
        ctx.fillStyle = style
        for (const i of list) {
          const x = i % W
          const y = (i / W) | 0
          const x0 = Math.round(x * cd)
          const y0 = Math.round(y * cd)
          ctx.fillRect(x0 + ((Math.round((x + 1) * cd) - x0 - size) >> 1), y0 + ((Math.round((y + 1) * cd) - y0 - size) >> 1), size, size)
        }
      }
    }

    const draw = (now: number) => {
      if (!L || !S) return
      paint(px, L, S, reduced ? 300 : now, sb, fb)
      flush()
    }

    const measure = () => {
      const b = host.getBoundingClientRect()
      if (!b.width || !b.height) return
      const c = b.width < 640 ? 2 : 3
      const W = Math.ceil(b.width / c)
      const H = Math.ceil(b.height / c)
      const offset = b.height - H * c
      const word = ground.current?.getBoundingClientRect()
      const row = word ? Math.floor((word.top - b.top - offset) / c) - Math.round(18 / c) : Math.round(H * 0.6)
      const pad = Number.parseFloat(getComputedStyle(host).getPropertyValue('--pad')) || 28
      const side = Math.max(0, (b.width - 1360) / 2) + pad
      L = layout(W, H, c, row, side / c, (b.width - side) / c)
      cd = c * Math.min(2, window.devicePixelRatio || 1)
      looks.clear()
      canvas.width = Math.round(W * cd)
      canvas.height = Math.round(H * cd)
      canvas.style.width = `${W * c}px`
      canvas.style.height = `${H * c}px`
      px = new Uint32Array(W * H)
      shown = new Uint32Array(W * H)
      full = true
      S = buildScene(L, seedRef.current)
      draw(performance.now())
    }

    reseed.current = () => {
      if (!L) return
      S = buildScene(L, seedRef.current)
      draw(performance.now())
    }

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      if (!visible || now - last < 50) return
      last = now
      draw(now)
    }

    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(host)
    void document.fonts?.ready.then(measure)
    const io = new IntersectionObserver(([entry]) => {
      visible = !!entry?.isIntersecting
    })
    io.observe(host)
    if (!reduced) raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      io.disconnect()
      reseed.current = () => {}
    }
  }, [reduced, ground])

  useEffect(() => {
    reseed.current()
  }, [seed])

  return <canvas ref={canvasRef} aria-hidden="true" className="foot__scene" />
}
