import * as React from 'react'
import { acquireScrollLock, releaseScrollLock } from '@/lib/smooth-scroll'

/**
 * Pause Lenis while an overlay is open.
 *
 * Radix Dialog/Sheet sets `overflow: hidden` on <body>, but Lenis keeps its own
 * scroll position and would otherwise keep moving the page underneath the
 * overlay. Locks are reference counted so closing one of two overlapping
 * overlays does not resume scrolling early.
 */
export function useDialogScrollLock(open) {
  const token = React.useRef(null)
  if (token.current === null) token.current = Symbol('scroll-lock')

  React.useEffect(() => {
    if (!open) return undefined
    acquireScrollLock(token.current)
    return () => releaseScrollLock(token.current)
  }, [open])
}