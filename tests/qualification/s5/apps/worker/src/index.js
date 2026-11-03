import { ditherFace, STYLES } from 'dither-face'

const STYLE_SLUGS = new Set(STYLES.map((style) => style.slug))

function runtimeHeaders(style) {
  return {
    'content-type': 'image/svg+xml; charset=utf-8',
    'cache-control': 'no-store',
    'x-runtime': 'workerd',
    'x-runtime-node': String(typeof process),
    'x-runtime-document': String(typeof document),
    'x-dither-style': style,
  }
}

export default {
  async fetch(request) {
    const url = new URL(request.url)

    if (url.pathname === '/health') {
      return new Response(
        JSON.stringify({
          ok: true,
          runtime: 'workerd',
          hasProcess: typeof process !== 'undefined',
          hasDocument: typeof document !== 'undefined',
          styles: [...STYLE_SLUGS],
        }),
        {
          headers: {
            'content-type': 'application/json; charset=utf-8',
            'cache-control': 'no-store',
          },
        },
      )
    }

    if (url.pathname !== '/avatar') {
      return new Response('not found', { status: 404 })
    }

    const style = url.searchParams.get('style') ?? 'pixel-sprite'
    const seed = url.searchParams.get('seed')
    const name = url.searchParams.get('name') ?? undefined
    const pxRaw = url.searchParams.get('px') ?? '80'
    const px = Number(pxRaw)

    if (!STYLE_SLUGS.has(style)) {
      return new Response(`unknown style: ${style}`, { status: 400 })
    }
    if (seed === null) {
      return new Response('seed is required', { status: 400 })
    }
    if (!Number.isFinite(px) || px <= 0) {
      return new Response('px must be a positive finite number', { status: 400 })
    }

    try {
      const svg = ditherFace(seed, { style, name, px })
      return new Response(svg, { status: 200, headers: runtimeHeaders(style) })
    } catch (error) {
      return new Response(`render failed: ${error?.message ?? error}`, {
        status: 500,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      })
    }
  },
}
