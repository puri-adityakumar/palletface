'use client'

import { useEffect, useMemo, useState } from 'react'
import { ditherFace, STYLES } from 'dither-face'

function dataUrl(svg) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

export default function AvatarExplorer({ initial, initialSeed, initialName, px }) {
  const [seed, setSeed] = useState(initialSeed)
  const [name, setName] = useState(initialName)
  const [style, setStyle] = useState('pixel-sprite')
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    setHydrated(true)
  }, [])

  const live = useMemo(
    () =>
      STYLES.map((entry) => ({
        slug: entry.slug,
        src: dataUrl(ditherFace(seed, { style: entry.slug, name, px })),
      })),
    [seed, name, px],
  )

  const current = live.find((entry) => entry.slug === style) ?? live[0]

  return (
    <section id="explorer" data-hydrated={hydrated ? 'true' : 'false'}>
      <div className="controls">
        <label htmlFor="seed">
          Seed
          <input
            id="seed"
            name="seed"
            value={seed}
            onChange={(event) => setSeed(event.target.value)}
          />
        </label>
        <label htmlFor="name">
          Name
          <input
            id="name"
            name="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label htmlFor="style">
          Style
          <select
            id="style"
            name="style"
            value={style}
            onChange={(event) => setStyle(event.target.value)}
          >
            {STYLES.map((entry) => (
              <option key={entry.slug} value={entry.slug}>
                {entry.slug}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div id="current" data-style={style}>
        <img id="current-avatar" data-avatar="current" alt="" src={current.src} />
      </div>

      <h2>Server initial</h2>
      <ul id="initial-grid">
        {initial.map((entry) => (
          <li key={entry.slug} data-initial-style={entry.slug}>
            <img
              data-initial={entry.slug}
              alt={`initial ${entry.slug}`}
              src={entry.src}
            />
          </li>
        ))}
      </ul>

      <h2>Live</h2>
      <ul id="live-grid">
        {live.map((entry) => (
          <li key={entry.slug} data-live-style={entry.slug}>
            <img
              data-live={entry.slug}
              alt={`live ${entry.slug}`}
              src={entry.src}
            />
          </li>
        ))}
      </ul>
    </section>
  )
}
