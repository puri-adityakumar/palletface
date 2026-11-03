import { ditherFace } from 'dither-face'

export function Avatar({ seed, name, style = 'pixel-sprite', px = 80 }) {
  const svg = ditherFace(seed, { style, name, px })
  const src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  return <img src={src} width={px} height={px} alt={`${name ?? 'User'} avatar`} />
}
