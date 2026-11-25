import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { Marked, Renderer } from 'marked'
import type { Plugin } from 'vite'

const site = new URL('../', import.meta.url)
const guide = new URL('../public/docs/guide.md', import.meta.url)

const pages = [
  { slug: '', title: 'Overview', description: 'Generate deterministic SVG avatars with palletface.', group: 'start' },
  { slug: 'quick-start', title: 'Quick start', description: 'Install palletface and write your first SVG.', group: 'start' },
  { slug: 'playground', title: 'Playground', description: 'Try a seed and style, then copy the code or download the SVG.', group: 'start' },
  { slug: 'api-reference', title: 'API reference', description: 'Look up options, errors, the style registry, and output stability.', group: 'reference' },
  { slug: 'styles', title: 'Styles', description: 'Find a style slug, its renderer export, and whether it uses a name.', group: 'reference' },
  { slug: 'integrations', title: 'Integrations', description: 'Display avatars in a browser or return them from a server.', group: 'reference' },
].map((page) => {
  const href = `/docs/${page.slug ? `${page.slug}/` : ''}`
  return { ...page, href, entry: `${href.slice(1)}index.html` }
})

export const docsEntries = pages.map(({ entry }) => entry)

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
          .replace('<!-- playground -->', '<div id="avatar-playground"></div><noscript>The playground requires JavaScript.</noscript>')

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
        const playground = page.slug === 'playground' ? '<script type="module" src="/src/docs/playground.tsx"></script>' : ''

        return template
          .replace('<!-- docs metadata -->', () => meta)
          .replace('<!-- docs getting started -->', () => nav('start'))
          .replace('<!-- docs reference -->', () => nav('reference'))
          .replace('<!-- docs heading -->', () => title)
          .replace('<!-- docs outline -->', () => outline)
          .replace('<!-- docs guide -->', () => article + index + pagination)
          .replace('<!-- docs playground script -->', () => playground)
      },
    },
  }
}
