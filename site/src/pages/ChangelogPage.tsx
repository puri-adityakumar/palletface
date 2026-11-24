import { useEffect, useState, type ReactNode } from 'react'
import { SubHead } from '../components/SubHead'
import { Footer } from '../sections/Footer'
import { LINKS, REPO_API } from '../lib/content'
import { RELEASES, type Release } from '../lib/releases'
import { usePageMeta } from '../lib/router'
import './page.css'

/** The bundled snapshot shows instantly; a working public API refreshes it. */
function useReleases(): { releases: Release[]; failed: boolean } {
  const [releases, setReleases] = useState<Release[]>(RELEASES)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    const ctrl = new AbortController()
    fetch(`${REPO_API}/releases?per_page=50`, { signal: ctrl.signal })
      .then((res) => (res.ok ? (res.json() as Promise<Release[]>) : Promise.reject(new Error(String(res.status)))))
      .then(setReleases)
      .catch(() => setFailed(true))
    return () => ctrl.abort()
  }, [])
  return { releases, failed }
}

/** Inline markdown: code, bold, and links. Nothing else the release notes need. */
function inline(text: string, key: number): ReactNode {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g)
  return parts.map((p, i) => {
    const k = `${key}-${i}`
    if (p.startsWith('`')) return <code key={k}>{p.slice(1, -1)}</code>
    if (p.startsWith('**')) return <strong key={k}>{p.slice(2, -2)}</strong>
    const link = p.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
    if (link) {
      const href = link[2]!
      return (
        <a key={k} href={href} target="_blank" rel="noreferrer">
          {link[1]}
        </a>
      )
    }
    return p
  })
}

/** Release notes as headings, lists and paragraphs. Raw URLs stay plain text. */
function Notes({ body }: { body: string }) {
  const blocks: ReactNode[] = []
  let list: string[] = []
  const flush = (key: number) => {
    if (!list.length) return
    blocks.push(
      <ul key={`ul-${key}`}>
        {list.map((item, i) => (
          <li key={i}>{inline(item, i)}</li>
        ))}
      </ul>,
    )
    list = []
  }
  const lines = body.replace(/\r/g, '').split('\n')
  lines.forEach((raw, i) => {
    const line = raw.trim()
    if (!line) {
      flush(i)
      return
    }
    if (line.startsWith('- ') || line.startsWith('* ')) {
      list.push(line.slice(2))
      return
    }
    flush(i)
    const heading = line.match(/^#{1,4}\s+(.*)$/)
    if (heading) blocks.push(<h3 key={i}>{inline(heading[1]!, i)}</h3>)
    else blocks.push(<p key={i}>{inline(line, i)}</p>)
  })
  flush(lines.length)
  return <>{blocks}</>
}

const dateFmt = new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', year: 'numeric' })

/** Every GitHub release, newest first. */
export function ChangelogPage() {
  usePageMeta('Changelog · palletface')
  const { releases, failed } = useReleases()
  return (
    <div>
      <SubHead />
      <main className="wrap page">
        <div className="page__head">
          <h1 className="h2">Changelog.</h1>
          <p className="note">
            Every release, straight from GitHub. Before 1.0, a minor release may change the output, so pin with <code>--save-exact</code>.
          </p>
        </div>
        {releases.length === 0 && (
          <p className="log__state">
            {failed ? (
              <>
                Couldn't load the releases right now. <a href={LINKS.releases}>Read them on GitHub</a>.
              </>
            ) : (
              <>
                No releases yet. <a href={LINKS.releases}>Watch the repo on GitHub</a>.
              </>
            )}
          </p>
        )}
        <ol className="log">
          {releases.map((r) => (
            <li key={r.tag_name} className="log__item">
              <div className="log__meta">
                <a className="log__tag" href={r.html_url} target="_blank" rel="noreferrer">
                  {r.tag_name}
                </a>
                <span className="log__date">
                  {dateFmt.format(new Date(r.published_at))}
                  {r.prerelease ? ' · pre-release' : ''}
                </span>
              </div>
              <div className="log__body">
                {r.name && r.name !== r.tag_name && <h2>{r.name}</h2>}
                {r.body ? <Notes body={r.body} /> : <p>No notes for this release.</p>}
              </div>
            </li>
          ))}
        </ol>
      </main>
      <Footer seed="ada" />
    </div>
  )
}
