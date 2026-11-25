import { useDeferredValue, useState } from 'react'
import { DitherBand } from './lib/dither'
import { Hero } from './sections/Hero'
import { Showcase } from './sections/Showcase'
import { Features } from './sections/Features'
import { Styles } from './sections/Styles'
import { HowItWorks, QuickStart } from './sections/HowItWorks'
import { Sponsor } from './sections/Sponsor'
import { Faq } from './sections/Faq'
import { Footer } from './sections/Footer'
import { PlaygroundPage } from './pages/PlaygroundPage'
import { ChangelogPage } from './pages/ChangelogPage'
import { usePath } from './lib/router'

const PAPER = '#e7e7e3'
const INK = '#1d1d1b'

export default function App() {
  const path = usePath()
  if (path === '/playground') return <PlaygroundPage />
  if (path === '/changelog') return <ChangelogPage />
  return <Landing />
}

function Landing() {
  const [seed, setSeed] = useState('ada')
  // the hero follows every keystroke; sections below the fold may lag a frame behind
  const later = useDeferredValue(seed)

  return (
    <div id="top">
      <main>
        <Hero seed={seed} />
        <Showcase />
        <Features seed={later} />
        <Styles seed={later} input={seed} setSeed={setSeed} />
        <HowItWorks seed={later} />
        <DitherBand from={PAPER} to={INK} height={72} cell={8} seed="field/band-down" />
        <QuickStart />
        <DitherBand from={INK} to={PAPER} height={72} cell={8} mode="static" seed="field/band-up" />
        <Sponsor seed={later} />
        <Faq />
      </main>
      <Footer seed={later} />
    </div>
  )
}
