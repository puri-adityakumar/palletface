#!/usr/bin/env node
/**
 * Stage 6 shared helpers.
 *
 * Used by scripts/testing/s6-qualify.mjs and by the negative controls. The
 * comparators here are production assertions: the controls must be rejected
 * by the same functions that accept the expected values, never by a weaker
 * test-only branch.
 */
import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'

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

export function relativeLog(logPath, outDir) {
  return path.relative(outDir, logPath).split(path.sep).join('/')
}

export async function walkFiles(root) {
  const result = []
  async function visit(directory) {
    const entries = await fsp.readdir(directory, { withFileTypes: true })
    for (const entry of entries) {
      const absolute = path.join(directory, entry.name)
      const relative = path.relative(root, absolute).split(path.sep).join('/')
      if (entry.isSymbolicLink()) {
        result.push({ path: relative, type: 'symlink', absolute })
      } else if (entry.isDirectory()) {
        result.push({ path: relative, type: 'directory', absolute })
        await visit(absolute)
      } else if (entry.isFile()) {
        const bytes = await fsp.readFile(absolute)
        result.push({
          path: relative,
          type: 'file',
          absolute,
          size: bytes.length,
          sha256: sha256(bytes),
        })
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
  return {
    files: files.map(({ path: file, size, sha256: hash }) => ({ path: file, size, sha256: hash })),
    sha256: sha256(files.map((entry) => `${entry.path}\0${entry.sha256}`).sort().join('\n')),
  }
}

export async function runCommand({ label, command, cwd, env = {}, timeout = 600_000, logDir }) {
  const started = Date.now()
  const child = spawn('/bin/bash', ['-lc', command], {
    cwd,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let stdout = ''
  let stderr = ''
  let timedOut = false
  const append = (target, chunk) => {
    if (target === 'out') stdout = (stdout + chunk).slice(-200_000)
    else stderr = (stderr + chunk).slice(-200_000)
  }
  child.stdout.on('data', (chunk) => append('out', String(chunk)))
  child.stderr.on('data', (chunk) => append('err', String(chunk)))
  const timer = setTimeout(() => {
    timedOut = true
    child.kill('SIGKILL')
  }, timeout)
  const result = await new Promise((resolve) => {
    child.on('error', (error) => {
      clearTimeout(timer)
      resolve({ code: null, signal: null, error })
    })
    child.on('close', (code, signal) => {
      clearTimeout(timer)
      resolve({ code, signal })
    })
  })
  const durationMs = Date.now() - started
  let logPath = null
  if (logDir) {
    await ensureDir(logDir)
    logPath = path.join(logDir, `${label}.log`)
    const header = [
      `label: ${label}`,
      `command: ${command}`,
      `cwd: ${cwd}`,
      `timeoutMs: ${timeout}`,
      `exitCode: ${result.code}`,
      `signal: ${result.signal}`,
      `timedOut: ${timedOut}`,
      `durationMs: ${durationMs}`,
      '--- stdout ---',
    ].join('\n')
    await fsp.writeFile(logPath, `${header}\n${stdout}\n--- stderr ---\n${stderr}\n`)
  }
  return {
    label,
    command,
    cwd,
    exitCode: result.code,
    signal: result.signal,
    timedOut,
    durationMs,
    stdout,
    stderr,
    logPath,
    log: logPath && logDir ? relativeLog(logPath, logDir) : null,
  }
}

export function startServer({ command, args, cwd, logPath, env = {} }) {
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const stream = fs.createWriteStream(logPath, { flags: 'a' })
  child.stdout.on('data', (chunk) => stream.write(chunk))
  child.stderr.on('data', (chunk) => stream.write(chunk))
  return { child, stream, pid: child.pid, startedAt: new Date().toISOString() }
}

export async function stopServer(server, { timeoutMs = 10_000 } = {}) {
  if (!server) return { stopped: false, exitCode: null, signal: null }
  const child = server.child
  if (child.exitCode !== null || child.signalCode !== null) {
    server.stream.end()
    return { stopped: true, exitCode: child.exitCode, signal: child.signalCode }
  }
  child.kill('SIGTERM')
  const result = await new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      resolve({ exitCode: child.exitCode, signal: 'SIGKILL', forced: true })
    }, timeoutMs)
    child.on('close', (code, signal) => {
      clearTimeout(timer)
      resolve({ exitCode: code, signal, forced: false })
    })
  })
  server.stream.end()
  return { stopped: true, ...result }
}

export async function fetchStatus(url, timeoutMs = 2000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { signal: controller.signal, redirect: 'manual' })
    return { reachable: true, status: response.status }
  } catch (error) {
    return { reachable: false, status: null, error: error.message }
  } finally {
    clearTimeout(timer)
  }
}

export async function waitForHttp(url, { timeoutMs = 60_000, intervalMs = 250 } = {}) {
  const started = Date.now()
  let last = null
  while (Date.now() - started < timeoutMs) {
    last = await fetchStatus(url)
    if (last.reachable) return { ...last, ok: true, durationMs: Date.now() - started }
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
  return { ...last, ok: false, durationMs: Date.now() - started }
}

export function compareSvg(expected, actual) {
  const expectedSha = sha256(expected)
  const actualSha = sha256(actual)
  return {
    ok: expected === actual && expectedSha === actualSha,
    expectedSha,
    actualSha,
    expectedBytes: Buffer.byteLength(expected),
    actualBytes: Buffer.byteLength(actual),
    exactBytes: expected === actual,
  }
}

export function compareDigest(expectedSha, actual) {
  const actualSha = sha256(actual)
  return { ok: expectedSha === actualSha, expectedSha, actualSha }
}

export function compareState(expected, actual, fields = ['seed', 'name', 'style', 'size', 'source']) {
  const differences = []
  for (const field of fields) {
    if (expected?.[field] !== actual?.[field]) {
      differences.push({ field, expected: expected?.[field], actual: actual?.[field] })
    }
  }
  return { ok: differences.length === 0, differences }
}

export function makeUsage(seed, options) {
  return `import { ditherFace } from 'dither-face'\n\nconst svg = ditherFace(${JSON.stringify(seed)}, ${JSON.stringify(options, null, 2)})`
}

export function optionsFor(style, px, name) {
  return { style, px, ...(name === '' || name === undefined ? {} : { name }) }
}

export function isLocalRequest(url, origin) {
  return url.startsWith(origin) || url.startsWith('data:') || url.startsWith('blob:')
}

export function bounded(values, limit = 200) {
  return values.slice(-limit)
}

export function createCaseRecorder(scenario, name) {
  const record = { scenario, name, assertions: 0, failures: [], notes: [] }
  return {
    record,
    check(ok, message, detail = null) {
      record.assertions += 1
      if (!ok) record.failures.push({ message, detail })
      return Boolean(ok)
    },
    equal(actual, expected, message, detail = null) {
      return this.check(Object.is(actual, expected), message, { actual, expected, ...(detail ?? {}) })
    },
    note(message, detail = null) {
      record.notes.push({ message, detail })
    },
  }
}

export function scenarioRecorder(id, expectedDefinition) {
  const state = {
    id,
    title: expectedDefinition.title,
    expectedStatus: expectedDefinition.expectedStatus,
    expectedCases: expectedDefinition.cases,
    cases: 0,
    assertions: 0,
    failures: [],
    caseRecords: [],
    notes: [],
    startedAt: new Date().toISOString(),
    finishedAt: null,
  }
  return {
    state,
    async runCase(name, fn) {
      const caseRecord = createCaseRecorder(id, name)
      state.cases += 1
      try {
        await fn(caseRecord)
      } catch (error) {
        caseRecord.check(false, `case threw: ${error.message}`, { stack: error.stack })
      }
      state.assertions += caseRecord.record.assertions
      if (caseRecord.record.failures.length) {
        state.failures.push({ case: name, failures: caseRecord.record.failures, assertions: caseRecord.record.assertions })
      }
      state.caseRecords.push(caseRecord.record)
      return caseRecord.record
    },
    finish() {
      state.finishedAt = new Date().toISOString()
      const countMatches = state.cases === state.expectedCases.length
      if (!countMatches) {
        state.failures.push({
          case: '__case-count__',
          failures: [{
            message: 'case count does not match expected-before-run list',
            detail: { expected: state.expectedCases.length, actual: state.cases, names: state.expectedCases },
          }],
          assertions: 0,
        })
      }
      const nameMismatches = state.expectedCases.filter((name, index) => state.caseRecords[index]?.name !== name)
      if (nameMismatches.length) {
        state.failures.push({
          case: '__case-names__',
          failures: [{
            message: 'case names/order do not match expected-before-run list',
            detail: { expected: state.expectedCases, actual: state.caseRecords.map((entry) => entry.name), nameMismatches },
          }],
          assertions: 0,
        })
      }
      state.actualStatus = state.failures.length === 0 ? 'PASS' : 'FAIL'
      state.expectedStatusMatched = state.actualStatus === state.expectedStatus
      return state
    },
  }
}
