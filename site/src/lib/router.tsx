import { useEffect, useState, type AnchorHTMLAttributes, type MouseEvent, type ReactNode } from 'react'

/** Minimal pathname routing for the sub pages. No router dependency. */
export function usePath(): string {
  const [path, setPath] = useState(() => window.location.pathname)
  useEffect(() => {
    const onPop = () => setPath(window.location.pathname)
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])
  return path
}

export function navigate(to: string) {
  window.history.pushState({}, '', to)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

type LinkProps = {
  to: string
  children: ReactNode
} & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'>

/** An internal link: normal new-tab behavior with modifier keys, client-side otherwise. */
export function Link({ to, children, onClick, ...rest }: LinkProps) {
  const go = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e)
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
    e.preventDefault()
    navigate(to)
  }
  return (
    <a href={to} onClick={go} {...rest}>
      {children}
    </a>
  )
}

/** Sets the tab title and returns to the top on every page change. */
export function usePageMeta(title: string) {
  useEffect(() => {
    const previous = document.title
    document.title = title
    // A new page starts at the top at once, even with smooth scrolling on the root.
    window.scrollTo({ top: 0, behavior: 'instant' })
    return () => {
      document.title = previous
    }
  }, [title])
}
