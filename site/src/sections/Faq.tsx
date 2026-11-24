import type { ReactNode } from 'react'
import { Out } from '../components/Pixel'
import { LINKS } from '../lib/content'
import './faq.css'

const QA: { q: string; a: ReactNode }[] = [
  {
    q: 'Is palletface free to use?',
    a: 'Yes. It is MIT-licensed, for personal and commercial use.',
  },
  {
    q: 'Will a user’s avatar ever change?',
    a: 'Not with the same inputs and version. Before 1.0, a minor release may change the output, so pin an exact version to keep avatars stable.',
  },
  {
    q: 'What should I use as the seed?',
    a: 'A stable, opaque ID, like a user ID. Keep emails, tokens, and secrets out, because the SVG can reveal initials.',
  },
  {
    q: 'Can I render avatars on the server?',
    a: (
      <>
        Yes. CI tests Node 22 and 24. Serve the string with <code>Content-Type: image/svg+xml</code>, or use a data URL.
      </>
    ),
  },
  {
    q: 'How do I show it in React, Vue, or plain HTML?',
    a: (
      <>
        Use a data URL as the image source: <code>{'data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}'}</code>. No <code>innerHTML</code> needed.
      </>
    ),
  },
  {
    q: 'Is every avatar unique?',
    a: 'No. Different seeds can collide or look alike, so an avatar is not proof of identity.',
  },
  {
    q: 'Which styles use a name?',
    a: (
      <>
        Pixel Letter, Pixelify Letter, and Pixel Stamp use the first ASCII letter or digit of <code>name</code>, which defaults to the seed. Colors still come
        from the seed.
      </>
    ),
  },
  {
    q: 'What about accessibility and CSP?',
    a: (
      <>
        Use <code>alt=""</code> next to a visible user name, and a real label otherwise. For CSP, allow <code>data:</code> in <code>img-src</code>, or serve
        the SVG from your own route.
      </>
    ),
  },
]

export function Faq() {
  return (
    <section className="section faq" id="faq" aria-labelledby="faq-title">
      <div className="wrap faq__layout">
        <div className="faq__head">
          <p className="kicker">FAQ</p>
          <h2 className="h2" id="faq-title">
            Questions, <em>answered.</em>
          </h2>
          <p className="note">
            Can’t find yours?{' '}
            <a href={LINKS.issues} target="_blank" rel="noreferrer">
              Ask on GitHub <Out />
            </a>
          </p>
        </div>
        <div className="faq__list">
          {QA.map(({ q, a }, i) => (
            <details key={q} open={i === 0}>
              <summary>
                <span className="faq__n">{String(i + 1).padStart(2, '0')}</span>
                <span className="faq__q">{q}</span>
                <span className="faq__mark" aria-hidden="true" />
              </summary>
              <p className="faq__a">{a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}
