import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const fixtures: string[] = []
afterEach(() => fixtures.splice(0).forEach(path => rmSync(path, { recursive: true, force: true })))

function repository(version = '0.1.0') {
  const cwd = mkdtempSync(join(tmpdir(), 'palletface-release-test-'))
  fixtures.push(cwd)
  mkdirSync(join(cwd, 'scripts'))
  copyFileSync(new URL('../scripts/check-release.mjs', import.meta.url), join(cwd, 'scripts/check-release.mjs'))
  writeFileSync(join(cwd, 'package.json'), JSON.stringify({ version }))
  writeFileSync(join(cwd, '.gitignore'), 'dist/\n')
  const git = (...args: string[]) => execFileSync('git', args, { cwd, stdio: 'pipe' })
  git('init', '-b', 'main')
  git('add', '.')
  git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-m', 'test: create release fixture')
  git('tag', `v${version}`)
  git('update-ref', 'refs/remotes/origin/main', 'HEAD')
  const run = (tag = `v${version}`, branch = 'main') => execFileSync(process.execPath, ['scripts/check-release.mjs', tag], {
    cwd,
    encoding: 'utf8',
    stdio: 'pipe',
    env: { ...process.env, RELEASE_BRANCH: branch },
  })
  return { cwd, git, run }
}

describe('release guard', () => {
  it('accepts a matching clean tagged commit on main and ignores generated files', () => {
    const { cwd, run } = repository()
    mkdirSync(join(cwd, 'dist'))
    writeFileSync(join(cwd, 'dist/generated.js'), '// ignored')
    expect(run()).toContain('PASS release gate')
  })

  it('accepts a semver prerelease tag', () => {
    const { run } = repository('1.1.0-rc.1')
    expect(run()).toContain('PASS release gate')
  })

  it('accepts a reviewed release branch other than main', () => {
    const { git, run } = repository()
    git('update-ref', 'refs/remotes/origin/cleanup', 'HEAD')
    expect(run('v0.1.0', 'cleanup')).toContain('on cleanup')
  })

  it('rejects malformed input, wrong version, and untracked or tracked changes', () => {
    const { cwd, run } = repository()
    expect(() => run('bad; echo unsafe')).toThrow()
    expect(() => run('v0.2.0')).toThrow()
    writeFileSync(join(cwd, 'untracked.txt'), 'not reviewed')
    expect(() => run()).toThrow()
    rmSync(join(cwd, 'untracked.txt'))
    writeFileSync(join(cwd, 'package.json'), '{"version":"0.1.0","extra":true}')
    expect(() => run()).toThrow()
  })

  it('rejects a checkout that differs from its tag or is not on main', () => {
    const { cwd, git, run } = repository()
    writeFileSync(join(cwd, 'new.txt'), 'new commit')
    git('add', '.')
    git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-m', 'test: add release fixture commit')
    expect(() => run()).toThrow()
    git('tag', '-f', 'v0.1.0')
    expect(() => run()).toThrow()
  })
})
