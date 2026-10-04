import * as React from 'react'
import Lenis from 'lenis'
import { getLenis, setLenis } from '@/lib/smooth-scroll'

/**
 * A single Lenis instance for the whole app.
 *
 * Requirements this satisfies:
 *  - ONE instance only. Creating a second on route change is the classic Lenis
 *    bug: two rAF loops fight each other and scroll speed drifts.
 *  - StrictMode-safe: the instance is torn down on unmount and re-created on the
 *    remount, and never leaked into the module-level handle after destruction.
 *  - Reduced motion is respected. When the user asks for less motion we do not
 *    instantiate Lenis at all — native scrolling is the accessible fallback.
 *  - Keyboard accessibility is preserved. Lenis keeps native scroll semantics
 *    (it drives the real scroll position rather than transforming a container),
 *    so Tab, Space, Page Up/Down, Home/End and screen-reader virtual cursors
 *    all behave normally.
 */

const LenisContext = React.createContext(null)

function prefersReducedMotion() {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function SmoothScrollProvider({ children }) {
  const [reduced, setReduced] = React.useState(() => prefersReducedMotion())

  // React to live changes of the OS setting rather than only the initial value.
  React.useEffect(() => {
    if (!window.matchMedia) return undefined
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = (event) => setReduced(event.matches)
    query.addEventListener?.('change', onChange)
    return () => query.removeEventListener?.('change', onChange)
  }, [])

  React.useEffect(() => {
    if (reduced) {
      setLenis(null)
      return undefined
    }

    const lenis = new Lenis({
      // Slightly under 1s so momentum settles quickly and does not fight the
      // user on a catalogue page where they are scanning, not reading.
      duration: 0.85,
      easing: (t) => Math.min(1, 1.001 - 2 ** (-10 * t)),
      smoothWheel: true,
      // Native touch scrolling is already smooth and intercepting it makes
      // mobile feel worse, not better.
      syncTouch: false,
      touchMultiplier: 1.4,
      wheelMultiplier: 1,
    })

    setLenis(lenis)

    let frame = 0
    const raf = (time) => {
      lenis.raf(time)
      frame = requestAnimationFrame(raf)
    }
    frame = requestAnimationFrame(raf)

    return () => {
      cancelAnimationFrame(frame)
      lenis.destroy()
      setLenis(null)
    }
  }, [reduced])

  return <LenisContext.Provider value={{ reduced }}>{children}</LenisContext.Provider>
}

/**
 * Subscribe to Lenis scroll events.
 *
 * Falls back to the native `scroll` event when Lenis is not running, so callers
 * never need to know which mode is active.
 */
export function useLenisScroll(callback) {
  const handler = React.useRef(callback)
  handler.current = callback

  React.useEffect(() => {
    const instance = getLenis()
    if (instance) {
      const onScroll = (event) => handler.current?.(event)
      instance.on('scroll', onScroll)
      return () => instance.off('scroll', onScroll)
    }
    const onScroll = () => handler.current?.({ scroll: window.scrollY, progress: 0, limit: 0 })
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
}

/** True when the user asked the OS for reduced motion. */
export function usePrefersReducedMotion() {
  const [reduced, setReduced] = React.useState(() => prefersReducedMotion())
  React.useEffect(() => {
    if (!window.matchMedia) return undefined
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = (event) => setReduced(event.matches)
    query.addEventListener?.('change', onChange)
    return () => query.removeEventListener?.('change', onChange)
  }, [])
  return reduced
}

export { LenisContext }