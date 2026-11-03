#!/usr/bin/env node
/**
 * Stage 6 scenarios S6-01..S6-05: URL restore, history, invalid parameters,
 * duplicate parameters and malformed/encoded input.
 */
import {
  compareDigest,
  compareState,
  compareSvg,
  makeUsage,
  optionsFor,
  scenarioRecorder,
} from './s6-lib.mjs'
import {
  assertClean,
  assertRendered,
  assertThumbnail,
  closePage,
  openPage,
  readState,
  traceRecord,
} from './s6-page.mjs'

function queryFor(spec) {
  if (spec.query) return spec.query
  const params = new URLSearchParams()
  params.set('seed', spec.seed)
  if (spec.explicitNameBlank || spec.name !== '') params.set('name', spec.name)
  params.set('style', spec.style)
  params.set('size', spec.size)
  return `/?${params.toString()}`
}

function expectedFor(ctx, state) {
  const style = state.style ?? state.selected?.[0]
  return ctx.lib.ditherFace(state.seed, optionsFor(style, Number(state.size), state.name))
}

function checkCanonical(c, state, { seed, name, style, size }, label) {
  c.equal(state.paramAll.seed?.[0], seed, `${label}: URL seed`)
  c.equal(state.paramAll.style?.[0], style, `${label}: URL style`)
  c.equal(state.paramAll.size?.[0], size, `${label}: URL size`)
  if (name === '') {
    c.check(state.paramAll.name === undefined, `${label}: blank name omitted from URL`, { name: state.paramAll.name })
  } else {
    c.equal(state.paramAll.name?.[0], name, `${label}: URL name`)
  }
  for (const key of ['seed', 'style', 'size', 'name']) {
    const count = state.paramAll[key]?.length ?? 0
    c.check(count <= 1, `${label}: URL has at most one ${key}`, { count, values: state.paramAll[key] })
  }
}

function checkPage(c, state, expectedSvg, { style, size }, label) {
  const comparison = compareSvg(expectedSvg, state.source)
  c.check(comparison.ok, `${label}: textarea source is the exact expected SVG`, comparison)
  c.equal(state.selected.join(','), style, `${label}: selected style`)
  c.equal(state.size, size, `${label}: size select value`)
  c.equal(state.previewWidth, size, `${label}: rendered SVG width`)
  c.equal(state.previewHeight, size, `${label}: rendered SVG height`)
  c.check(Boolean(state.previewViewBox), `${label}: rendered SVG viewBox present`, { viewBox: state.previewViewBox })
  c.equal(state.previewSvgCount, 1, `${label}: exactly one preview SVG`)
  c.equal(state.galleryButtons, 8, `${label}: eight style buttons`)
  c.equal(state.gallerySvgs, 8, `${label}: eight gallery thumbnail SVGs`)
}

async function runScenario(ctx, id, fn) {
  const recorder = scenarioRecorder(id, ctx.expected.expectations[id])
  recorder.state.traces = []
  recorder.state.screenshots = []
  try {
    await fn(recorder.runCase, recorder.state)
  } catch (error) {
    recorder.state.failures.push({
      case: '__scenario__',
      assertions: 0,
      failures: [{ message: `scenario threw: ${error.message}`, detail: { stack: error.stack } }],
    })
  }
  return recorder.finish()
}

const restoreCases = [
  {
    name: 'defaults-no-query',
    query: '/',
    seed: 'dither-face',
    name: '',
    style: 'pixel-sprite',
    size: '80',
  },
  {
    name: 'empty-seed-explicit',
    seed: '',
    name: '',
    style: 'pixel-sprite',
    size: '80',
  },
  {
    name: 'name-blank-explicit-48',
    seed: 'preview-output',
    name: '',
    explicitNameBlank: true,
    style: 'ascii-letter',
    size: '48',
  },
  {
    name: 'numeric-seed-pixel-letter-48',
    seed: '20261104',
    name: '',
    style: 'pixel-letter',
    size: '48',
  },
  {
    name: 'unicode-seed-and-name-ascii-letter-128',
    seed: '東京🌍',
    name: 'Élodie',
    style: 'ascii-letter',
    size: '128',
  },
  {
    name: 'golden-pixel-sprite-80',
    seed: 'preview-output',
    name: '7even',
    style: 'pixel-sprite',
    size: '80',
    golden: 'pixel-sprite',
  },
  {
    name: 'golden-pixel-letter-80',
    seed: 'preview-output',
    name: '7even',
    style: 'pixel-letter',
    size: '80',
    golden: 'pixel-letter',
  },
  {
    name: 'golden-dither-orb-80',
    seed: 'preview-output',
    name: '7even',
    style: 'dither-orb',
    size: '80',
    golden: 'dither-orb',
  },
  {
    name: 'golden-pixel-landscape-80',
    seed: 'preview-output',
    name: '7even',
    style: 'pixel-landscape',
    size: '80',
    golden: 'pixel-landscape',
  },
  {
    name: 'golden-ascii-letter-80',
    seed: 'preview-output',
    name: '7even',
    style: 'ascii-letter',
    size: '80',
    golden: 'ascii-letter',
  },
  {
    name: 'golden-ascii-field-80',
    seed: 'preview-output',
    name: '7even',
    style: 'ascii-field',
    size: '80',
    golden: 'ascii-field',
  },
  {
    name: 'golden-ascii-face-80',
    seed: 'preview-output',
    name: '7even',
    style: 'ascii-face',
    size: '80',
    golden: 'ascii-face',
  },
  {
    name: 'golden-pixelify-letter-80',
    seed: 'preview-output',
    name: '7even',
    style: 'pixelify-letter',
    size: '80',
    golden: 'pixelify-letter',
  },
  {
    name: 'size-192-pixel-landscape',
    seed: '1234567890',
    name: '',
    style: 'pixel-landscape',
    size: '192',
  },
]

async function runS601(ctx, runCase, state) {
  const caseNames = ctx.expected.expectations['S6-01'].cases
  for (const [index, spec] of restoreCases.entries()) {
    const caseName = caseNames[index]
    await runCase(caseName, async (c) => {
      const opened = await openPage(ctx.chromium, { origin: ctx.origin, url: queryFor(spec) })
      try {
        c.check(!opened.gotoError, `${caseName}: page loaded`, { error: opened.gotoError })
        c.check(!opened.readyError, `${caseName}: application ready`, { error: opened.readyError })
        if (opened.gotoError || opened.readyError) return
        const st = await readState(opened.page)
        const options = optionsFor(spec.style, Number(spec.size), spec.name)
        const expectedSvg = ctx.lib.ditherFace(spec.seed, options)
        checkPage(c, st, expectedSvg, spec, caseName)
        checkCanonical(c, st, spec, caseName)
        c.equal(st.usage, makeUsage(spec.seed, options), `${caseName}: exact usage source`)
        await assertRendered(c, opened.page, '#preview', expectedSvg, `${caseName}: preview DOM matches expected SVG`)
        if (spec.golden) {
          const digest = compareDigest(ctx.goldenHashes[spec.golden], st.source)
          c.check(digest.ok, `${caseName}: recorded golden SHA-256`, digest)
        }
        assertClean(c, opened.rec, { label: caseName })
        if (caseName === 'defaults-no-query') {
          const shot = await ctx.screenshot(opened.page, 'S6-01-default')
          state.screenshots.push(shot)
        }
      } finally {
        state.traces.push(traceRecord(caseName, opened.rec))
        await closePage(opened)
      }
    })
  }
}

const firstHistoryUrl = '/?seed=alpha&style=pixel-sprite&size=80'
const secondHistoryUrl = '/?seed=charlie&style=dither-orb&size=192&name=Zoe'

async function runS602(ctx, runCase, state) {
  const opened = await openPage(ctx.chromium, { origin: ctx.origin, url: firstHistoryUrl })
  const page = opened.page
  let historyBase = null
  let editedSeed = null
  let editedState = null
  let secondState = null
  try {
    await runCase('initial-share-url-restored', async (c) => {
      c.check(!opened.gotoError, 'initial page loaded', { error: opened.gotoError })
      const st = await readState(page)
      historyBase = st.historyLength
      c.equal(st.seed, 'alpha', 'initial seed')
      c.equal(st.style ?? st.selected[0], 'pixel-sprite', 'initial style')
      c.equal(st.size, '80', 'initial size')
      c.check(st.historyLength >= 1, 'real history length is at least one', { historyLength: st.historyLength })
      checkPage(c, st, expectedFor(ctx, st), { style: 'pixel-sprite', size: '80' }, 'initial')
      assertClean(c, opened.rec, { label: 'initial' })
    })

    await runCase('seed-keystrokes-replace-not-push', async (c) => {
      await page.locator('#seed').click()
      await page.keyboard.press('Control+A')
      await page.locator('#seed').pressSequentially('bravo-charlie', { delay: 2 })
      const st = await readState(page)
      editedSeed = st.seed
      c.equal(st.seed, 'bravo-charlie', 'seed after per-keystroke typing')
      c.equal(st.historyLength, historyBase, 'history length unchanged by per-keystroke replaceState')
      c.equal(st.paramAll.seed?.[0], 'bravo-charlie', 'URL seed after typing')
      c.check(compareSvg(expectedFor(ctx, st), st.source).ok, 'source matches typed seed')
    })

    await runCase('control-edits-replace-not-push', async (c) => {
      await page.locator('#gallery button[data-style="ascii-letter"]').click()
      await page.locator('#size').selectOption('128')
      await page.locator('#name').fill('Ada')
      const st = await readState(page)
      editedState = { seed: st.seed, name: st.name, style: st.selected[0], size: st.size, source: st.source, url: st.url }
      c.equal(st.historyLength, historyBase, 'history length unchanged by style/size/name edits')
      c.equal(st.selected[0], 'ascii-letter', 'edited style')
      c.equal(st.size, '128', 'edited size')
      c.equal(st.name, 'Ada', 'edited name')
      c.check(compareSvg(expectedFor(ctx, st), st.source).ok, 'source matches edited controls')
      c.equal(st.paramAll.style?.[0], 'ascii-letter', 'URL edited style')
      c.equal(st.paramAll.size?.[0], '128', 'URL edited size')
      c.equal(st.paramAll.name?.[0], 'Ada', 'URL edited name')
    })

    await runCase('second-share-url-restored', async (c) => {
      await page.goto(`${ctx.origin}${secondHistoryUrl}`, { waitUntil: 'load' })
      await page.waitForFunction(() => document.querySelectorAll('#gallery button').length === 8)
      const st = await readState(page)
      secondState = { seed: st.seed, name: st.name, style: st.selected[0], size: st.size, source: st.source, url: st.url }
      c.equal(st.seed, 'charlie', 'second share seed')
      c.equal(st.name, 'Zoe', 'second share name')
      c.equal(st.selected[0], 'dither-orb', 'second share style')
      c.equal(st.size, '192', 'second share size')
      c.check(compareSvg(expectedFor(ctx, st), st.source).ok, 'second share source')
    })

    await runCase('back-restores-edited-entry', async (c) => {
      await page.goBack({ waitUntil: 'load' })
      await page.waitForFunction(() => document.querySelector('#seed')?.value === 'bravo-charlie')
      const st = await readState(page)
      const comparison = compareState(editedState, {
        seed: st.seed,
        name: st.name,
        style: st.selected[0],
        size: st.size,
        source: st.source,
        url: st.url,
      }, ['seed', 'name', 'style', 'size', 'source'])
      c.check(comparison.ok, 'back restores the edited entry state', comparison)
      c.equal(st.paramAll.seed?.[0], editedSeed, 'back URL seed')
    })

    await runCase('forward-restores-second-entry', async (c) => {
      await page.goForward({ waitUntil: 'load' })
      await page.waitForFunction(() => document.querySelector('#seed')?.value === 'charlie')
      const st = await readState(page)
      const comparison = compareState(secondState, {
        seed: st.seed,
        name: st.name,
        style: st.selected[0],
        size: st.size,
        source: st.source,
      }, ['seed', 'name', 'style', 'size', 'source'])
      c.check(comparison.ok, 'forward restores the second entry state', comparison)
      c.equal(st.paramAll.seed?.[0], 'charlie', 'forward URL seed')
    })

    await runCase('hash-preserved-in-share-url', async (c) => {
      await page.goto(`${ctx.origin}/?seed=hashy&style=ascii-field&size=48#frag`, { waitUntil: 'load' })
      await page.waitForFunction(() => document.querySelectorAll('#gallery button').length === 8)
      const before = await readState(page)
      c.equal(before.hash, '#frag', 'hash present on load')
      await page.locator('#seed').fill('hash-edited')
      const after = await readState(page)
      c.equal(after.hash, '#frag', 'hash preserved after state edit')
      c.equal(after.paramAll.seed?.[0], 'hash-edited', 'edited seed in URL')
      c.check(after.url.endsWith('#frag'), 'share URL retains hash', { url: after.url })
      c.check(compareSvg(expectedFor(ctx, after), after.source).ok, 'hash case source matches state')
    })

    await runCase('hash-back-popstate-restores', async (c) => {
      await page.goto(`${ctx.origin}/?seed=hashback&style=pixel-sprite&size=80`, { waitUntil: 'load' })
      await page.waitForFunction(() => document.querySelectorAll('#gallery button').length === 8)
      await page.evaluate(() => {
        window.__s6Popstate = 0
        window.addEventListener('popstate', () => { window.__s6Popstate += 1 })
      })
      await page.locator('a.wordmark').click()
      await page.waitForFunction(() => location.hash === '#top')
      const atHash = await readState(page)
      c.equal(atHash.hash, '#top', 'hash navigation created a same-document entry')
      await page.evaluate(() => history.back())
      await page.waitForFunction(() => location.hash === '')
      await page.waitForFunction(() => window.__s6Popstate >= 1)
      const st = await readState(page)
      const pops = await page.evaluate(() => window.__s6Popstate)
      c.check(pops >= 1, 'back traversal fired popstate', { pops })
      c.equal(st.seed, 'hashback', 'popstate restored seed')
      c.equal(st.paramAll.seed?.[0], 'hashback', 'popstate restored URL seed')
      c.check(compareSvg(expectedFor(ctx, st), st.source).ok, 'popstate restored the expected source')
      c.equal(st.historyLength, atHash.historyLength, 'back traversal consumed the hash entry without adding one')
      assertClean(c, opened.rec, { label: 'history scenario' })
    })
  } finally {
    state.traces.push(traceRecord('history-seq', opened.rec))
    await closePage(opened)
  }
}

async function runS603(ctx, runCase, state) {
  const defaultStyle = 'pixel-sprite'

  const load = async (query) => {
    const opened = await openPage(ctx.chromium, { origin: ctx.origin, url: query })
    const st = opened.gotoError ? null : await readState(opened.page)
    return { opened, st }
  }

  await runCase('unknown-style-fallback', async (c) => {
    const { opened, st } = await load('/?seed=fallback-unknown&style=not-real&size=80')
    try {
      c.check(!opened.gotoError, 'page loaded')
      c.equal(st.selected[0], defaultStyle, 'unknown style falls back to pixel-sprite')
      c.equal(st.selectedTitle, 'pixel sprite', 'fallback title')
      const expectedDefault = ctx.lib.ditherFace('fallback-unknown', { style: defaultStyle, px: 80 })
      c.check(compareSvg(expectedDefault, st.source).ok, 'fallback source is the default style')
      c.equal(st.paramAll.style?.[0], defaultStyle, 'URL normalized to fallback style')
      assertClean(c, opened.rec, { label: 'unknown style' })
    } finally {
      state.traces.push(traceRecord('unknown-style', opened.rec))
      await closePage(opened)
    }
  })

  await runCase('case-and-type-style-fallback', async (c) => {
    const { opened, st } = await load('/?seed=fallback-case&style=PIXEL-LETTER&size=080')
    try {
      c.check(!opened.gotoError, 'page loaded')
      c.equal(st.selected[0], defaultStyle, 'wrong-case style falls back')
      c.equal(st.size, '80', 'non-whitelisted 080 size falls back to 80')
      c.equal(st.paramAll.style?.[0], defaultStyle, 'URL style normalized')
      c.equal(st.paramAll.size?.[0], '80', 'URL size normalized')
      assertClean(c, opened.rec, { label: 'wrong case style' })
    } finally {
      state.traces.push(traceRecord('case-style', opened.rec))
      await closePage(opened)
    }
  })

  await runCase('nonnumeric-size-fallback', async (c) => {
    const { opened, st } = await load('/?seed=fallback-nan&style=pixel-sprite&size=abc')
    try {
      c.check(!opened.gotoError, 'page loaded')
      c.equal(st.size, '80', 'non-numeric size falls back to 80')
      c.equal(st.previewWidth, '80', 'rendered width is 80')
      c.equal(st.paramAll.size?.[0], '80', 'URL size normalized to 80')
      assertClean(c, opened.rec, { label: 'nonnumeric size' })
    } finally {
      state.traces.push(traceRecord('nonnumeric-size', opened.rec))
      await closePage(opened)
    }
  })

  await runCase('out-of-range-size-fallback', async (c) => {
    const opened = await openPage(ctx.chromium, { origin: ctx.origin, url: '/?seed=fallback-range&style=dither-orb&size=-1' })
    try {
      c.check(!opened.gotoError, 'page loaded')
      for (const size of ['-1', '0', '999999', '1e3']) {
        await opened.page.goto(`${ctx.origin}/?seed=fallback-range&style=dither-orb&size=${size}`, { waitUntil: 'load' })
        await opened.page.waitForFunction(() => document.querySelectorAll('#gallery button').length === 8)
        const st = await readState(opened.page)
        c.equal(st.size, '80', `size ${size} falls back to 80`)
        c.equal(st.previewWidth, '80', `size ${size} renders at 80`)
        c.equal(st.paramAll.size?.[0], '80', `size ${size} URL normalized`)
      }
      assertClean(c, opened.rec, { label: 'out of range sizes' })
    } finally {
      state.traces.push(traceRecord('out-of-range-size', opened.rec))
      await closePage(opened)
    }
  })

  await runCase('ui-whitelist-size-64-falls-back', async (c) => {
    const { opened, st } = await load('/?seed=fallback-64&style=pixel-landscape&size=64')
    try {
      c.check(!opened.gotoError, 'page loaded')
      c.equal(st.size, '80', 'UI does not accept 64')
      c.equal(st.previewWidth, '80', '64 renders at the 80 fallback')
      const library64 = ctx.lib.ditherFace('fallback-64', { style: 'pixel-landscape', px: 64 })
      c.check(library64.includes('width="64"'), 'library itself accepts px 64')
      c.check(library64 !== ctx.lib.ditherFace('fallback-64', { style: 'pixel-landscape', px: 80 }), 'px 64 changes output')
      assertClean(c, opened.rec, { label: 'size 64' })
    } finally {
      state.traces.push(traceRecord('size-64', opened.rec))
      await closePage(opened)
    }
  })

  await runCase('empty-values-default-with-empty-seed', async (c) => {
    const { opened, st } = await load('/?seed=&name=&style=&size=')
    try {
      c.check(!opened.gotoError, 'page loaded')
      c.equal(st.seed, '', 'empty seed remains valid')
      c.equal(st.name, '', 'empty name remains blank')
      c.equal(st.selected[0], defaultStyle, 'empty style uses default')
      c.equal(st.size, '80', 'empty size uses default')
      c.check(st.paramAll.name === undefined, 'empty name omitted from normalized URL')
      c.check(compareSvg(ctx.lib.ditherFace('', { style: defaultStyle, px: 80 }), st.source).ok, 'empty seed source')
      assertClean(c, opened.rec, { label: 'empty values' })
    } finally {
      state.traces.push(traceRecord('empty-values', opened.rec))
      await closePage(opened)
    }
  })

  await runCase('url-normalized-after-invalid', async (c) => {
    const { opened, st } = await load('/?seed=keep&style=unknown&size=999&name=')
    try {
      c.check(!opened.gotoError, 'page loaded')
      c.equal(st.paramAll.seed?.[0], 'keep', 'valid seed preserved')
      c.equal(st.paramAll.style?.[0], defaultStyle, 'unknown style replaced with default')
      c.equal(st.paramAll.size?.[0], '80', 'invalid size replaced with default')
      c.check(st.paramAll.name === undefined, 'blank name removed')
      c.check(Object.values(st.paramAll).every((values) => values.length === 1), 'one value per normalized key')
      assertClean(c, opened.rec, { label: 'url normalized' })
    } finally {
      state.traces.push(traceRecord('url-normalized', opened.rec))
      await closePage(opened)
    }
  })

  await runCase('invalid-input-no-crash', async (c) => {
    const query = `/?seed=${encodeURIComponent('<b>bold</b>')}&style=nope&size=NaN&name=${encodeURIComponent('"><img src=x>')}`
    const { opened, st } = await load(query)
    try {
      c.check(!opened.gotoError, 'page loaded')
      c.equal(opened.rec.pageErrors.length, 0, 'no page error')
      c.equal(st.previewSvgCount, 1, 'preview still renders one SVG')
      c.equal(st.galleryButtons, 8, 'gallery still renders eight styles')
      c.check(compareSvg(expectedFor(ctx, st), st.source).ok, 'source matches sanitized state')
      const injected = await opened.page.evaluate(() => document.querySelectorAll('#preview img, #gallery img, #preview script').length)
      c.equal(injected, 0, 'no injected elements')
      assertClean(c, opened.rec, { label: 'invalid input' })
    } finally {
      state.traces.push(traceRecord('invalid-no-crash', opened.rec))
      await closePage(opened)
    }
  })

  await runCase('ui-whitelist-and-library-broader', async (c) => {
    const { opened, st } = await load('/?seed=size-matrix&style=pixel-letter&size=80')
    try {
      c.check(!opened.gotoError, 'page loaded')
      c.equal(JSON.stringify(st.sizeOptions), JSON.stringify(['48', '80', '128', '192']), 'UI size whitelist exact')
      for (const px of ['48', '80', '128', '192']) {
        await opened.page.locator('#size').selectOption(px)
        const next = await readState(opened.page)
        const expected = ctx.lib.ditherFace('size-matrix', { style: 'pixel-letter', px: Number(px) })
        c.check(compareSvg(expected, next.source).ok, `UI size ${px} renders exact expected source`)
        c.equal(next.previewWidth, px, `UI size ${px} rendered width`)
      }
      for (const px of [1, 64, 1000]) {
        const svg = ctx.lib.ditherFace('size-matrix', { style: 'pixel-letter', px })
        c.check(svg.includes(`width="${px}"`), `library broader size ${px} is accepted`)
      }
      assertClean(c, opened.rec, { label: 'size whitelist' })
    } finally {
      state.traces.push(traceRecord('size-whitelist', opened.rec))
      await closePage(opened)
    }
  })

  state.notes.push({
    message: 'Invalid-style/size fallback is the documented default (pixel-sprite, 80) plus the playground UI whitelist 48/80/128/192; empty seed and blank name are valid, not errors. The library itself accepts other positive finite sizes.',
  })
}

async function runS604(ctx, runCase, state) {
  const load = async (query) => {
    const opened = await openPage(ctx.chromium, { origin: ctx.origin, url: query })
    const st = opened.gotoError ? null : await readState(opened.page)
    return { opened, st }
  }

  await runCase('duplicate-seed-first-wins', async (c) => {
    const { opened, st } = await load('/?seed=first&seed=second&style=pixel-sprite&size=80')
    try {
      c.check(!opened.gotoError, 'page loaded')
      c.equal(st.seed, 'first', 'first duplicate seed wins')
      c.equal(st.paramAll.seed?.length, 1, 'normalized URL has one seed')
      c.equal(st.paramAll.seed?.[0], 'first', 'normalized seed is first value')
      c.check(compareSvg(ctx.lib.ditherFace('first', { style: 'pixel-sprite', px: 80 }), st.source).ok, 'source uses first seed')
      assertClean(c, opened.rec, { label: 'duplicate seed' })
    } finally {
      state.traces.push(traceRecord('dup-seed', opened.rec))
      await closePage(opened)
    }
  })

  await runCase('duplicate-style-first-wins', async (c) => {
    const { opened, st } = await load('/?style=ascii-letter&style=pixel-letter&seed=dup-style&size=80')
    try {
      c.check(!opened.gotoError, 'page loaded')
      c.equal(st.selected[0], 'ascii-letter', 'first duplicate style wins')
      c.equal(st.paramAll.style?.[0], 'ascii-letter', 'normalized style is first value')
      c.check(compareSvg(ctx.lib.ditherFace('dup-style', { style: 'ascii-letter', px: 80 }), st.source).ok, 'source uses first style')
      assertClean(c, opened.rec, { label: 'duplicate style' })
    } finally {
      state.traces.push(traceRecord('dup-style', opened.rec))
      await closePage(opened)
    }
  })

  await runCase('duplicate-size-first-wins', async (c) => {
    const { opened, st } = await load('/?size=48&size=192&seed=dup-size&style=pixel-sprite')
    try {
      c.check(!opened.gotoError, 'page loaded')
      c.equal(st.size, '48', 'first duplicate size wins')
      c.equal(st.previewWidth, '48', 'rendered width is first size')
      c.equal(st.paramAll.size?.length, 1, 'normalized URL has one size')
      c.equal(st.paramAll.size?.[0], '48', 'normalized size is first value')
      assertClean(c, opened.rec, { label: 'duplicate size' })
    } finally {
      state.traces.push(traceRecord('dup-size', opened.rec))
      await closePage(opened)
    }
  })

  await runCase('duplicate-name-first-wins', async (c) => {
    const { opened, st } = await load('/?name=Ada&name=Bob&seed=dup-name&style=ascii-letter&size=80')
    try {
      c.check(!opened.gotoError, 'page loaded')
      c.equal(st.name, 'Ada', 'first duplicate name wins')
      c.equal(st.paramAll.name?.[0], 'Ada', 'normalized name is first value')
      const expectedFirst = ctx.lib.ditherFace('dup-name', { style: 'ascii-letter', px: 80, name: 'Ada' })
      const expectedSecond = ctx.lib.ditherFace('dup-name', { style: 'ascii-letter', px: 80, name: 'Bob' })
      c.check(compareSvg(expectedFirst, st.source).ok, 'source uses first name')
      c.check(compareSvg(expectedSecond, st.source).ok === false, 'source is not the discarded second name')
      assertClean(c, opened.rec, { label: 'duplicate name' })
    } finally {
      state.traces.push(traceRecord('dup-name', opened.rec))
      await closePage(opened)
    }
  })

  await runCase('empty-first-seed-wins', async (c) => {
    const { opened, st } = await load('/?seed=&seed=second&name=&name=Bob&style=pixel-sprite&size=80')
    try {
      c.check(!opened.gotoError, 'page loaded')
      c.equal(st.seed, '', 'empty first seed wins')
      c.equal(st.name, '', 'empty first name wins')
      c.equal(st.paramAll.seed?.length, 1, 'one normalized seed')
      c.equal(st.paramAll.seed?.[0], '', 'normalized seed is the empty first value')
      c.check(st.paramAll.name === undefined, 'normalized URL omits the blank name')
      c.check(compareSvg(ctx.lib.ditherFace('', { style: 'pixel-sprite', px: 80 }), st.source).ok, 'source uses empty seed')
      assertClean(c, opened.rec, { label: 'empty first' })
    } finally {
      state.traces.push(traceRecord('dup-empty-first', opened.rec))
      await closePage(opened)
    }
  })

  await runCase('key-order-and-duplicates-normalized', async (c) => {
    const first = await load('/?size=128&seed=order&style=dither-orb')
    const second = await load('/?style=dither-orb&size=128&seed=order&seed=ignored')
    try {
      c.check(!first.opened.gotoError && !second.opened.gotoError, 'both pages loaded')
      c.check(compareSvg(first.st.source, second.st.source).ok, 'distinct key order produces the same source')
      c.equal(new URL(first.st.url).search, new URL(second.st.url).search, 'both normalize to the same query')
      c.equal(second.st.seed, 'order', 'first value still wins with another key order')
      c.equal(second.st.paramAll.seed?.length, 1, 'duplicate collapsed in normalized URL')
      c.equal(second.st.size, '128', 'size preserved across key order')
      assertClean(c, first.opened.rec, { label: 'order first' })
      assertClean(c, second.opened.rec, { label: 'order second' })
    } finally {
      state.traces.push(traceRecord('order-first', first.opened.rec))
      state.traces.push(traceRecord('order-second', second.opened.rec))
      await closePage(first.opened)
      await closePage(second.opened)
    }
  })

  await runCase('reload-consistent', async (c) => {
    const { opened, st } = await load('/?seed=reload&seed=again&style=ascii-field&size=128&name=Zoe')
    try {
      c.check(!opened.gotoError, 'page loaded')
      const before = { seed: st.seed, name: st.name, style: st.selected[0], size: st.size, source: st.source, url: st.url }
      await opened.page.reload({ waitUntil: 'load' })
      await opened.page.waitForFunction(() => document.querySelectorAll('#gallery button').length === 8)
      const after = await readState(opened.page)
      const comparison = compareState(before, {
        seed: after.seed,
        name: after.name,
        style: after.selected[0],
        size: after.size,
        source: after.source,
        url: after.url,
      }, ['seed', 'name', 'style', 'size', 'source', 'url'])
      c.check(comparison.ok, 'reload preserves the normalized state', comparison)
      c.check(Object.values(after.paramAll).every((values) => values.length === 1), 'reload keeps one value per key')
      c.equal(opened.rec.pageErrors.length, 0, 'no page error on reload')
      assertClean(c, opened.rec, { label: 'reload' })
    } finally {
      state.traces.push(traceRecord('reload', opened.rec))
      await closePage(opened)
    }
  })

  state.notes.push({
    message: 'The site documents no app-specific duplicate-parameter precedence. Observed behavior is the platform URLSearchParams.get first-value rule, including an explicitly empty first value, and the normalized URL keeps one value per key. No precedence was invented.',
  })
}

async function runS605(ctx, runCase, state) {
  const open = async (url) => openPage(ctx.chromium, { origin: ctx.origin, url, loadTimeout: 20_000 })

  async function loadCase(c, url, { label, expectStyle = 'pixel-sprite', expectSize = '80', maxMs = 15_000 } = {}) {
    const opened = await open(url)
    try {
      c.check(!opened.gotoError, `${label}: page loaded`, { error: opened.gotoError })
      c.check(!opened.readyError, `${label}: app ready`, { error: opened.readyError })
      c.check(opened.durationMs < maxMs, `${label}: bounded load time`, { durationMs: opened.durationMs, maxMs })
      if (opened.gotoError || opened.readyError) return { opened, st: null }
      const st = await readState(opened.page)
      c.equal(st.selected[0], expectStyle, `${label}: expected style`)
      c.equal(st.size, expectSize, `${label}: expected size`)
      c.check(compareSvg(expectedFor(ctx, st), st.source).ok, `${label}: source matches decoded displayed state`)
      await assertRendered(c, opened.page, '#preview', expectedFor(ctx, st), `${label}: preview matches displayed state`)
      c.equal(st.galleryButtons, 8, `${label}: eight styles rendered`)
      c.check(!/[\r\n]/.test(st.url), `${label}: URL contains no raw newline`)
      c.check(!st.url.includes('<script') && !st.url.includes('onerror='), `${label}: URL contains no raw injection token`, { url: st.url.slice(0, 400) })
      return { opened, st }
    } catch (error) {
      c.check(false, `${label}: case threw ${error.message}`)
      return { opened, st: null }
    }
  }

  const finish = async (name, opened) => {
    state.traces.push(traceRecord(name, opened.rec))
    await closePage(opened)
  }

  await runCase('bare-percent', async (c) => {
    const { opened, st } = await loadCase(c, '/?seed=%&style=pixel-sprite&size=80', { label: 'bare percent' })
    try {
      if (st) {
        c.equal(st.paramAll.seed?.[0], st.seed, 'percent text round-trips through URLSearchParams')
        assertClean(c, opened.rec, { label: 'bare percent' })
      }
    } finally {
      await finish('bare-percent', opened)
    }
  })

  await runCase('invalid-percent-sequences', async (c) => {
    const { opened, st } = await loadCase(c, '/?seed=%ZZ%E0%A4%A&style=pixel-sprite&size=80', { label: 'invalid percent' })
    try {
      if (st) {
        c.check(st.seed.length > 0, 'malformed percent does not crash or erase the seed')
        assertClean(c, opened.rec, { label: 'invalid percent' })
      }
    } finally {
      await finish('invalid-percent', opened)
    }
  })

  await runCase('invalid-utf8-replacement', async (c) => {
    const { opened, st } = await loadCase(c, '/?seed=%C3%28&name=%FF&style=ascii-letter&size=80', {
      label: 'invalid utf8',
      expectStyle: 'ascii-letter',
    })
    try {
      if (st) {
        c.check(st.paramAll.seed?.[0] === st.seed, 'invalid UTF-8 seed round-trips consistently')
        c.check(st.paramAll.name?.[0] === st.name, 'invalid UTF-8 name round-trips consistently')
        assertClean(c, opened.rec, { label: 'invalid utf8' })
      }
    } finally {
      await finish('invalid-utf8', opened)
    }
  })

  await runCase('html-image-injection', async (c) => {
    const seed = '<img src=x onerror="window.__pwned=\'img\'">'
    const name = '"><img src=x onerror="window.__pwned=\'name\'">'
    const params = new URLSearchParams({ seed, name, style: 'ascii-letter', size: '80' })
    const { opened, st } = await loadCase(c, `/?${params}`, { label: 'html image', expectStyle: 'ascii-letter' })
    try {
      if (st) {
        const injected = await opened.page.evaluate(() => ({
          pwned: window.__pwned ?? null,
          nodes: document.querySelectorAll('#preview img, #gallery img, #preview script, #gallery script').length,
        }))
        c.equal(injected.pwned, null, 'onerror payload did not execute')
        c.equal(injected.nodes, 0, 'no img/script nodes were injected')
        c.check(!st.source.includes('<img'), 'SVG source contains no raw img tag')
        c.check(st.usage.includes(JSON.stringify(name)), 'usage JSON-encodes the img payload as data')
        assertClean(c, opened.rec, { label: 'html image' })
      }
    } finally {
      await finish('html-image', opened)
    }
  })

  await runCase('script-tag-injection', async (c) => {
    const seed = '</textarea><script>window.__pwned=\'script\'</script>'
    const name = '<script>window.__pwned=\'name-script\'</script>'
    const params = new URLSearchParams({ seed, name, style: 'ascii-letter', size: '80' })
    const { opened, st } = await loadCase(c, `/?${params}`, { label: 'script tag', expectStyle: 'ascii-letter' })
    try {
      if (st) {
        const injected = await opened.page.evaluate(() => ({
          pwned: window.__pwned ?? null,
          previewScripts: document.querySelectorAll('#preview script, #gallery script').length,
          scripts: document.scripts.length,
        }))
        c.equal(injected.pwned, null, 'script payload did not execute')
        c.equal(injected.previewScripts, 0, 'no script nodes in preview or gallery')
        c.check(injected.scripts <= 1, 'only the legitimate module script exists', injected)
        c.check(!st.source.includes('<script>'), 'SVG source contains no raw script tag')
        c.check(st.usage.includes(JSON.stringify(name)), 'usage JSON-encodes the script payload as data')
        assertClean(c, opened.rec, { label: 'script tag' })
      }
    } finally {
      await finish('script-tag', opened)
    }
  })

  await runCase('attribute-and-svg-injection', async (c) => {
    const seed = '"><svg onload="window.__pwned=\'svg\'">'
    const name = '"><svg onload="window.__pwned=\'name-svg\'">'
    const params = new URLSearchParams({ seed, name, style: 'ascii-letter', size: '80' })
    const { opened, st } = await loadCase(c, `/?${params}`, { label: 'svg onload', expectStyle: 'ascii-letter' })
    try {
      if (st) {
        const injected = await opened.page.evaluate(() => ({
          pwned: window.__pwned ?? null,
          handlers: document.querySelectorAll('#preview [onload], #gallery [onload], #preview svg[onload]').length,
          svgs: document.querySelectorAll('#preview svg').length,
        }))
        c.equal(injected.pwned, null, 'onload payload did not execute')
        c.equal(injected.handlers, 0, 'no injected onload attributes')
        c.equal(injected.svgs, 1, 'only the legitimate preview SVG exists')
        c.check(!st.source.includes('<svg onload'), 'SVG source contains no injected svg tag')
        c.check(st.usage.includes(JSON.stringify(name)), 'usage JSON-encodes the SVG-looking payload as data')
        assertClean(c, opened.rec, { label: 'svg onload' })
      }
    } finally {
      await finish('svg-onload', opened)
    }
  })

  await runCase('newline-and-control-characters', async (c) => {
    const { opened, st } = await loadCase(
      c,
      '/?seed=line1%0Aline2%0D%0Aline3%09tab&name=Na%0Ame&style=ascii-letter&size=80',
      { label: 'newlines', expectStyle: 'ascii-letter' },
    )
    try {
      if (st) {
        c.check(!st.seed.includes('\n') && !st.seed.includes('\r'), 'seed input sanitizes CR/LF')
        c.check(!st.name.includes('\n') && !st.name.includes('\r'), 'name input sanitizes CR/LF')
        c.equal(st.paramAll.seed?.[0], st.seed, 'sanitized seed round-trips')
        c.equal(st.paramAll.name?.[0], st.name, 'sanitized name round-trips')
        assertClean(c, opened.rec, { label: 'newlines' })
      }
    } finally {
      await finish('newlines', opened)
    }
  })

  await runCase('long-seed-bounded', async (c) => {
    const seed = 'a'.repeat(12_000)
    const opened = await open(`/?seed=${seed}&style=pixel-sprite&size=80`)
    try {
      c.check(!opened.gotoError, 'long-seed page loaded', { error: opened.gotoError })
      c.check(opened.durationMs < 15_000, 'long-seed load is bounded', { durationMs: opened.durationMs })
      if (!opened.gotoError) {
        const st = await readState(opened.page)
        c.equal(st.seed.length, seed.length, 'long seed preserved at bounded length')
        c.check(compareSvg(ctx.lib.ditherFace(seed, { style: 'pixel-sprite', px: 80 }), st.source).ok, 'long seed renders expected SVG')
        c.equal(st.galleryButtons, 8, 'long seed still renders eight thumbnails')
        c.check(!/[\r\n]/.test(st.url), 'long URL has no raw newline')
        assertClean(c, opened.rec, { label: 'long seed' })
      }
    } finally {
      await finish('long-seed', opened)
    }
  })

  await runCase('long-name-bounded', async (c) => {
    const name = 'N'.repeat(4_000)
    const opened = await open(`/?seed=long-name&name=${name}&style=ascii-letter&size=80`)
    try {
      c.check(!opened.gotoError, 'long-name page loaded', { error: opened.gotoError })
      c.check(opened.durationMs < 15_000, 'long-name load is bounded', { durationMs: opened.durationMs })
      if (!opened.gotoError) {
        const st = await readState(opened.page)
        c.equal(st.name.length, name.length, 'long name preserved')
        c.check(compareSvg(ctx.lib.ditherFace('long-name', { style: 'ascii-letter', px: 80, name }), st.source).ok, 'long name renders expected SVG')
        c.check(st.usage.length > name.length, 'usage text remains complete')
        assertClean(c, opened.rec, { label: 'long name' })
      }
    } finally {
      await finish('long-name', opened)
    }
  })

  await runCase('malformed-style-size-hash', async (c) => {
    const url = '/?seed=ok&style=%3Cscript%3E&size=%E0%A4%A&name=%3Cimg%20src%3Dx%20onerror%3Dwindow.__pwned%3D1%3E#%3Csvg%20onload%3Dwindow.__pwned%3D1%3E'
    const { opened, st } = await loadCase(c, url, { label: 'malformed style/size/hash' })
    try {
      if (st) {
        const injected = await opened.page.evaluate(() => ({
          pwned: window.__pwned ?? null,
          nodes: document.querySelectorAll('#preview img, #preview script, #gallery img, #gallery script, #preview svg[onload]').length,
        }))
        c.equal(injected.pwned, null, 'malformed hash/name payload did not execute')
        c.equal(injected.nodes, 0, 'no injected nodes from malformed values')
        c.equal(st.selected[0], 'pixel-sprite', 'malformed style falls back')
        c.equal(st.size, '80', 'malformed size falls back')
        c.check(compareSvg(ctx.lib.ditherFace('ok', { style: 'pixel-sprite', px: 80 }), st.source).ok, 'malformed values render the safe fallback')
        assertClean(c, opened.rec, { label: 'malformed style/size/hash' })
      }
    } finally {
      await finish('malformed-style-size-hash', opened)
    }
  })

  state.notes.push({
    message: 'Malformed percent escapes, invalid UTF-8, HTML/script/onload payloads, newlines and long values were treated as data; no sentinel executed and no blank/stalled page was observed. Long cases were bounded well below 15 seconds.',
  })
}

export async function runScenariosA(ctx) {
  const results = {}
  results['S6-01'] = await runScenario(ctx, 'S6-01', (runCase, state) => runS601(ctx, runCase, state))
  results['S6-02'] = await runScenario(ctx, 'S6-02', (runCase, state) => runS602(ctx, runCase, state))
  results['S6-03'] = await runScenario(ctx, 'S6-03', (runCase, state) => runS603(ctx, runCase, state))
  results['S6-04'] = await runScenario(ctx, 'S6-04', (runCase, state) => runS604(ctx, runCase, state))
  results['S6-05'] = await runScenario(ctx, 'S6-05', (runCase, state) => runS605(ctx, runCase, state))
  return results
}
