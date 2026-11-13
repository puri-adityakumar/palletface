import { STYLES } from 'dither-face'

STYLES[0]!.slug = 'pixel-sprite-extra'
STYLES[0]!.title = 'changed'
STYLES[0] = STYLES[1]!
STYLES.push(STYLES[0]!)
