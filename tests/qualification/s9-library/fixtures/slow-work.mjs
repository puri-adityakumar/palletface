/**
 * Stage 9 negative-control fixture.
 *
 * `slowWork(ms)` burns CPU synchronously for approximately `ms` milliseconds.
 * The Stage 9 cap detector must reject it when the declared cap is smaller
 * than the requested work. This is a detector self-test only: it is not a
 * product workload and it defines no release budget.
 */
export function slowWork(ms) {
  if (!Number.isFinite(ms) || ms < 0) throw new TypeError('ms must be a finite non-negative number')
  const started = performance.now()
  let spins = 0
  while (performance.now() - started < ms) spins += 1
  return { requestedMs: ms, elapsedMs: performance.now() - started, spins }
}
