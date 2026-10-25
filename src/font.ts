/**
 * The 5x7 bitmap font for letter avatars, plus the two helpers every style
 * reaches for: `glyph()` for the pixel grid and `initialOf()` for the letter.
 */

/** Each glyph is seven 5-bit rows, space-separated; `?` is the fallback. */
export const FONT: Readonly<Record<string, string>> = {
  A: '01110 10001 10001 11111 10001 10001 10001',
  B: '11110 10001 10001 11110 10001 10001 11110',
  C: '01110 10001 10000 10000 10000 10001 01110',
  D: '11110 10001 10001 10001 10001 10001 11110',
  E: '11111 10000 10000 11110 10000 10000 11111',
  F: '11111 10000 10000 11110 10000 10000 10000',
  G: '01110 10001 10000 10111 10001 10001 01111',
  H: '10001 10001 10001 11111 10001 10001 10001',
  I: '01110 00100 00100 00100 00100 00100 01110',
  J: '00111 00010 00010 00010 00010 10010 01100',
  K: '10001 10010 10100 11000 10100 10010 10001',
  L: '10000 10000 10000 10000 10000 10000 11111',
  M: '10001 11011 10101 10101 10001 10001 10001',
  N: '10001 10001 11001 10101 10011 10001 10001',
  O: '01110 10001 10001 10001 10001 10001 01110',
  P: '11110 10001 10001 11110 10000 10000 10000',
  Q: '01110 10001 10001 10001 10101 10010 01101',
  R: '11110 10001 10001 11110 10100 10010 10001',
  S: '01111 10000 10000 01110 00001 00001 11110',
  T: '11111 00100 00100 00100 00100 00100 00100',
  U: '10001 10001 10001 10001 10001 10001 01110',
  V: '10001 10001 10001 10001 10001 01010 00100',
  W: '10001 10001 10001 10101 10101 10101 01010',
  X: '10001 10001 01010 00100 01010 10001 10001',
  Y: '10001 10001 01010 00100 00100 00100 00100',
  Z: '11111 00001 00010 00100 01000 10000 11111',
  '?': '01110 10001 00001 00010 00100 00000 00100',
}

/** The glyph for `ch` as seven rows of five booleans; unknown chars get `?`. */
export function glyph(ch: string): boolean[][] {
  return (FONT[ch] ?? FONT['?'])!.split(' ').map((row) => [...row].map((bit) => bit === '1'))
}

/**
 * The avatar initial: the first ascii letter or digit of `name`, uppercased.
 * Accents are stripped with an NFD decomposition first, so `élodie` yields `E`,
 * not `É`; names with no ascii letter or digit at all get `?`.
 */
export function initialOf(name: string): string {
  const [first] = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').match(/[a-z0-9]/i) ?? ['?']
  return (first ?? '?').toUpperCase()
}
