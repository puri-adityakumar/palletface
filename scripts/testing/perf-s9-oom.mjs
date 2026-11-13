#!/usr/bin/env node
/**
 * Stage 9 fatal-OOM limitation probe.
 *
 * Deliberately exhausts a very small V8 old space. The expected outcome is a
 * process-level fatal error, not a library exception. This file exists so the
 * report cannot accidentally claim that the library catches or bounds fatal
 * out-of-memory conditions.
 */
const chunks = []
let index = 0
for (;;) {
  chunks.push('x'.repeat(4 * 1024 * 1024))
  index += 1
  if (index % 4 === 0) process.stderr.write(`s9-oom allocated ${index} chunks\n`)
}
