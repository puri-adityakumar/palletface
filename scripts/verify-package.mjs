import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
const run = promisify(execFile), root = process.cwd(), temp = await mkdtemp(join(tmpdir(), 'dither-face-package-'))
let passed = 0
const check = (ok, message) => { if (!ok) throw new Error(message); passed++ }
try {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  const env = { ...process.env, NPM_CONFIG_LOGLEVEL: 'error' }
  await run(npm, ['run', 'build'], { cwd: root, env })
  await run(npm, ['run', 'build:web'], { cwd: root, env })
  const packed = await run(npm, ['pack', '--json', '--ignore-scripts', '--pack-destination', temp], { cwd: root, env })
  const manifest = JSON.parse(packed.stdout)[0], files = manifest.files.map((f) => f.path)
  check(files.includes('package.json') && files.includes('README.md') && files.includes('LICENSE'), 'required package metadata missing')
  const allowed = /^(package\.json|README\.md|LICENSE|dist\/[^/]+\.(?:js|d\.ts))$/
  check(files.every((p) => allowed.test(p)), `unexpected tarball files: ${files.filter((p) => !allowed.test(p)).join(', ')}`)
  check(!files.some((p) => /(?:\.test\.|\.spec\.|\.map$|site|playground)/i.test(p)), 'test, source map, or site file included')
  const consumer = join(temp, 'consumer'); await mkdir(consumer)
  await run(npm, ['init', '-y'], { cwd: consumer, env })
  await run(npm, ['install', '--ignore-scripts', '--no-audit', '--no-fund', join(temp, manifest.filename)], { cwd: consumer, env })
  await writeFile(join(consumer, 'check.mjs'), `import assert from 'node:assert/strict'; import { ditherFace, STYLES } from 'dither-face';
assert.equal(STYLES.length,8); assert.match(ditherFace('x'),/^<svg/); assert.equal(ditherFace('x'),ditherFace('x'));
for(const {slug} of STYLES){const a=ditherFace('s',{style:slug,px:37,name:'Ada'});assert.equal(a,ditherFace('s',{style:slug,px:37,name:'Ada'}));assert.match(a,/width="37"/)}
assert.throws(()=>ditherFace('x',{style:'bad'}),/unknown style/);assert.throws(()=>ditherFace('x',{px:0}),/positive/);assert.throws(()=>ditherFace(3),/seed/);console.log('runtime consumer passed')`)
  await run(process.execPath, ['check.mjs'], { cwd: consumer }); passed++
  await writeFile(join(consumer, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target:'ES2022',module:'NodeNext',moduleResolution:'NodeNext',strict:true,noEmit:true,skipLibCheck:true }, files:['consumer.ts'] }))
  await writeFile(join(consumer, 'consumer.ts'), `import { ditherFace, type StyleSlug } from 'dither-face';
const style: StyleSlug = 'pixel-sprite'; ditherFace('x',{style,px:24,name:'Ada'});
// @ts-expect-error invalid style must fail
ditherFace('x',{style:'not-a-style'});`)
  await run(resolve(root, 'node_modules/.bin/tsc'), ['-p', join(consumer, 'tsconfig.json')], { cwd: root }); passed++
  console.log(`PASS verify-package: ${passed} checks; ${manifest.filename}`)
} catch (error) { console.error(`FAIL verify-package after ${passed} checks: ${error.message}`); process.exitCode=1 }
finally { await rm(temp,{recursive:true,force:true}) }
