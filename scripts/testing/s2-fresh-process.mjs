#!/usr/bin/env node
/**
 * S2-02 fresh-process child. One process renders the fixed fresh corpus from
 * the installed tarball and writes raw-SVG SHA-256 values. It never imports
 * the repository source and never reuses a parent process.
 */
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { buildFreshCases, caseKey } from './s2-cases.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const args = {}
for (let index = 2; index < process.argv.length; index += 2) {
  const key = process.argv[index]
  if (!key?.startsWith('--') || index + 1 >= process.argv.length) throw new Error(`bad argument: ${key}`)
  args[key.slice(2)] = process.argv[index + 1]
}
for (const required of ['consumer', 'corpus', 'out']) if (!args[required]) throw new Error(`missing --${required}`)

const consumerDir = path.resolve(args.consumer)
const corpusPath = path.resolve(args.corpus)
const corpus = JSON.parse(fs.readFileSync(corpusPath, 'utf8'))
const requireFromConsumer = createRequire(path.join(consumerDir, 'package.json'))
const packageEntry = requireFromConsumer.resolve('dither-face')
const module = await import(pathToFileURL(packageEntry).href)
if (typeof module.ditherFace !== 'function') throw new Error('installed package has no ditherFace')

const cases = buildFreshCases(corpus)
const results = []
const originalRandom = Math.random
const originalNow = Date.now
let guardError = null
Math.random = () => {
  guardError = new Error('Math.random called during deterministic render')
  throw guardError
}
Date.now = () => {
  guardError = new Error('Date.now called during deterministic render')
  throw guardError
}
try {
  for (const testCase of cases) {
    const svg = module.ditherFace(testCase.seed, {
      style: testCase.style,
      px: testCase.px,
      ...(testCase.name === null ? {} : { name: testCase.name }),
    })
    results.push({ key: caseKey(testCase), sha256: createHash('sha256').update(svg).digest('hex'), bytes: Buffer.byteLength(svg) })
  }
} finally {
  Math.random = originalRandom
  Date.now = originalNow
}

const payload = {
  process: {
    version: process.version,
    major: Number(process.versions.node.split('.')[0]),
    platform: process.platform,
    arch: process.arch,
    execPath: process.execPath,
  },
  corpusPath,
  corpusSha256: createHash('sha256').update(fs.readFileSync(corpusPath)).digest('hex'),
  packageEntry,
  guard: guardError === null ? 'pass' : `fail: ${guardError.message}`,
  cases: results,
}
fs.mkdirSync(path.dirname(path.resolve(args.out)), { recursive: true })
fs.writeFileSync(path.resolve(args.out), `${JSON.stringify(payload, null, 2)}\n`)
console.log(JSON.stringify({ version: process.version, cases: results.length, guard: payload.guard, out: path.resolve(args.out) }))
if (guardError) process.exitCode = 1