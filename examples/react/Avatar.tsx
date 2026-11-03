import * as React from 'react'
import { ditherFace, type StyleSlug } from 'dither-face'

export interface AvatarProps {
  seed: string
  name?: string
  style?: StyleSlug
  px?: number
  /** Empty text makes the image decorative when the user's name is adjacent. */
  alt?: string
}

/** Works during SSR; generation requires no effect, browser DOM, or network. */
export function Avatar({ seed, name, style = 'pixel-sprite', px = 80, alt = `${name ?? 'User'} avatar` }: AvatarProps) {
  const svg = ditherFace(seed, { style, name, px })
  const src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  return <img src={src} width={px} height={px} alt={alt} />
}
