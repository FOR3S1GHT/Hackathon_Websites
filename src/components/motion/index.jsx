import * as React from 'react'
import { motion, useInView, useReducedMotion, useScroll, useSpring, useTransform } from 'motion/react'
import { usePrefersReducedMotion } from '@/hooks/use-lenis'

/**
 * Motion primitives.
 *
 * Two rules govern everything here:
 *
 * 1. **Never hide content.** Reveal effects animate from a *visible* resting
 *    state. `RevealFromBlack` starts fully opaque-black over the content and
 *    fades the black plate away, so if JavaScript, IntersectionObserver or
 *    Motion all fail, the content is still on screen and readable. It is not an
 *    opacity-0 -> opacity-1 reveal, which would leave a blank page on failure.
 *
 * 2. **Reduced motion is honoured, not just detected.** When the user asks for
 *    reduced motion every component below renders its final state immediately and
 *    `whileInView` animations are skipped entirely.
 */

/** Fades a single block in on first view, with a configurable offset. */
export function FadeIn({
  children,
  delay = 0,
  y = 18,
  duration = 0.5,
  className,
  as = 'div',
  once = true,
  amount = 0.2,
  ...rest
}) {
  const reduced = useReducedMotion()
  const Component = motion[as] ?? motion.div

  if (reduced) {
    const Tag = as
    return (
      <Tag className={className} {...rest}>
        {children}
      </Tag>
    )
  }

  return (
    <Component
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once, amount }}
      transition={{ duration, delay, ease: [0.16, 1, 0.3, 1] }}
      {...rest}
    >
      {children}
    </Component>
  )
}

/**
 * The signature scroll reveal: a black plate slides away to expose the content.
 *
 * `initial` renders the plate opaque, and the *content* is always painted on top
 * of it. No state, no IntersectionObserver gate, no content-hiding — the effect
 * is purely additive decoration that fails safely.
 */
export function RevealFromBlack({
  children,
  className,
  delay = 0,
  duration = 0.7,
  once = true,
  amount = 0.15,
  direction = 'up',
  ...rest
}) {
  const reduced = usePrefersReducedMotion()
  const ref = React.useRef(null)
  const inView = useInView(ref, { once, amount, margin: '0px 0px -10% 0px' })

  if (reduced) {
    return (
      <div ref={ref} className={className} {...rest}>
        {children}
      </div>
    )
  }

  const offset =
    direction === 'left' ? { x: '-100%', y: 0 } : direction === 'right' ? { x: '100%', y: 0 } : { x: 0, y: '100%' }

  return (
    <div ref={ref} className={className} {...rest}>
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-10 bg-black"
        initial={{ ...offset }}
        animate={inView ? { x: 0, y: 0 } : undefined}
        transition={{ duration, delay, ease: [0.76, 0, 0.24, 1] }}
      />
      {children}
    </div>
  )
}

/**
 * Stagger container. Children should be `motion.div`s with a `Reveal` variant,
 * or simply `StaggerItem`s.
 */
export function Stagger({ children, className, delay = 0, stagger = 0.06, ...rest }) {
  const reduced = useReducedMotion()
  if (reduced) {
    return (
      <div className={className} {...rest}>
        {children}
      </div>
    )
  }
  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.1 }}
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: stagger, delayChildren: delay } },
      }}
      {...rest}
    >
      {children}
    </motion.div>
  )
}

export function StaggerItem({ children, className, y = 16, ...rest }) {
  const reduced = useReducedMotion()
  if (reduced) {
    return (
      <div className={className} {...rest}>
        {children}
      </div>
    )
  }
  return (
    <motion.div
      className={className}
      variants={{
        hidden: { opacity: 0, y },
        visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] } },
      }}
      {...rest}
    >
      {children}
    </motion.div>
  )
}

/** Hard-edged press feedback for cards and buttons. */
export function Pressable({ children, className, scale = 0.985, ...rest }) {
  const reduced = useReducedMotion()
  if (reduced) return <div className={className}>{children}</div>
  return (
    <motion.div
      className={className}
      whileHover={{ x: -3, y: -3 }}
      whileTap={{ x: 1, y: 1, scale }}
      transition={{ type: 'spring', stiffness: 400, damping: 26 }}
      {...rest}
    >
      {children}
    </motion.div>
  )
}

/**
 * Parallax offset driven by scroll progress, clamped so it never moves an
 * element more than `distance` pixels.
 */
export function Parallax({ children, className, distance = 60, ...rest }) {
  const ref = React.useRef(null)
  const reduced = usePrefersReducedMotion()
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'end start'],
  })
  const raw = useTransform(scrollYProgress, [0, 1], [distance, -distance])
  const y = useSpring(raw, { stiffness: 90, damping: 24, mass: 0.4 })

  if (reduced) {
    return (
      <div ref={ref} className={className} {...rest}>
        {children}
      </div>
    )
  }

  return (
    <motion.div ref={ref} className={className} style={{ y }} {...rest}>
      {children}
    </motion.div>
  )
}

/** Count-up number for the hero's live catalogue count. */
export function CountUp({ value, duration = 1.4, className, suffix = '', prefix = '' }) {
  const reduced = usePrefersReducedMotion()
  const [display, setDisplay] = React.useState(reduced || !value ? value ?? 0 : 0)
  const ref = React.useRef(null)
  const inView = useInView(ref, { once: true, amount: 0.5 })

  React.useEffect(() => {
    if (reduced || !inView || !value) {
      setDisplay(value ?? 0)
      return undefined
    }
    let frame = 0
    const start = performance.now()
    const tick = (now) => {
      const t = Math.min(1, (now - start) / (duration * 1000))
      // easeOutExpo — fast start, gentle settle.
      const eased = t === 1 ? 1 : 1 - 2 ** (-10 * t)
      setDisplay(Math.round(value * eased))
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [value, inView, reduced, duration])

  return (
    <span ref={ref} className={className}>
      {prefix}
      {display.toLocaleString('en-US')}
      {suffix}
    </span>
  )
}

/** Page-level transition wrapper used by the router outlet. */
export function PageTransition({ children, className }) {
  const reduced = useReducedMotion()
  if (reduced) return <div className={className}>{children}</div>
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  )
}

/** Magnetic pointer-follow wrapper for the hero call-to-action. */
export function Magnetic({ children, strength = 0.25, className }) {
  const reduced = useReducedMotion()
  const ref = React.useRef(null)
  const x = useSpring(0, { stiffness: 220, damping: 20 })
  const y = useSpring(0, { stiffness: 220, damping: 20 })

  if (reduced) return <div className={className}>{children}</div>

  const onMove = (event) => {
    const node = ref.current
    if (!node) return
    const rect = node.getBoundingClientRect()
    x.set((event.clientX - (rect.left + rect.width / 2)) * strength)
    y.set((event.clientY - (rect.top + rect.height / 2)) * strength)
  }

  const reset = () => {
    x.set(0)
    y.set(0)
  }

  return (
    <motion.div
      ref={ref}
      className={className}
      style={{ x, y }}
      onMouseMove={onMove}
      onMouseLeave={reset}
    >
      {children}
    </motion.div>
  )
}

export { motion }