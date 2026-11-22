import { writeFile } from 'node:fs/promises'
import { STYLES } from '../dist/index.js'

// A checked-in, self-contained SVG for the README; generated from the library.
const columns = 3
const width = 44 + columns * 190
const height = 30 + Math.ceil(STYLES.length / columns) * 160
const cells = STYLES.map((style, index) => {
  const x = 22 + (index % columns) * 190
  const y = 30 + Math.floor(index / columns) * 160
  return `<g transform="translate(${x},${y})">${style.draw('dither-face-preview', 96, 'Ada')}<text x="0" y="120">${style.slug}</text></g>`
}).join('')
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title"><title id="title">${STYLES.length} dither-face avatar styles</title><rect width="${width}" height="${height}" fill="#f7f7f5"/><g fill="#232323" font-family="ui-monospace,monospace" font-size="13">${cells}</g></svg>\n`
await writeFile(new URL('../.github/preview.svg', import.meta.url), svg)
console.log('Wrote .github/preview.svg from the built library')
