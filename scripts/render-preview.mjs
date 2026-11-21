import { writeFile } from 'node:fs/promises'
import { STYLES } from '../dist/index.js'

// A checked-in, self-contained SVG for the README; generated from the library.
const cells = STYLES.map((style, index) => {
  const x = 22 + (index % 4) * 190
  const y = 30 + Math.floor(index / 4) * 160
  return `<g transform="translate(${x},${y})">${style.draw('dither-face-preview', 96, 'Ada')}<text x="0" y="120">${style.slug}</text></g>`
}).join('')
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="350" viewBox="0 0 800 350" role="img" aria-labelledby="title"><title id="title">Eight dither-face avatar styles</title><rect width="800" height="350" fill="#f7f7f5"/><g fill="#232323" font-family="ui-monospace,monospace" font-size="13">${cells}</g></svg>\n`
await writeFile(new URL('../site/public/preview.svg', import.meta.url), svg)
console.log('Wrote site/public/preview.svg from the built library')
