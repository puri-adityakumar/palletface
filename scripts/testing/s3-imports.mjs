#!/usr/bin/env node
/**
 * Stage 3 export-resolution probe.
 *
 * Runs from a consumer with the actual tarball installed. It reports the ESM
 * root namespace, deep-import failures, and modern Node require(esm) behavior.
 * The qualification harness decides whether the observations are expected.
 */
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'

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
if (!args.expected) throw new Error('missing --expected')
const expected = JSON.parse(fs.readFileSync(path.resolve(args.expected), 'utf8'))
const require = createRequire(import.meta.url)
const esm = await import('dither-face')
const esmExports = Object.keys(esm).sort()
const esmMissing = expected.runtimeValueExports.filter((name) => !(name in esm))
const esmUnexpected = esmExports.filter((name) => !expected.runtimeValueExports.includes(name))
const esmTypeof = {
  ditherFace: typeof esm.ditherFace,
  STYLESLength: Array.isArray(esm.STYLES) ? esm.STYLES.length : null,
}

const deepImports = []
for (const specifier of expected.unsupportedDeepImports) {
  try {
    await import(specifier)
    deepImports.push({ specifier, resolved: true, code: null, message: null })
  } catch (error) {
    deepImports.push({ specifier, resolved: false, code: error?.code ?? null, message: String(error?.message ?? error) })
  }
}

const deepRequires = []
for (const specifier of expected.unsupportedDeepRequires) {
  try {
    require(specifier)
    deepRequires.push({ specifier, resolved: true, code: null, message: null })
  } catch (error) {
    deepRequires.push({ specifier, resolved: false, code: error?.code ?? null, message: String(error?.message ?? error) })
  }
}

let cjs = null
try {
  const namespace = require('dither-face')
  cjs = {
    succeeded: true,
    code: null,
    typeofDitherFace: typeof namespace.ditherFace,
    typeofSTYLES: Array.isArray(namespace.STYLES) ? 'array' : typeof namespace.STYLES,
    STYLESLength: Array.isArray(namespace.STYLES) ? namespace.STYLES.length : null,
    keys: Object.keys(namespace).sort(),
  }
} catch (error) {
  cjs = {
    succeeded: false,
    code: error?.code ?? null,
    message: String(error?.message ?? error),
    typeofDitherFace: null,
    typeofSTYLES: null,
    STYLESLength: null,
    keys: [],
  }
}

const resolvedEntry = require.resolve('dither-face')
const packageRoot = path.resolve(path.dirname(resolvedEntry), '..')
const packageRootReadable = fs.existsSync(path.join(packageRoot, 'package.json'))
const packageJson = packageRootReadable
  ? JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'))
  : null

console.log(JSON.stringify({
  node: process.version,
  esmExports,
  esmMissing,
  esmUnexpected,
  esmTypeof,
  deepImports,
  deepRequires,
  cjs,
  resolvedEntry,
  packageRoot,
  packageRootReadable,
  packageVersion: packageJson?.version ?? null,
  packageExports: packageJson?.exports ?? null,
  packageMain: packageJson?.main ?? null,
  packageTypes: packageJson?.types ?? null,
  importMetaResolve: (() => {
    try {
      return import.meta.resolve('dither-face')
    } catch (error) {
      return { error: String(error?.message ?? error) }
    }
  })(),
}, null, 2))
