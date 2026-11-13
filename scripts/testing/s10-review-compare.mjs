/**
 * Stage 10 review comparator helpers.
 *
 * These functions are deliberately small and exact:
 * - compareRgba compares every pixel channel with zero tolerance and reports
 *   eligibleFraction = 1.0. There is no mask, crop or threshold.
 * - scanSvg is a conservative static safety scan used only as a control.
 *
 * The module is copied and mutated in a disposable work directory by the S10
 * review to prove that a weakened harness is detectable.
 */
import { createHash } from 'node:crypto'

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

export function compareRgba(a, b) {
  if (!a || !b || a.length !== b.length) {
    return {
      dimensionsEqual: false,
      accepted: false,
      totalPixels: null,
      eligiblePixels: 0,
      eligibleFraction: 0,
      differingPixels: null,
      maxChannelDelta: null
    }
  }
  let differingPixels = 0
  let maxChannelDelta = 0
  for (let index = 0; index < a.length; index += 4) {
    const delta = Math.max(
      Math.abs(a[index] - b[index]),
      Math.abs(a[index + 1] - b[index + 1]),
      Math.abs(a[index + 2] - b[index + 2]),
      Math.abs(a[index + 3] - b[index + 3])
    )
    if (delta === 0) continue
    differingPixels += 1
    if (delta > maxChannelDelta) maxChannelDelta = delta
  }
  const totalPixels = Math.floor(a.length / 4)
  return {
    dimensionsEqual: true,
    accepted: differingPixels === 0,
    totalPixels,
    eligiblePixels: totalPixels,
    eligibleFraction: totalPixels > 0 ? 1 : 0,
    differingPixels,
    maxChannelDelta
  }
}

export function scanSvg(svg) {
  const violations = []
  if (typeof svg !== 'string' || svg.trim() === '') return { ok: false, violations: ['empty'] }
  const value = svg.trim()
  if (!/^<svg(?:\s|>)/i.test(value)) violations.push('no-root')
  if (/<script\b/i.test(value)) violations.push('script-element')
  if (/\son[a-z]+\s*=/i.test(value)) violations.push('event-handler-attribute')
  if (/<foreignObject\b/i.test(value)) violations.push('foreign-object')
  if (/(?:href|src)\s*=\s*["'](?:https?:|data:|javascript:|file:)/i.test(value)) violations.push('external-reference')
  if (/<!DOCTYPE|<!ENTITY/i.test(value)) violations.push('doctype-entity')
  return { ok: violations.length === 0, violations }
}
