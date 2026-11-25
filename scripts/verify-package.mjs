import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const exec = promisify(execFile)
const root = fileURLToPath(new URL('../', import.meta.url))
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const temp = await mkdtemp(join(tmpdir(), 'palletface-package-'))
const run = async (command, args, cwd = root) => {
  try {
    return await exec(command, args, { cwd, maxBuffer: 4 * 1024 * 1024 })
  } catch (error) {
    throw new Error(`${command} ${args.join(' ')} failed\n${error.stdout ?? ''}${error.stderr ?? ''}`, { cause: error })
  }
}

try {
  // Exercise the actual prepack lifecycle, not an alternate release build.
  const packed = await run(npm, ['pack', '--json', '--pack-destination', temp])
  // Some npm versions forward lifecycle test output before the JSON manifest.
  const jsonStart = packed.stdout.lastIndexOf('\n[')
  const [manifest] = JSON.parse(jsonStart >= 0 ? packed.stdout.slice(jsonStart + 1) : packed.stdout)
  const files = manifest.files.map(({ path }) => path)
  for (const required of ['package.json', 'README.md', 'LICENSE', 'dist/index.js', 'dist/index.d.ts', 'dist/palletface.js']) {
    assert.ok(files.includes(required), `Missing package file: ${required}`)
  }
  const allowed = /^(?:package\.json|README\.md|LICENSE|dist\/(?:[a-z0-9-]+\/)*[a-z0-9-]+\.(?:js|d\.ts))$/i
  assert.ok(files.every((path) => allowed.test(path) && !/\.(?:test|spec)\./.test(path)), `Unexpected tarball files: ${files.filter((path) => !allowed.test(path) || /\.(?:test|spec)\./.test(path)).join(', ')}`)

  const consumer = join(temp, 'consumer')
  await mkdir(consumer)
  await writeFile(join(consumer, 'package.json'), JSON.stringify({ name: 'palletface-consumer', private: true, type: 'module' }))
  await run(npm, ['install', '--ignore-scripts', '--no-audit', '--no-fund', join(temp, manifest.filename)], consumer)
  const metadata = JSON.parse(await readFile(join(consumer, 'node_modules/palletface/package.json'), 'utf8'))
  assert.equal(Object.keys(metadata.dependencies ?? {}).length, 0, 'Package must have zero runtime dependencies')

  await writeFile(join(consumer, 'check.mjs'), `
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { palletface, STYLES, pixelFlora, pixelRelic, pixelStamp } from 'palletface'
assert.equal(STYLES.length, 12)
assert.equal(new Set(STYLES.map(s => s.slug)).size, STYLES.length)
assert.equal(palletface('x'), palletface('x', { style: 'pixel-sprite', px: 80 }))
for (const { slug } of STYLES) {
  for (const seed of ['', 's', 'élodie', '東京', '<script>']) {
    const options = { style: slug, px: 37, name: 'Ada' }
    const a = palletface(seed, options)
    assert.equal(a, palletface(seed, options))
    assert.match(a, /^<svg /)
    assert.match(a, /width="37"/)
    assert.ok(!a.includes('<script>'))
  }
}
assert.notEqual(palletface('x', {style:'pixel-letter',name:'Ada'}), palletface('x', {style:'pixel-letter',name:'Zeke'}))
assert.throws(() => palletface('x', {style:'bad'}), /unknown style/)
assert.throws(() => palletface('x', {px:0}), /positive/)
assert.throws(() => palletface(3), /seed/)
const context = {}
runInNewContext(readFileSync('node_modules/palletface/dist/palletface.js', 'utf8'), context)
for (const {slug} of STYLES) assert.equal(context.Palletface.palletface('bundle-check', {style:slug}), palletface('bundle-check', {style:slug}))
for (const [slug, draw, bundled] of [
  ['pixel-flora', pixelFlora, context.Palletface.pixelFlora],
  ['pixel-relic', pixelRelic, context.Palletface.pixelRelic],
  ['pixel-stamp', pixelStamp, context.Palletface.pixelStamp],
]) {
  const svg = palletface('x', {style:slug, px:24, name:'Élodie'})
  assert.equal(draw('x', 24, 'Élodie'), svg)
  assert.equal(bundled('x', 24, 'Élodie'), svg)
}
for (const style of ['ascii-letter', 'ascii-field', 'ascii-face']) {
  assert.ok(!STYLES.some(entry => entry.slug === style))
  assert.equal(context.Palletface.palletface('legacy-check', {style}), palletface('legacy-check', {style}))
}
console.log('PASS runtime consumer and browser bundle parity')
`)
  await run(process.execPath, ['check.mjs'], consumer)

  await writeFile(join(consumer, 'tsconfig.json'), JSON.stringify({
    compilerOptions: { target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', strict: true, noEmit: true, skipLibCheck: false },
    files: ['consumer.ts'],
  }))
  await writeFile(join(consumer, 'consumer.ts'), `
import { palletface, pixelSprite, pixelLetter, pixelEmotes, pixelFlora, pixelRelic, pixelStamp, STYLES, type StyleSlug, type PalletfaceOptions } from 'palletface'
const style: StyleSlug = 'mirrored-signal'
const options: PalletfaceOptions = {style, px:24, name:'Ada'}
const svg: string = palletface('x', options)
pixelSprite('x', 80)
pixelLetter('x', 80, 'Ada')
pixelEmotes('x', 80)
const additions: StyleSlug[] = ['pixel-flora', 'pixel-relic', 'pixel-stamp']
additions.forEach(style => palletface('x', {style}))
pixelFlora('x', 24)
pixelRelic('x', 32)
pixelStamp('x', 80, 'Élodie')
STYLES.forEach(s => palletface('x', {style:s.slug}))
// @ts-expect-error invalid style must fail
palletface('x', {style:'not-a-style'})
// @ts-expect-error seed must be a string
palletface(12)
// @ts-expect-error size must be numeric
palletface('x', {px:'80'})
`)
  await run(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), '-p', join(consumer, 'tsconfig.json')])
  console.log(`PASS package: ${manifest.filename}; ${files.length} allowed files; Node runtime, IIFE parity and TypeScript consumer`)
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
} finally {
  // The only recursively removed path is our own unique scratch directory.
  await rm(temp, { recursive: true, force: true })
}
