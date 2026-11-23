/// <reference types="vite/client" />

import type { DetailedHTMLProps, HTMLAttributes } from 'react'

// ascii.rest defines the <ascii-art> custom element (import 'ascii.rest/element')
declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'ascii-art': DetailedHTMLProps<
        HTMLAttributes<HTMLElement> & {
          piece?: string
          fps?: number
          options?: string
          label?: string
          mono?: boolean | string
        },
        HTMLElement
      >
    }
  }
}

// injected by vite.config.ts `define` — build-time numbers, never hand-typed
declare global {
  const __BUILD__: {
    version: string
    iifeKb: string
    gzipKb: string
    stars: number | null
  }
}

export {}
