import { ditherFace } from 'palletface'

export const SEED_DEFAULT = 'palletface'

/** Draw one face: seed drives the art, `name` supplies letter styles' initial. */
export function draw(seed: string, slug: string, px: number, name?: string): string {
  return ditherFace(seed, { style: slug as never, px, name })
}

export const PREFERS_REDUCED_MOTION =
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Clipboard with an execCommand fallback (headless/permission-safe). */
export async function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      /* fall through */
    }
  }
  const ta = document.createElement('textarea')
  ta.value = text
  ta.setAttribute('readonly', '')
  ta.style.cssText = 'position:fixed;top:-999px;left:-999px;opacity:0'
  document.body.appendChild(ta)
  ta.select()
  let ok = false
  try {
    ok = document.execCommand('copy')
  } catch {
    ok = false
  }
  ta.remove()
  return ok
}
