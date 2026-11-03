#!/usr/bin/env node
/**
 * Stage 3 packaging helpers.
 *
 * The tarball, metadata, export and TypeScript checks in this module are used
 * by both the positive qualification scenarios and the negative controls. A
 * checker that only reports install success is not accepted: callers assert on
 * returned findings and on exact byte/content evidence.
 */
import { createHash } from 'node:crypto'
import { execFileSync, spawn } from 'node:child_process'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import zlib from 'node:zlib'

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

export async function sha256File(file) {
  return sha256(await fsp.readFile(file))
}

export function canonical(value) {
  return JSON.stringify(value)
}

export function deepEqual(a, b) {
  return canonical(a) === canonical(b)
}

function extractJsonAt(raw, start) {
  const opener = raw[start]
  if (opener !== '[' && opener !== '{') return null
  let depth = 0
  let inString = false
  let escaped = false
  for (let index = start; index < raw.length; index++) {
    const character = raw[index]
    if (inString) {
      if (escaped) escaped = false
      else if (character === '\\') escaped = true
      else if (character === '"') inString = false
      continue
    }
    if (character === '"') {
      inString = true
      continue
    }
    if (character === '[' || character === '{') depth += 1
    else if (character === ']' || character === '}') {
      depth -= 1
      if (depth === 0) return raw.slice(start, index + 1)
    }
  }
  return null
}

export function parsePackJson(raw) {
  // npm lifecycle output can precede and follow the JSON document. Find a
  // balanced array rather than parsing from an opening bracket to end-of-log.
  for (let i = raw.indexOf('['); i >= 0; i = raw.indexOf('[', i + 1)) {
    const document = extractJsonAt(raw, i)
    if (!document) continue
    try {
      const parsed = JSON.parse(document)
      if (Array.isArray(parsed)) return parsed
    } catch {
      // Keep scanning.
    }
  }
  return null
}

export async function runCommand({ label, command, cwd, env = {}, timeout = 600000, logDir }) {
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
  const code = await new Promise((resolve, reject) => {
    child.on('error', reject)
    child.on('close', (value, signal) => resolve({ value, signal }))
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
    await fsp.writeFile(logPath, `$ ${command}\n# cwd=${cwd}\n# exit=${code.value} signal=${code.signal ?? 'none'} timedOut=${timedOut} durationMs=${Date.now() - started}\n\n${raw}\n`)
  }
  return {
    label,
    command,
    cwd,
    exitCode: code.value,
    signal: code.signal,
    timedOut,
    durationMs: Date.now() - started,
    stdout: stdoutText,
    stderr: stderrText,
    raw,
    logPath,
  }
}

export async function walkFiles(root) {
  const out = []
  async function visit(directory) {
    const entries = await fsp.readdir(directory, { withFileTypes: true })
    for (const entry of entries) {
      const absolute = path.join(directory, entry.name)
      const relative = path.relative(root, absolute).split(path.sep).join('/')
      if (entry.isSymbolicLink()) {
        out.push({ path: relative, type: 'symlink', absolute })
      } else if (entry.isDirectory()) {
        out.push({ path: relative, type: 'directory', absolute })
        await visit(absolute)
      } else if (entry.isFile()) {
        const stat = await fsp.lstat(absolute)
        const bytes = await fsp.readFile(absolute)
        out.push({
          path: relative,
          type: 'file',
          absolute,
          size: stat.size,
          mode: stat.mode & 0o777,
          sha256: sha256(bytes),
        })
      } else {
        out.push({ path: relative, type: 'other', absolute })
      }
    }
  }
  await visit(root)
  return out
}

export async function hashTree(root) {
  const files = (await walkFiles(root)).filter((entry) => entry.type === 'file')
  return {
    files: files.map(({ path: file, size, sha256: hash }) => ({ path: file, size, sha256: hash })),
    sha256: sha256(files.map((entry) => `${entry.path}\0${entry.sha256}`).sort().join('\n')),
  }
}

function tarList(tarball) {
  const names = execFileSync('tar', ['-tzf', tarball], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
    .split('\n')
    .filter(Boolean)
  let metadata = []
  try {
    const verbose = execFileSync('tar', ['--numeric-owner', '-tvzf', tarball], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
    metadata = verbose.split('\n').filter(Boolean).map((line) => {
      // GNU tar prints uid/gid as 0/0 with an ISO date; bsdtar prints them
      // separately with a textual date. Both retain the type char and the
      // package-relative path, which are the fields used by this checker.
      const match = line.match(/^([A-Za-z-])[rwxStTs-]{9}\s+.*?\s+(package\/.*)$/)
      if (!match) return { line, parsed: false }
      return {
        parsed: true,
        type: match[1],
        name: match[2],
        line,
      }
    })
  } catch {
    metadata = []
  }
  return { names, metadata }
}

export async function inspectTarball(tarball, extractDir) {
  const gzipBytes = (await fsp.stat(tarball)).size
  const rawBytes = await fsp.readFile(tarball)
  const rawSha256 = sha256(rawBytes)
  const tarStreamSha256 = sha256(zlib.gunzipSync(rawBytes))
  const { names, metadata } = tarList(tarball)
  await fsp.rm(extractDir, { recursive: true, force: true })
  await fsp.mkdir(extractDir, { recursive: true })
  execFileSync('tar', ['-xzf', tarball, '-C', extractDir, '--no-same-owner'], { stdio: 'pipe' })
  const walked = await walkFiles(extractDir)
  const files = walked.filter((entry) => entry.type === 'file')
  const fileMap = Object.fromEntries(files.map((entry) => [entry.path, entry]))
  const duplicateNames = [...new Set(names.filter((name, index) => names.indexOf(name) !== index))]
  const parsedMetadata = metadata.filter((entry) => entry.parsed)
  const listingMetadata = Object.fromEntries(parsedMetadata.map((entry) => [entry.name, entry]))
  const archiveDirectories = parsedMetadata.filter((entry) => entry.type === 'd').map((entry) => entry.name)
  const archiveSymlinks = parsedMetadata.filter((entry) => entry.type === 'l').map((entry) => entry.name)
  const archiveOther = parsedMetadata.filter((entry) => !['-', 'd', 'l'].includes(entry.type)).map((entry) => entry.name)
  return {
    tarball,
    gzipBytes,
    rawSha256,
    tarStreamSha256,
    names,
    duplicateNames,
    metadata,
    listingParseFailures: metadata.filter((entry) => !entry.parsed).map((entry) => entry.line),
    listingMetadata,
    entries: walked,
    files,
    fileMap,
    walkedDirectories: walked.filter((entry) => entry.type === 'directory').map((entry) => entry.path),
    directories: archiveDirectories,
    symlinks: archiveSymlinks.length ? archiveSymlinks : walked.filter((entry) => entry.type === 'symlink').map((entry) => entry.path),
    other: archiveOther.length ? archiveOther : walked.filter((entry) => entry.type === 'other').map((entry) => entry.path),
    totalFileBytes: files.reduce((sum, entry) => sum + entry.size, 0),
  }
}

const CONTENT_PATTERNS = [
  'sourceMappingURL',
  'PRIVATE KEY',
  'BEGIN RSA',
  'BEGIN OPENSSH',
  'npm_[A-Za-z0-9]{36}',
  'ghp_[A-Za-z0-9]{36}',
  'AKIA[0-9A-Z]{16}',
]

export async function checkTarballManifest({ inspection, allowlist, dryRun }) {
  const failures = []
  const checks = []
  const push = (ok, name, detail) => {
    checks.push({ name, ok, detail })
    if (!ok) failures.push({ name, detail })
  }
  const expected = new Set(allowlist.files)
  const actual = new Set(inspection.files.map((entry) => entry.path))
  const unexpected = [...actual].filter((entry) => !expected.has(entry)).sort()
  const missing = [...expected].filter((entry) => !actual.has(entry)).sort()
  push(unexpected.length === 0, 'exact allowlist has no unexpected path', unexpected)
  push(missing.length === 0, 'exact allowlist has no missing path', missing)
  push(inspection.files.length === allowlist.files.length, 'file count equals allowlist', { actual: inspection.files.length, expected: allowlist.files.length })
  push(inspection.duplicateNames.length === 0, 'archive has no duplicate entry name', inspection.duplicateNames)
  push(inspection.names.length === inspection.files.length, 'archive has one entry per regular file', { names: inspection.names.length, files: inspection.files.length })
  push(inspection.directories.length === 0, 'archive has no directory entries', inspection.directories)
  push(inspection.symlinks.length === 0, 'archive has no symlink entries', inspection.symlinks)
  push(inspection.other.length === 0, 'archive has no non-regular entries', inspection.other)
  push(inspection.listingParseFailures.length === 0, 'tar verbose metadata parsed', inspection.listingParseFailures)
  const badTypes = inspection.metadata.filter((entry) => entry.parsed && entry.type !== '-')
  push(badTypes.length === 0, 'tar header type is regular file for every entry', badTypes.map((entry) => entry.line))
  const badModes = inspection.files.filter((entry) => entry.type === 'file' && entry.mode !== 0o644 && entry.mode !== 0o444)
  push(badModes.length === 0, 'packed file modes are ordinary readable files', badModes.map((entry) => ({ path: entry.path, mode: entry.mode })))
  const rootMetadata = inspection.files.map((entry) => entry.path).filter((entry) => entry.split('/').length === 2)
  push(
    rootMetadata.length === 3 && ['package/LICENSE', 'package/README.md', 'package/package.json'].every((entry) => rootMetadata.includes(entry)),
    'root metadata is only LICENSE, README.md and package.json',
    rootMetadata,
  )
  const absoluteOrTraversal = [...actual].filter((entry) => entry.startsWith('/') || entry.includes('\\') || entry.split('/').includes('..'))
  push(absoluteOrTraversal.length === 0, 'no absolute, backslash or traversal path', absoluteOrTraversal)
  const forbidden = []
  for (const entry of actual) {
    for (const pattern of allowlist.forbiddenPatterns ?? []) {
      if (CONTENT_PATTERNS.includes(pattern)) continue
      if (new RegExp(pattern).test(entry)) forbidden.push({ path: entry, pattern })
    }
  }
  push(forbidden.length === 0, 'no forbidden path pattern', forbidden)
  const contentFindings = []
  for (const entry of inspection.files) {
    if (!/\.(?:js|d\.ts|json|md)$/i.test(entry.path) && !entry.path.endsWith('LICENSE')) continue
    const text = await fsp.readFile(entry.absolute, 'utf8')
    for (const pattern of CONTENT_PATTERNS) {
      if (new RegExp(pattern).test(text)) contentFindings.push({ path: entry.path, pattern })
    }
  }
  push(contentFindings.length === 0, 'no source-map or credential pattern in packed text', contentFindings)

  if (dryRun) {
    const dryFiles = Array.isArray(dryRun.files) ? dryRun.files : []
    // npm pack --dry-run reports paths relative to the package root; the
    // archive (and tar -t) prefixes every entry with package/.
    const dryFilesNormalized = dryFiles.map((entry) => ({
      ...entry,
      path: entry.path.startsWith('package/') ? entry.path : `package/${entry.path}`,
    }))
    const dryPaths = new Set(dryFilesNormalized.map((entry) => entry.path))
    const dryUnexpected = [...dryPaths].filter((entry) => !expected.has(entry)).sort()
    const dryMissing = [...expected].filter((entry) => !dryPaths.has(entry)).sort()
    push(dryUnexpected.length === 0, 'dry-run manifest has no unexpected path', dryUnexpected)
    push(dryMissing.length === 0, 'dry-run manifest has no missing path', dryMissing)
    push(dryFilesNormalized.length === inspection.files.length, 'dry-run manifest file count equals archive', { dry: dryFilesNormalized.length, archive: inspection.files.length })
    const sizeMismatches = dryFilesNormalized.filter((entry) => inspection.fileMap[entry.path] && entry.size !== inspection.fileMap[entry.path].size)
    push(sizeMismatches.length === 0, 'dry-run manifest sizes equal archive bytes', sizeMismatches.map((entry) => ({ path: entry.path, dry: entry.size, archive: inspection.fileMap[entry.path]?.size })))
    push(dryRun.name === allowlist.package && dryRun.version === allowlist.version, 'dry-run manifest name/version match package', { name: dryRun.name, version: dryRun.version })
    push(dryRun.filename === `${allowlist.package}-${allowlist.version}.tgz`, 'dry-run filename matches package/version', dryRun.filename)
  } else {
    push(false, 'dry-run manifest is available and parseable', null)
  }

  return {
    failures,
    checks,
    summary: {
      actualFiles: [...actual].sort(),
      expectedFiles: [...expected].sort(),
      unexpected,
      missing,
      contentFindings,
      fileCount: inspection.files.length,
      gzipBytes: inspection.gzipBytes,
      totalFileBytes: inspection.totalFileBytes,
      rawSha256: inspection.rawSha256,
      tarStreamSha256: inspection.tarStreamSha256,
    },
  }
}

export function checkPackageMetadata({ packaged, repo, allowlist, inspection, repoRoot, lock }) {
  const failures = []
  const checks = []
  const push = (ok, name, detail) => {
    checks.push({ name, ok, detail })
    if (!ok) failures.push({ name, detail })
  }
  const actualNames = new Set(inspection.files.map((entry) => entry.path))
  push(deepEqual(packaged, repo), 'packed package.json deep-equals reviewed package.json', { packagedHash: sha256(canonical(packaged)), repoHash: sha256(canonical(repo)) })
  push(packaged.name === allowlist.metadata.name, 'name matches', packaged.name)
  push(packaged.version === allowlist.metadata.version, 'version matches', packaged.version)
  push(packaged.license === allowlist.metadata.license, 'license matches', packaged.license)
  push(packaged.type === allowlist.metadata.type, 'type is module', packaged.type)
  push(packaged.engines?.node === allowlist.metadata.enginesNode, 'engines.node matches', packaged.engines)
  push(packaged.sideEffects === allowlist.metadata.sideEffects, 'sideEffects matches', packaged.sideEffects)
  push(deepEqual(packaged.files, allowlist.metadata.files), 'files allowlist matches', packaged.files)
  push(packaged.main === allowlist.metadata.main, 'main matches', packaged.main)
  push(packaged.types === allowlist.metadata.types, 'types matches', packaged.types)
  push(deepEqual(packaged.exports, allowlist.metadata.exports), 'exports map matches', packaged.exports)
  push(deepEqual(Object.keys(packaged.exports ?? {}), ['.']), 'exports declares only the root subpath', Object.keys(packaged.exports ?? {}))
  for (const field of allowlist.metadata.runtimeDependencyFieldsAbsent) {
    push(!(field in packaged), `runtime dependency field ${field} is absent`, packaged[field] ?? null)
  }
  push(!packaged.dependencies || Object.keys(packaged.dependencies).length === 0, 'dependencies is empty or absent', packaged.dependencies ?? null)
  push(Boolean(packaged.devDependencies?.react), 'React appears only as a development dependency (metadata)', packaged.devDependencies?.react ?? null)
  push(!packaged.dependencies?.react && !packaged.dependencies?.['react-dom'], 'React is not a runtime dependency', packaged.dependencies ?? null)

  for (const target of [packaged.main, packaged.types, packaged.exports?.['.']?.types, packaged.exports?.['.']?.default]) {
    push(typeof target === 'string' && actualNames.has(`package/${target.replace(/^\.\//, '')}`), `declared path exists in archive: ${target}`, [...actualNames].filter((entry) => entry.endsWith(target?.replace(/^\.\//, '') ?? '')))
  }
  const jsModules = inspection.files
    .map((entry) => entry.path)
    .filter((entry) => entry.startsWith('package/dist/') && entry.endsWith('.js') && entry !== 'package/dist/dither-face.js')
  const missingDeclarations = jsModules.filter((entry) => !actualNames.has(entry.replace(/\.js$/, '.d.ts')))
  push(missingDeclarations.length === 0, 'every module JS has a matching declaration', missingDeclarations)
  push(actualNames.has('package/dist/dither-face.js'), 'documented IIFE bundle exists without a declaration pair', null)

  const readmePacked = inspection.fileMap['package/README.md']
  const licensePacked = inspection.fileMap['package/LICENSE']
  push(Boolean(readmePacked) && readmePacked.sha256 === sha256(fs.readFileSync(path.join(repoRoot, 'README.md'))), 'packed README.md equals repository README.md', { packed: readmePacked?.sha256 })
  push(Boolean(licensePacked) && licensePacked.sha256 === sha256(fs.readFileSync(path.join(repoRoot, 'LICENSE'))), 'packed LICENSE equals repository LICENSE', { packed: licensePacked?.sha256 })
  const lockVersion = lock?.packages?.['']?.version ?? lock?.version ?? null
  push(lockVersion === packaged.version, 'package-lock version agrees with package version', { lockVersion, packageVersion: packaged.version })

  return { failures, checks }
}

export function checkExportProbe(probe, expected) {
  const failures = []
  const checks = []
  const push = (ok, name, detail) => {
    checks.push({ name, ok, detail })
    if (!ok) failures.push({ name, detail })
  }
  push(deepEqual(probe.esmExports, [...expected.runtimeValueExports].sort()), 'root ESM export names exactly match documented runtime exports', { missing: probe.esmMissing, unexpected: probe.esmUnexpected })
  push(probe.esmMissing.length === 0 && probe.esmUnexpected.length === 0, 'root ESM export set has no missing or extra names', { missing: probe.esmMissing, unexpected: probe.esmUnexpected })
  push(probe.esmTypeof.ditherFace === 'function', 'ditherFace is callable from root ESM import', probe.esmTypeof)
  push(probe.esmTypeof.STYLESLength === 8, 'STYLES has eight entries from installed package', probe.esmTypeof)
  const deepOk = probe.deepImports.every((entry) => entry.resolved === false && entry.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED')
  push(deepOk, 'every unsupported ESM deep import is rejected by the exports map', probe.deepImports)
  const deepRequireOk = probe.deepRequires.every((entry) => entry.resolved === false && entry.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED')
  push(deepRequireOk, 'every unsupported CJS deep require is rejected by the exports map', probe.deepRequires)
  push(probe.packageExports && deepEqual(probe.packageExports, { '.': { types: './dist/index.d.ts', default: './dist/index.js' } }), 'installed exports map declares only the documented root', probe.packageExports)
  return { failures, checks }
}

export function checkCjsObservation(probe, expectedModernNodeMajor) {
  const failures = []
  const checks = []
  const push = (ok, name, detail) => {
    checks.push({ name, ok, detail })
    if (!ok) failures.push({ name, detail })
  }
  const major = Number(probe.node.replace(/^v/, '').split('.')[0])
  push(major === expectedModernNodeMajor, `probe runs on expected Node major ${expectedModernNodeMajor}`, probe.node)
  push(probe.cjs.succeeded === true, 'modern Node require(esm) loads the ESM package root (observed, not a universal CJS guarantee)', probe.cjs)
  push(probe.cjs.typeofDitherFace === 'function', 'require(esm) exposes callable ditherFace on tested Node', probe.cjs)
  push(probe.cjs.STYLESLength === 8, 'require(esm) exposes eight STYLES entries on tested Node', probe.cjs)
  return { failures, checks }
}

export function checkTypeScriptRun({ mode, version, valid, invalidRuns }) {
  const failures = []
  const checks = []
  const push = (ok, name, detail) => {
    checks.push({ name, ok, detail })
    if (!ok) failures.push({ name, detail })
  }
  push(valid.exitCode === 0, `TS ${version} ${mode}: strict valid consumer exits 0`, { exitCode: valid.exitCode, stderr: valid.stderr.slice(-3000) })
  const errorLines = valid.raw.split('\n').filter((line) => /error TS\d+/.test(line))
  push(errorLines.length === 0, `TS ${version} ${mode}: valid consumer has no diagnostics`, errorLines)
  for (const run of invalidRuns) {
    const diagnostics = run.raw.split('\n').filter((line) => /error TS\d+/.test(line))
    push(run.exitCode !== 0, `TS ${version} ${mode}: invalid ${run.name} exits nonzero`, { exitCode: run.exitCode })
    push(diagnostics.length > 0, `TS ${version} ${mode}: invalid ${run.name} produces a concrete diagnostic`, diagnostics.slice(0, 5))
  }
  return { failures, checks }
}

export async function ensureEmptyDirectory(directory) {
  // Use the platform rm rather than Node's recursive removal: pnpm's virtual
  // store contains symlink loops that can make libuv's recursive walk spin.
  execFileSync('rm', ['-rf', directory], { stdio: 'pipe' })
  await fsp.mkdir(directory, { recursive: true })
}

export async function copyFile(source, target) {
  await fsp.mkdir(path.dirname(target), { recursive: true })
  await fsp.copyFile(source, target)
}
