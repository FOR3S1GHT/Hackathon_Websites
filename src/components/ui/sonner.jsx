import { Toaster as SonnerToaster } from 'sonner'

/**
 * Toast host.
 *
 * HackRadar is monochrome by design, so no `richColors` — every toast uses the
 * black/white brutalist treatment defined in index.css, which is why the
 * overrides live there rather than in Tailwind classes.
 */
export function Toaster(props) {
  return <SonnerToaster position="bottom-right" closeButton richColors={false} {...props} />
}