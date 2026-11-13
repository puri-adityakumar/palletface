import {
  ditherFace,
  STYLES,
  pixelSprite,
  pixelLetter,
  type AvatarStyle,
  type DitherFaceOptions,
  type StyleSlug,
} from 'dither-face'

const style: StyleSlug = 'pixel-letter'
const options: DitherFaceOptions = { style, name: 'Élodie', px: 64 }
const svg: string = ditherFace('user-42', options)
const defaulted: string = ditherFace('user-42')
const sprite: string = pixelSprite('user-42', 80)
const letter: string = pixelLetter('user-42', 80, 'Élodie')
const registry: readonly AvatarStyle[] = STYLES
const slugs: readonly StyleSlug[] = STYLES.map((entry) => entry.slug)
const draws: readonly ((seed: string, px: number, name?: string) => string)[] = STYLES.map(
  (entry) => entry.draw,
)
const firstTitle: string = STYLES[0]!.title

void svg
void defaulted
void sprite
void letter
void registry
void slugs
void draws
void firstTitle
