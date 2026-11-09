#!/usr/bin/env node
/**
 * Stage 3 negative-control recheck.
 *
 * Runs the four required production checkers plus the golden-comparator
 * control against the same real tarball and same sandbox work tree. Used after
 * the resumed main run, so the controls have their own raw evidence file.
 */
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { compareGolden } from './s3-golden.mjs'
import {
  checkPackageMetadata,
  checkTarballManifest,
  ensureEmptyDirectory,
  inspectTarball,
  parsePackJson,
  runCommand,
} from './s3-lib.mjs'

function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]
    if (!key?.startsWith('--') || i + 1 >= argv.length) throw new Error(`bad argument: ${key}`)
    out[key.slice(2)] = argv[i + 1]
  }
  for (const required of ['repo', 'fixtures', 'out', 'work', 'tarball', 'ts-version', 'node-version']) {
    if (!out[required]) throw new Error(`missing --${required}`)
  }
  return out
}

const args = parseArgs(process.argv.slice(2))
const repo = path.resolve(args.repo)
const fixtures = path.resolve(args.fixtures)
const out = path.resolve(args.out)
const work = path.resolve(args.work)
const tarball = path.resolve(args.tarball)
const logs = path.join(out, 'logs')
await fsp.mkdir(logs, { recursive: true })
await fsp.mkdir(out, { recursive: true })
const allowlist = JSON.parse(fs.readFileSync(path.join(fixtures, 'tarball-allowlist.json'), 'utf8'))
const golden = JSON.parse(fs.readFileSync(path.join(fixtures, 'fixtures', 'golden.json'), 'utf8'))
const repoPackage = JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8'))
const lock = JSON.parse(fs.readFileSync(path.join(repo, 'package-lock.json'), 'utf8'))
const controls = []

function record(name, detected, detail) {
  controls.push({ name, detected: Boolean(detected), detail })
  return detected
}

function extract(tarballPath, target) {
  execFileSync('rm', ['-rf', target], { stdio: 'pipe' })
  execFileSync('mkdir', ['-p', target], { stdio: 'pipe' })
  execFileSync('tar', ['-xzf', tarballPath, '-C', target, '--no-same-owner'], { stdio: 'pipe' })
}

const inspection = await inspectTarball(tarball, path.join(work, 'controls-archive'))
const dry = await runCommand({
  label: 'controls-pack-dry-run',
  command: `npx -y npm@11.19.1 pack --dry-run --json`,
  cwd: repo,
  logDir: logs,
  timeout: 600000,
})
const dryManifest = parsePackJson(dry.raw)?.[0] ?? null

{
  const root = path.join(work, 'controls-nc1')
  extract(tarball, root)
  await fsp.mkdir(path.join(root, 'package', 'src'), { recursive: true })
  await fsp.writeFile(path.join(root, 'package', 'src', 'internal.ts'), 'export const leaked = true\n')
  await fsp.writeFile(path.join(root, 'package', 'dist', 'leak.js.map'), '{"version":3}\n//# sourceMappingURL=leak.js.map\n')
  const bad = path.join(work, 'controls-nc1.tgz')
  execFileSync('tar', ['-czf', bad, '-C', root, 'package'], { stdio: 'pipe' })
  const result = await checkTarballManifest({ inspection: await inspectTarball(bad, path.join(work, 'controls-nc1-archive')), allowlist, dryRun: dryManifest })
  const paths = result.failures.flatMap((failure) => Array.isArray(failure.detail) ? failure.detail : [])
  record('S3-NC1-forbidden-extra-entry', result.failures.length > 0 && paths.includes('package/src/internal.ts') && paths.includes('package/dist/leak.js.map'), { failures: result.failures })
}

{
  const root = path.join(work, 'controls-nc2')
  extract(tarball, root)
  const packagePath = path.join(root, 'package', 'package.json')
  const mutated = JSON.parse(await fsp.readFile(packagePath, 'utf8'))
  mutated.dependencies = { react: '19.3.1', 'left-pad': '1.3.0' }
  await fsp.writeFile(packagePath, `${JSON.stringify(mutated, null, 2)}\n`)
  const bad = path.join(work, 'controls-nc2.tgz')
  execFileSync('tar', ['-czf', bad, '-C', root, 'package'], { stdio: 'pipe' })
  const badInspection = await inspectTarball(bad, path.join(work, 'controls-nc2-archive'))
  const badPackage = JSON.parse(fs.readFileSync(badInspection.fileMap['package/package.json'].absolute, 'utf8'))
  const result = checkPackageMetadata({ packaged: badPackage, repo: repoPackage, allowlist, inspection: badInspection, repoRoot: repo, lock })
  record('S3-NC2-dependency-injection', result.failures.some((failure) => /dependency|deep-equals/.test(failure.name)), { failures: result.failures })
}

{
  const root = path.join(work, 'controls-nc3')
  extract(tarball, root)
  const packagePath = path.join(root, 'package', 'package.json')
  const mutated = JSON.parse(await fsp.readFile(packagePath, 'utf8'))
  mutated.exports['.'].default = './dist/indx.js'
  await fsp.writeFile(packagePath, `${JSON.stringify(mutated, null, 2)}\n`)
  const bad = path.join(work, 'controls-nc3.tgz')
  execFileSync('tar', ['-czf', bad, '-C', root, 'package'], { stdio: 'pipe' })
  const badInspection = await inspectTarball(bad, path.join(work, 'controls-nc3-archive'))
  const badPackage = JSON.parse(fs.readFileSync(badInspection.fileMap['package/package.json'].absolute, 'utf8'))
  const metadata = checkPackageMetadata({ packaged: badPackage, repo: repoPackage, allowlist, inspection: badInspection, repoRoot: repo, lock })
  const consumer = path.join(work, 'controls-nc3-consumer')
  await ensureEmptyDirectory(consumer)
  await fsp.writeFile(path.join(consumer, 'package.json'), `${JSON.stringify({ name: 's3-nc3', private: true, type: 'module' }, null, 2)}\n`)
  const install = await runCommand({ label: 'controls-nc3-install', command: `npx -y npm@11.19.1 install --ignore-scripts --no-audit --no-fund ${JSON.stringify(bad)}`, cwd: consumer, logDir: logs, timeout: 600000 })
  const imported = await runCommand({
    label: 'controls-nc3-import',
    command: `node -e "import('dither-face').then(()=>{console.log(JSON.stringify({resolved:true}));process.exit(0)}).catch((error)=>{console.log(JSON.stringify({resolved:false,code:error.code||null}));process.exit(1)})"`,
    cwd: consumer,
    logDir: logs,
    timeout: 120000,
  })
  const parsed = JSON.parse(imported.stdout.trim().split('\n').at(-1))
  record('S3-NC3-export-path-typo', install.exitCode === 0 && imported.exitCode !== 0 && parsed.resolved === false && metadata.failures.some((failure) => failure.name.includes('declared path exists')), { installExit: install.exitCode, importExit: imported.exitCode, import: parsed, metadataFailures: metadata.failures })
}

{
  const tsDir = path.join(work, 'consumers', 'ts')
  const tsc = path.join(work, 'tools', `typescript-${args['ts-version']}`, 'node_modules', 'typescript', 'bin', 'tsc')
  const invalid = await runCommand({
    label: 'controls-nc4-invalid-style',
    command: `node ${JSON.stringify(tsc)} --noEmit --strict --target ES2022 --noUncheckedIndexedAccess --pretty false --module nodenext --moduleResolution nodenext invalid-style.ts`,
    cwd: tsDir,
    logDir: logs,
    timeout: 300000,
  })
  const diagnostics = invalid.raw.split('\n').filter((line) => /error TS\d+/.test(line))
  record('S3-NC4-invalid-typescript', invalid.exitCode !== 0 && diagnostics.length > 0, { exitCode: invalid.exitCode, diagnostics: diagnostics.slice(0, 5) })
}

{
  const consumer = path.join(work, 'consumers', 'npm-prod')
  const require = createRequire(path.join(consumer, 'package.json'))
  const { ditherFace } = await import(pathToFileURL(require.resolve('dither-face')).href)
  const goldenSha = golden.styles.find((entry) => entry.slug === 'pixel-sprite').sha256
  const svg = ditherFace('preview-output', { style: 'pixel-sprite', name: '7even', px: 80 })
  const mutatedSvg = svg.replace('viewBox', 'viewbox')
  const original = compareGolden(svg, goldenSha)
  const mutated = compareGolden(mutatedSvg, goldenSha)
  const wrongExpectedSha = '0'.repeat(64)
  const mutatedExpected = compareGolden(svg, wrongExpectedSha)

  // Inject an always-accept comparator into an isolated copy. The two
  // negative inputs above must expose that fault; this never changes the
  // helper used by the real renderer or any installed package.
  const helperPath = new URL('./s3-golden.mjs', import.meta.url)
  const helperSource = await fsp.readFile(helperPath, 'utf8')
  const faultySource = helperSource.replace(
    'equal: actualSha256 === expectedSha256',
    'equal: true',
  )
  const faultySourceInjected = faultySource !== helperSource
  const faultyHelperPath = path.join(work, 'controls-faulty-s3-golden.mjs')
  await fsp.writeFile(faultyHelperPath, faultySource)
  const faultyHelper = await import(`${pathToFileURL(faultyHelperPath).href}?control=${Date.now()}`)
  const faultySvgMutation = faultyHelper.compareGolden(mutatedSvg, goldenSha)
  const faultyExpectedMutation = faultyHelper.compareGolden(svg, wrongExpectedSha)
  const faultyComparatorExposed = faultySvgMutation.equal && faultyExpectedMutation.equal
  const detected = original.equal &&
    mutatedSvg !== svg && !mutated.equal &&
    !mutatedExpected.equal &&
    faultySourceInjected && faultyComparatorExposed
  record('S3-NC5-golden-mismatch', detected, {
    comparator: 'scripts/testing/s3-golden.mjs:compareGolden',
    original,
    mutated,
    mutatedExpected,
    faultyComparator: {
      disposableCopy: faultyHelperPath,
      sourceMutationApplied: faultySourceInjected,
      mutatedSvgAccepted: faultySvgMutation.equal,
      mutatedExpectedAccepted: faultyExpectedMutation.equal,
      exposedByNegativeInputs: faultyComparatorExposed,
    },
    changed: mutatedSvg !== svg,
  })
}

const output = { createdAt: new Date().toISOString(), tarball, tarballSha256: inspection.rawSha256, controls }
await fsp.writeFile(path.join(out, 'controls-final.json'), `${JSON.stringify(output, null, 2)}\n`)
console.log(JSON.stringify(output, null, 2))
if (controls.some((control) => !control.detected)) process.exitCode = 1
