import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const root = path.resolve(process.argv[2] ?? '.');
const out = path.resolve(process.argv[3] ?? 'out/qualification/FINAL-20261109');
const sourceCommit = process.argv[4];
const approvedTarballSha = process.argv[5];
if (!sourceCommit || !approvedTarballSha) {
  throw new Error('usage: final-qualification-prepare.mjs REPO OUT SOURCE_COMMIT APPROVED_TARBALL_SHA');
}

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const entries = [];
async function walk(dir) {
  for (const item of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const fullPath = path.join(dir, item.name);
    const relativePath = path.relative(root, fullPath).split(path.sep).join('/');
    if (item.isDirectory()) {
      if (item.name === '.git') throw new Error(`forbidden uploaded directory: ${relativePath}`);
      if (item.name === 'node_modules') continue;
      await walk(fullPath);
    } else if (item.isFile()) {
      if (item.name.startsWith('._') || item.name === '.env' || item.name.startsWith('.env.')) {
        throw new Error(`forbidden uploaded file: ${relativePath}`);
      }
      const bytes = await readFile(fullPath);
      entries.push({ path: relativePath, sha256: hash(bytes), size: bytes.length });
    } else {
      throw new Error(`unexpected filesystem entry: ${relativePath}`);
    }
  }
}

await walk(root);
const tarball = path.join(out, 'artifacts/dither-face-0.1.0.tgz');
const tarballBytes = await readFile(tarball);
const tarballSha = hash(tarballBytes);
if (tarballSha !== approvedTarballSha) throw new Error(`frozen tarball SHA mismatch: ${tarballSha}`);
const sourceManifest = { commit: sourceCommit, fileCount: entries.length, files: entries };
sourceManifest.sha256 = hash(entries.map((entry) => `${entry.path}\0${entry.sha256}`).join('\n'));
const manifest = JSON.stringify(sourceManifest, null, 2) + '\n';
await writeFile(path.join(out, 'artifacts/source-manifest.json'), manifest);
const environment = {
  sourceCommit,
  files: entries.length,
  manifestSha256: hash(manifest),
  tarballSha256: tarballSha,
  tarballBytes: tarballBytes.length,
  node: process.version,
  npmUserAgent: process.env.npm_config_user_agent ?? null,
  platform: process.platform,
  kernel: os.release(),
  logicalCpus: os.cpus().length,
};
await writeFile(path.join(out, 'artifacts/environment.json'), JSON.stringify(environment, null, 2) + '\n');
console.log(JSON.stringify(environment));
