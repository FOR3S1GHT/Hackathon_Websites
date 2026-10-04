import * as React from 'react'
import { api } from '@/lib/api'

/**
 * Catalogue queries with debounced search.
 *
 * `useHackathons` owns the whole list-page contract: URL-synced query state,
 * a debounced `q`, request cancellation on rapid filter changes, and the facet
 * vocabulary the filter UI needs.
 */

const DEFAULT_PAGE_SIZE = 24

/**
 * Fetch a page of the catalogue.
 *
 * `query` is passed straight through to the API, so the caller owns filter state
 * (the URL, on Explore). The previous request is abandoned whenever the query
 * changes, which prevents a slow page 1 overwriting a fast page 2.
 */
export function useHackathons(query, options = {}) {
  const { pageSize = DEFAULT_PAGE_SIZE } = options
  const [data, setData] = React.useState(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState(null)

  const requestKey = React.useMemo(() => JSON.stringify(query), [query])

  React.useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)

    api
      .listHackathons({ ...query, pageSize })
      .then((result) => {
        if (active) setData(result)
      })
      .catch((err) => {
        if (!active) return
        setError(err)
        setData(null)
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
    // requestKey is the stable identity of `query`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey, pageSize])

  return {
    items: data?.items ?? [],
    pagination: data?.pagination ?? { page: 1, pageSize, total: 0, totalPages: 0 },
    counts: data?.counts ?? null,
    appliedFilters: data?.appliedFilters ?? null,
    loading,
    error,
    requestKey,
  }
}

/** Filter vocabulary and live facet counts, used by the filter UI. */
export function useHackathonFacets() {
  const [facets, setFacets] = React.useState(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState(null)

  const reload = React.useCallback(async () => {
    setLoading(true)
    try {
      setFacets(await api.hackathonMeta())
      setError(null)
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    reload()
  }, [reload])

  return { facets, loading, error, reload }
}

/** One hackathon by slug, with lazy detail enrichment handled server-side. */
export function useHackathon(slug) {
  const [data, setData] = React.useState(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState(null)

  const load = React.useCallback(
    async (options = {}) => {
      if (!slug) return
      if (!options.silent) setLoading(true)
      setError(null)
      try {
        const result = await api.hackathon(slug)
        setData(result)
      } catch (err) {
        setError(err)
        setData(null)
      } finally {
        setLoading(false)
      }
    },
    [slug],
  )

  React.useEffect(() => {
    load()
  }, [load])

  return {
    hackathon: data?.hackathon ?? null,
    related: data?.related ?? [],
    loading,
    error,
    refetch: load,
  }
}

/** Global metadata: store driver, sources, capabilities, stats, sync health. */
export function useMeta() {
  const [meta, setMeta] = React.useState(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState(null)

  const load = React.useCallback(async () => {
    try {
      setError(null)
      setMeta(await api.meta())
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    load()
  }, [load])

  return { meta, loading, error, reload: load }
}