import { build } from 'esbuild'
import { cp, mkdir, rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const output = new URL('../dist-site/', import.meta.url)
await rm(output, { recursive: true, force: true })
await mkdir(new URL('assets/', output), { recursive: true })
await build({
  absWorkingDir: root,
  entryPoints: ['site/main.ts'],
  bundle: true,
  minify: true,
  format: 'esm',
  platform: 'browser',
  target: ['es2022'],
  outfile: fileURLToPath(new URL('assets/app.js', output)),
})
for (const path of ['index.html', 'bootstrap.js', 'site.css', 'favicon.svg', 'robots.txt', 'sitemap.xml', '_headers']) {
  await cp(new URL(`../site/${path}`, import.meta.url), new URL(path, output))
}
await cp(new URL('../site/assets/social-preview.svg', import.meta.url), new URL('social-preview.svg', output))
console.log('Built static site in dist-site/')
