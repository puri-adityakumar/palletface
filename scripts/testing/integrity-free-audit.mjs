#!/usr/bin/env node
/**
 * S10-INTEGRITY-FREE-R1 — evidence-integrity closure auditor.
 *
 * Purpose: independent recheck of the qualification documentation set and the
 * selected raw evidence (S8-R2, S3-COMPARATOR-R1) supporting F-01/F-03 closure
 * review. No dependencies. Runs in a dedicated sandbox, never on the host.
 *
 * Checks:
 *  - matrix accounting (63 PASS / 1 BLOCKED / 12 REVIEW REQUIRED / 4 NOT RUN = 80)
 *  - current-header consistency across PLAN/REPORT/DISPOSITIONS/MATRIX/FINDINGS
 *  - stale 54/80 summaries appear only in explicitly historical context
 *  - S3 comparator acceptance, NC5 withdrawal, rejected resumed S3 retention
 *  - S8-R1 separate historical failure not credited; S8-R2 hashes verified
 *  - S3-COMPARATOR-R1 raw summary.json totals/controls/hash/commit agreement
 *  - S10-R1 historical 4/5 FAIL record not rewritten; FINAL partial scope
 *  - scope limits not waived (Safari, S9 budgets, S11)
 *  - negative controls: same check code must fail on mutated inputs
 *
 * Exit code 0 iff every check passes and every negative control is detected.
 * Findings (soft documentation contradictions) are reported, not failings.
 *
 * Usage:
 *   node integrity-free-audit.mjs --docs <dir> --raw-s8r2 <dir> \
 *     --raw-s3cmp <dir> --out <dir> --commit <sha> --sandbox <name>
 */

import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const m = process.argv[i].match(/^--([a-z0-9-]+)$/);
  if (m && i + 1 < process.argv.length) args[m[1]] = process.argv[++i];
}
for (const k of ["docs", "raw-s8r2", "raw-s3cmp", "out", "commit", "sandbox"]) {
  if (!args[k]) fail(`missing --${k}`);
}

const OUT = args.out;
fs.mkdirSync(OUT, { recursive: true });

const SHA = (buf) => createHash("sha256").update(buf).digest("hex");
const HEADER = "63 PASS, 1 BLOCKED, 12 REVIEW REQUIRED, 4 NOT RUN";
const TARBALL_SHA = "ed4c359b1b023e9b68a584334faef914390372f5e589b8c28d569b6932c20021";
const EVIDENCE_TAR_SHA = "4f34c432a017ac74751eed8d37da473b4e95bb97538e2bda95506fc0394512df";
const S8R2_COMMIT_PREFIX = "7ac425d";
const S3CMP_COMMIT = "c44471e4ee961b6ced468312fbec09956d90940e";
const S3CMP_SANDBOX = "dither-face-q-codex-s3-comparator-20261109-r8q3";

function fail(msg) {
  process.stderr.write(`integrity-free-audit: ${msg}\n`);
  process.exit(2);
}

function readDoc(rel) {
  const p = path.join(args.docs, rel);
  return fs.readFileSync(p, "utf8");
}

function findLine(text, needle) {
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) if (lines[i].includes(needle)) return i + 1;
  return -1;
}

function checkLineRefs(text, baseFile, needles) {
  // Return file:line refs for each needle; null if any needle is missing.
  const out = [];
  for (const n of needles) {
    const ln = findLine(text, n);
    if (ln < 0) return null;
    out.push(`${baseFile}:${ln}`);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Matrix parsing
// ---------------------------------------------------------------------------
function parseMatrix(text) {
  const rows = [];
  const stageCounts = [];
  let current = null;
  for (const line of text.split("\n")) {
    const st = line.match(/^### Stage (\d+)/);
    if (st) { if (current) stageCounts.push(current); current = 0; continue; }
    const cells = line.split("|").map((c) => c.trim());
    if (cells.length < 7) continue;
    const id = cells[1];
    if (!/^S\d+-\d{2}$/.test(id)) continue;
    const statusRaw = (cells[6] || "").replace(/\*\*/g, "").trim();
    let status = null;
    if (statusRaw.startsWith("PASS")) status = "PASS";
    else if (statusRaw.startsWith("BLOCKED")) status = "BLOCKED";
    else if (statusRaw.startsWith("REVIEW REQUIRED")) status = "REVIEW";
    else if (statusRaw.startsWith("NOT RUN")) status = "NOTRUN";
    if (!status) continue;
    rows.push({ id, status });
    if (current !== null) current++;
  }
  if (current) stageCounts.push(current);
  const counts = { PASS: 0, BLOCKED: 0, REVIEW: 0, NOTRUN: 0 };
  for (const r of rows) counts[r.status]++;
  return { rows, counts, stageCounts };
}

// ---------------------------------------------------------------------------
// S8-R2 SHA256SUMS verification
// ---------------------------------------------------------------------------
function verifyShaSums(sumsText, root) {
  const entries = [];
  for (const line of sumsText.split("\n")) {
    const m = line.match(/^([0-9a-f]{64})  (.+)$/);
    if (m) entries.push({ sha: m[1], file: m[2] });
  }
  const results = { entries: entries.length, verified: 0, skipped: [], mismatched: [] };
  for (const e of entries) {
    const p = path.join(root, e.file);
    if (!fs.existsSync(p)) { results.skipped.push(e.file); continue; }
    const h = SHA(fs.readFileSync(p));
    if (h === e.sha) results.verified++;
    else results.mismatched.push(e.file);
  }
  return results;
}

// ---------------------------------------------------------------------------
// Check implementations. Each returns {status, detail} with status PASS|FAIL.
// `doc` is a map of file name -> content. Negative-control variants call the
// SAME functions with mutated inputs.
// ---------------------------------------------------------------------------
function makeChecks(doc, raw) {
  const checks = [];
  const add = (id, status, detail) => checks.push({ id, status, detail });

  // -- input presence --------------------------------------------------------
  const required = [
    "DISPOSITIONS.md", "MATRIX.md", "PLAN.md", "REPORT.md", "FINDINGS.md",
    "EXECUTION-LOG.md", "evidence/S10-R1.md", "evidence/S3-COMPARATOR-R1.md",
    "evidence/S3-R1.md", "evidence/S3.md", "evidence/S8-R2.md",
    "evidence/FINAL-20261109.md",
  ];
  const missing = required.filter((f) => !doc[f]);
  add("input.files", missing.length === 0 ? "PASS" : "FAIL",
    missing.length === 0 ? `${required.length} required documents present` : `missing: ${missing.join(", ")}`);

  // -- matrix accounting -----------------------------------------------------
  const matrix = parseMatrix(doc["MATRIX.md"] || "");
  const expect = { PASS: 63, BLOCKED: 1, REVIEW: 12, NOTRUN: 4 };
  const okCounts = Object.keys(expect).every((k) => matrix.counts[k] === expect[k]);
  const total = matrix.rows.length;
  add("matrix.rowcount", okCounts && total === 80 ? "PASS" : "FAIL",
    `rows=${total} counts=${JSON.stringify(matrix.counts)} expected=${JSON.stringify(expect)}`);

  const stageExpect = [8, 8, 8, 7, 7, 9, 8, 9, 7, 5, 4];
  const stagesOk = stageExpect.every((n, i) => matrix.stageCounts[i] === n);
  add("matrix.stagegrid", stagesOk ? "PASS" : "FAIL",
    `per-stage rows=${JSON.stringify(matrix.stageCounts)} expected=${JSON.stringify(stageExpect)}`);

  // -- current headers --------------------------------------------------------
  const headerDocs = ["DISPOSITIONS.md", "MATRIX.md", "PLAN.md", "REPORT.md"];
  const headerMissing = headerDocs.filter((f) => !(doc[f] || "").includes(HEADER));
  const datedMissing = headerDocs.filter((f) => !(doc[f] || "").includes("2026-11-09"));
  add("headers.current", headerMissing.length === 0 && datedMissing.length === 0 ? "PASS" : "FAIL",
    `numeric header absent: ${headerMissing.join(",") || "none"}; date absent: ${datedMissing.join(",") || "none"}`);

  const findings = (doc["FINDINGS.md"] || "");
  const findingsOk = findings.includes("2026-11-09")
    && findings.includes("S10-04 evidence-integrity FAIL")
    && findings.includes("S9-O1 is OPEN and not waived")
    && findings.includes("NC5 sensitivity credit is withdrawn");
  add("headers.findings", findingsOk ? "PASS" : "FAIL",
    "FINDINGS.md current-status header must date 2026-11-09 and match DISPOSITIONS state");

  // -- stale 54/80 only in explicitly historical context ---------------------
  // A dated chronological log section (## 2026-11-…) is itself historical
  // context; status documents need an on-line historical marker.
  const staleBad = [];
  const staleHist = [];
  for (const f of ["DISPOSITIONS.md", "MATRIX.md", "PLAN.md", "REPORT.md", "FINDINGS.md", "EXECUTION-LOG.md"]) {
    const lines = (doc[f] || "").split("\n");
    let inDatedSection = false;
    lines.forEach((line, i) => {
      if (/^## \d{4}-\d{2}-\d{2} /.test(line)) inDatedSection = true;
      if (!/54 PASS|54\/80|old 54 count/.test(line)) return;
      const ref = `${f}:${i + 1}`;
      const onLineHistorical = /historical|superseded|accounting|omitted|old 54/i.test(line);
      const datedLogSection = f === "EXECUTION-LOG.md" && inDatedSection;
      if (onLineHistorical || datedLogSection) staleHist.push(`${ref}(${onLineHistorical ? "line" : "dated-log-section"})`);
      else staleBad.push(ref);
    });
  }
  add("stale54.historical-only", staleBad.length === 0 ? "PASS" : "FAIL",
    `54-summaries in historical context: ${staleHist.join(", ") || "none"}; unflagged: ${staleBad.join(", ") || "none"}`);

  // -- S3 comparator acceptance / NC5 withdrawal / rejected resumed S3 -------
  const s3c = doc["evidence/S3-COMPARATOR-R1.md"] || "";
  const s3cOk = /Parent disposition \(2026-11-09\): ACCEPTED/.test(s3c)
    && /Parent disposition: PENDING/.test(s3c)
    && /F-02 is CLOSED/.test(s3c)
    && /no retroactive credit/.test(s3c)
    && /always[- ]accept mutant|always return .equal: true.|faulty comparator/i.test(s3c)
    && /helper|adjacen/i.test(s3c);
  add("s3.comparator-accepted", s3cOk ? "PASS" : "FAIL",
    "S3-COMPARATOR-R1 must carry current ACCEPTED parenthetical while retaining the original PENDING record, F-02 closure, no retroactive NC5 credit, faulty-mutant exposure and helper adjacency");

  const s3Withdrawn = (doc["MATRIX.md"] || "").includes("NC5 sensitivity credit is withdrawn")
    && (doc["MATRIX.md"] || "").includes("Historical hash-only NC5 receives no credit")
    && (doc["DISPOSITIONS.md"] || "").includes("hash-only NC5 claim withdrawn")
    && (doc["REPORT.md"] || "").includes("Historical NC5 credit is withdrawn")
    && (doc["EXECUTION-LOG.md"] || "").includes("without retroactive credit to the old NC5");
  add("s3.nc5-withdrawn", s3Withdrawn ? "PASS" : "FAIL",
    "NC5 withdrawal must appear in MATRIX (x2), DISPOSITIONS, REPORT and EXECUTION-LOG");

  const s3 = doc["evidence/S3.md"] || "";
  const s3Rejected = s3.includes("--resume-from")
    && (doc["REPORT.md"] || "").includes("rejected resumed S3 remains rejected")
    && (doc["evidence/S3-R1.md"] || "").includes("original rejected resumed S3 remains rejected and retained");
  add("s3.original-rejected", s3Rejected ? "PASS" : "FAIL",
    "resumed S3 record (evidence/S3.md --resume-from) retained; REPORT/S3-R1 keep it rejected");

  // -- S8 R1/R2 ----------------------------------------------------------------
  const s10r1 = doc["evidence/S10-R1.md"] || "";
  const s8r2 = doc["evidence/S8-R2.md"] || "";
  const s8Sep = s10r1.includes("7 PASS / 1 FAIL / 1 BLOCKED")
    && s10r1.includes("7c86da9")
    && s10r1.includes("test/s8-r1")
    && s8r2.includes(S8R2_COMMIT_PREFIX)
    && s8r2.includes(EVIDENCE_TAR_SHA)
    && !s8r2.includes("FULL BROWSER SUITE PASS");
  add("s8r2.separate-r1", s8Sep ? "PASS" : "FAIL",
    "S10-R1 records S8-R1 as separate historical 7/1/1 failure at 7c86da9; S8-R2 carries run commit 7ac425d and tar hash; stale S8-R1 headline absent from S8-R2");

  const hashes = raw.sumsText ? verifyShaSums(raw.sumsText, raw.s8r2Root) : null;
  const keyFiles = ["source-manifest.json", "playwright-summary.json", "retrieval.json",
    "sandbox-create.json", "environment.txt", "playwright-results.json"];
  const keyMissing = hashes ? keyFiles.filter((f) => hashes.skipped.includes(f) || hashes.mismatched.includes(f)) : ["SHA256SUMS not uploaded"];
  const sumsRecordedInReport = s8r2.includes(EVIDENCE_TAR_SHA);
  const tarSumsMatch = !!raw.sumsText
    && new RegExp(`^${EVIDENCE_TAR_SHA}  evidence\\.tar\\.gz$`, "m").test(raw.sumsText);
  const hashesOk = hashes && hashes.mismatched.length === 0 && keyMissing.length === 0
    && hashes.verified >= 8 && sumsRecordedInReport && tarSumsMatch;
  add("s8r2.hashes", hashesOk ? "PASS" : "FAIL",
    hashes ? `SHA256SUMS entries=${hashes.entries} verified=${hashes.verified} skipped=${hashes.skipped.length} mismatched=${hashes.mismatched.join(",") || "none"}; evidence-tar sha recorded in S8-R2.md=${sumsRecordedInReport} and in SHA256SUMS=${tarSumsMatch}` : "raw S8-R2 SHA256SUMS unavailable");

  // -- S3-COMPARATOR-R1 raw summary agreement ---------------------------------
  let sum = null;
  try { sum = JSON.parse(raw.s3cmpSummary || "null"); } catch { sum = null; }
  const sumOk = !!sum
    && sum.totals && sum.totals.scenarios === 8 && sum.totals.pass === 8
    && sum.totals.fail === 0 && sum.totals.cases === 68
    && sum.totals.assertions === 319 && sum.totals.failures === 0
    && Array.isArray(sum.controls) && sum.controls.length === 5
    && sum.controls.every((c) => c.detected === true)
    && sum.tarballSha256 === TARBALL_SHA
    && sum.commit === S3CMP_COMMIT
    && sum.sandbox === S3CMP_SANDBOX
    && sum.helperResolutionPass === true;
  add("s3cmp.summary", sumOk ? "PASS" : "FAIL",
    "raw summary.json must show 8/8, 68 cases, 319 assertions, 0 failures, 5/5 controls, approved tarball sha, commit c44471e, sandbox r8q3, helperResolutionPass");

  // -- orchestration markers ---------------------------------------------------
  const tl = raw.timeline;
  const markerProblems = [];
  if (!tl || !Array.isArray(tl)) markerProblems.push("timeline.json absent");
  else {
    const expectedNames = ["s3cmp-source-prepare", "s3cmp-npm-ci", "s3cmp-full-qualify", "s3cmp-controls"];
    for (const n of expectedNames) {
      const e = tl.find((x) => x.name === n);
      if (!e) markerProblems.push(`missing process ${n}`);
      else if (e.exitCode !== 0 || e.status !== "completed") markerProblems.push(`${n} exit=${e.exitCode} status=${e.status}`);
    }
  }
  for (const [name, text] of Object.entries(raw.processes)) {
    let j = null;
    try { j = JSON.parse(text); } catch { markerProblems.push(`${name} unparseable`); continue; }
    // Process records carry cliExitCode; exitCode appears only in timeline.json.
    if (j.cliExitCode !== 0 || (j.exitCode !== undefined && j.exitCode !== 0)) {
      markerProblems.push(`${name} cliExitCode=${j.cliExitCode} exitCode=${j.exitCode}`);
    }
  }
  add("s3cmp.markers", markerProblems.length === 0 ? "PASS" : "FAIL",
    markerProblems.length === 0 ? `named-process markers verified: ${["s3cmp-source-prepare", "s3cmp-npm-ci", "s3cmp-full-qualify", "s3cmp-controls"].join(", ")} + uploaded process records` : markerProblems.join("; "));

  // -- tarball sha agreement ---------------------------------------------------
  const tarRefs = ["evidence/S3-COMPARATOR-R1.md", "evidence/S10-R1.md", "evidence/FINAL-20261109.md"]
    .filter((f) => !(doc[f] || "").includes(TARBALL_SHA));
  const tarRawOk = !!sum && sum.tarballSha256 === TARBALL_SHA;
  add("tarball.sha-agreement", tarRefs.length === 0 && tarRawOk ? "PASS" : "FAIL",
    `approved tarball sha present in tracked reports and raw summary; missing refs: ${tarRefs.join(",") || "none"}`);

  // -- S10 historical record not rewritten -------------------------------------
  const s10Ok = s10r1.includes("4/5")
    && s10r1.includes("86/92")
    && /S10-04/.test(s10r1)
    && !s10r1.split("\n").some((l) => /S10-04/.test(l) && /\bPASS\b/.test(l) && !/FAIL/.test(l));
  add("s10.not-rewritten", s10Ok ? "PASS" : "FAIL",
    "S10-R1 must remain the historical 4/5 result with S10-04 evidence-integrity FAIL (86/92) and no PASS relabelling");

  // -- FINAL partial scope -------------------------------------------------------
  const finalDoc = doc["evidence/FINAL-20261109.md"] || "";
  const stage11Claims = finalDoc.split("\n")
    .filter((l) => /Stage 11 PASS/.test(l))
    .filter((l) => !/no release recommendation|is not made|no Stage 11 PASS|not.*PASS/i.test(l));
  const finalOk = finalDoc.includes("partial verification only")
    && finalDoc.includes("137")
    && /[Nn]ot run\./.test(finalDoc)
    && /(do|does) not satisfy/.test(finalDoc)
    && stage11Claims.length === 0
    && /No release recommendation/i.test(finalDoc);
  add("final.partial", finalOk ? "PASS" : "FAIL",
    "FINAL-20261109 must remain partial-only: S6 137 inconclusive, Playwright suite not run, no Stage 11 PASS claim, no release recommendation");

  // -- scope limits not waived ---------------------------------------------------
  const disp = doc["DISPOSITIONS.md"] || "";
  const execLog = doc["EXECUTION-LOG.md"] || "";
  const s9Rows = matrix.rows.filter((r) => r.id.startsWith("S9-"));
  const s11Rows = matrix.rows.filter((r) => r.id.startsWith("S11-"));
  const s8row9 = matrix.rows.find((r) => r.id === "S8-09");
  const scopeOk = disp.includes("Native Safari unavailable")
    && disp.includes("66 ms/50 ms")
    && disp.includes("history-rate-limit")
    && s8row9 && s8row9.status === "BLOCKED"
    && s9Rows.length === 7 && s9Rows.every((r) => r.status === "REVIEW")
    && s11Rows.length === 4 && s11Rows.every((r) => r.status === "NOTRUN")
    && execLog.includes("8 GB")
    && execLog.includes("No test workload ran in that attempt");
  add("scope.notwaived", scopeOk ? "PASS" : "FAIL",
    "S8-09 BLOCKED, S9 7xREVIEW with 66ms/50ms failure and S9-O1 retained, S11 4xNOT RUN, 8GB provisioning failure recorded as non-product");

  return { checks, matrix };
}

// ---------------------------------------------------------------------------
// Finding scan (soft contradictions; reported, not failings)
// ---------------------------------------------------------------------------
function scanFindings(doc) {
  const findings = [];

  // FINAL-20261109 claims about other files' current text can go stale when
  // master docs are reconciled after the record was written. Verify the
  // referenced facts against the current documents and report drift.
  const finalDoc = doc["evidence/FINAL-20261109.md"] || "";
  const matrix = doc["MATRIX.md"] || "";
  const execLog = doc["EXECUTION-LOG.md"] || "";
  const claimLine = findLine(finalDoc, "still describe");
  if (claimLine > 0 && finalDoc.includes("comparator integration recheck as pending")) {
    const matrixNowAccepted = /(accepted|ACCEPTED)/.test(matrix) && !/comparator integration recheck as pending/.test(matrix);
    const refs = checkLineRefs(finalDoc, "docs/testing/evidence/FINAL-20261109.md", ["still describe"]);
    if (matrixNowAccepted) {
      findings.push({
        file: "docs/testing/evidence/FINAL-20261109.md",
        line: refs ? refs[0].split(":")[1] : String(claimLine),
        severity: "S3",
        detail: "Stale cross-reference: this preserved run record states MATRIX.md:5,41 and EXECUTION-LOG.md:17,25 'still describe the accepted S3 comparator integration recheck as pending', but current MATRIX.md describes S3-COMPARATOR-R1 as parent-accepted (reconciled in commits after 13:01 on 2026-11-09). The record itself is unchanged raw history; the master documents have since moved further than the record claims. Parent may annotate; do not rewrite the run record.",
      });
    }
  }

  // EXECUTION-LOG mapping-table cells that still say the integrated comparator
  // recheck is pending, although the same log later records its acceptance.
  const lines = execLog.split("\n");
  const pendingLines = [];
  lines.forEach((l, i) => {
    if (/recheck (remains|is) pending|remains pending as a separate/i.test(l)) pendingLines.push(i + 1);
  });
  if (pendingLines.length > 0 && /Comparator integration accepted/.test(execLog)) {
    findings.push({
      file: "docs/testing/EXECUTION-LOG.md",
      line: pendingLines.join(","),
      severity: "S3",
      detail: "Chronology tension inside one current document: mapping-table cells still describe the integrated S3 comparator recheck as pending while a later same-day section records parent acceptance of S3-COMPARATOR-R1. DISPOSITIONS.md is authoritative and already reflects acceptance. Parent may annotate the mapping table as time-of-reconciliation text; not edited here (file not in task scope).",
    });
  }

  return findings;
}

// ---------------------------------------------------------------------------
// Negative controls: same check code, disposable mutated inputs.
// Each must produce at least one expected failing check id.
// ---------------------------------------------------------------------------
function runNegativeControls(doc, raw) {
  const results = [];

  function expectFail(name, mutatedDoc, mutatedRaw, expectedIds) {
    const { checks } = makeChecks(mutatedDoc, mutatedRaw || raw);
    const failed = checks.filter((c) => c.status === "FAIL").map((c) => c.id);
    const detected = expectedIds.every((id) => failed.includes(id));
    results.push({
      id: name, detected, expected: expectedIds, failedChecks: failed,
      detail: detected ? `auditor failed as required (${failed.join(", ")})` : `MISSING EXPECTED FAILURE; got ${failed.join(", ") || "none"}`,
    });
  }

  // NC-A: wrong matrix row count (one REVIEW REQUIRED relabelled PASS).
  const matrixMutated = doc["MATRIX.md"].replace(
    /(\| S10-04 \| Evidence integrity[^\n]*\| S0 \| )REVIEW REQUIRED \|/,
    "$1PASS |",
  );
  if (matrixMutated === doc["MATRIX.md"]) {
    results.push({ id: "neg.wrong-rowcount", detected: false, detail: "mutation did not apply (anchor row not found)" });
  } else {
    expectFail("neg.wrong-rowcount", { ...doc, "MATRIX.md": matrixMutated }, raw, ["matrix.rowcount"]);
  }

  // NC-B: wrong raw hash (one character flipped in the tarball sha).
  if (raw.s3cmpSummary) {
    const mutated = { ...JSON.parse(raw.s3cmpSummary) };
    mutated.tarballSha256 = (mutated.tarballSha256 || "").replace(/^./, (c) => (c === "0" ? "1" : "0"));
    expectFail("neg.wrong-hash", doc, { ...raw, s3cmpSummary: JSON.stringify(mutated) }, ["s3cmp.summary"]);
  } else {
    results.push({ id: "neg.wrong-hash", detected: false, detail: "raw summary unavailable for mutation" });
  }

  // NC-C: stale current header (54 PASS presented as current, no historical marker).
  const reportMutated = doc["REPORT.md"].replace(
    HEADER,
    "54 PASS, 1 BLOCKED, 12 REVIEW REQUIRED, 4 NOT RUN",
  );
  if (reportMutated === doc["REPORT.md"]) {
    results.push({ id: "neg.stale-header", detected: false, detail: "mutation did not apply (header not found)" });
  } else {
    expectFail("neg.stale-header", { ...doc, "REPORT.md": reportMutated }, raw, ["headers.current"]);
  }

  // NC-D: missing report.
  const docMissing = { ...doc };
  delete docMissing["FINDINGS.md"];
  expectFail("neg.missing-report", docMissing, raw, ["input.files"]);

  return results;
}

// ---------------------------------------------------------------------------
// Fresh source manifest of the audited tree (docs + raw + harness).
// ---------------------------------------------------------------------------
function writeManifest(harnessSelf) {
  const files = [];
  const walk = (root, rel) => {
    for (const e of fs.readdirSync(root, { withFileTypes: true })) {
      const p = path.join(root, e.name);
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(p, r);
      else if (e.isFile()) {
        const b = fs.readFileSync(p);
        files.push({ path: r, bytes: b.length, sha256: SHA(b) });
      }
    }
  };
  walk(args.docs, "docs");
  walk(args["raw-s8r2"], "raw/s8-r2");
  walk(args["raw-s3cmp"], "raw/s3cmp");
  const hb = fs.readFileSync(harnessSelf);
  files.push({ path: "scripts/testing/integrity-free-audit.mjs", bytes: hb.length, sha256: SHA(hb) });
  files.sort((a, b) => a.path.localeCompare(b.path));
  const digest = SHA(files.map((f) => `${f.path}\0${f.sha256}`).join("\n"));
  const manifest = {
    commit: args.commit,
    sandbox: args.sandbox,
    generatedAtUtc: new Date().toISOString(),
    fileCount: files.length,
    digest,
    files,
  };
  fs.writeFileSync(path.join(OUT, "source-manifest-integrity.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const doc = {};
for (const f of ["DISPOSITIONS.md", "MATRIX.md", "PLAN.md", "REPORT.md", "FINDINGS.md", "EXECUTION-LOG.md"]) {
  const p = path.join(args.docs, f);
  if (fs.existsSync(p)) doc[f] = fs.readFileSync(p, "utf8");
}
for (const f of ["evidence/S10-R1.md", "evidence/S3-COMPARATOR-R1.md", "evidence/S3-R1.md", "evidence/S3.md", "evidence/S8-R2.md", "evidence/FINAL-20261109.md"]) {
  const p = path.join(args.docs, f);
  if (fs.existsSync(p)) doc[f] = fs.readFileSync(p, "utf8");
}

const s8r2Root = args["raw-s8r2"];
const raw = {
  s8r2Root,
  sumsText: fs.existsSync(path.join(s8r2Root, "SHA256SUMS")) ? fs.readFileSync(path.join(s8r2Root, "SHA256SUMS"), "utf8") : null,
  s3cmpSummary: fs.existsSync(path.join(args["raw-s3cmp"], "summary.json")) ? fs.readFileSync(path.join(args["raw-s3cmp"], "summary.json"), "utf8") : null,
  timeline: (() => {
    const p = path.join(args["raw-s3cmp"], "timeline.json");
    try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; }
  })(),
  processes: {},
};
for (const f of ["s3cmp-source-prepare.json", "s3cmp-npm-ci.json", "s3cmp-full-qualify.json", "s3cmp-controls.json"]) {
  const p = path.join(args["raw-s3cmp"], f);
  if (fs.existsSync(p)) raw.processes[f] = fs.readFileSync(p, "utf8");
}

const { checks } = makeChecks(doc, raw);
const findings = scanFindings(doc);
const negcontrols = runNegativeControls(doc, raw);

const harnessSelf = path.join(args.docs, "..", "scripts", "testing", "integrity-free-audit.mjs");
const manifest = writeManifest(harnessSelf);

const allPass = checks.every((c) => c.status === "PASS") && negcontrols.every((n) => n.detected);
const result = {
  runId: "S10-INTEGRITY-FREE-R1",
  commit: args.commit,
  sandbox: args.sandbox,
  generatedAtUtc: new Date().toISOString(),
  runtime: { node: process.version, platform: process.platform },
  manifestDigest: manifest.digest,
  manifestFileCount: manifest.fileCount,
  counts: {
    checks: checks.length,
    pass: checks.filter((c) => c.status === "PASS").length,
    fail: checks.filter((c) => c.status === "FAIL").length,
    negativeControls: negcontrols.length,
    negativeControlsDetected: negcontrols.filter((n) => n.detected).length,
    findings: findings.length,
  },
  checks,
  negativeControls: negcontrols,
  findings,
  verdict: allPass ? "PASS" : "FAIL",
};

fs.writeFileSync(path.join(OUT, "results.json"), `${JSON.stringify(result, null, 2)}\n`);
const logLines = checks.concat(negcontrols.map((n) => ({ id: n.id, status: n.detected ? "PASS" : "FAIL", detail: n.detail })))
  .map((c) => `${c.status}  ${c.id}  ${c.detail}`);
fs.writeFileSync(path.join(OUT, "audit.log"), `${logLines.join("\n")}\n`);
for (const n of negcontrols) {
  fs.writeFileSync(path.join(OUT, `negcontrol-${n.id.replace("neg.", "")}.json`), `${JSON.stringify(n, null, 2)}\n`);
}

for (const c of checks) process.stdout.write(`${c.status}  ${c.id}\n`);
for (const n of negcontrols) process.stdout.write(`${n.detected ? "PASS" : "FAIL"}  ${n.id}\n`);
for (const f of findings) process.stdout.write(`FINDING (${f.severity}) ${f.file}:${f.line} — ${f.detail.split(". ")[0]}\n`);
process.stdout.write(`VERDICT ${result.verdict} checks=${result.counts.pass}/${result.counts.checks} neg=${result.counts.negativeControlsDetected}/${result.counts.negativeControls} findings=${result.counts.findings}\n`);
process.exit(allPass ? 0 : 1);
