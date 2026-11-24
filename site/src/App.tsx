import { useEffect, useState } from 'react'
import { DitherBand } from './lib/dither'
import { FIELD_GREEN, FIELD_NIGHT } from './meadow/world'
import { Hero } from './sections/Hero'
import { Problem } from './sections/Problem'
import { Features } from './sections/Features'
import { Styles } from './sections/Styles'
import { HowItWorks } from './sections/HowItWorks'
import { Sponsor } from './sections/Sponsor'
import { Faq } from './sections/Faq'
import { Footer } from './sections/Footer'

const PAPER = '#fbf9f4'
const PAPER_2 = '#efe9db'
const NIGHT_SKY = '#161d3b'

export default function App() {
  const [seed, setSeed] = useState('ada')
  const [night, setNight] = useState(false)

  useEffect(() => {
    document.documentElement.dataset.time = night ? 'night' : 'day'
  }, [night])

  return (
    <div id="top">
      <main>
        <Hero seed={seed} setSeed={setSeed} night={night} setNight={setNight} />
        <DitherBand from={night ? FIELD_NIGHT : FIELD_GREEN} to={PAPER} height={68} cell={4} mode="static" rough={0.31} seed="meadow/paper-edge" />
        <Problem />
        <Features />
        <Styles seed={seed} setSeed={setSeed} />
        <HowItWorks seed={seed} />
        <Sponsor />
        <Faq />
      </main>
      <DitherBand from={PAPER_2} to={NIGHT_SKY} height={68} cell={4} mode="static" rough={0.31} seed="meadow/night-edge" />
      <Footer seed={seed} />
    </div>
  )
}
