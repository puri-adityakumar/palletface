import { useEffect } from 'react'

type Item = { key: string; name: string }

export function PrototypeSwitcher({ items, current, onChange }: { items: Item[]; current: string; onChange: (key: string) => void }) {
  const index = Math.max(0, items.findIndex((v) => v.key === current))
  const step = (delta: number) => onChange(items[(index + delta + items.length) % items.length]!.key)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const target = e.target as HTMLElement | null
      if (target?.closest('input, textarea, select, [contenteditable]')) return
      if (e.key === 'ArrowLeft') step(-1)
      if (e.key === 'ArrowRight') step(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const item = items[index]!
  return (
    <div className="proto-switcher" role="toolbar" aria-label="prototype variants">
      <button type="button" onClick={() => step(-1)} aria-label="previous variant">
        ←
      </button>
      <span>
        {item.key} · {item.name}
        <em>
          {index + 1}/{items.length}
        </em>
      </span>
      <button type="button" onClick={() => step(1)} aria-label="next variant">
        →
      </button>
    </div>
  )
}
