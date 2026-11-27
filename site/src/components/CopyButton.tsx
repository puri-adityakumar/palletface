import { Fragment } from 'react'
import { useCopy } from '../lib/hooks'
import { CheckMark, CopyMark } from './Pixel'

type Props = { value: string; variant?: 'install' | 'code'; label?: string; tone?: 'ink' | 'paper' }

/** A command that wraps only at spaces and after a slash, so a flag like `--skill` never splits. */
function Command({ text }: { text: string }) {
  return text.split(' ').map((word, i) => (
    <Fragment key={i}>
      {i > 0 && ' '}
      {word.split('/').map((part, j, parts) => (
        <Fragment key={j}>
          {j > 0 && <wbr />}
          <span className="install__word">{j < parts.length - 1 ? `${part}/` : part}</span>
        </Fragment>
      ))}
    </Fragment>
  ))
}

/** Copies `value`. The install variant shows the command itself. */
export function CopyButton({ value, variant = 'code', label, tone = 'ink' }: Props) {
  const [state, copy] = useCopy(value)
  const status = state === 'ok' ? 'Copied' : state === 'fail' ? 'Retry' : 'Copy'
  if (variant === 'code') {
    return (
      <button type="button" className="copy-code" onClick={copy}>
        <span aria-live="polite">{status}</span>
        <span className="sr-only"> {label ?? 'code'}</span>
      </button>
    )
  }
  return (
    <button type="button" className={tone === 'paper' ? 'install install--paper' : 'install'} onClick={copy} data-nodig>
      <span className="install__prompt" aria-hidden="true">$</span>
      <code>
        <Command text={value} />
      </code>
      <span className="install__label" aria-live="polite">
        {state === 'ok' ? <CheckMark /> : state === 'fail' ? 'Retry' : <CopyMark />}
        <span className="sr-only">{status} install command</span>
      </span>
    </button>
  )
}
