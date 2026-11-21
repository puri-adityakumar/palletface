import { ditherFace, STYLES } from 'dither-face'
import AvatarExplorer from './avatar-explorer.jsx'

export const dynamic = 'force-dynamic'

const SEED = 'preview-output'
const NAME = '7even'
const PX = 80

function dataUrl(svg) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

export default function Page() {
  const initial = STYLES.map((style) => ({
    slug: style.slug,
    src: dataUrl(ditherFace(SEED, { style: style.slug, name: NAME, px: PX })),
  }))

  return (
    <main data-ssr="next" data-framework="next">
      <h1>Next.js SSR qualification</h1>
      <p>
        Server-rendered from the installed dither-face tarball. The no-JS HTML
        below is the SSR record; controls become interactive only after
        hydration.
      </p>
      <AvatarExplorer
        initial={initial}
        initialSeed={SEED}
        initialName={NAME}
        px={PX}
      />
    </main>
  )
}
