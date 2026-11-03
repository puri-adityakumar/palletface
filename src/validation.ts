/** Shared runtime checks for the public and low-level rendering APIs. */
export function validateRenderArgs(seed: unknown, px: unknown, name?: unknown): asserts seed is string {
  if (typeof seed !== 'string') throw new TypeError(`seed must be a string; received ${typeof seed}`)
  if (typeof px !== 'number' || !Number.isFinite(px) || px <= 0) {
    throw new RangeError(`px must be a positive finite number; received ${String(px)}`)
  }
  if (name !== undefined && typeof name !== 'string') throw new TypeError(`name must be a string when provided; received ${typeof name}`)
}
