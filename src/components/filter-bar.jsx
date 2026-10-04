import * as React from 'react'
import { useSearchParams } from 'react-router-dom'
import { Filter, Search, SlidersHorizontal, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox, Input, Label } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { CATEGORY_LIST, TECHNOLOGY_LIST } from '@/lib/taxonomy-labels'
import { cn } from '@/lib/utils'

/**
 * Explore filters.
 *
 * The URL query string is the single source of truth: every filter lives there,
 * so a filtered view is shareable, bookmarkable and survives a reload or a back
 * navigation. No filter state exists only in React.
 *
 * Parameter names match the API's `listQuerySchema` in server/routes/hackathons.js
 * exactly, so what you see in the address bar is what the backend receives.
 */

const STATUS_OPTIONS = [
  { value: '', label: 'Any status' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'ongoing', label: 'Ongoing now' },
  { value: 'completed', label: 'Completed' },
  { value: 'newly-added', label: 'Newly added' },
]

const REGISTRATION_OPTIONS = [
  { value: '', label: 'Any registration state' },
  { value: 'open', label: 'Registration open' },
  { value: 'closing-soon', label: 'Closing soon' },
  { value: 'closed', label: 'Registration closed' },
]

const FORMAT_OPTIONS = [
  { value: '', label: 'Any format' },
  { value: 'online', label: 'Online' },
  { value: 'offline', label: 'In person' },
  { value: 'hybrid', label: 'Hybrid' },
]

const SORT_OPTIONS = [
  { value: 'recently-discovered', label: 'Recently discovered' },
  { value: 'registration-deadline', label: 'Registration deadline (soonest)' },
  { value: 'start-date', label: 'Start date (soonest)' },
  { value: 'prize-pool', label: 'Prize pool (largest)' },
  { value: 'alphabetical', label: 'Alphabetical (A–Z)' },
  { value: 'relevance', label: 'Best match' },
]

const BOOLEAN_FILTERS = [
  { key: 'prize', label: 'Has a prize pool' },
  // Deliberately narrow. Only Unstop publishes an entry-fee flag, so "free to
  // enter" means "the organiser stated this costs nothing" — not "no fee was
  // published", which is true of 576 of the 839 indexed events and is not the
  // same claim. Relabelling this "no fee listed" would make the results read as
  // a promise the underlying records cannot support.
  { key: 'free', label: 'Free to enter' },
  { key: 'beginnerFriendly', label: 'Beginner friendly' },
  { key: 'featured', label: 'Featured by HackRadar' },
]

const EMPTY = {
  q: '',
  status: '',
  registration: '',
  format: '',
  categories: [],
  technologies: [],
  country: '',
  dateFrom: '',
  dateTo: '',
  sort: 'recently-discovered',
  prize: false,
  free: false,
  beginnerFriendly: false,
  featured: false,
  page: 1,
}

function listOf(params, key) {
  return params.getAll(key).filter(Boolean)
}

/** URL -> state. */
export function fromParams(params) {
  const flag = (key) => params.get(key) === 'true'
  return {
    q: params.get('q') ?? '',
    status: params.get('status') ?? '',
    registration: params.get('registration') ?? '',
    format: params.get('format') ?? '',
    categories: listOf(params, 'category'),
    technologies: listOf(params, 'technology'),
    country: params.get('country') ?? '',
    dateFrom: params.get('dateFrom') ?? '',
    dateTo: params.get('dateTo') ?? '',
    sort: params.get('sort') ?? 'recently-discovered',
    prize: flag('prize'),
    free: flag('free'),
    beginnerFriendly: flag('beginnerFriendly'),
    featured: flag('featured'),
    page: Math.max(1, Number(params.get('page') ?? 1) || 1),
  }
}

/** state -> URL. Only non-defaults are written, keeping shared links short. */
export function toParams(state) {
  const params = new URLSearchParams()
  if (state.q) params.set('q', state.q)
  if (state.status) params.set('status', state.status)
  if (state.registration) params.set('registration', state.registration)
  if (state.format) params.set('format', state.format)
  for (const value of state.categories) params.append('category', value)
  for (const value of state.technologies) params.append('technology', value)
  if (state.country) params.set('country', state.country)
  if (state.dateFrom) params.set('dateFrom', state.dateFrom)
  if (state.dateTo) params.set('dateTo', state.dateTo)
  if (state.sort && state.sort !== EMPTY.sort) params.set('sort', state.sort)
  if (state.prize) params.set('prize', 'true')
  if (state.free) params.set('free', 'true')
  if (state.beginnerFriendly) params.set('beginnerFriendly', 'true')
  if (state.featured) params.set('featured', 'true')
  if (state.page > 1) params.set('page', String(state.page))
  return params
}

export function useFilterState() {
  const [searchParams, setSearchParams] = useSearchParams()
  const state = React.useMemo(() => fromParams(searchParams), [searchParams])

  const update = React.useCallback(
    (patch, options = {}) => {
      const next = { ...state, ...patch }
      // Any filter change resets to page 1 unless the caller is paging explicitly.
      if (options.keepPage !== true && !('page' in patch)) next.page = 1
      setSearchParams(toParams(next), { replace: Boolean(options.replace) })
    },
    [state, setSearchParams],
  )

  const clearAll = React.useCallback(() => {
    setSearchParams(new URLSearchParams(), { replace: false })
  }, [setSearchParams])

  const chips = React.useMemo(() => {
    const list = []
    if (state.status) {
      list.push({
        key: 'status',
        label: STATUS_OPTIONS.find((o) => o.value === state.status)?.label ?? state.status,
      })
    }
    if (state.registration) {
      list.push({
        key: 'registration',
        label: REGISTRATION_OPTIONS.find((o) => o.value === state.registration)?.label ?? state.registration,
      })
    }
    if (state.format) {
      list.push({
        key: 'format',
        label: FORMAT_OPTIONS.find((o) => o.value === state.format)?.label ?? state.format,
      })
    }
    for (const category of state.categories) {
      list.push({
        key: `category:${category}`,
        label: CATEGORY_LIST.find((c) => c.key === category)?.label ?? category,
      })
    }
    // Technology filters carry the stored label, so no lookup is needed.
    for (const tech of state.technologies) {
      list.push({ key: `technology:${tech}`, label: tech })
    }
    if (state.country) list.push({ key: 'country', label: state.country })
    if (state.dateFrom) list.push({ key: 'dateFrom', label: `From ${state.dateFrom}` })
    if (state.dateTo) list.push({ key: 'dateTo', label: `To ${state.dateTo}` })
    for (const option of BOOLEAN_FILTERS) {
      if (state[option.key]) list.push({ key: option.key, label: option.label })
    }
    return list
  }, [state])

  const removeChip = React.useCallback(
    (key) => {
      if (key.startsWith('category:')) {
        update({ categories: state.categories.filter((c) => c !== key.slice(9)) })
        return
      }
      if (key.startsWith('technology:')) {
        update({ technologies: state.technologies.filter((t) => t !== key.slice(11)) })
        return
      }
      if (['status', 'registration', 'format', 'country', 'dateFrom', 'dateTo'].includes(key)) {
        update({ [key]: '' })
        return
      }
      if (key in EMPTY) update({ [key]: false })
    },
    [state, update],
  )

  return { state, update, clearAll, chips, removeChip }
}

/** Convert UI state into the exact object the API expects. */
export function toApiQuery(state) {
  return {
    q: state.q || undefined,
    status: state.status || undefined,
    registration: state.registration || undefined,
    format: state.format || undefined,
    category: state.categories.length ? state.categories : undefined,
    technology: state.technologies.length ? state.technologies : undefined,
    country: state.country || undefined,
    dateFrom: state.dateFrom || undefined,
    dateTo: state.dateTo || undefined,
    sort: state.sort || undefined,
    prize: state.prize ? true : undefined,
    free: state.free ? true : undefined,
    beginnerFriendly: state.beginnerFriendly ? true : undefined,
    featured: state.featured ? true : undefined,
    page: state.page,
  }
}

function FilterControls({ state, update, facets, idPrefix = 'f' }) {
  // The API returns category and technology facets as arrays of
  // { key|label, count }. Categories filter by key; technologies filter by label
  // because that is what gets stored on each record.
  const categories = facets?.categories ?? CATEGORY_LIST.map((c) => ({ key: c.key, label: c.label, count: 0 }))
  const technologies = facets?.technologies?.length
    ? facets.technologies
    : TECHNOLOGY_LIST.map((t) => ({ key: t.key, label: t.label, count: 0 }))
  const countries = facets?.countries ?? []

  const toggleIn = (list, value) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value]

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor={`${idPrefix}-status`}>Status</Label>
          <Select value={state.status || 'none'} onValueChange={(value) => update({ status: value === 'none' ? '' : value })}>
            <SelectTrigger id={`${idPrefix}-status`} className="mt-2">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((option) => (
                <SelectItem key={option.value || 'none'} value={option.value || 'none'}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor={`${idPrefix}-registration`}>Registration</Label>
          <Select
            value={state.registration || 'none'}
            onValueChange={(value) => update({ registration: value === 'none' ? '' : value })}
          >
            <SelectTrigger id={`${idPrefix}-registration`} className="mt-2">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REGISTRATION_OPTIONS.map((option) => (
                <SelectItem key={option.value || 'none'} value={option.value || 'none'}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <Label htmlFor={`${idPrefix}-format`}>Format</Label>
        <Select value={state.format || 'none'} onValueChange={(value) => update({ format: value === 'none' ? '' : value })}>
          <SelectTrigger id={`${idPrefix}-format`} className="mt-2">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FORMAT_OPTIONS.map((option) => (
              <SelectItem key={option.value || 'none'} value={option.value || 'none'}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <fieldset>
        <legend className="brutal-kicker">Categories</legend>
        <div className="mt-3 grid max-h-64 grid-cols-1 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-1">
          {categories.map((category) => {
            const checked = state.categories.includes(category.key)
            return (
              <label
                key={category.key}
                className="flex cursor-pointer items-center gap-2.5 border-2 border-ash px-2.5 py-1.5 transition-colors hover:border-black hover:bg-ash has-[:checked]:border-black has-[:checked]:bg-ash"
              >
                <Checkbox
                  checked={checked}
                  onChange={() => update({ categories: toggleIn(state.categories, category.key) })}
                />
                <span className="min-w-0 flex-1 truncate font-mono text-[11px] font-bold uppercase tracking-[0.1em]">
                  {category.label}
                </span>
                <span className="font-mono text-[10px] text-concrete">{category.count ?? 0}</span>
              </label>
            )
          })}
        </div>
      </fieldset>

      <fieldset>
        <legend className="brutal-kicker">Technology</legend>
        <div className="mt-3 flex max-h-56 flex-wrap gap-1.5 overflow-y-auto">
          {technologies.map((tech) => {
            const active = state.technologies.includes(tech.label)
            return (
              <button
                key={tech.label}
                type="button"
                aria-pressed={active}
                onClick={() => update({ technologies: toggleIn(state.technologies, tech.label) })}
                className={cn(
                  'border-2 border-black px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.1em] transition-colors',
                  active ? 'bg-black text-white' : 'bg-white text-black hover:bg-ash',
                )}
              >
                {tech.label}
                {tech.count ? <span className="ml-1.5 opacity-60">{tech.count}</span> : null}
              </button>
            )
          })}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor={`${idPrefix}-from`}>Starts on/after</Label>
          <Input
            id={`${idPrefix}-from`}
            type="date"
            value={state.dateFrom}
            onChange={(event) => update({ dateFrom: event.target.value })}
            className="mt-2"
          />
        </div>
        <div>
          <Label htmlFor={`${idPrefix}-to`}>Starts on/before</Label>
          <Input
            id={`${idPrefix}-to`}
            type="date"
            value={state.dateTo}
            onChange={(event) => update({ dateTo: event.target.value })}
            className="mt-2"
          />
        </div>
      </div>

      <div>
        <Label htmlFor={`${idPrefix}-country`}>Country</Label>
        <Select
          value={state.country || 'any'}
          onValueChange={(value) => update({ country: value === 'any' ? '' : value })}
        >
          <SelectTrigger id={`${idPrefix}-country`} className="mt-2">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any country</SelectItem>
            {countries.map(({ name, count }) => (
              <SelectItem key={name} value={name}>
                {name} ({count})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <fieldset>
        <legend className="brutal-kicker">Only show</legend>
        <div className="mt-3 space-y-1.5">
          {BOOLEAN_FILTERS.map((option) => (
            <label
              key={option.key}
              className="flex cursor-pointer items-center gap-2.5 border-2 border-ash px-2.5 py-2 transition-colors hover:border-black hover:bg-ash has-[:checked]:border-black has-[:checked]:bg-ash"
            >
              <Checkbox
                checked={state[option.key]}
                onChange={(event) => update({ [option.key]: event.target.checked })}
              />
              <span className="font-mono text-[11px] font-bold uppercase tracking-[0.1em]">{option.label}</span>
            </label>
          ))}
        </div>
        {state.free ? (
          // The filter is honest but narrow, and a narrow filter that looks
          // broken is worse than one that explains itself.
          <p className="mt-3 border-2 border-dashed border-ash px-2.5 py-2 text-[11px] leading-relaxed text-muted-foreground">
            Most sources never publish an entry fee, so &ldquo;not stated as
            paid&rdquo; is not the same as &ldquo;free&rdquo;. This matches only
            events whose organiser stated a fee of zero &mdash; open each listing
            to confirm.
          </p>
        ) : null}
      </fieldset>
    </div>
  )
}

function SortSelect({ value, onChange, id }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} className="w-full lg:w-72" aria-label="Sort results">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {SORT_OPTIONS.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function FilterBar({ facets, total = 0 }) {
  const { state, update, clearAll, chips, removeChip } = useFilterState()
  const [draft, setDraft] = React.useState(state.q)
  const [sheetOpen, setSheetOpen] = React.useState(false)

  // Keep the box in sync when the URL changes from a chip, the back button, etc.
  React.useEffect(() => {
    setDraft(state.q)
  }, [state.q])

  return (
    <div className="space-y-4">
      <Card className="flex flex-col gap-3 p-3 shadow-brutal lg:flex-row lg:items-center">
        <form
          onSubmit={(event) => {
            event.preventDefault()
            update({ q: draft.trim() })
          }}
          className="relative flex-1"
          role="search"
        >
          <Label htmlFor="hackathon-search" className="sr-only">
            Search hackathons by name, organiser, technology, category, theme or location
          </Label>
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 stroke-[3]"
            aria-hidden
          />
          <Input
            id="hackathon-search"
            type="search"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Search name, organiser, tech, category, theme, location…"
            className="pl-10 pr-24"
          />
          <Button type="submit" size="sm" className="absolute right-1.5 top-1/2 -translate-y-1/2">
            Search
          </Button>
        </form>

        <div className="hidden items-center gap-2 lg:flex">
          <span className="brutal-kicker whitespace-nowrap">Sort</span>
          <SortSelect
            id="sort-desktop"
            value={state.sort}
            onChange={(value) => update({ sort: value }, { keepPage: true })}
          />
        </div>

        <div className="flex items-center gap-2">
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" className="flex-1 lg:hidden">
                <SlidersHorizontal /> Filters
                {chips.length ? (
                  <Badge variant="solid" size="sm" className="bg-black text-white">
                    {chips.length}
                  </Badge>
                ) : null}
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="max-h-[88vh] overflow-y-auto p-0">
              <SheetHeader>
                <SheetTitle>Filters</SheetTitle>
                <p className="mt-2 text-sm text-soot">
                  Narrow {total.toLocaleString('en-US')} hackathons to the ones worth your weekend.
                </p>
              </SheetHeader>
              <div className="p-5">
                <FilterControls state={state} update={update} facets={facets} idPrefix="m" />
              </div>
              <div className="sticky bottom-0 flex gap-3 border-t-[3px] border-black bg-white p-4">
                <Button className="flex-1" onClick={() => setSheetOpen(false)}>
                  Show {total.toLocaleString('en-US')} results
                </Button>
                <Button variant="outline" onClick={clearAll}>
                  Clear
                </Button>
              </div>
            </SheetContent>
          </Sheet>

          {chips.length ? (
            <Button variant="ghost" onClick={clearAll} className="hidden lg:inline-flex">
              <X /> Clear all
            </Button>
          ) : null}
        </div>
      </Card>

      <div className="lg:hidden">
        <Label htmlFor="sort-mobile" className="sr-only">
          Sort results
        </Label>
        <SortSelect
          id="sort-mobile"
          value={state.sort}
          onChange={(value) => update({ sort: value }, { keepPage: true })}
        />
      </div>

      {chips.length ? (
        <div className="flex flex-wrap items-center gap-2" aria-label="Active filters">
          <span className="brutal-kicker flex items-center gap-1.5">
            <Filter className="size-3.5 stroke-[3]" /> Active
          </span>
          {chips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={() => removeChip(chip.key)}
              className="inline-flex items-center gap-1.5 border-2 border-black bg-ash px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.12em] transition-colors hover:bg-black hover:text-white"
            >
              {chip.label}
              <X className="size-3 stroke-[3]" aria-hidden />
              <span className="sr-only">Remove this filter</span>
            </button>
          ))}
          <Button variant="ghost" size="sm" onClick={clearAll}>
            Clear all
          </Button>
        </div>
      ) : null}
    </div>
  )
}

export function FilterSidebar({ facets, className }) {
  const { state, update } = useFilterState()
  return (
    <Card className={cn('p-5 shadow-brutal', className)}>
      <p className="brutal-kicker mb-5 border-b-[3px] border-black pb-3">Refine</p>
      <FilterControls state={state} update={update} facets={facets} idPrefix="s" />
    </Card>
  )
}

export { FilterControls, SORT_OPTIONS, STATUS_OPTIONS, REGISTRATION_OPTIONS, FORMAT_OPTIONS, BOOLEAN_FILTERS, EMPTY }