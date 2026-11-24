import { SAMPLE_SEEDS } from '../lib/content'

type Props = {
  id: string
  seed: string
  setSeed: (seed: string) => void
  label?: string
  size?: 'lg' | 'sm'
}

/** The seed text box with a button that steps through sample seeds. Any string, including an empty one, is a valid seed. */
export function SeedInput({ id, seed, setSeed, label = 'Seed', size = 'sm' }: Props) {
  const next = () => {
    const i = SAMPLE_SEEDS.findIndex((s) => s === seed)
    setSeed(SAMPLE_SEEDS[(i + 1) % SAMPLE_SEEDS.length]!)
  }
  return (
    <div className={`seed-input seed-input--${size}`} data-nodig>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        value={seed}
        onChange={(e) => setSeed(e.target.value)}
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        maxLength={40}
      />
      <button type="button" onClick={next} aria-label="Next sample seed" title="Next sample seed">
        ↻
      </button>
    </div>
  )
}
