importScripts('./dither-face.js')

const api = self.DitherFace

self.onmessage = (event) => {
  const message = event.data ?? {}
  try {
    if (!api || typeof api.ditherFace !== 'function' || !Array.isArray(api.STYLES)) {
      throw new Error('DitherFace classic IIFE did not expose ditherFace/STYLES')
    }
    const px = message.px ?? 80
    const results = api.STYLES.map((style) => ({
      style: style.slug,
      svg: api.ditherFace(message.seed, {
        style: style.slug,
        name: message.name,
        px,
      }),
    }))
    self.postMessage({ ok: true, results })
  } catch (error) {
    self.postMessage({ ok: false, error: String(error?.stack ?? error) })
  }
}
