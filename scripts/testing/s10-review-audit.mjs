/**
 * Stage 10 static evidence and harness audit.
 *
 * This module consumes a compact audit index generated from the prior stages'
 * raw evidence. It verifies hashes and claims in-sandbox, then applies targeted
 * checks for the failure modes named in the Stage 10 dispatch. It never writes
 * to accepted reports, expected fixtures or product files.
 */
import fsp from 'node:fs/promises'
import path from 'node:path'
import { sha256 } from './s10-review-compare.mjs'

async function readJson(file) {
  return JSON.parse(await fsp.readFile(file, 'utf8'))
}
async function readText(file) {
  return fsp.readFile(file, 'utf8')
}
async function fileSha(file) {
  return sha256(await fsp.readFile(file))
}
function sameNumber(a, b) {
  return Number(a) === Number(b)
}
function intervalsOverlap(a, b) {
  if (!a.start || !a.end || !b.start || !b.end) return false
  return a.start < b.end && b.start < a.end
}
function actualFromRaw(raw) {
  const totals = raw.totals ?? {}
  const sourceManifest = raw.sourceManifest ?? raw.environment?.sourceManifest ?? null
  return {
    commit: raw.commit ?? sourceManifest?.commit ?? null,
    sandbox: raw.sandbox ?? raw.environment?.sandbox ?? null,
    totals: {
      scenarios: totals.scenarios ?? null,
      pass: totals.pass ?? totals.passed ?? null,
      fail: totals.fail ?? totals.failed ?? null,
      blocked: totals.blocked ?? null,
      notRun: totals.notRun ?? null,
      cases: totals.cases ?? null,
      assertions: totals.assertions ?? null,
      failures: totals.failures ?? totals.failedAssertions ?? null
    },
    sourceManifest: sourceManifest ? { sha256: sourceManifest.sha256, fileCount: sourceManifest.fileCount } : null,
    tarballSha: raw.tarball?.sha256 ?? raw.tarball?.actual ?? null
  }
}

export async function runAudit({ repo, evidenceDir, auditInput, sourceManifest, tarballPath }) {
  const checks = []
  const findings = []
  const limitations = []
  const check = (id, status, detail) => {
    const value = typeof status === 'boolean' ? (status ? 'PASS' : 'FAIL') : status
    checks.push({ id, status: value, detail })
    return value === 'PASS'
  }
  const finding = (id, severity, type, title, evidence, recommendation) => {
    findings.push({ id, severity, type, title, evidence, recommendation })
  }

  // A1 — uploaded source manifest.
  const sourceBytes = await fsp.readFile(sourceManifest.path)
  const sourceDigest = sha256(sourceBytes)
  const source = JSON.parse(sourceBytes.toString('utf8'))
  const manifestDigestParts = []
  let manifestMismatch = null
  for (const entry of source.files) {
    const bytes = await fsp.readFile(path.join(repo, entry.path))
    const actual = sha256(bytes)
    if (actual !== entry.sha256) manifestMismatch = { path: entry.path, actual, expected: entry.sha256 }
    if (bytes.length !== entry.bytes) manifestMismatch = { path: entry.path, actualBytes: bytes.length, expectedBytes: entry.bytes }
    manifestDigestParts.push(`${entry.path}\0${actual}`)
  }
  const computedManifestDigest = sha256(manifestDigestParts.join('\n'))
  check('A1-source-manifest', !manifestMismatch && computedManifestDigest === source.sha256 && source.files.length === auditInput.sourceFileCount,
    { commit: source.commit, files: source.files.length, digest: computedManifestDigest, expected: source.sha256, sourceManifestFileSha: sourceDigest, mismatch: manifestMismatch })
  if (sourceDigest !== auditInput.sourceManifestFileSha256) {
    check('A1b-source-manifest-file', false, { actual: sourceDigest, expected: auditInput.sourceManifestFileSha256 })
  } else {
    check('A1b-source-manifest-file', true, { sha256: sourceDigest })
  }

  // A2 — approved tarball.
  const tarballBytes = await fsp.readFile(tarballPath)
  const tarballSha = sha256(tarballBytes)
  check('A2-tarball-hash', tarballSha === auditInput.tarball.sha256 && tarballBytes.length === auditInput.tarball.bytes,
    { sha256: tarballSha, bytes: tarballBytes.length, expectedSha: auditInput.tarball.sha256, expectedBytes: auditInput.tarball.bytes })
  if (tarballSha !== auditInput.tarball.sha256) {
    finding('S10-A2', 'S0', 'audit-gap', 'Approved tarball hash mismatch', `actual ${tarballSha}`, 'Stop and retrieve the approved artifact.')
  }

  // A3/A4 — per-stage report/raw hash and claim consistency.
  for (const stage of auditInput.stages) {
    const reportPath = path.join(repo, stage.report)
    const reportSha = await fileSha(reportPath)
    const rawPath = path.join(evidenceDir, stage.raw)
    let rawSha = null
    let raw = null
    try {
      rawSha = await fileSha(rawPath)
      raw = await readJson(rawPath)
    } catch (error) {
      check(`A3-${stage.id}-raw`, false, { error: error.message, rawPath })
      finding(`S10-A3-${stage.id}`, 'S1', 'audit-gap', `Raw evidence missing for ${stage.id}`, rawPath, 'Retrieve the raw evidence before accepting the stage.')
      continue
    }
    check(`A3-${stage.id}-report-hash`, reportSha === stage.reportSha256, { actual: reportSha, expected: stage.reportSha256 })
    check(`A3-${stage.id}-raw-hash`, rawSha === stage.rawSha256, { actual: rawSha, expected: stage.rawSha256 })
    if (reportSha !== stage.reportSha256) finding(`S10-A3-${stage.id}-report`, 'S1', 'audit-gap', `${stage.id} report hash mismatch`, reportSha, 'Re-retrieve the report and reconcile the evidence index.')
    if (rawSha !== stage.rawSha256) finding(`S10-A3-${stage.id}-raw`, 'S1', 'audit-gap', `${stage.id} raw evidence hash mismatch`, rawSha, 'Re-retrieve the raw evidence and reconcile the evidence index.')

    const actual = actualFromRaw(raw)
    const totalsMatch = Object.entries(stage.totals).every(([key, value]) => actual.totals[key] === null || sameNumber(actual.totals[key], value))
    const claimsMatch =
      (!actual.commit || actual.commit === stage.commit) &&
      (!actual.sandbox || actual.sandbox === stage.sandbox) &&
      totalsMatch &&
      (!actual.sourceManifest || (actual.sourceManifest.sha256 === stage.sourceManifest.sha256 && sameNumber(actual.sourceManifest.fileCount, stage.sourceManifest.fileCount))) &&
      (!actual.tarballSha || actual.tarballSha === stage.tarballSha)
    check(`A4-${stage.id}-claims`, claimsMatch, { claimed: stage, actual })
    if (!claimsMatch) finding(`S10-A4-${stage.id}`, 'S1', 'audit-gap', `${stage.id} report/raw claim mismatch`, { claimed: stage, actual }, 'Reconcile report prose with the raw result before disposition.')

    // Expected fixture and harness bytes at the audited revision.
    if (stage.expected) {
      const expectedPath = path.join(repo, stage.expected.path)
      const expectedSha = await fileSha(expectedPath)
      check(`A5-${stage.id}-expected`, expectedSha === stage.expected.sha256, { path: stage.expected.path, actual: expectedSha, expected: stage.expected.sha256 })
      if (expectedSha !== stage.expected.sha256) finding(`S10-A5-${stage.id}`, 'S1', 'audit-gap', `${stage.id} expected fixture changed`, { path: stage.expected.path, actual: expectedSha, expected: stage.expected.sha256 }, 'Re-run the affected stage with the unmodified expected fixture.')
    }
    for (const harness of stage.harness ?? []) {
      const harnessPath = path.join(repo, harness.path)
      const harnessSha = await fileSha(harnessPath)
      check(`A6-${stage.id}-harness-${path.basename(harness.path)}`, harnessSha === harness.sha256, { path: harness.path, actual: harnessSha, expected: harness.sha256 })
      if (harnessSha !== harness.sha256) finding(`S10-A6-${stage.id}-${path.basename(harness.path)}`, 'S1', 'audit-gap', `${stage.id} harness changed`, { path: harness.path, actual: harnessSha, expected: harness.sha256 }, 'Do not attribute the recorded result to a different harness revision.')
    }

    // Stale status labels.
    if (stage.reportHeaderClaim !== stage.disposition) {
      check(`A7-${stage.id}-stale-label`, true, { reportHeaderClaim: stage.reportHeaderClaim, parentDisposition: stage.disposition })
      finding(`S10-A7-${stage.id}`, 'S2', 'audit-gap', `${stage.id} report header is stale`, `${stage.report} says ${stage.reportHeaderClaim}; execution log records ${stage.disposition}`, 'Parent updates the master disposition; do not edit accepted results.')
    } else {
      check(`A7-${stage.id}-stale-label`, true, { claim: stage.reportHeaderClaim })
    }
  }

  // A8 — master status documents.
  const masterFiles = Object.values(auditInput.master).filter(entry => entry?.path)
  for (const entry of masterFiles) {
    const text = await readText(path.join(repo, entry.path))
    const approved = Number((text.match(/(\d+)\s*(?:\/|of)\s*80/) ?? [])[1] ?? NaN)
    if (Number.isNaN(approved)) {
      check(`A8-${entry.path}-approved`, true, { file: entry.path, approvedClaim: null, note: 'no aggregate approved count claimed in this file' })
    } else {
      check(`A8-${entry.path}-approved`, approved === auditInput.computedApproved, { file: entry.path, approvedClaim: approved, computedApproved: auditInput.computedApproved })
    }
    if (entry.path.includes('MATRIX') || entry.path.includes('REPORT') || entry.path.includes('PLAN')) {
      if (/55 NOT RUN/.test(text) && auditInput.computedApproved !== 16) {
        check(`A8-${entry.path}-notrun`, false, { file: entry.path, claim: '55 NOT RUN', computedApproved: auditInput.computedApproved })
      } else {
        check(`A8-${entry.path}-notrun`, true, { file: entry.path })
      }
    }
  }
  const masterInconsistent = checks.filter(c => c.id.startsWith('A8-') && c.status === 'FAIL')
  if (masterInconsistent.length) {
    finding('S10-A8', 'S2', 'audit-gap', 'Master qualification status is stale and internally inconsistent',
      masterInconsistent.map(c => c.detail), 'Parent must update MATRIX/PLAN/REPORT/FINDINGS from the execution log before any final disposition; no agent may edit master status.')
  }

  // A9 — hidden skips.
  const browserText = (await Promise.all((await fsp.readdir(path.join(repo, 'tests/browser'))).filter(f => f.endsWith('.ts')).map(f => readText(path.join(repo, 'tests/browser', f))))).join('\n')
  const testSkips = [...browserText.matchAll(/test\.skip\(([^\n]*)/g)].map(m => m[1])
  check('A9-browser-skips', testSkips.length === 1 && /clipboard/i.test(testSkips[0]), { count: testSkips.length, reasons: testSkips })
  if (testSkips.length !== 1) finding('S10-A9-browser', 'S1', 'audit-gap', 'Unexpected browser skip count', testSkips, 'Every skip needs a reason and parent acknowledgement.')
  const harnessFiles = (await fsp.readdir(path.join(repo, 'scripts/testing'))).filter(f => f.endsWith('.mjs'))
  const skipHits = []
  for (const file of harnessFiles) {
    const text = await readText(path.join(repo, 'scripts/testing', file))
    if (/\.skip\s*\(|\.todo\s*\(|process\.env\.[A-Z_]*SKIP/.test(text)) skipHits.push(file)
  }
  check('A9-harness-skips', skipHits.length === 0, { files: skipHits })
  if (skipHits.length) finding('S10-A9-harness', 'S1', 'audit-gap', 'Hidden skip construct in a qualification harness', skipHits, 'Remove the skip or declare it as an observed BLOCKED result.')

  // A10 — exact pixel comparator.
  const s2svg = await readText(path.join(repo, 'scripts/testing/s2-svg.mjs'))
  const exactComparator = /accepted:\s*differingPixels === 0/.test(s2svg) && /eligiblePixels:\s*totalPixels/.test(s2svg) && /eligibleFraction:\s*totalPixels > 0 \? 1 : 0/.test(s2svg)
  check('A10-pixel-comparator', exactComparator, { file: 'scripts/testing/s2-svg.mjs', exactComparator })
  if (!exactComparator) finding('S10-A10', 'S0', 'audit-gap', 'S2 full-pixel comparator is not exact', 'scripts/testing/s2-svg.mjs', 'Re-run S2-05 with an exact full-box comparator.')

  // A11 — known stale harness expectations in S8-R1.
  const s8 = await readText(path.join(repo, 'scripts/testing/s8-qualify.mjs'))
  const s8Stale = /statusState,\s*'loading'/.test(s8)
  check('A11-s8-stale-expectation', true, { s8StaticStatusLoadingLiteral: s8Stale, meaning: s8Stale ? 'S8-03 expects loading while the fixed product correctly reports failed' : 'not present' })
  if (s8Stale) finding('S10-A11-s8', 'S1', 'audit-gap', 'S8-03 harness still expects the pre-fix loading state', 'scripts/testing/s8-qualify.mjs: static HTML labels without JS chromium', 'Fix the harness expectation and re-run S8-03; the product fallback itself is independently checked in this review. Not a product defect.')
  const s6 = await readText(path.join(repo, 'scripts/testing/s6-cases-a.mjs'))
  const s6Stale = /injected\.scripts <= 1/.test(s6)
  check('A11-s6-stale-expectation', true, { s6OneScriptLiteral: s6Stale, meaning: s6Stale ? 'S6-05 expects at most one script; the fixed site has bootstrap.js + app.js' : 'not present' })
  if (s6Stale) finding('S10-A11-s6', 'S1', 'audit-gap', 'S6-05 harness still expects the pre-fix one-script site', 'scripts/testing/s6-cases-a.mjs: script-tag-injection', 'Fix the harness expectation and re-run S6-05; injection behavior itself is independently checked in this review. Not a product defect.')

  // A12 — weak negative control in S3-R1.
  const s3controls = await readText(path.join(repo, 'scripts/testing/s3-controls.mjs'))
  const nc5Weak = /mutatedRejected:\s*mutated !== golden/.test(s3controls) && !/compareFullPixels|compareGolden/.test(s3controls.slice(s3controls.indexOf('S3-NC5'), s3controls.indexOf('S3-NC5') + 1800))
  check('A12-s3-nc5', true, { weakHashOnly: nc5Weak, file: 'scripts/testing/s3-controls.mjs' })
  if (nc5Weak) finding('S10-A12', 'S2', 'audit-gap', 'S3-NC5 is a tautological hash-inequality control', 'scripts/testing/s3-controls.mjs: S3-NC5 recomputes SHA-256 of two different strings instead of passing a one-byte mutation through the golden comparator', 'Replace NC5 with a control that uses the real golden acceptance function; do not count the current NC5 as proof of comparator sensitivity.')

  // A13 — golden provenance.
  const golden = await readJson(path.join(repo, 'tests/qualification/s3/fixtures/golden.json'))
  const preview = await readJson(path.join(repo, 'src/fixtures/preview.json'))
  const previewMap = new Map(preview.records.map(record => [record.style, record.sha256]))
  const goldenMatchesPreview = golden.styles.every(style => previewMap.get(style.slug) === style.sha256)
  check('A13-golden-provenance', true, { goldenMatchesProductPreview: goldenMatchesPreview, styleCount: golden.styles.length })
  if (goldenMatchesPreview) {
    limitations.push('The eight-style golden fixture is byte-identical to the product-tracked src/fixtures/preview.json snapshot. It is a regression anchor transcribed from parent-accepted S2-08, not an independent renderer oracle; only the ascii-letter historical baseline and the S1 oracle provide a second implementation path.')
  }

  // A14 — self-comparison usage in S6.
  const s6Self = (s6.match(/compareSvg\(ctx\.lib\./g) ?? []).length
  check('A14-self-comparison', true, { s6LibraryComparisons: s6Self, note: 'S6 non-golden cases compare the UI source to the same built library; the eight golden cases anchor all styles.' })
  if (s6Self > 0) limitations.push(`S6 uses ${s6Self} non-golden assertions that compare the page to the same built library; these validate UI state propagation, not independent product correctness.`)

  // A15 — copied/resumed results in final runs.
  const resumeProblems = []
  for (const stage of auditInput.stages) {
    const rawPath = path.join(evidenceDir, stage.raw)
    try {
      const raw = await readJson(rawPath)
      if (raw.resume && Object.values(raw.resume).some(Boolean)) resumeProblems.push({ stage: stage.id, resume: raw.resume })
      if (raw.reused || raw.copiedResults) resumeProblems.push({ stage: stage.id, reused: raw.reused ?? raw.copiedResults })
    } catch {}
  }
  check('A15-copied-results', resumeProblems.length === 0, { problems: resumeProblems })
  if (resumeProblems.length) finding('S10-A15', 'S0', 'audit-gap', 'Final evidence contains resumed or copied results', resumeProblems, 'Use a single non-resumed final run for each accepted stage.')

  // A16 — overlapping process intervals.
  const overlaps = []
  for (let i = 0; i < auditInput.intervals.length; i += 1) {
    for (let j = i + 1; j < auditInput.intervals.length; j += 1) {
      if (intervalsOverlap(auditInput.intervals[i], auditInput.intervals[j])) overlaps.push([auditInput.intervals[i].id, auditInput.intervals[j].id])
    }
  }
  check('A16-overlap', overlaps.length === 0, { intervals: auditInput.intervals, overlaps })
  if (overlaps.length) finding('S10-A16', 'S1', 'audit-gap', 'Overlapping qualification processes', overlaps, 'Re-run affected phases sequentially with unique output.')

  // A17 — sandbox identity and orphan attempts.
  const sandboxes = auditInput.stages.map(stage => stage.sandbox)
  const duplicateSandboxes = sandboxes.filter((name, index) => sandboxes.indexOf(name) !== index)
  check('A17-sandbox-identity', duplicateSandboxes.length === 0, { sandboxes, duplicateSandboxes })
  if (duplicateSandboxes.length) finding('S10-A17', 'S1', 'audit-gap', 'A sandbox is reused across stages', duplicateSandboxes, 'Each stage needs a dedicated sandbox.')
  if (auditInput.orphanAttempts?.length) {
    check('A17b-orphan-attempts', false, { orphanAttempts: auditInput.orphanAttempts })
    finding('S10-A17b', 'S3', 'audit-gap', 'Unaccounted sandbox/attempt exists outside the evidence set', auditInput.orphanAttempts, 'Parent reconciles or deletes the orphan attempt; it cannot contribute to qualification.')
  } else {
    check('A17b-orphan-attempts', true, { orphanAttempts: [] })
  }

  // A18 — lockfile provenance.
  const s4report = await readText(path.join(repo, 'docs/testing/evidence/S4.md'))
  const s4Bootstrapped = /Lockfiles were bootstrapped in the same dedicated sandbox/i.test(s4report)
  check('A18-lock-provenance', true, { s4LockfilesBootstrappedInSandbox: s4Bootstrapped })
  if (s4Bootstrapped) limitations.push('S4 reports that its consumer lockfiles were bootstrapped in the same dedicated sandbox and then used as tracked inputs; they were unchanged by the final npm ci, but they were not supplied as pre-run independent locks.')

  // A19 — browser/server scope.
  const s8Expected = await readJson(path.join(repo, 'tests/qualification/s8/expected-results.json'))
  const safariBlocked = s8Expected.expectations?.['S8-09']?.expectedStatus === 'BLOCKED'
  check('A19-browser-scope', safariBlocked, { nativeSafariBlocked: safariBlocked })
  if (!safariBlocked) finding('S10-A19', 'S1', 'audit-gap', 'Native Safari is not marked BLOCKED', 'tests/qualification/s8/expected-results.json', 'Do not substitute Linux WebKit for native Safari.')

  // A20 — resource budgets.
  const budgetOverruns = auditInput.intervals.filter(entry => entry.seconds > 1800)
  check('A20-resource-budget', budgetOverruns.length === 0, { intervals: auditInput.intervals, overruns: budgetOverruns })
  if (budgetOverruns.length) finding('S10-A20', 'S1', 'audit-gap', 'Sandbox active budget exceeded', budgetOverruns, 'Stop and retrieve at the cap; a fresh run is required.')

  // A21 — limitations presented as PASS.
  const headlineConflicts = []
  for (const item of auditInput.headlineConflicts ?? []) {
    const text = await readText(path.join(repo, item.report))
    if (text.includes(item.mustContain)) headlineConflicts.push({ report: item.report, headline: item.mustContain, actual: item.actual })
  }
  check('A21-limitations-as-pass', headlineConflicts.length === 0, { conflicts: headlineConflicts })
  if (headlineConflicts.length) finding('S10-A21', 'S2', 'audit-gap', 'A report headline presents a partial result as a full PASS', headlineConflicts, 'Correct the label and let the parent disposition the actual FAIL rows; do not accept the stage as all-PASS.')

  const pass = checks.filter(entry => entry.status === 'PASS').length
  const fail = checks.filter(entry => entry.status === 'FAIL').length
  return {
    generatedAt: new Date().toISOString(),
    status: fail === 0 ? 'PASS' : 'FAIL',
    totals: { checks: checks.length, pass, fail },
    checks,
    findings,
    limitations
  }
}
