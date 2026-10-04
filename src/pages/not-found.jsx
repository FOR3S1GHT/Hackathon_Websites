import { Link, useLocation } from 'react-router-dom'
import { ArrowRight, Compass, Home } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

const SUGGESTIONS = [
  { to: '/explore', label: 'Explore the catalogue' },
  { to: '/categories', label: 'Browse by category' },
  { to: '/ideas', label: 'Generate project ideas' },
  { to: '/bookmarks', label: 'Your bookmarks' },
]

export default function NotFoundPage() {
  const location = useLocation()

  return (
    <div className="mx-auto flex max-w-3xl flex-col justify-center px-4 py-20 sm:px-6">
      <p className="brutal-kicker">Error 404</p>

      <h1 className="mt-3 font-display text-[clamp(4rem,18vw,11rem)] uppercase leading-[0.8] tracking-[-0.05em]">
        No signal
      </h1>

      <p className="mt-6 max-w-xl text-lg leading-relaxed text-soot">
        Nothing is published at{' '}
        <code className="border-2 border-black bg-ash px-1.5 py-0.5 font-mono text-base">
          {location.pathname}
        </code>
        . The listing may have been withdrawn upstream, or the link may have a typo.
      </p>

      <Card className="mt-10 p-6 shadow-brutal-lg">
        <p className="brutal-kicker">Try one of these</p>
        <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {SUGGESTIONS.map((item) => (
            <li key={item.to}>
              <Link
                to={item.to}
                className="flex items-center justify-between gap-3 border-2 border-black px-3 py-3 font-mono text-[11px] font-bold uppercase tracking-[0.12em] transition-colors hover:bg-black hover:text-white"
              >
                {item.label}
                <ArrowRight className="size-3.5 stroke-[3]" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </Card>

      <div className="mt-8 flex flex-wrap gap-3">
        <Button asChild size="lg">
          <Link to="/">
            <Home /> Back to the radar
          </Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link to="/contact">
            <Compass /> Report a broken link
          </Link>
        </Button>
      </div>
    </div>
  )
}