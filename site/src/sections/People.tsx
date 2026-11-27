import { useEffect, useState } from 'react'
import { Out } from '../components/Pixel'
import { Face, styleFor } from '../lib/faces'
import { useInView, useReducedMotion } from '../lib/hooks'
import { LAUNCH_POST, REPLIES, replyUrl } from '../lib/replies'
import './people.css'

const ROTATE_MS = 3600

/**
 * Replies to the launch post. Each tile is a palletface avatar seeded by the
 * person's X handle, and the quote card shows their X photo. Quotes rotate on
 * their own; hover or focus holds one, and a click keeps it.
 */
export function People() {
  const reduced = useReducedMotion()
  const [ref, inView] = useInView<HTMLDivElement>({ once: false, rootMargin: '0px' })
  const [index, setIndex] = useState(0)
  const [hold, setHold] = useState(false)
  const [picked, setPicked] = useState(false)
  const reply = REPLIES[index]!

  useEffect(() => {
    if (reduced || hold || picked || !inView) return
    const t = window.setInterval(() => setIndex((i) => (i + 1) % REPLIES.length), ROTATE_MS)
    return () => window.clearInterval(t)
  }, [reduced, hold, picked, inView])

  // fetch every photo once the wall is near, so switching quotes never shows an empty circle
  useEffect(() => {
    if (inView) for (const r of REPLIES) new Image().src = r.photo
  }, [inView])

  return (
    <section className="section people" id="people" aria-labelledby="people-title">
      <div className="wrap">
        <div className="section-head">
          <h2 className="h2" id="people-title">
            Every face here <em>said something.</em>
          </h2>
          <p className="note">
            Each tile is a palletface avatar drawn from the person’s X handle. Pick one to read their reply to{' '}
            <a href={LAUNCH_POST} target="_blank" rel="noreferrer">
              our launch post <Out />
            </a>
          </p>
        </div>

        <div ref={ref} className="people__wall">
          <ul className="people__faces">
            {REPLIES.map((r, i) => {
              const style = styleFor(r.handle)
              return (
                <li key={r.handle}>
                  <button
                    type="button"
                    className="people__face"
                    aria-pressed={i === index}
                    aria-controls="people-quote"
                    aria-label={`${r.name}, @${r.handle}`}
                    onClick={() => {
                      setIndex(i)
                      setPicked(true)
                    }}
                    onPointerEnter={() => {
                      setHold(true)
                      setIndex(i)
                    }}
                    onPointerLeave={() => setHold(false)}
                    onFocus={() => setHold(true)}
                    onBlur={() => setHold(false)}
                  >
                    <Face seed={r.handle} style={style.slug} px={112} name={r.name} />
                    <span className="people__handle">@{r.handle}</span>
                    <span className="people__style">{style.title}</span>
                  </button>
                </li>
              )
            })}
          </ul>

          {/* announces changes only after a pick, not on every automatic turn */}
          <figure className="people__quote" id="people-quote" aria-live={picked ? 'polite' : 'off'}>
            <span className="people__mark" aria-hidden="true">
              “
            </span>
            <blockquote key={reply.handle} cite={replyUrl(reply)}>
              {reply.text}
            </blockquote>
            <figcaption>
              <img className="people__photo" src={reply.photo} width={44} height={44} alt="" />
              <span>
                <b>{reply.name}</b>{' '}
                <small>
                  @{reply.handle} · {reply.date}
                </small>
              </span>
              <a href={replyUrl(reply)} target="_blank" rel="noreferrer">
                View on X <Out />
              </a>
            </figcaption>
          </figure>
        </div>
      </div>
    </section>
  )
}
