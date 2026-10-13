import { useEffect, useState } from 'react'
import type { GraphSnapshot } from './graphEvents.ts'
import type { LiveState } from './useLiveGraph.ts'
import type { Workspace } from './workspaceModel.ts'

/** How long "Credits loaded" stays up once a song's credits have arrived. */
const loadedNoticeMs = 2200

function crawlText(crawl: GraphSnapshot['crawl']): string | null {
  if (crawl.queued > 0) {
    const seconds = crawl.etaSeconds
    return (
      `Fetching credits: ${crawl.queued} ${crawl.queued === 1 ? 'lookup' : 'lookups'} waiting` +
      (seconds > 0 ? `, about ${seconds} ${seconds === 1 ? 'second' : 'seconds'} to go` : '')
    )
  }
  return null
}

export interface LiveStatus {
  /** The words for the live chip, or null when nothing is arriving. */
  text: string | null
  /** Whether the chip's dot pulses: something is on its way. */
  pulsing: boolean
}

/**
 * What the live chip says (FR-GRAPH-02): the connection's state first, then that credits have just arrived, then that
 * they are on the way (with the crawl's queue and its estimate), then that a lookup failed. The words are true to what
 * the server told us; the prototype's "0/12" is not here, because the total is not known when a song is added.
 */
export function useLiveStatus(workspace: Workspace | null, snapshot: GraphSnapshot | undefined, live: LiveState): LiveStatus {
  // Which songs were loading last time and how many credits each had, to notice a song that has just finished.
  const loadingKey = workspace === null ? '' : workspace.songs.filter((song) => song.creditsStatus === 'loading').map((song) => song.mbid).join(',')
  const [seen, setSeen] = useState<{ loading: string; credits: Map<string, number> }>({ loading: loadingKey, credits: new Map() })
  const [loaded, setLoaded] = useState<number | null>(null)

  if (workspace !== null && seen.loading !== loadingKey) {
    const before = new Set(seen.loading === '' ? [] : seen.loading.split(','))
    const now = new Set(loadingKey === '' ? [] : loadingKey.split(','))
    let finishedCredits = 0
    let finished = false
    for (const mbid of before) {
      if (now.has(mbid)) continue
      const song = workspace.songById.get(mbid)
      if (song === undefined) continue
      finished = true
      finishedCredits += song.credits.length
    }
    setSeen({ loading: loadingKey, credits: seen.credits })
    if (finished) setLoaded(finishedCredits)
  }

  useEffect(() => {
    if (loaded === null) return
    const timer = setTimeout(() => setLoaded(null), loadedNoticeMs)
    return () => clearTimeout(timer)
  }, [loaded])

  if (live === 'offline') return { text: 'Live updates are off. Reload the page to get them back.', pulsing: false }
  if (live === 'reconnecting') return { text: 'Reconnecting: changes will show when the connection is back.', pulsing: true }

  const queued = snapshot === undefined ? null : crawlText(snapshot.crawl)
  const loadingCount = loadingKey === '' ? 0 : loadingKey.split(',').length
  if (loadingCount > 0 || queued !== null) return { text: queued ?? 'Live · listening for credits', pulsing: true }
  if (loaded !== null) return { text: `Credits loaded · ${loaded} new`, pulsing: false }

  const failed = snapshot?.crawl.failed ?? 0
  if (failed > 0) return { text: `${failed} ${failed === 1 ? 'lookup' : 'lookups'} could not be completed`, pulsing: false }
  return { text: null, pulsing: false }
}
