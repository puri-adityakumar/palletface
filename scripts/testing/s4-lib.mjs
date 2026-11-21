#!/usr/bin/env node
/**
 * Stage 4 shared qualification helpers. These are used by the production
 * checker (s4-qualify.mjs) and the browser scenarios, and by the negative
 * controls where the same comparator must reject bad input.
 */
import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'

export const SVG_DATA_URL_PREFIX = 'data:image/svg+xml;charset=utf-8,'

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

export async function sha256File(file) {
  return sha256(await fsp.readFile(file))
}

export function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export async function writeJson(file, value) {
  await fsp.mkdir(path.dirname(file), { recursive: true })
  await fsp.writeFile(file, `${JSON.stringify(value, null, 2)}\n`)
}

export async function readJson(file) {
  return JSON.parse(await fsp.readFile(file, 'utf8'))
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
  const stdout = []
  const stderr = []
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    child.kill('SIGKILL')
  }, timeout)
  child.stdout.on('data', (chunk) => stdout.push(chunk))
  child.stderr.on('data', (chunk) => stderr.push(chunk))
  const closed = await new Promise((resolve, reject) => {
    child.on('error', reject)
    child.on('close', (exitCode, signal) => resolve({ exitCode, signal }))
  })
  clearTimeout(timer)
  const stdoutText = Buffer.concat(stdout).toString('utf8')
  const stderrText = Buffer.concat(stderr).toString('utf8')
  const raw = `${stdoutText}${stderrText}`
  let logPath = null
  if (logDir) {
    await fsp.mkdir(logDir, { recursive: true })
    const safe = label.replace(/[^A-Za-z0-9_.-]+/g, '-')
    logPath = path.join(logDir, `${safe}.log`)
    await fsp.writeFile(
      logPath,
      `$ ${command}\n# cwd=${cwd}\n# exit=${closed.exitCode} signal=${closed.signal ?? 'none'} timedOut=${timedOut} durationMs=${Date.now() - started}\n\n${raw}\n`,
    )
  }
  return {
    label,
    command,
    cwd,
    exitCode: closed.exitCode,
    signal: closed.signal,
    timedOut,
    durationMs: Date.now() - started,
    stdout: stdoutText,
    stderr: stderrText,
    raw,
    logPath,
  }
}

export function startProcess({ label, command, cwd, env = {}, logPath }) {
  fs.mkdirSync(path.dirname(logPath), { recursive: true })
  const fd = fs.openSync(logPath, 'a')
  const child = spawn('/bin/bash', ['-lc', command], {
    cwd,
    env: { ...process.env, ...env },
    detached: true,
    stdio: ['ignore', fd, fd],
  })
  fs.closeSync(fd)
  child.unref()
  return { label, command, cwd, child, pid: child.pid, logPath, startedAt: new Date().toISOString() }
}

export async function stopProcess(server, { timeoutMs = 20_000 } = {}) {
  const started = Date.now()
  const pid = server.pid
  let signal = 'SIGTERM'
  const alreadyExited = server.child.exitCode !== null || server.child.signalCode !== null
  if (!alreadyExited) {
    try {
      process.kill(-pid, 'SIGTERM')
    } catch {
      try {
        process.kill(pid, 'SIGTERM')
      } catch {
        // Already gone.
      }
    }
  }
  const exited = alreadyExited
    ? { code: server.child.exitCode, sig: server.child.signalCode, alreadyExited: true }
    : await Promise.race([
        new Promise((resolve) => server.child.once('exit', (code, sig) => resolve({ code, sig }))),
        new Promise((resolve) => setTimeout(() => resolve(null), timeoutMs)),
      ])
  if (exited === null) {
    signal = 'SIGKILL'
    try {
      process.kill(-pid, 'SIGKILL')
    } catch {
      try {
        process.kill(pid, 'SIGKILL')
      } catch {
        // Already gone.
      }
    }
  }
  return {
    label: server.label,
    pid,
    signal,
    exited,
    durationMs: Date.now() - started,
    log: server.logPath,
  }
}

export async function waitForHttp(url, { timeoutMs = 60_000, intervalMs = 250 } = {}) {
  const started = Date.now()
  let lastError = null
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url, { redirect: 'manual' })
      const text = await response.text()
      return { ok: true, status: response.status, text, durationMs: Date.now() - started, lastError: null }
    } catch (error) {
      lastError = String(error?.cause?.message ?? error?.message ?? error)
      await new Promise((resolve) => setTimeout(resolve, intervalMs))
    }
  }
  return { ok: false, status: null, text: '', durationMs: Date.now() - started, lastError }
}

export async function fetchStatus(url) {
  try {
    const response = await fetch(url, { redirect: 'manual' })
    await response.text()
    return { reachable: true, status: response.status }
  } catch (error) {
    return { reachable: false, status: null, error: String(error?.cause?.message ?? error?.message ?? error) }
  }
}

export function createChecker() {
  const cases = []
  const assertions = []
  const failures = []
  return {
    cases,
    assertions,
    failures,
    case(name, detail = {}) {
      cases.push({ name, ...detail })
    },
    assert(ok, name, detail = {}) {
      const row = { name, ok: Boolean(ok), ...detail }
      assertions.push(row)
      if (!ok) failures.push(row)
      return Boolean(ok)
    },
    equal(actual, expected, name, detail = {}) {
      return this.assert(actual === expected, name, { actual, expected, ...detail })
    },
  }
}

export function decodeSvgDataUrl(src) {
  if (typeof src !== 'string' || !src.startsWith(SVG_DATA_URL_PREFIX)) return null
  try {
    return decodeURIComponent(src.slice(SVG_DATA_URL_PREFIX.length))
  } catch {
    return null
  }
}

export function goldenMap(golden) {
  return Object.fromEntries(golden.styles.map((row) => [row.slug, row.sha256]))
}

export function validateGolden(golden) {
  const problems = []
  if (!isPlainObject(golden)) problems.push('golden is not an object')
  if (!Array.isArray(golden?.styles) || golden.styles.length !== 8) problems.push('golden must contain eight styles')
  const slugs = new Set()
  for (const row of golden?.styles ?? []) {
    if (typeof row?.slug !== 'string' || !/^[a-z0-9-]+$/.test(row.slug)) problems.push(`bad slug ${String(row?.slug)}`)
    if (typeof row?.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(row.sha256)) problems.push(`bad hash for ${String(row?.slug)}`)
    if (slugs.has(row?.slug)) problems.push(`duplicate slug ${row.slug}`)
    slugs.add(row?.slug)
  }
  if (!isPlainObject(golden?.input)) problems.push('golden input missing')
  return problems
}

export function compareGolden(svg, expectedSha256) {
  const actualSha256 = sha256(svg)
  return {
    expectedSha256,
    actualSha256,
    equal: actualSha256 === expectedSha256,
    bytes: Buffer.byteLength(svg),
  }
}

export function isLocalRequest(url, origin) {
  if (url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('about:')) return true
  try {
    const parsed = new URL(url)
    if (parsed.protocol === 'ws:' || parsed.protocol === 'wss:') {
      return parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost'
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false
    if (parsed.hostname !== '127.0.0.1' && parsed.hostname !== 'localhost') return false
    const expected = new URL(origin)
    return parsed.port === expected.port || parsed.port === ''
  } catch {
    return false
  }
}

export function scanTextFiles(root, patterns) {
  const findings = []
  const files = []
  async function visit(directory) {
    for (const entry of await fsp.readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        await visit(absolute)
      } else if (entry.isFile() && /\.(?:js|mjs|cjs|css|html|json|map)$/.test(entry.name)) {
        const text = await fsp.readFile(absolute, 'utf8')
        files.push(path.relative(root, absolute).split(path.sep).join('/'))
        for (const pattern of patterns) {
          const regex = new RegExp(pattern, 'g')
          const matches = [...text.matchAll(regex)].slice(0, 5).map((match) => match[0])
          if (matches.length > 0) {
            findings.push({
              file: path.relative(root, absolute).split(path.sep).join('/'),
              pattern,
              matches,
            })
          }
        }
      }
    }
  }
  return (async () => {
    await visit(root)
    return { files, findings }
  })()
}

export function relativeLog(logPath, outDir) {
  if (!logPath) return null
  return path.relative(outDir, logPath).split(path.sep).join('/')
}
