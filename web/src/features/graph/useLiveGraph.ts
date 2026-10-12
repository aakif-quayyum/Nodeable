import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { fetchGraphSnapshot, GraphRequestError, graphQueryKey } from './graphApi.ts'
import {
  loadSignalrConnection,
  useGraphConnectionFactory,
  type GraphHubConnection,
} from './graphConnection.ts'
import { applyGraphEvent, graphEventTypes, replayEvents, type GraphEvent, type GraphSnapshot } from './graphEvents.ts'
import type { GraphSession } from './graphSession.ts'

/** Where the live connection stands, for the person: `live` means changes arrive by themselves. */
export type LiveState = 'connecting' | 'live' | 'reconnecting' | 'offline'

// Events kept for replaying on top of a snapshot that arrives after them. A graph of 50 songs produces a few
// hundred events while it is crawled, so this is far more than a snapshot's load can overlap.
const maxKeptEvents = 1000

export interface LiveGraph {
  snapshot: GraphSnapshot | undefined
  isPending: boolean
  isError: boolean
  error: unknown
  refetch: () => void
  live: LiveState
  /** Why a song's credits could not be fetched, by song MBID (CrawlFailed). Cleared when the page is reloaded. */
  failures: Readonly<Record<string, string>>
}

/**
 * The graph on screen: the snapshot from the Api kept current by the hub (FR-GRAPH-02).
 *
 * The order matters and is the one of spec section 9: connect, join the graph's group, **then** load the snapshot.
 * Events that arrive before the snapshot are kept and replayed on top of it, so nothing that happened between the
 * join and the snapshot's read is lost, and events already part of the snapshot are dropped by their `seq`.
 */
export function useLiveGraph(session: GraphSession): LiveGraph {
  const queryClient = useQueryClient()
  const factory = useGraphConnectionFactory()

  const [ready, setReady] = useState(false)
  const [live, setLive] = useState<LiveState>('connecting')
  const [failures, setFailures] = useState<Record<string, string>>({})
  const events = useRef<GraphEvent[]>([])

  const query = useQuery({
    queryKey: graphQueryKey(session.id),
    // The snapshot is loaded only once the join has been tried: an earlier load could miss what happens before it.
    enabled: ready,
    queryFn: async ({ signal }) => {
      const snapshot = await fetchGraphSnapshot(session, signal)

      // LEARN: LG-03 join-then-load | The snapshot is read after the group was joined, and every event newer than it is replayed on top (events are idempotent), which closes the gap a plain "load, then subscribe" leaves open between the two
      const newer = events.current.filter((event) => event.seq > snapshot.seq)
      events.current = newer
      return replayEvents(snapshot, newer)
    },
    // The hub keeps the snapshot current, so it is not stale after a few seconds like other data.
    staleTime: Infinity,
    retry: (count, error) => !(error instanceof GraphRequestError) && count < 1,
  })

  // The latest refetch, readable from the connection's callbacks without restarting the connection when it changes.
  const refetchRef = useRef(query.refetch)
  useEffect(() => {
    refetchRef.current = query.refetch
  })

  useEffect(() => {
    const key = graphQueryKey(session.id)
    let disposed = false
    let connection: GraphHubConnection | null = null
    events.current = []

    function receive(event: GraphEvent) {
      if (event.type === 'CrawlFailed') {
        setFailures((current) => ({ ...current, [event.songMbid]: event.reason }))
      }

      events.current.push(event)
      if (events.current.length > maxKeptEvents) {
        events.current.shift()
      }

      // LEARN: LG-03 set-query-data | The hub never talks to components: each event is applied to the query cache with setQueryData, and every component showing that data re-renders, so the list, the hubs panel and the canvas stay one source of truth
      queryClient.setQueryData<GraphSnapshot>(key, (current) =>
        current === undefined ? current : applyGraphEvent(current, event),
      )
    }

    async function join(hub: GraphHubConnection) {
      await hub.invoke('JoinGraph', session.id, session.token)
    }

    async function connect() {
      try {
        connection = await (factory ?? loadSignalrConnection)()
        if (disposed) return

        for (const type of graphEventTypes) {
          connection.on(type, (message) => {
            if (!disposed) receive({ ...(message as object), type } as GraphEvent)
          })
        }
        connection.onreconnecting(() => !disposed && setLive('reconnecting'))
        connection.onclose(() => !disposed && setLive('offline'))
        connection.onreconnected(() => {
          if (disposed || connection === null) return
          // A reconnect is a new connection: it is in no group, and events may have been missed while it was down.
          void join(connection)
            .then(() => {
              if (disposed) return
              setLive('live')
              void refetchRef.current()
            })
            .catch(() => !disposed && setLive('offline'))
        })

        await connection.start()
        if (disposed) return
        await join(connection)
        if (disposed) return
        setLive('live')
      } catch {
        // The hub is a bonus on top of the REST snapshot: without it the graph still loads, it just does not move.
        if (!disposed) setLive('offline')
      } finally {
        if (!disposed) setReady(true)
      }
    }

    void connect()

    return () => {
      disposed = true
      void connection?.stop()
    }
    // The connection belongs to one graph: a different graph is a different connection.
  }, [session, factory, queryClient])

  return {
    snapshot: query.data,
    isPending: !ready || query.isPending,
    isError: query.isError,
    error: query.error,
    refetch: () => void query.refetch(),
    live,
    failures,
  }
}
