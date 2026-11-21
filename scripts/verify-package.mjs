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
const temp = await mkdtemp(join(tmpdir(), 'dither-face-package-'))
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
  for (const required of ['package.json', 'README.md', 'LICENSE', 'dist/index.js', 'dist/index.d.ts', 'dist/dither-face.js']) {
    assert.ok(files.includes(required), `Missing package file: ${required}`)
  }
  const allowed = /^(?:package\.json|README\.md|LICENSE|dist\/(?:[a-z0-9-]+\/)*[a-z0-9-]+\.(?:js|d\.ts))$/i
  assert.ok(files.every((path) => allowed.test(path) && !/\.(?:test|spec)\./.test(path)), `Unexpected tarball files: ${files.filter((path) => !allowed.test(path) || /\.(?:test|spec)\./.test(path)).join(', ')}`)

  const consumer = join(temp, 'consumer')
  await mkdir(consumer)
  await writeFile(join(consumer, 'package.json'), JSON.stringify({ name: 'dither-face-consumer', private: true, type: 'module' }))
  await run(npm, ['install', '--ignore-scripts', '--no-audit', '--no-fund', join(temp, manifest.filename)], consumer)
  const metadata = JSON.parse(await readFile(join(consumer, 'node_modules/palletface/package.json'), 'utf8'))
  assert.equal(Object.keys(metadata.dependencies ?? {}).length, 0, 'Package must have zero runtime dependencies')

  await writeFile(join(consumer, 'check.mjs'), `
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { ditherFace, STYLES } from 'palletface'
assert.equal(STYLES.length, 8)
assert.equal(new Set(STYLES.map(s => s.slug)).size, 8)
assert.equal(ditherFace('x'), ditherFace('x', { style: 'pixel-sprite', px: 80 }))
for (const { slug } of STYLES) {
  for (const seed of ['', 's', 'élodie', '東京', '<script>']) {
    const options = { style: slug, px: 37, name: 'Ada' }
    const a = ditherFace(seed, options)
    assert.equal(a, ditherFace(seed, options))
    assert.match(a, /^<svg /)
    assert.match(a, /width="37"/)
    assert.ok(!a.includes('<script>'))
  }
}
assert.notEqual(ditherFace('x', {style:'pixel-letter',name:'Ada'}), ditherFace('x', {style:'pixel-letter',name:'Zeke'}))
assert.throws(() => ditherFace('x', {style:'bad'}), /unknown style/)
assert.throws(() => ditherFace('x', {px:0}), /positive/)
assert.throws(() => ditherFace(3), /seed/)
const context = {}
runInNewContext(readFileSync('node_modules/palletface/dist/dither-face.js', 'utf8'), context)
for (const {slug} of STYLES) assert.equal(context.DitherFace.ditherFace('bundle-check', {style:slug}), ditherFace('bundle-check', {style:slug}))
console.log('PASS runtime consumer and browser bundle parity')
`)
  await run(process.execPath, ['check.mjs'], consumer)

  await writeFile(join(consumer, 'tsconfig.json'), JSON.stringify({
    compilerOptions: { target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', strict: true, noEmit: true, skipLibCheck: false },
    files: ['consumer.ts'],
  }))
  await writeFile(join(consumer, 'consumer.ts'), `
import { ditherFace, pixelSprite, pixelLetter, STYLES, type StyleSlug, type DitherFaceOptions } from 'palletface'
const style: StyleSlug = 'pixel-sprite'
const options: DitherFaceOptions = {style, px:24, name:'Ada'}
const svg: string = ditherFace('x', options)
pixelSprite('x', 80)
pixelLetter('x', 80, 'Ada')
STYLES.forEach(s => ditherFace('x', {style:s.slug}))
// @ts-expect-error invalid style must fail
ditherFace('x', {style:'not-a-style'})
// @ts-expect-error seed must be a string
ditherFace(12)
// @ts-expect-error size must be numeric
ditherFace('x', {px:'80'})
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
