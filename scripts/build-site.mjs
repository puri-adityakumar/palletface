import { build } from 'esbuild'
import { cp, mkdir, rm } from 'node:fs/promises'
await rm('dist-site',{recursive:true,force:true}); await mkdir('dist-site/assets',{recursive:true})
await build({entryPoints:['site/main.ts'],bundle:true,format:'esm',platform:'browser',target:['es2020'],outfile:'dist-site/assets/app.js'})
await cp('site/index.html','dist-site/index.html'); await cp('site/site.css','dist-site/site.css'); await cp('site/assets','dist-site/assets',{recursive:true}); await cp('site/favicon.svg','dist-site/favicon.svg'); await cp('site/assets/social-preview.svg','dist-site/social-preview.svg')
await cp('site/robots.txt','dist-site/robots.txt'); await cp('site/sitemap.xml','dist-site/sitemap.xml')
