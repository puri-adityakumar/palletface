#!/usr/bin/env node
/**
 * Stage 3 installed-package renderer.
 *
 * Runs from a consumer directory outside the repository. It imports the package
 * root only after installing a network guard, renders the fixed eight-style
 * fixture, and compares raw-SVG SHA-256 values to the tracked golden file.
 * There are no repository-relative imports and no test-tool imports.
 */
import { createHash } from 'node:crypto'
import { compareGolden } from './s3-golden.mjs'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import net from 'node:net'
import tls from 'node:tls'
import http from 'node:http'
import https from 'node:https'
import dns from 'node:dns'
import dgram from 'node:dgram'

function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]
    if (!key?.startsWith('--') || i + 1 >= argv.length) throw new Error(`bad argument: ${key}`)
    out[key.slice(2)] = argv[i + 1]
  }
  return out
}

const args = parseArgs(process.argv.slice(2))
const goldenPath = path.resolve(args.golden || '')
const label = args.label || 'consumer'
if (!args.golden) throw new Error('missing --golden')
const golden = JSON.parse(fs.readFileSync(goldenPath, 'utf8'))
const expected = new Map(golden.styles.map((entry) => [entry.slug, entry.sha256]))
if (expected.size !== 8) throw new Error('golden file must contain eight styles')

const attempts = []
const blockedError = (kind, detail) => {
  attempts.push({ kind, detail })
  const error = new Error(`S3_NETWORK_GUARD: ${kind} ${detail}`)
  error.code = 'S3_NETWORK_GUARD'
  throw error
}

net.Socket.prototype.connect = function guardedSocketConnect(...connectArgs) {
  const detail = typeof connectArgs[0] === 'object'
    ? JSON.stringify({ host: connectArgs[0]?.host, port: connectArgs[0]?.port, path: connectArgs[0]?.path })
    : JSON.stringify(connectArgs.slice(0, 2))
  return blockedError('net.Socket.connect', detail)
}
net.connect = (...connectArgs) => blockedError('net.connect', JSON.stringify(connectArgs.slice(0, 2)))
net.createConnection = (...connectArgs) => blockedError('net.createConnection', JSON.stringify(connectArgs.slice(0, 2)))
tls.connect = (...connectArgs) => blockedError('tls.connect', JSON.stringify(connectArgs.slice(0, 2)))
for (const method of ['request', 'get']) {
  http[method] = (...requestArgs) => blockedError(`http.${method}`, JSON.stringify(requestArgs.slice(0, 1)))
  https[method] = (...requestArgs) => blockedError(`https.${method}`, JSON.stringify(requestArgs.slice(0, 1)))
}
for (const method of ['lookup', 'resolve', 'resolve4', 'resolve6', 'resolveAny']) {
  if (typeof dns[method] === 'function') dns[method] = (...lookupArgs) => blockedError(`dns.${method}`, JSON.stringify(lookupArgs.slice(0, 2)))
}
for (const method of ['lookup', 'resolve']) {
  if (typeof dns.promises[method] === 'function') dns.promises[method] = (...lookupArgs) => blockedError(`dns.promises.${method}`, JSON.stringify(lookupArgs.slice(0, 2)))
}
dgram.createSocket = (...socketArgs) => blockedError('dgram.createSocket', JSON.stringify(socketArgs.slice(0, 1)))
globalThis.fetch = (...fetchArgs) => blockedError('fetch', JSON.stringify(fetchArgs.slice(0, 1)))

const require = createRequire(import.meta.url)
let resolvedEntry = null
let packageRoot = null
let packageVersion = null
let packageRootReadable = false
try {
  resolvedEntry = require.resolve('dither-face')
  packageRoot = path.resolve(path.dirname(resolvedEntry), '..')
  packageRootReadable = fs.existsSync(path.join(packageRoot, 'package.json'))
  if (packageRootReadable) packageVersion = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8')).version
} catch (error) {
  throw new Error(`package root resolution failed: ${error.stack || error}`)
}

const module = await import('dither-face')
if (typeof module.ditherFace !== 'function') throw new Error('ditherFace is not exported from the package root')
if (!Array.isArray(module.STYLES) || module.STYLES.length !== 8) throw new Error('STYLES must contain eight entries')

const cases = []
let failures = 0
for (const style of golden.styles) {
  const svg = module.ditherFace(golden.input.seed, {
    style: style.slug,
    name: golden.input.name,
    px: golden.input.px,
  })
  const expectedSha256 = expected.get(style.slug)
  const comparison = compareGolden(svg, expectedSha256)
  const actualSha256 = comparison.actualSha256
  const equal = comparison.equal
  if (!equal) failures += 1
  cases.push({
    style: style.slug,
    expectedSha256,
    actualSha256,
    equal,
    bytes: Buffer.byteLength(svg, 'utf8'),
    startsWithSvg: svg.startsWith('<svg '),
  })
}

const styleOrder = module.STYLES.map((entry) => entry.slug)
const expectedOrder = golden.styles.map((entry) => entry.slug)
const activeResources = process.getActiveResourcesInfo()
const output = {
  label,
  node: process.version,
  platform: process.platform,
  arch: process.arch,
  resolvedEntry,
  packageRoot,
  packageRootReadable,
  packageVersion,
  styleOrder,
  styleOrderMatchesGolden: JSON.stringify(styleOrder) === JSON.stringify(expectedOrder),
  goldenPath,
  goldenSha256: createHash('sha256').update(fs.readFileSync(goldenPath)).digest('hex'),
  cases,
  failures,
  networkAttempts: attempts,
  activeResources,
}
console.log(JSON.stringify(output, null, 2))
if (failures > 0 || !output.styleOrderMatchesGolden || attempts.length > 0) {
  process.exitCode = 1
}
