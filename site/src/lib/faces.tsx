import { ditherFace, STYLES, type StyleSlug } from 'palletface'
import type { CSSProperties } from 'react'

export { STYLES }
export type { StyleSlug }

/** Styles that draw an initial from `name`. */
export const LETTER_STYLES: ReadonlySet<StyleSlug> = new Set<StyleSlug>(['pixel-letter', 'pixelify-letter', 'pixel-stamp'])

export function face(seed: string, style: StyleSlug, px = 80, name?: string): string {
  return ditherFace(seed, { style, px, name })
}

export const svgUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`

/** A single-quoted JavaScript string literal. */
export const quote = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`

/** The exact call that draws an avatar, for copy buttons and code captions. */
export function callFor(seed: string, style: StyleSlug, px = 80, name?: string): string {
  const named = LETTER_STYLES.has(style) && name !== undefined ? `, name: ${quote(name)}` : ''
  return `palletface(${quote(seed)}, { style: '${style}', px: ${px}${named} })`
}

type FaceProps = {
  seed: string
  style: StyleSlug
  px?: number
  name?: string
  className?: string
  style_?: CSSProperties
  alt?: string
}

/** One avatar as an <img>; no raw HTML injection needed. */
export function Face({ seed, style, px = 80, name, className, style_, alt = '' }: FaceProps) {
  return (
    <img
      className={className}
      style={style_}
      src={svgUrl(face(seed, style, px, name))}
      width={px}
      height={px}
      alt={alt}
      draggable={false}
    />
  )
}
