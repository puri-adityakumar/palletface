#!/usr/bin/env node
/**
 * Build the tracked-source manifest uploaded to the Stage 9 site sandbox.
 * Only git-tracked files are included; node_modules, out/, .git and local
 * artifacts are never part of the upload boundary.
 */
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import fsp from 'node:fs/promises'
import path from 'node:path'

const args = process.argv.slice(2)
function arg(name, fallback = null) {
  const index = args.indexOf(`--${name}`)
  return index >= 0 ? args[index + 1] : fallback
}
const repo = path.resolve(arg('repo', process.cwd()))
const out = path.resolve(arg('out'))
const commit = arg('commit')
if (!out || !commit) throw new Error('usage: perf-site-manifest.mjs --repo <repo> --out <manifest.json> --commit <sha>')

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

const output = execFileSync('git', ['ls-files', '-z'], { cwd: repo, maxBuffer: 64 * 1024 * 1024 })
const paths = output.toString('utf8').split('\0').filter(Boolean).sort()
const files = []
for (const relative of paths) {
  const buffer = await fsp.readFile(path.join(repo, relative))
  files.push({
    path: relative.split(path.sep).join('/'),
    bytes: buffer.length,
    sha256: sha256(buffer)
  })
}
const manifest = {
  stage: 'S9-SITE',
  commit,
  createdAt: new Date().toISOString(),
  fileCount: files.length,
  files,
  sha256: sha256(files.map(file => `${file.path}\0${file.sha256}`).join('\n'))
}
await fsp.mkdir(path.dirname(out), { recursive: true })
await fsp.writeFile(out, `${JSON.stringify(manifest, null, 2)}\n`)
console.log(JSON.stringify({
  out,
  commit,
  fileCount: manifest.fileCount,
  sha256: manifest.sha256
}, null, 2))
