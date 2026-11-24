/**
 * PROTOTYPE: five landing page directions on one route, picked with ?variant=.
 * Each variant owns its whole page; only this switcher is shared.
 */
import { lazy, Suspense, useEffect, useState, type ComponentType, type LazyExoticComponent } from 'react'
import { PrototypeSwitcher } from './PrototypeSwitcher'

type Variant = { key: string; id: string; name: string; Component: LazyExoticComponent<ComponentType> }

const VARIANTS: Variant[] = [
  { key: 'A', id: 'field', name: 'seed field', Component: lazy(() => import('./variants/field/Variant')) },
  { key: 'B', id: 'plotter', name: 'plotter', Component: lazy(() => import('./variants/plotter/Variant')) },
  { key: 'C', id: 'meadow', name: 'meadow', Component: lazy(() => import('./variants/meadow/Variant')) },
  { key: 'D', id: 'signal', name: 'signal', Component: lazy(() => import('./variants/signal/Variant')) },
  { key: 'E', id: 'catalog', name: 'catalog', Component: lazy(() => import('./variants/catalog/Variant')) },
]

function fromUrl(): Variant {
  const key = new URLSearchParams(window.location.search).get('variant')?.toUpperCase()
  return VARIANTS.find((v) => v.key === key) ?? VARIANTS[0]!
}

export default function App() {
  const [current, setCurrent] = useState(fromUrl)

  useEffect(() => {
    const onPop = () => setCurrent(fromUrl())
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  // Variants style <html> through this attribute so overscroll matches the page.
  useEffect(() => {
    document.documentElement.dataset.variant = current.id
  }, [current])

  const go = (key: string) => {
    const next = VARIANTS.find((v) => v.key === key)
    if (!next) return
    const url = new URL(window.location.href)
    url.searchParams.set('variant', key)
    window.history.replaceState(null, '', url)
    window.scrollTo(0, 0)
    setCurrent(next)
  }

  const Page = current.Component
  return (
    <>
      <Suspense fallback={null}>
        <Page key={current.key} />
      </Suspense>
      {import.meta.env.DEV && (
        <PrototypeSwitcher items={VARIANTS.map(({ key, name }) => ({ key, name }))} current={current.key} onChange={go} />
      )}
    </>
  )
}
