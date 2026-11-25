import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { CopyButton } from '../components/CopyButton'
import { Out } from '../components/Pixel'
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

const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
const plain = (text: string) => text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/[`*]/g, '')
const HEADING = /^#{1,4}\s+(.*)$/

type Section = { id: string; title: string }

/** The headings in a release body, with the ids the page gives them. */
function sectionsOf(release: Release): Section[] {
  return (release.body ?? '').split('\n').flatMap((line) => {
    const match = line.trim().match(HEADING)
    if (!match) return []
    const title = plain(match[1]!)
    return [{ id: `${release.tag_name}-${slug(title)}`, title }]
  })
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
function Notes({ release }: { release: Release }) {
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
  const lines = (release.body ?? '').replace(/\r/g, '').split('\n')
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
    const heading = line.match(HEADING)
    if (heading) {
      blocks.push(
        <h3 key={i} id={`${release.tag_name}-${slug(plain(heading[1]!))}`}>
          {inline(heading[1]!, i)}
        </h3>,
      )
    } else blocks.push(<p key={i}>{inline(line, i)}</p>)
  })
  flush(lines.length)
  return <>{blocks}</>
}

/** The id of the last target whose top has scrolled past the reading line. */
function useCurrent(ids: string[]): string | undefined {
  const [current, setCurrent] = useState<string>()
  const key = ids.join(' ')
  useEffect(() => {
    const targets = key.split(' ').filter(Boolean)
    const update = () => {
      const root = document.documentElement
      if (window.scrollY + window.innerHeight >= root.scrollHeight - 2) {
        // Short last sections never reach the line, so the page end counts as the last one.
        const last = [...targets].reverse().find((id) => (document.getElementById(id)?.getBoundingClientRect().top ?? Infinity) < window.innerHeight)
        if (last) return setCurrent(last)
      }
      let found = targets[0]
      for (const id of targets) {
        const top = document.getElementById(id)?.getBoundingClientRect().top
        if (top !== undefined && top <= 140) found = id
      }
      setCurrent(found)
    }
    update()
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [key])
  return current
}

const dateFmt = new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', year: 'numeric' })

/** Every GitHub release, newest first, with a contents list that follows the reader. */
export function ChangelogPage() {
  usePageMeta('Changelog · palletface')
  const { releases, failed } = useReleases()
  const sections = useMemo(() => releases.map((r) => ({ release: r, sections: sectionsOf(r) })), [releases])
  const ids = sections.flatMap(({ release, sections }) => [release.tag_name, ...sections.map((s) => s.id)])
  const current = useCurrent(ids)
  const latest = releases.find((r) => !r.prerelease)?.tag_name

  // usePageMeta scrolls to the top on mount, so a link to one release has to jump again.
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1))
    if (id) document.getElementById(id)?.scrollIntoView()
  }, [])

  return (
    <div>
      <SubHead />
      <main className="wrap page">
        <div className="page__head">
          <h1 className="h2">Changelog.</h1>
          <p className="note">
            Every release, newest first. Before 1.0, a minor release may change the output, so pin the version with <code>--save-exact</code>.
          </p>
          <p className="log__links">
            <a href={LINKS.releases} target="_blank" rel="noreferrer">
              Releases on GitHub <Out />
            </a>
            <a href={`${LINKS.npm}?activeTab=versions`} target="_blank" rel="noreferrer">
              Versions on npm <Out />
            </a>
          </p>
        </div>

        {releases.length === 0 ? (
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
        ) : (
          <div className="log">
            <nav className="toc" aria-labelledby="toc-title">
              <p className="toc__title" id="toc-title">
                {releases.length} {releases.length === 1 ? 'release' : 'releases'}
              </p>
              <ol>
                {sections.map(({ release: r, sections }) => {
                  const here = current === r.tag_name || sections.some((s) => s.id === current)
                  return (
                    <li key={r.tag_name} className={here ? 'is-here' : undefined}>
                      <a href={`#${r.tag_name}`} aria-current={current === r.tag_name ? 'location' : undefined}>
                        <span>{r.tag_name}</span>
                        <time dateTime={r.published_at}>{dateFmt.format(new Date(r.published_at))}</time>
                      </a>
                      {sections.length > 0 && (
                        <ul>
                          {sections.map((s) => (
                            <li key={s.id}>
                              <a href={`#${s.id}`} aria-current={current === s.id ? 'location' : undefined}>
                                {s.title}
                              </a>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  )
                })}
              </ol>
            </nav>

            <ol className="log__list">
              {releases.map((r) => (
                <li key={r.tag_name}>
                  <article className="rel" aria-labelledby={r.tag_name}>
                    <header className="rel__head">
                      <h2 className="rel__tag" id={r.tag_name}>
                        <a href={`#${r.tag_name}`}>{r.tag_name}</a>
                      </h2>
                      <p className="rel__meta">
                        <time dateTime={r.published_at}>{dateFmt.format(new Date(r.published_at))}</time>
                        {r.prerelease && <span className="rel__badge">Pre-release</span>}
                        {r.tag_name === latest && <span className="rel__badge rel__badge--on">Latest</span>}
                      </p>
                    </header>
                    {r.name && r.name !== r.tag_name && <p className="rel__name">{r.name}</p>}
                    <div className="rel__install">
                      <CopyButton variant="install" tone="paper" value={`npm install --save-exact palletface@${r.tag_name.replace(/^v/, '')}`} />
                    </div>
                    <div className="log__body">{r.body ? <Notes release={r} /> : <p>No notes for this release.</p>}</div>
                    <a className="rel__gh" href={r.html_url} target="_blank" rel="noreferrer">
                      View {r.tag_name} on GitHub <Out />
                    </a>
                  </article>
                </li>
              ))}
            </ol>
          </div>
        )}
      </main>
      <Footer seed="ada" />
    </div>
  )
}
