import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { Marked, Renderer } from 'marked'
import type { Plugin } from 'vite'
import { ditherFace, STYLES, type DitherFaceOptions } from '../../src/index.ts'

const site = new URL('../', import.meta.url)
const guide = new URL('../public/docs/guide.md', import.meta.url)

const pages = [
  { slug: '', title: 'Overview', description: 'Generate deterministic SVG avatars with palletface.', group: 'start' },
  { slug: 'quick-start', title: 'Quick start', description: 'Install palletface and write your first SVG.', group: 'start' },
  { slug: 'examples', title: 'Examples', description: 'See common calls next to the avatars they draw.', group: 'start' },
  { slug: 'api-reference', title: 'API reference', description: 'Look up options, errors, the style registry, and output stability.', group: 'reference' },
  { slug: 'styles', title: 'Styles', description: 'Find a style slug, its renderer export, and whether it uses a name.', group: 'reference' },
  { slug: 'integrations', title: 'Integrations', description: 'Display avatars in a browser or return them from a server.', group: 'reference' },
].map((page) => {
  const href = `/docs/${page.slug ? `${page.slug}/` : ''}`
  return { ...page, href, entry: `${href.slice(1)}index.html` }
})

export const docsEntries = pages.map(({ entry }) => entry)

const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

type Drawn = { seed: string; style: string; name?: string; px: number; svg: string }

/** Runs a snippet with `palletface` and `STYLES` in scope and keeps every avatar it draws. */
function draw(code: string): Drawn[] {
  const drawn: Drawn[] = []
  const palletface = (seed: string, options: DitherFaceOptions = {}) => {
    const svg = ditherFace(seed, options)
    drawn.push({ seed, style: options.style ?? 'pixel-sprite', name: options.name, px: options.px ?? 80, svg })
    return svg
  }
  new Function('palletface', 'STYLES', code)(palletface, STYLES)
  if (!drawn.length) throw new Error(`This example draws no avatar:\n${code}`)
  return drawn
}

/** The avatars a snippet draws. Each one is labeled with whatever differs between them. */
function exampleResult(code: string) {
  const drawn = draw(code)
  const fields = drawn.map(({ seed, style, name, px }) => [seed, style, name ?? '', `${px} px`])
  const differs = fields[0]!.map((_, i) => new Set(fields.map((row) => row[i])).size > 1)
  const items = drawn.map(({ seed, style, name, px, svg }, n) => {
    const label = fields[n]!.filter((_, i) => differs[i]).join(' · ')
    const alt = `${style} avatar for “${seed}”${name === undefined ? '' : ` named ${name}`}, ${px} px`
    const src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
    return `<li><img src="${src}" width="${px}" height="${px}" alt="${escapeHtml(alt)}" />${label ? `<span>${escapeHtml(label)}</span>` : ''}</li>`
  })
  return `<ul class="docs-example-result" aria-label="Result">${items.join('')}</ul>`
}

function headingId(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function paginationLink(page: (typeof pages)[number] | undefined, direction: 'prev' | 'next') {
  if (!page) return ''
  const label = direction === 'prev' ? 'Previous' : 'Next'
  return `<a href="${page.href}" rel="${direction}"><span>${label}</span><strong>${page.title}</strong></a>`
}

export function docsMarkdown(): Plugin {
  return {
    name: 'docs-markdown',
    transformIndexHtml: {
      order: 'pre',
      async handler(html, { filename }) {
        const page = pages.find(({ entry }) => fileURLToPath(new URL(entry, site)) === filename)
        if (!page) return

        const overview = page.slug === ''
        const template = overview ? html : await readFile(new URL('./index.html', import.meta.url), 'utf8')
        const sections: string[] = []
        const markdown = new Marked({
          renderer: {
            heading({ depth, text, tokens }) {
              const id = headingId(text)
              const title = this.parser.parseInline(tokens)
              if (depth === 3) sections.push(`<li><a href="#${id}">${title}</a></li>`)
              const level = depth > 2 ? depth - 1 : depth
              return `<h${level} id="${id}">${title}</h${level}>\n`
            },
            code(token) {
              // ```js example runs at build time, and its avatars are shown under the code.
              const [lang, ...flags] = (token.lang ?? '').split(/\s+/)
              const html = Renderer.prototype.code.call(this, { ...token, lang })
              if (!flags.includes('example')) return html
              return `<figure class="docs-example">${html}${exampleResult(token.text)}</figure>\n`
            },
            table(token) {
              const table = Renderer.prototype.table.call(this, token)
              return `<div class="docs-table-scroll" tabindex="0">${table}</div>\n`
            },
          },
        })

        // Each top-level Markdown section has a static HTML route.
        const tokens = markdown.lexer(await readFile(guide, 'utf8'))
        const start = tokens.findIndex((token) => token.type === 'heading' && (
          overview ? token.depth === 1 : token.depth === 2 && headingId(token.text) === page.slug
        ))
        const heading = tokens[start]
        if (heading?.type !== 'heading') throw new Error(`Missing Markdown heading for ${page.href}`)
        const end = tokens.findIndex((token, index) => index > start && token.type === 'heading' && token.depth === 2)
        const title = markdown.parser([{ ...heading, depth: 1 }])
        const article = markdown.parser(tokens.slice(start + 1, end === -1 ? undefined : end))

        const nav = (group: string) => pages.filter((item) => item.group === group).map((item) => {
          const current = item === page ? ' aria-current="page"' : ''
          return `<li><a href="${item.href}"${current}>${item.title}</a></li>`
        }).join('\n')

        const index = overview ? `<ul class="docs-overview">${pages.slice(1).map((item) =>
          `<li><a id="${item.slug}" href="${item.href}"><strong>${item.title}</strong><span>${item.description}</span></a></li>`,
        ).join('\n')}</ul>` : ''
        const pageIndex = pages.indexOf(page)
        const pagination = `<nav class="docs-pagination" aria-label="Docs pagination">
          ${paginationLink(pages[pageIndex - 1], 'prev')}
          ${paginationLink(pages[pageIndex + 1], 'next')}
        </nav>`
        const outline = sections.length ? `<nav class="docs-outline" aria-label="On this page">
          <p>On this page</p><ul>${sections.join('\n')}</ul>
        </nav>` : ''
        const pageTitle = overview ? 'palletface Docs' : `${page.title} · palletface Docs`
        const meta = `<title>${pageTitle}</title><meta name="description" content="${page.description}" />`

        return template
          .replace('<!-- docs metadata -->', () => meta)
          .replace('<!-- docs getting started -->', () => nav('start'))
          .replace('<!-- docs reference -->', () => nav('reference'))
          .replace('<!-- docs heading -->', () => title)
          .replace('<!-- docs outline -->', () => outline)
          .replace('<!-- docs guide -->', () => article + index + pagination)
      },
    },
  }
}
