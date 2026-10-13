import { skipToken, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { addSongToGraph, ensureGraphSession, fetchGraphSnapshot, graphQueryKey, removeSongFromGraph } from './graphApi.ts'
import type { GraphSnapshot } from './graphEvents.ts'
import { useGraphSession, type GraphSession } from './graphSession.ts'

/**
 * Adds a recording to the browser's graph, creating the graph on first use (FR-GRAPH-01, FR-GRAPH-02).
 *
 * The song's node is put into the cached snapshot from the Api's answer at once; credits follow as hub events.
 * Then the snapshot is read again, because events about this song may have reached the page before the answer did
 * (a cached song's credits are sent while the request is still open) and were set aside as being about an unknown song.
 */
export function useAddSong() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (recordingMbid: string) => {
      const session = await ensureGraphSession()
      const answer = await addSongToGraph(session, recordingMbid)
      return { session, answer }
    },

    onSuccess: ({ session, answer }) => {
      const key = graphQueryKey(session.id)

      queryClient.setQueryData<GraphSnapshot>(key, (current) => {
        if (current === undefined || current.songs.some((song) => song.mbid === answer.song.mbid)) {
          return current
        }
        return { ...current, songs: [...current.songs, answer.song] }
      })

      // `invalidateQueries` marks the snapshot stale and reads it again if it is on screen. A snapshot that is not
      // loaded yet (the graph was just created) loads on its own when the list mounts.
      void queryClient.invalidateQueries({ queryKey: key })
    },
  })
}

export function useRemoveSong(session: GraphSession) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (songMbid: string) => removeSongFromGraph(session, songMbid),

    onSuccess: (_, songMbid) => {
      const key = graphQueryKey(session.id)

      // Gone from the list at once; the hubs and the counts follow from the next snapshot and the HubsUpdated event.
      queryClient.setQueryData<GraphSnapshot>(key, (current) =>
        current === undefined
          ? current
          : {
              ...current,
              songs: current.songs.filter((song) => song.mbid !== songMbid),
              credits: current.credits.filter((credit) => credit.songMbid !== songMbid),
            },
      )
      void queryClient.invalidateQueries({ queryKey: key })
    },
  })
}

/**
 * The MBIDs of the songs in the browser's graph, so a search result can say "in your graph".
 *
 * When the graph is on screen its query is in the cache and is only observed here (whoever shows the graph owns
 * loading it). When it is not (the landing page), `loadIfMissing` reads the graph once, under its own key, so the
 * page that owns the live snapshot is never handed data that was read before its connection joined.
 */
export function useGraphSongIds(loadIfMissing = false): ReadonlySet<string> {
  const session = useGraphSession()
  const id = session?.id ?? ''

  // `skipToken` as the queryFn makes a query that observes the cache and never fetches, and TypeScript still knows the data's type.
  const cached = useQuery({
    queryKey: graphQueryKey(id),
    queryFn: skipToken,
    select: (snapshot: GraphSnapshot) => new Set(snapshot.songs.map((song) => song.mbid)),
  })

  const fetched = useQuery({
    queryKey: [...graphQueryKey(id), 'song-ids'],
    enabled: loadIfMissing && session !== null && cached.data === undefined,
    queryFn: async ({ signal }) => {
      const snapshot = await fetchGraphSnapshot(session!, signal)
      return snapshot.songs.map((song) => song.mbid)
    },
    select: (ids) => new Set(ids),
    staleTime: 30_000,
    retry: false,
  })

  return cached.data ?? fetched.data ?? emptySet
}

const emptySet: ReadonlySet<string> = new Set()
