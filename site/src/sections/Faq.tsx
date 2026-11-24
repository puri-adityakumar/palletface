import type { ReactNode } from 'react'
import { Out } from '../components/Pixel'
import { LINKS } from '../lib/content'
import './faq.css'

const QA: { q: string; a: ReactNode }[] = [
  {
    q: 'Is palletface free to use?',
    a: 'Yes. It is MIT-licensed, so you can use it in personal and commercial projects.',
  },
  {
    q: 'Will a user’s avatar ever change?',
    a: 'Not while the inputs and package version stay the same. Before 1.0, a minor release may change the API or the avatar output, so pin an exact version if avatars must stay the same across upgrades.',
  },
  {
    q: 'What should I use as the seed?',
    a: 'An opaque, stable ID, like a user ID. Any string works, including empty and Unicode strings. Keep emails, tokens, and secrets out of seeds, because an SVG can reveal initials and design details.',
  },
  {
    q: 'Does it call a server or store anything?',
    a: 'No. Every avatar is computed on the spot. There is no avatar service, image storage, account, or network request, and no external font is fetched.',
  },
  {
    q: 'Can I render avatars on the server?',
    a: (
      <>
        Yes. Core rendering does not use <code>window</code> or the DOM, and CI tests Node 22 and 24. Send the string with{' '}
        <code>Content-Type: image/svg+xml</code>, or put it in an image’s data URL.
      </>
    ),
  },
  {
    q: 'How do I show it in React, Vue, or plain HTML?',
    a: (
      <>
        Turn the string into a data URL and use it as an image source: <code>{'data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}'}</code>. No raw
        HTML injection needed.
      </>
    ),
  },
  {
    q: 'Is every avatar unique?',
    a: 'No. This is deterministic art, not cryptography. Different seeds can collide or look alike, so an avatar is not proof of identity.',
  },
  {
    q: 'Which styles use a name?',
    a: (
      <>
        Pixel Letter, Pixelify Letter, and Pixel Stamp draw an initial from <code>name</code>, which defaults to the seed. They use the first ASCII letter or
        digit, and the colors still come from the seed.
      </>
    ),
  },
  {
    q: 'What about accessibility and CSP?',
    a: (
      <>
        Next to a visible user name, <code>alt=""</code> avoids saying the name twice. Otherwise, give the image a meaningful label. Data URLs need{' '}
        <code>data:</code> in your <code>img-src</code> policy, or you can serve the SVG from your own route.
      </>
    ),
  },
]

export function Faq() {
  return (
    <section className="section faq" id="faq" aria-labelledby="faq-title">
      <div className="wrap faq__layout">
        <div className="faq__head">
          <p className="kicker">06 / FAQ</p>
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
