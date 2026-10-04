import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Check,
  ClipboardCopy,
  Columns2,
  Download,
  Gauge,
  Lightbulb,
  RefreshCw,
  Save,
  Sparkles,
  Users,
  Wrench,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { EmptyState, ErrorState, SectionHeader } from '@/components/feedback'
import { Stagger, StaggerItem } from '@/components/motion'
import { useAuth } from '@/hooks/use-auth'
import { api } from '@/lib/api'
import { DIFFICULTY_LABEL } from '@/lib/taxonomy-labels'
import { cn } from '@/lib/utils'

/** Client-side plain-text render. Mirrors the server's /api/ideas/format. */
function ideaToText(idea, context = {}) {
  const lines = [
    idea.title,
    context.hackathonTitle ? `For: ${context.hackathonTitle}` : null,
    context.organizer ? `Organiser: ${context.organizer}` : null,
    '',
    `SUMMARY`,
    idea.summary || idea.problem || '—',
    '',
    `PROBLEM`,
    idea.problem || '—',
    '',
    `WHO IT IS FOR`,
    idea.targetUsers || '—',
    '',
    `DIFFICULTY / TIME`,
    `${DIFFICULTY_LABEL[idea.difficulty] ?? idea.difficulty ?? '—'} · ${idea.estimatedTime ?? '—'}`,
    '',
    `SUGGESTED STACK`,
    (idea.technologies ?? []).join(', ') || '—',
    '',
    `KEY FEATURES`,
    ...(idea.keyFeatures ?? []).map((f, i) => `${i + 1}. ${f}`),
    '',
    `HOW TO BUILD IT`,
    ...(idea.implementationSteps ?? []).map((step, i) => `${i + 1}. ${step}`),
    '',
    `DEMO TIPS`,
    ...(idea.demoTips ?? []).map((tip) => `- ${tip}`),
    '',
    'NOTE: These are HackRadar suggestions derived from this event’s published themes.',
    'They are not official organiser requirements and do not guarantee selection or a prize.',
  ].filter((line) => line !== null)
  return lines.join('\n')
}

function download(filename, text) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  // Revoke on the next tick so Safari has finished reading the blob.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // Clipboard API needs a secure context and permission; fall back so the
    // button still works over plain HTTP on a LAN address.
    try {
      const area = document.createElement('textarea')
      area.value = text
      area.setAttribute('readonly', '')
      area.style.position = 'fixed'
      area.style.opacity = '0'
      document.body.appendChild(area)
      area.select()
      const ok = document.execCommand('copy')
      area.remove()
      return ok
    } catch {
      return false
    }
  }
}

function IdeaCard({
  idea,
  context,
  saved,
  onSave,
  onCompare,
  compared,
  index,
  busy,
}) {
  const [copied, setCopied] = React.useState(false)

  const handleCopy = async () => {
    const text = ideaToText(idea, context)
    const ok = await copyToClipboard(text)
    if (ok) {
      setCopied(true)
      toast.success('Idea copied as plain text.')
      setTimeout(() => setCopied(false), 2000)
    } else {
      toast.error('Could not copy. Use "Download" instead.')
    }
  }

  return (
    <Card className="flex h-full flex-col shadow-brutal">
      <div className="flex items-start justify-between gap-3 border-b-[3px] border-black bg-ash px-4 py-3">
        <span className="brutal-kicker text-concrete">Idea {String(index + 1).padStart(2, '0')}</span>
        <div className="flex items-center gap-1.5">
          <Badge variant={idea.source === 'ai' ? 'solid' : 'outline'}>
            {idea.source === 'ai' ? 'AI draft' : 'Rule-based'}
          </Badge>
          <Badge variant="ash">{DIFFICULTY_LABEL[idea.difficulty] ?? idea.difficulty}</Badge>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-4 p-4">
        <h3 className="font-display text-xl uppercase leading-[1.05] tracking-[-0.02em]">{idea.title}</h3>

        {idea.summary ? <p className="text-sm leading-relaxed text-soot">{idea.summary}</p> : null}

        <dl className="space-y-3 border-t-2 border-ash pt-3">
          {idea.problem ? (
            <div>
              <dt className="brutal-kicker flex items-center gap-1.5 text-concrete">
                <Lightbulb className="size-3 stroke-[3]" aria-hidden /> Problem
              </dt>
              <dd className="mt-1 text-sm leading-relaxed text-soot">{idea.problem}</dd>
            </div>
          ) : null}

          {idea.targetUsers ? (
            <div>
              <dt className="brutal-kicker flex items-center gap-1.5 text-concrete">
                <Users className="size-3 stroke-[3]" aria-hidden /> Who it is for
              </dt>
              <dd className="mt-1 text-sm leading-relaxed text-soot">{idea.targetUsers}</dd>
            </div>
          ) : null}

          {idea.technologies?.length ? (
            <div>
              <dt className="brutal-kicker flex items-center gap-1.5 text-concrete">
                <Wrench className="size-3 stroke-[3]" aria-hidden /> Suggested stack
              </dt>
              <dd className="mt-1.5 flex flex-wrap gap-1.5">
                {idea.technologies.map((tech) => (
                  <span
                    key={tech}
                    className="border-2 border-ash bg-ash px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.1em]"
                  >
                    {tech}
                  </span>
                ))}
              </dd>
            </div>
          ) : null}

          {idea.keyFeatures?.length ? (
            <div>
              <dt className="brutal-kicker">Key features</dt>
              <dd>
                <ul className="mt-1.5 space-y-1.5">
                  {idea.keyFeatures.map((feature) => (
                    <li key={feature} className="flex gap-2 text-sm leading-relaxed text-soot">
                      <span aria-hidden className="mt-1.5 inline-block size-1.5 shrink-0 bg-black" />
                      {feature}
                    </li>
                  ))}
                </ul>
              </dd>
            </div>
          ) : null}

          {idea.implementationSteps?.length ? (
            <div>
              <dt className="brutal-kicker">Build steps</dt>
              <dd>
                <ol className="mt-1.5 space-y-1.5">
                  {idea.implementationSteps.map((step, i) => (
                    <li key={step} className="flex gap-2 text-sm leading-relaxed text-soot">
                      <span className="shrink-0 font-mono text-[11px] font-bold text-black">
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      {step}
                    </li>
                  ))}
                </ol>
              </dd>
            </div>
          ) : null}

          {idea.demoTips?.length ? (
            <div>
              <dt className="brutal-kicker">Demo tips</dt>
              <dd>
                <ul className="mt-1.5 space-y-1">
                  {idea.demoTips.map((tip) => (
                    <li key={tip} className="text-sm leading-relaxed text-soot">
                      &rarr; {tip}
                    </li>
                  ))}
                </ul>
              </dd>
            </div>
          ) : null}
        </dl>

        <p className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 border-t-2 border-ash pt-3 font-mono text-[10px] uppercase tracking-[0.12em] text-concrete">
          <span className="flex items-center gap-1.5">
            <Gauge className="size-3 stroke-[3]" aria-hidden /> {idea.estimatedTime ?? 'Time not estimated'}
          </span>
          {idea.derivedFrom?.themes?.length ? (
            <span className="truncate">from: {idea.derivedFrom.themes.join(' · ')}</span>
          ) : null}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t-[3px] border-black px-3 py-2.5">
        <Button size="sm" variant="outline" onClick={handleCopy}>
          {copied ? <Check /> : <ClipboardCopy />}
          {copied ? 'Copied' : 'Copy'}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            download(`${idea.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60)}.txt`, ideaToText(idea, context))
          }
        >
          <Download /> Download
        </Button>
        {onCompare ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => onCompare(idea)}
            aria-pressed={compared}
            className={compared ? 'bg-black text-white hover:bg-black hover:text-white' : undefined}
          >
            <Columns2 /> {compared ? 'In compare' : 'Compare'}
          </Button>
        ) : null}
        {onSave ? (
          <Button size="sm" onClick={() => onSave(idea)} disabled={busy} className="ml-auto">
            {saved ? <Check /> : <Save />}
            {saved ? 'Saved' : 'Save'}
          </Button>
        ) : null}
      </div>
    </Card>
  )
}

export function CompareTray({ ideas, onClear, onRemove }) {
  if (ideas.length === 0) return null
  return (
    <Card className="border-[3px] border-black bg-black p-0 text-white shadow-brutal-lg">
      <div className="flex items-center justify-between border-b-2 border-white/30 px-4 py-2.5">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em]">
          Comparing {ideas.length} idea{ideas.length === 1 ? '' : 's'}
        </p>
        <Button size="sm" variant="ghost" onClick={onClear} className="text-white hover:bg-white hover:text-black">
          Clear
        </Button>
      </div>
      <div className="grid gap-px bg-white/25 sm:grid-cols-2">
        {ideas.map((idea) => (
          <div key={idea.title} className="bg-black p-4">
            <div className="flex items-start justify-between gap-3">
              <h4 className="font-display text-base uppercase leading-tight tracking-[-0.02em]">{idea.title}</h4>
              <button
                type="button"
                onClick={() => onRemove(idea)}
                aria-label={`Remove ${idea.title} from the comparison`}
                className="shrink-0 border-2 border-white px-1.5 py-0.5 font-mono text-[10px] uppercase hover:bg-white hover:text-black"
              >
                ✕
              </button>
            </div>
            <dl className="mt-3 space-y-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-ash">
              <div className="flex justify-between gap-2">
                <dt>Difficulty</dt>
                <dd className="font-bold text-white">{DIFFICULTY_LABEL[idea.difficulty] ?? idea.difficulty}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>Time</dt>
                <dd className="font-bold text-white">{idea.estimatedTime ?? '—'}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>Stack size</dt>
                <dd className="font-bold text-white">{idea.technologies?.length ?? 0}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>Features</dt>
                <dd className="font-bold text-white">{idea.keyFeatures?.length ?? 0}</dd>
              </div>
            </dl>
            <p className="mt-3 line-clamp-3 text-xs leading-relaxed text-ash">{idea.summary}</p>
          </div>
        ))}
      </div>
    </Card>
  )
}

/**
 * Project idea generator.
 *
 * Works for any hackathon, embedded on the detail page or standalone on /ideas.
 *
 * Honesty rules baked in:
 *  - the source of each batch (`rule-based` vs `ai`) is always shown;
 *  - when AI is not configured the control says so instead of pretending;
 *  - the "no prize guarantee" disclaimer is rendered unconditionally.
 */
export function IdeaGenerator({ hackathon, initialCount = 3, showHeading = true }) {
  const navigate = useNavigate()
  const { isAuthenticated } = useAuth()
  const [count, setCount] = React.useState(initialCount)
  const [offset, setOffset] = React.useState(0)
  const [difficulty, setDifficulty] = React.useState('all')
  const [engine, setEngine] = React.useState('auto')
  const [result, setResult] = React.useState(null)
  const [error, setError] = React.useState(null)
  const [loading, setLoading] = React.useState(false)
  const [compare, setCompare] = React.useState([])
  const [savedTitles, setSavedTitles] = React.useState(new Set())
  const [saving, setSaving] = React.useState(null)

  const slug = hackathon?.slug

  const generate = React.useCallback(
    async (options = {}) => {
      if (!slug) return
      setLoading(true)
      setError(null)
      try {
        const data = await api.generateIdeas({
          hackathonSlug: slug,
          count: options.count ?? count,
          offset: options.offset ?? offset,
          difficulty: difficulty === 'all' ? [] : [difficulty],
          engine,
        })
        setResult(data)
        if (options.announce !== false) {
          toast.success(
            data.source === 'ai'
              ? `${data.ideas.length} AI-drafted ideas. Review them before you rely on them.`
              : `${data.ideas.length} rule-based ideas generated.`,
          )
        }
      } catch (err) {
        setError(err)
        setResult(null)
      } finally {
        setLoading(false)
      }
    },
    [slug, count, offset, difficulty, engine],
  )

  // Generate once when the hackathon changes.
  React.useEffect(() => {
    if (!slug) return
    setOffset(0)
    setResult(null)
    setCompare([])
    generate({ offset: 0 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug])

  // Load previously saved ideas so the buttons reflect reality.
  React.useEffect(() => {
    if (!isAuthenticated) return
    api
      .ideas()
      .then((data) => {
        setSavedTitles(new Set((data?.items ?? []).map((i) => i.title)))
      })
      .catch(() => {})
  }, [isAuthenticated, result])

  const saveIdea = async (idea) => {
    if (!isAuthenticated) {
      navigate('/login', { state: { from: `/hackathon/${slug}` } })
      toast('Sign in to save project ideas to your account.')
      return
    }
    setSaving(idea.title)
    try {
      const data = await api.saveIdea({
        hackathonId: hackathon?.id ? String(hackathon.id) : undefined,
        hackathonTitle: hackathon?.title ?? null,
        title: idea.title,
        description: idea.summary ?? null,
        problem: idea.problem ?? null,
        targetUsers: idea.targetUsers ?? null,
        difficulty: ['beginner', 'intermediate', 'advanced'].includes(idea.difficulty)
          ? idea.difficulty
          : 'intermediate',
        technologies: (idea.technologies ?? []).slice(0, 20),
        keyFeatures: (idea.keyFeatures ?? []).slice(0, 12),
        implementationSteps: (idea.implementationSteps ?? []).slice(0, 12),
        estimatedTime: idea.estimatedTime ?? null,
        demoTips: (idea.demoTips ?? []).slice(0, 6),
        source: idea.source === 'ai' ? 'ai' : 'rule-based',
      })
      if (data?.idea?.id) {
        setSavedTitles((prev) => new Set(prev).add(idea.title))
      }
      toast.success('Saved to your dashboard.')
    } catch (err) {
      toast.error(err?.message ?? 'Could not save that idea.')
    } finally {
      setSaving(null)
    }
  }

  const toggleCompare = (idea) => {
    setCompare((prev) => {
      if (prev.some((i) => i.title === idea.title)) return prev.filter((i) => i.title !== idea.title)
      if (prev.length >= 3) {
        toast('Compare up to three ideas at a time.')
        return prev
      }
      return [...prev, idea]
    })
  }

  if (!hackathon) return null

  const ideas = result?.ideas ?? []
  const context = { hackathonTitle: hackathon.title, organizer: hackathon.organizer }

  return (
    <div className="space-y-6">
      {showHeading ? (
        <SectionHeader
          kicker="Project ideas"
          title="Something to actually build"
          description="Ideas derived from this event's own published themes, tracks and technologies. They are starting points to adapt, not official requirements."
        />
      ) : null}

      <Card className="p-4 shadow-brutal">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
          <div className="lg:w-44">
            <Label htmlFor="idea-count">How many</Label>
            <Select value={String(count)} onValueChange={(value) => setCount(Number(value))}>
              <SelectTrigger id="idea-count" className="mt-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="lg:w-56">
            <Label htmlFor="idea-difficulty">Difficulty</Label>
            <Select value={difficulty} onValueChange={setDifficulty}>
              <SelectTrigger id="idea-difficulty" className="mt-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any difficulty</SelectItem>
                <SelectItem value="beginner">Beginner</SelectItem>
                <SelectItem value="intermediate">Intermediate</SelectItem>
                <SelectItem value="advanced">Advanced</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <fieldset className="flex-1">
            <legend className="brutal-kicker">Engine</legend>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {[
                { value: 'auto', label: 'Auto (best available)' },
                { value: 'rules', label: 'Rules only' },
                { value: 'ai', label: 'AI only' },
              ].map((option) => (
                <label
                  key={option.value}
                  className={cn(
                    'cursor-pointer border-2 border-black px-2.5 py-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.12em] transition-colors',
                    engine === option.value ? 'bg-black text-white' : 'bg-white hover:bg-ash',
                  )}
                >
                  <input
                    type="radio"
                    name="idea-engine"
                    className="sr-only"
                    checked={engine === option.value}
                    onChange={() => setEngine(option.value)}
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </fieldset>

          <Button onClick={() => generate()} disabled={loading} className="lg:w-auto">
            <RefreshCw className={cn(loading && 'animate-spin')} />
            {loading ? 'Generating…' : 'Generate'}
          </Button>
        </div>

        {result?.aiStatus ? (
          <p className="mt-4 border-t-2 border-ash pt-3 font-mono text-[10px] uppercase leading-relaxed tracking-[0.12em] text-concrete">
            {result.source === 'ai'
              ? `Drafted by ${result.model ?? 'the configured AI provider'}. AI output can be wrong — verify it against the organiser's brief.`
              : result.aiStatus.enabled === false
                ? 'AI is not configured on this server, so these came from deterministic rules instead. Set AI_PROVIDER and AI_API_KEY to enable AI drafting.'
                : `Generated with deterministic rules${result.aiStatus.lastAttemptError ? ` because the AI call failed (${result.aiStatus.lastAttemptError})` : ''}.`}
          </p>
        ) : null}
      </Card>

      <p className="border-[3px] border-black bg-ash px-4 py-3 font-mono text-[10px] uppercase leading-relaxed tracking-[0.12em] text-soot">
        {result?.disclaimer ??
          'Suggestions are derived from this event’s published themes. They are not official organiser requirements and do not guarantee selection or a prize.'}
      </p>

      {result?.source === 'rule-based' && result.requestedCount > ideas.length ? (
        <p className="border-l-[3px] border-black pl-3 font-mono text-[10px] uppercase leading-relaxed tracking-[0.12em] text-concrete">
          Showing {ideas.length} of the {result.requestedCount} requested: this event publishes{' '}
          {result.availableCount === 1 ? 'one distinct concept' : `${result.availableCount} distinct concepts`} from
          its own themes. Generate again to reshuffle the wording and difficulty, not to pad the list with
          near-duplicates.
        </p>
      ) : null}

      <CompareTray
        ideas={compare}
        onClear={() => setCompare([])}
        onRemove={(idea) => setCompare((prev) => prev.filter((i) => i.title !== idea.title))}
      />

      {error ? <ErrorState title="Could not generate ideas" error={error} onRetry={() => generate()} /> : null}

      {!result && loading ? (
        <div className="grid gap-5 lg:grid-cols-2" aria-hidden>
          {[0, 1].map((i) => (
            <div key={i} className="h-72 border-[3px] border-black bg-ash" />
          ))}
        </div>
      ) : null}

      {result && ideas.length === 0 && !loading ? (
        <EmptyState
          icon={Lightbulb}
          title="No ideas matched that filter"
          description="This event publishes very little to work from, so there is not enough signal to generate anything specific. Try 'Any difficulty' or generate for a different event."
          action={
            <Button variant="outline" onClick={() => setDifficulty('all')}>
              Reset the filter
            </Button>
          }
        />
      ) : null}

      {ideas.length ? (
        <Stagger className="grid gap-5 lg:grid-cols-2">
          {ideas.map((idea, index) => (
            <StaggerItem key={`${idea.title}-${index}`}>
              <IdeaCard
                idea={idea}
                context={context}
                index={index}
                saved={savedTitles.has(idea.title)}
                busy={saving === idea.title}
                onSave={saveIdea}
                onCompare={toggleCompare}
                compared={compare.some((i) => i.title === idea.title)}
              />
            </StaggerItem>
          ))}
        </Stagger>
      ) : null}

      {result ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t-[3px] border-black pt-5">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-concrete">
            <Sparkles className="mr-1.5 inline size-3 stroke-[3]" aria-hidden />
            {result.signals?.themes?.length
              ? `Built from: ${result.signals.themes.join(' · ')}`
              : 'Built from this event’s published description and tags.'}
            {result.difficultyInference?.difficulty
              ? ` Inferred difficulty: ${DIFFICULTY_LABEL[result.difficultyInference.difficulty]}.`
              : ''}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => generate({ offset, count })} disabled={loading}>
              <RefreshCw className={cn(loading && 'animate-spin')} /> Regenerate
            </Button>
            <Button
              onClick={() => {
                setOffset((value) => value + count)
                generate({ offset: offset + count, count })
              }}
              disabled={loading}
              variant="ghost"
            >
              Different ideas <RefreshCw />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export { ideaToText, copyToClipboard }