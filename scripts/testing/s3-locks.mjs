#!/usr/bin/env node
/**
 * Stage 3 lockfile bootstrap. Run once in the dedicated sandbox with the real
 * packed tarball. It creates the version-pinned npm, pnpm and Yarn PnP fixture
 * lockfiles that are then committed and used by the final qualification run.
 */
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { runCommand } from './s3-lib.mjs'

function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]
    if (!key?.startsWith('--') || i + 1 >= argv.length) throw new Error(`bad argument: ${key}`)
    out[key.slice(2)] = argv[i + 1]
  }
  for (const required of ['fixtures', 'out', 'tarball', 'npm-version', 'pnpm-version', 'yarn-version']) {
    if (!out[required]) throw new Error(`missing --${required}`)
  }
  return out
}

const args = parseArgs(process.argv.slice(2))
const fixtures = path.resolve(args.fixtures)
const out = path.resolve(args.out)
const tarball = path.resolve(args.tarball)
const logs = path.join(out, 'logs')
const locks = path.join(out, 'locks')
await fsp.mkdir(logs, { recursive: true })
await fsp.mkdir(locks, { recursive: true })

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

async function prepare(name) {
  const target = path.join(out, name)
  await fsp.rm(target, { recursive: true, force: true })
  await fsp.mkdir(target, { recursive: true })
  for (const file of ['package.json']) {
    await fsp.copyFile(path.join(fixtures, 'consumers', name, file), path.join(target, file))
  }
  for (const file of ['.npmrc', '.yarnrc.yml']) {
    const source = path.join(fixtures, 'consumers', name, file)
    if (fs.existsSync(source)) await fsp.copyFile(source, path.join(target, file))
  }
  await fsp.copyFile(tarball, path.join(target, 'dither-face-0.1.0.tgz'))
  return target
}

const commands = []
async function run(label, command, cwd) {
  const result = await runCommand({ label, command, cwd, logDir: logs, timeout: 600000 })
  commands.push({
    label,
    command,
    cwd,
    exitCode: result.exitCode,
    durationMs: result.durationMs,
    log: result.logPath ? path.basename(result.logPath) : null,
  })
  if (result.exitCode !== 0) throw new Error(`${label} exited ${result.exitCode}\n${result.raw.slice(-4000)}`)
  return result
}

try {
  const npmDir = await prepare('npm')
  await run('npm-lock', `npx -y npm@${args['npm-version']} install --package-lock-only --ignore-scripts --no-audit --no-fund`, npmDir)
  await fsp.copyFile(path.join(npmDir, 'package-lock.json'), path.join(locks, 'package-lock.json'))

  const pnpmDir = await prepare('pnpm')
  await run('pnpm-lock', `npx -y pnpm@${args['pnpm-version']} install --lockfile-only --ignore-scripts`, pnpmDir)
  await fsp.copyFile(path.join(pnpmDir, 'pnpm-lock.yaml'), path.join(locks, 'pnpm-lock.yaml'))

  const yarnDir = await prepare('yarn')
  await run('yarn-lock', `npx -y -p @yarnpkg/cli-dist@${args['yarn-version']} yarn install`, yarnDir)
  await fsp.copyFile(path.join(yarnDir, 'yarn.lock'), path.join(locks, 'yarn.lock'))

  const manifest = {
    createdAt: new Date().toISOString(),
    tarball: {
      name: path.basename(tarball),
      sha256: sha256(await fsp.readFile(tarball)),
      bytes: (await fsp.stat(tarball)).size,
    },
    versions: {
      npm: args['npm-version'],
      pnpm: args['pnpm-version'],
      yarn: args['yarn-version'],
    },
    commands,
    locks: {},
  }
  for (const file of ['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock']) {
    const bytes = await fsp.readFile(path.join(locks, file))
    manifest.locks[file] = { sha256: sha256(bytes), bytes: bytes.length }
  }
  await fsp.writeFile(path.join(locks, 'bootstrap.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  console.log(JSON.stringify(manifest, null, 2))
} catch (error) {
  await fsp.writeFile(path.join(out, 'bootstrap-failure.json'), `${JSON.stringify({ commands, error: error.stack || String(error) }, null, 2)}\n`)
  console.error(error)
  process.exitCode = 1
}
