import { useEffect } from 'react'
import { Chrome } from './components/Chrome'
import { Hero } from './components/Hero'
import { Machine } from './components/Machine'
import { HowItWorks } from './components/HowItWorks'
import { Showcase } from './components/Showcase'
import { StyleCards } from './components/StyleCards'
import { QuickStart } from './components/QuickStart'
import { Facts } from './components/Facts'
import { Provenance } from './components/Provenance'
import { Closing } from './components/Closing'
import { useReveal } from './hooks/useReveal'

export default function App() {
  useReveal()

  // reduced-motion flag on <html> — CSS reshapes pinned bands into static/scroller layouts
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const apply = () => document.documentElement.classList.toggle('rm', mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

  return (
    <>
      <Chrome />
      <main id="top">
        <Hero />
        <Machine />
        <HowItWorks />
        <Showcase />
        <StyleCards />
        <QuickStart />
        <Facts />
        <Provenance />
        <Closing />
      </main>
    </>
  )
}
