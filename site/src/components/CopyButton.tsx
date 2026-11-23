import { useRef, useState, type ReactNode } from 'react'
import { copyText } from '../lib/dither'

interface CopyButtonProps {
  text: string
  label: ReactNode
  className?: string
  okColor?: string
  failColor?: string
  style?: React.CSSProperties
}

/**
 * Copy-to-clipboard button with a temporary state swap and aria-live feedback
 * (microinteractivity.md: copy-feedback hardening).
 */
export function CopyButton({ text, label, className, okColor, failColor, style }: CopyButtonProps) {
  const [state, setState] = useState<'idle' | 'ok' | 'fail'>('idle')
  const timer = useRef(0)

  const copy = async () => {
    const ok = await copyText(text)
    setState(ok ? 'ok' : 'fail')
    clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setState('idle'), 1400)
  }

  const color = state === 'ok' ? okColor : state === 'fail' ? failColor : undefined

  return (
    <button type="button" className={className} style={{ ...style, color }} onClick={copy} aria-live="polite">
      {state === 'idle' ? label : state === 'ok' ? 'copied ✓' : 'copy failed'}
    </button>
  )
}
