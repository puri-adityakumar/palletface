import { useDeferredValue, useState } from 'react'
import { DitherBand } from './lib/dither'
import { Hero } from './sections/Hero'
import { Problem } from './sections/Problem'
import { Features } from './sections/Features'
import { Styles } from './sections/Styles'
import { HowItWorks, QuickStart } from './sections/HowItWorks'
import { Sponsor } from './sections/Sponsor'
import { Faq } from './sections/Faq'
import { Footer } from './sections/Footer'

const PAPER = '#e7e7e3'
const INK = '#1d1d1b'

export default function App() {
  const [seed, setSeed] = useState('ada')
  // the hero follows every keystroke; sections below the fold may lag a frame behind
  const later = useDeferredValue(seed)

  return (
    <div id="top">
      <main>
        <Hero seed={seed} />
        <Problem />
        <Features />
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
