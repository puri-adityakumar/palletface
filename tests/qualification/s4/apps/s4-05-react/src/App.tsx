import { useEffect, useRef, useState } from 'react'
import { Avatar } from './Avatar'

interface DebugState {
  seed: string
  name: string
  size: number
  inline: boolean
  showMain: boolean
  showList: boolean
  renders: number
}

declare global {
  interface Window {
    __s4react?: DebugState
  }
}

const listSeeds = Array.from({ length: 100 }, (_, index) => `list-${index}`)

export function App() {
  const [seed, setSeed] = useState('preview-output')
  const [name, setName] = useState('7even')
  const [size, setSize] = useState(80)
  const [inline, setInline] = useState(false)
  const [showMain, setShowMain] = useState(true)
  const [showList, setShowList] = useState(false)
  const renders = useRef(0)
  renders.current += 1

  useEffect(() => {
    window.__s4react = { seed, name, size, inline, showMain, showList, renders: renders.current }
  }, [seed, name, size, inline, showMain, showList])

  return (
    <main>
      <h1>dither-face React Vite consumer</h1>
      <form id="controls" autoComplete="off" onSubmit={(event) => event.preventDefault()}>
        <label htmlFor="seed">Seed</label>
        <input id="seed" value={seed} onChange={(event) => setSeed(event.target.value)} />
        <label htmlFor="name">Name</label>
        <input id="name" value={name} onChange={(event) => setName(event.target.value)} />
        <label htmlFor="size">Size</label>
        <select id="size" value={size} onChange={(event) => setSize(Number(event.target.value))}>
          <option value={48}>48</option>
          <option value={80}>80</option>
          <option value={120}>120</option>
        </select>
        <button id="toggle-inline" type="button" onClick={() => setInline((value) => !value)}>
          {inline ? 'Hide inline specimen' : 'Show inline specimen'}
        </button>
        <button id="toggle-main" type="button" onClick={() => setShowMain((value) => !value)}>
          {showMain ? 'Unmount main avatar' : 'Mount main avatar'}
        </button>
        <button id="toggle-list" type="button" onClick={() => setShowList((value) => !value)}>
          {showList ? 'Unmount 100 avatars' : 'Mount 100 avatars'}
        </button>
      </form>
      <p id="status" role="status" aria-live="polite">
        {seed} / {name} / {size}px
      </p>
      <section id="specimen" aria-label="Main avatar">
        {showMain ? <Avatar seed={seed} name={name} size={size} testId="avatar-main" /> : null}
        {inline ? (
          <Avatar seed={seed} name={name} size={size} inline testId="avatar-inline" />
        ) : null}
      </section>
      {showList ? (
        <section id="list" aria-label="One hundred avatars">
          {listSeeds.map((listSeed) => (
            <Avatar key={listSeed} seed={listSeed} size={48} testId="avatar-list-item" />
          ))}
        </section>
      ) : null}
    </main>
  )
}
