import { useEffect, useRef, useState, type ReactNode } from 'react'
import { STYLES } from 'palletface'
import { LINKS } from '../lib/content'
import { Face } from '../lib/faces'
import { useReducedMotion } from '../lib/hooks'
import './support-toast.css'

const DISMISS_KEY = 'palletface:support-dismissed'
const DISMISS_MS = 30 * 24 * 60 * 60 * 1000
const SWAP_MS = 3200
/** Matches the duck transition in support-toast.css. */
const DUCK_MS = 260

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const SEEDS = ['palletface', 'kai', 'yuki', 'noor', 'priya', 'otto', 'lena', 'ravi', 'juno', 'felix', 'hana', 'zara']
const FIRST = STYLES.findIndex((s) => s.slug === 'pixel-sprite')
/** One face per style, starting with Pixel Sprite. */
const PEEKS = STYLES.map((_, i) => ({ seed: SEEDS[i % SEEDS.length]!, style: STYLES[(FIRST + i) % STYLES.length]!.slug }))
const BUBBLES: ReactNode[] = [
  <>
    psst… a <span className="support__star">★</span> helps a lot
  </>,
  <>
    sponsor us, <span className="support__pink">get featured ♥</span>
  </>,
]

function dismissedRecently(): boolean {
  try {
    return Date.now() - Number(localStorage.getItem(DISMISS_KEY)) < DISMISS_MS
  } catch {
    return false
  }
}

/**
 * True while the hero, the sponsors row, or the Sponsor section is on screen.
 * The hero has its own calls to action, and the other two already ask.
 */
function useQuiet(): boolean {
  const [quiet, setQuiet] = useState(true)
  useEffect(() => {
    const zones = [document.querySelector('.hero'), document.getElementById('sponsors'), document.getElementById('sponsor')]
    const seen = new Set<Element>()
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) seen.add(e.target)
        else seen.delete(e.target)
      }
      setQuiet(seen.size > 0)
    })
    for (const z of zones) if (z) io.observe(z)
    return () => io.disconnect()
  }, [])
  return quiet
}

/**
 * A face that peeks up from the bottom-right corner and asks for a star or a
 * sponsor. It swaps to a new face every few seconds; clicking it opens both
 * options. "Not now" hides it for 30 days. It never moves focus on its own.
 */
export function SupportToast() {
  const reduced = useReducedMotion()
  const quiet = useQuiet()
  const [dismissed, setDismissed] = useState(dismissedRecently)
  const [open, setOpen] = useState(false)
  const [hover, setHover] = useState(false)
  const [peek, setPeek] = useState(0)
  const [duck, setDuck] = useState(false)
  const root = useRef<HTMLElement>(null)
  const faceButton = useRef<HTMLButtonElement>(null)
  const shown = !dismissed && !quiet
  const face = PEEKS[peek]!

  useEffect(() => {
    if (!shown || open || hover || reduced) return
    let back = 0
    const t = window.setInterval(() => {
      setDuck(true)
      back = window.setTimeout(() => {
        setPeek((k) => (k + 1) % PEEKS.length)
        setDuck(false)
      }, DUCK_MS)
    }, SWAP_MS)
    return () => {
      window.clearInterval(t)
      window.clearTimeout(back)
      setDuck(false)
    }
  }, [shown, open, hover, reduced])

  useEffect(() => {
    if (!shown) setOpen(false)
  }, [shown])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (root.current?.contains(document.activeElement)) faceButton.current?.focus()
      setOpen(false)
    }
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onDown)
    }
  }, [open])

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()))
    } catch {
      // storage can be off in private windows; it still hides for this visit
    }
    setDismissed(true)
  }

  const seeWhere = () => {
    setOpen(false)
    const row = document.getElementById('sponsors')
    if (!row) return
    row.classList.remove('is-flash')
    void row.offsetWidth
    row.classList.add('is-flash')
  }

  if (dismissed) return null

  return (
    <aside
      ref={root}
      className={`support${shown ? ' is-in' : ''}${open ? ' is-open' : ''}`}
      aria-label="Support palletface"
      inert={!shown}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
    >
      <p className="support__bubble" aria-hidden="true">
        {BUBBLES[peek % BUBBLES.length]}
      </p>
      <div className="support__menu" id="support-menu">
        <p className="support__title">Like palletface?</p>
        <p>It’s free and made by one person. Two ways to help:</p>
        <a className="support__opt" href={LINKS.github} target="_blank" rel="noreferrer">
          <span className="support__icon support__star" aria-hidden="true">
            ★
          </span>
          <b>Star on GitHub</b>
          <small>Helps other developers find it.</small>
        </a>
        <a className="support__opt support__opt--sponsor" href={LINKS.sponsor} target="_blank" rel="noreferrer">
          <span className="support__icon" aria-hidden="true">
            ♥
          </span>
          <b>Sponsor us and get featured</b>
          <small>Your face goes on the site, right under the showcase.</small>
        </a>
        <div className="support__foot">
          <button type="button" className="support__later" onClick={dismiss}>
            Not now
          </button>
          <a className="support__see" href="#examples" onClick={seeWhere}>
            See where ↓
          </a>
        </div>
      </div>
      <button
        ref={faceButton}
        type="button"
        className={`support__face${duck ? ' is-duck' : ''}`}
        aria-label="Support palletface"
        aria-expanded={open}
        aria-controls="support-menu"
        onClick={() => setOpen((o) => !o)}
      >
        <Face seed={face.seed} style={face.style} px={88} name={capital(face.seed)} />
      </button>
    </aside>
  )
}
