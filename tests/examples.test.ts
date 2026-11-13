import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Avatar } from '../examples/react/Avatar.js'
import { ditherFace } from '../src/index.js'

describe('React example', () => {
  it('renders server-side to an accessible image with the exact SVG data URL', () => {
    const options = { style: 'pixel-letter' as const, px: 64, name: 'Élodie' }
    const html = renderToStaticMarkup(createElement(Avatar, { seed: 'user-7', ...options }))
    const src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(ditherFace('user-7', options))}`
    expect(html).toContain(`src="${src}"`)
    expect(html).toContain('alt="Élodie avatar"')
    expect(html).toContain('width="64"')
    expect(html).not.toContain('<svg')
  })

  it('supports decorative images and safely escapes labels', () => {
    expect(renderToStaticMarkup(createElement(Avatar, { seed: '', alt: '' }))).toContain('alt=""')
    expect(renderToStaticMarkup(createElement(Avatar, { seed: 'x', name: '"><script>' }))).not.toContain('<script>')
  })
})
