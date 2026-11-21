import { ditherFace, type StyleSlug } from 'dither-face'

const invalidStyle: StyleSlug = 'pixel-sprite-extra'
ditherFace('user-42', { style: invalidStyle })
