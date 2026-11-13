#!/usr/bin/env node
/**
 * Stage 9 shared helpers.
 *
 * The comparators and cap detector here are used by both the clean positive
 * checks and the negative controls. Controls must be rejected by exactly the
 * same functions that accept expected values, never by a weaker test branch.
 */
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import zlib from 'node:zlib'

export function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    if (!token.startsWith('--')) throw new Error(`Unexpected argument: ${token}`)
    const key = token.slice(2)
    const value = argv[i + 1]
    if (value === undefined || value.startsWith('--')) throw new Error(`Missing value for --${key}`)
    args[key] = value
    i += 1
  }
  return args
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

export async function sha256File(file) {
  return sha256(await fsp.readFile(file))
}

export async function readJson(file) {
  return JSON.parse(await fsp.readFile(file, 'utf8'))
}

export async function writeJson(file, value) {
  await fsp.mkdir(path.dirname(file), { recursive: true })
  await fsp.writeFile(file, `${JSON.stringify(value, null, 2)}\n`)
}

export async function ensureDir(directory) {
  await fsp.mkdir(directory, { recursive: true })
}

export async function walkFiles(root) {
  const result = []
  async function visit(directory) {
    for (const entry of await fsp.readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name)
      const relative = path.relative(root, absolute).split(path.sep).join('/')
      if (entry.isSymbolicLink()) {
        result.push({ path: relative, type: 'symlink', absolute })
      } else if (entry.isDirectory()) {
        await visit(absolute)
      } else if (entry.isFile()) {
        const bytes = await fsp.readFile(absolute)
        result.push({ path: relative, type: 'file', absolute, size: bytes.length, sha256: sha256(bytes) })
      } else {
        result.push({ path: relative, type: 'other', absolute })
      }
    }
  }
  await visit(root)
  return result
}

export async function hashTree(root) {
  const files = (await walkFiles(root)).filter((entry) => entry.type === 'file')
  const records = files
    .map((entry) => ({ path: entry.path, size: entry.size, sha256: entry.sha256 }))
    .sort((a, b) => a.path.localeCompare(b.path))
  return {
    fileCount: records.length,
    totalBytes: records.reduce((sum, entry) => sum + entry.size, 0),
    files: records,
    sha256: sha256(records.map((entry) => `${entry.path}\0${entry.sha256}`).join('\n')),
  }
}

export function runCommand({ label, command, cwd, env = {}, timeoutMs = 600000, maxBuffer = 64 * 1024 * 1024 }) {
  const startedAt = new Date().toISOString()
  const started = Date.now()
  const result = spawnSync('/bin/bash', ['-lc', command], {
    cwd,
    env: { ...process.env, ...env },
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer,
    killSignal: 'SIGKILL',
  })
  return {
    label,
    command,
    cwd,
    timeoutMs,
    startedAt,
    endedAt: new Date().toISOString(),
    durationMs: Date.now() - started,
    exitCode: result.status,
    signal: result.signal,
    timedOut: result.error?.code === 'ETIMEDOUT' || result.signal === 'SIGKILL',
    error: result.error ? result.error.message : null,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  }
}

export function runNode({ label, node, args, cwd, env = {}, timeoutMs = 600000 }) {
  const startedAt = new Date().toISOString()
  const started = Date.now()
  const result = spawnSync(node, args, {
    cwd,
    env: { ...process.env, ...env },
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 64 * 1024 * 1024,
    killSignal: 'SIGKILL',
  })
  return {
    label,
    node,
    args,
    cwd,
    timeoutMs,
    startedAt,
    endedAt: new Date().toISOString(),
    durationMs: Date.now() - started,
    exitCode: result.status,
    signal: result.signal,
    timedOut: result.error?.code === 'ETIMEDOUT' || result.signal === 'SIGKILL',
    error: result.error ? result.error.message : null,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  }
}

export function compressedSizes(buffer) {
  const gzip = zlib.gzipSync(buffer, { level: 9 })
  const brotli = zlib.brotliCompressSync(buffer, {
    params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 },
  })
  return {
    rawBytes: buffer.length,
    gzipBytes: gzip.length,
    brotliBytes: brotli.length,
    gzipSha256: sha256(gzip),
    brotliSha256: sha256(brotli),
  }
}

export function compareGolden(golden, actualByStyle) {
  const mismatches = []
  for (const entry of golden.styles) {
    const actual = actualByStyle[entry.slug]
    if (actual !== entry.sha256) {
      mismatches.push({
        style: entry.slug,
        expected: entry.sha256,
        actual: actual ?? null,
      })
    }
  }
  return {
    ok: mismatches.length === 0 && golden.styles.length === Object.keys(actualByStyle).length,
    expectedStyles: golden.styles.length,
    actualStyles: Object.keys(actualByStyle).length,
    mismatches,
  }
}

export function runWithCap(fn, capMs) {
  const started = performance.now()
  const value = fn()
  const elapsedMs = performance.now() - started
  return { ok: elapsedMs <= capMs, capMs, elapsedMs, value }
}

export function mib(bytes) {
  return bytes / (1024 * 1024)
}

function preview(value, maxLength = 240) {
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  if (text === undefined) return null
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text
}

export class Recorder {
  constructor({ stage, track, phase }) {
    this.stage = stage
    this.track = track
    this.phase = phase
    this.startedAt = new Date().toISOString()
    this.cases = []
    this.assertions = []
    this.measurements = []
  }

  case(id, scenario, title, meta = {}) {
    const record = {
      id,
      scenario,
      title,
      startedAt: new Date().toISOString(),
      status: 'running',
      assertions: 0,
      failedAssertions: 0,
      ...meta,
    }
    this.cases.push(record)
    return record
  }

  finish(record, status = record.failedAssertions > 0 ? 'failed' : 'completed') {
    record.status = status
    record.endedAt = new Date().toISOString()
    return record
  }

  check(record, name, ok, expected, actual, detail = null) {
    const assertion = {
      case: record.id,
      scenario: record.scenario,
      name,
      ok: Boolean(ok),
      expected: preview(expected),
      actual: preview(actual),
      detail,
      at: new Date().toISOString(),
    }
    this.assertions.push(assertion)
    record.assertions += 1
    if (!assertion.ok) {
      record.failedAssertions += 1
      if (record.status === 'running') record.status = 'failed'
    }
    return assertion.ok
  }

  measure(record, name, value, unit, meta = {}) {
    const measurement = { case: record.id, scenario: record.scenario, name, value, unit, ...meta, at: new Date().toISOString() }
    this.measurements.push(measurement)
    return measurement
  }

  fail(record, name, expected, actual, detail = null) {
    return this.check(record, name, false, expected, actual, detail)
  }

  summary() {
    const byScenario = {}
    for (const record of this.cases) {
      const entry = byScenario[record.scenario] ?? { cases: 0, assertions: 0, failedAssertions: 0, statuses: {} }
      entry.cases += 1
      entry.assertions += record.assertions
      entry.failedAssertions += record.failedAssertions
      entry.statuses[record.status] = (entry.statuses[record.status] ?? 0) + 1
      byScenario[record.scenario] = entry
    }
    return {
      stage: this.stage,
      track: this.track,
      phase: this.phase,
      startedAt: this.startedAt,
      endedAt: new Date().toISOString(),
      cases: this.cases.length,
      assertions: this.assertions.length,
      failedAssertions: this.assertions.filter((entry) => !entry.ok).length,
      byScenario,
      caseRecords: this.cases,
      assertionRecords: this.assertions,
      measurements: this.measurements,
    }
  }
}
