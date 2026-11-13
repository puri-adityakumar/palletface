/**
 * Fixed, deterministic Stage 2 case builders.
 *
 * Shared by the main qualification harness and the fresh-process child so the
 * exact same inputs are built independently in each process. No clock, random
 * source, or process-local counter participates in case selection.
 */

export const STYLE_ORDER = [
  'pixel-sprite',
  'pixel-letter',
  'dither-orb',
  'pixel-landscape',
  'ascii-letter',
  'ascii-field',
  'ascii-face',
  'pixelify-letter',
]

export const LETTER_STYLES = new Set(['pixel-letter', 'ascii-letter', 'pixelify-letter'])

export function caseKey(testCase) {
  return JSON.stringify({
    style: testCase.style,
    seed: testCase.seed,
    name: testCase.name ?? null,
    px: testCase.px,
  })
}

export function optionsFor(testCase) {
  const options = { style: testCase.style, px: testCase.px }
  if (testCase.name !== null && testCase.name !== undefined) options.name = testCase.name
  return options
}

function styleLetterName(corpus, styleIndex, caseIndex) {
  return corpus.names.letter[(styleIndex + caseIndex) % corpus.names.letter.length]
}

function pxAt(corpus, group, index) {
  return corpus.px[group][index % corpus.px[group].length]
}

/** S2-01: 8 styles x 2 seeds x 2 option sets, each repeated 100 times. */
export function buildRepeatCombos(corpus) {
  const combos = []
  STYLE_ORDER.forEach((style, styleIndex) => {
    corpus.seeds.repeat.forEach((seed, seedIndex) => {
      for (const [variantIndex, variant] of [
        { label: 'default-px', px: 80, name: null },
        { label: 'named-fractional-px', px: 47.5, name: '\u00c9lodie' },
      ].entries()) {
        combos.push({
          style,
          seed,
          name: variant.name,
          px: variant.px,
          variant: variant.label,
          index: combos.length,
          styleIndex,
          seedIndex,
          variantIndex,
        })
      }
    })
  })
  return combos
}

/** S2-02: 8 styles x 20 fresh seeds, names/sizes cycling deterministically. */
export function buildFreshCases(corpus) {
  const cases = []
  STYLE_ORDER.forEach((style, styleIndex) => {
    corpus.seeds.fresh.forEach((seed, seedIndex) => {
      const name = LETTER_STYLES.has(style) ? styleLetterName(corpus, styleIndex, seedIndex) : null
      cases.push({ style, seed, name, px: pxAt(corpus, 'fresh', styleIndex + seedIndex) })
    })
  })
  return cases
}

/** S2-03: 8 styles x 6 cross-engine seeds. */
export function buildCrossEngineCases(corpus) {
  const cases = []
  STYLE_ORDER.forEach((style, styleIndex) => {
    corpus.seeds.crossEngine.forEach((seed, seedIndex) => {
      const name = LETTER_STYLES.has(style) ? styleLetterName(corpus, styleIndex, seedIndex) : null
      cases.push({ style, seed, name, px: pxAt(corpus, 'crossEngine', styleIndex + seedIndex) })
    })
  })
  return cases
}

/** S2-04: adversarial Unicode/control/lone-surrogate seeds and names. */
export function buildUnicodeCases(corpus) {
  const cases = []
  STYLE_ORDER.forEach((style, styleIndex) => {
    corpus.seeds.unicode.forEach((seed, seedIndex) => {
      const name = LETTER_STYLES.has(style) ? styleLetterName(corpus, styleIndex, seedIndex) : null
      cases.push({ style, seed, name, px: [48, 64, 80][(styleIndex + seedIndex) % 3], label: `seed-${seedIndex}` })
    })
    if (LETTER_STYLES.has(style)) {
      corpus.names.unicode.forEach((name, nameIndex) => {
        cases.push({ style, seed: 'unicode-name', name, px: 64, label: `name-${nameIndex}` })
      })
    }
  })
  return cases
}

/** S2-05: 8 styles x 10 mixed seeds plus two exact repeats = 82 instances. */
export function buildMixedInstances(corpus) {
  const instances = []
  STYLE_ORDER.forEach((style, styleIndex) => {
    corpus.seeds.mixed.forEach((seed, seedIndex) => {
      const name = LETTER_STYLES.has(style) ? styleLetterName(corpus, styleIndex, seedIndex) : null
      instances.push({ style, seed, name, px: pxAt(corpus, 'mixed', styleIndex * 3 + seedIndex) })
    })
  })
  instances.push({ ...instances[0] })
  instances.push({ ...instances[9] })
  return instances
}

/** S2-06: 8 styles x 2 embedding seeds. */
export function buildEmbeddingCases(corpus) {
  const cases = []
  STYLE_ORDER.forEach((style, styleIndex) => {
    corpus.seeds.embedding.forEach((seed, seedIndex) => {
      const name = LETTER_STYLES.has(style) ? styleLetterName(corpus, styleIndex, seedIndex) : null
      cases.push({ style, seed, name, px: 64 })
    })
  })
  return cases
}

/** S2-07: four representative transports, all styles kept in S2-06. */
export function buildTransportCases(corpus) {
  const styles = ['pixel-sprite', 'ascii-letter', 'ascii-field', 'pixelify-letter']
  return styles.map((style, index) => ({
    style,
    seed: corpus.seeds.embedding[index % corpus.seeds.embedding.length],
    name: LETTER_STYLES.has(style) ? corpus.names.letter[index % corpus.names.letter.length] : null,
    px: 80,
  }))
}

/** S2-08 schedule A: 8 styles x 24 pairwise seeds, style-major. */
export function buildPairwiseCases(corpus) {
  const cases = []
  STYLE_ORDER.forEach((style, styleIndex) => {
    corpus.seeds.pairwise.forEach((seed, seedIndex) => {
      const name = LETTER_STYLES.has(style) ? styleLetterName(corpus, styleIndex, seedIndex) : null
      cases.push({ style, seed, name, px: pxAt(corpus, 'pairwise', styleIndex + seedIndex) })
    })
  })
  return cases
}

/** Schedule B: the same cases ordered seed-major, maximally interleaving styles. */
export function interleaveCases(cases, corpus) {
  const bySeed = new Map()
  cases.forEach((testCase, index) => {
    if (!bySeed.has(testCase.seed)) bySeed.set(testCase.seed, [])
    bySeed.get(testCase.seed).push({ testCase, scheduleAIndex: index })
  })
  const seedOrder = corpus.seeds.pairwise.filter((seed) => bySeed.has(seed))
  const interleaved = []
  seedOrder.forEach((seed) => {
    const rows = bySeed.get(seed).slice().sort((a, b) => a.testCase.style.localeCompare(b.testCase.style))
    for (const row of rows) interleaved.push({ testCase: row.testCase, scheduleAIndex: row.scheduleAIndex })
  })
  return interleaved
}

/** Size invariance: 8 styles x 6 seeds x 6 sizes. */
export function buildSizeCases(corpus) {
  const cases = []
  STYLE_ORDER.forEach((style, styleIndex) => {
    corpus.s2_08.sizeSeeds.forEach((seed) => {
      corpus.s2_08.sizePx.forEach((px) => {
        const name = LETTER_STYLES.has(style) ? corpus.names.targeted[styleIndex % corpus.names.targeted.length] : null
        cases.push({ style, seed, name, px })
      })
    })
  })
  return cases
}

/** Name invariance: 3 letter styles x 6 names, plus ignored names on non-letter styles. */
export function buildNameCases(corpus) {
  const cases = []
  for (const style of STYLE_ORDER) {
    if (LETTER_STYLES.has(style)) {
      for (const name of corpus.names.targeted) {
        cases.push({ style, seed: corpus.s2_08.nameSeed, name, px: corpus.s2_08.namePx })
      }
    } else {
      for (const seed of ['name-ignored-alpha', '用户']) {
        cases.push({ style, seed, name: '\u00c9lodie', px: corpus.s2_08.namePx })
      }
    }
  }
  return cases
}