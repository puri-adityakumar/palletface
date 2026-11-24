import { useCopy } from '../lib/hooks'

type Props = { value: string; variant?: 'install' | 'code'; label?: string; tone?: 'ink' | 'paper' }

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
      <code>{value}</code>
      <span className="install__label" aria-live="polite">
        {status}
        <span className="sr-only"> install command</span>
      </span>
    </button>
  )
}
