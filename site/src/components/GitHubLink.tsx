import { useEffect, useState } from 'react'
import { LINKS, REPO_API } from '../lib/content'
import { GitHubMark, StarMark } from './Pixel'

const CACHE_KEY = 'palletface:stars'
const CACHE_MS = 60 * 60 * 1000
const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 })

type Cached = { at: number; stars: number | null }

function readCache(): Cached | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const cached = JSON.parse(raw) as Cached
    return Date.now() - cached.at < CACHE_MS ? cached : null
  } catch {
    return null
  }
}

/**
 * The repo's star count, or null while loading, when the API fails, or while the repo is private.
 * Failures are cached too: the unauthenticated API allows 60 requests an hour per visitor.
 */
function useGitHubStars(): number | null {
  const [stars, setStars] = useState<number | null>(() => readCache()?.stars ?? null)
  useEffect(() => {
    if (readCache()) return
    const ctrl = new AbortController()
    fetch(REPO_API, { signal: ctrl.signal })
      .then((res) => (res.ok ? (res.json() as Promise<{ stargazers_count?: unknown }>) : null))
      .then((data) => {
        const n = typeof data?.stargazers_count === 'number' ? data.stargazers_count : null
        try {
          sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), stars: n } satisfies Cached))
        } catch {
          // storage can be off in private windows; the count still shows
        }
        setStars(n)
      })
      .catch(() => {})
    return () => ctrl.abort()
  }, [])
  return stars
}

/** The GitHub nav link. The star count only shows once the repo has stars. */
export function GitHubLink() {
  const stars = useGitHubStars()
  const shown = stars !== null && stars > 0
  return (
    <a
      className="gh"
      href={LINKS.github}
      target="_blank"
      rel="noreferrer"
      aria-label={shown ? `GitHub, ${stars.toLocaleString('en-US')} stars` : 'GitHub'}
    >
      <GitHubMark />
      <span className="gh__name">GitHub</span>
      {shown && (
        <span className="gh__stars">
          <StarMark />
          {compact.format(stars)}
        </span>
      )}
    </a>
  )
}
