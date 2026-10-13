import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import LinearProgress from '@mui/material/LinearProgress'
import Snackbar from '@mui/material/Snackbar'
import Typography from '@mui/material/Typography'
import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { creditRoles } from '../../app/creditRoles.ts'
import { useRoleFilters } from '../../stores/roleFilters.ts'
import { ConnectorCards } from '../connectors/ConnectorCards.tsx'
import { LinerNotes } from '../notes/LinerNotes.tsx'
import { OrbitView } from '../orbit/OrbitView.tsx'
import { Breadcrumbs, Caption, ConnectionChip, LegendChips, LiveChip, StageChips, StageHeading } from '../orbit/StageOverlays.tsx'
import { rootRef } from '../orbit/orbitLayout.ts'
import { useCentre } from '../orbit/useCentre.ts'
import { useView } from '../orbit/useView.ts'
import { hidePerson, showEveryone, showPerson, useHiddenPeople } from './hiddenPeople.ts'
import type { GraphSession } from './graphSession.ts'
import { useLiveStatus } from './liveStatus.ts'
import { flushRemovals, undoRemoval, useRemovals } from './removals.ts'
import { GraphTools } from './GraphTools.tsx'
import { RoleFilterBar } from './RoleFilterBar.tsx'
import { Strip } from './Strip.tsx'
import { TextView } from './TextView.tsx'
import { useRemoveSong } from './useGraphMutations.ts'
import { useFreshCredits } from './useFreshCredits.ts'
import { useLiveGraph } from './useLiveGraph.ts'
import { buildWorkspace } from './workspaceModel.ts'

// The constellation carries the force simulation, the canvas renderer and the drag behaviour; someone who stays in the
// orbit never downloads them (NFR-PERF-01).
const ConstellationView = lazy(() =>
  import('../constellation/ConstellationView.tsx').then((module) => ({ default: module.ConstellationView })),
)

/**
 * Your graph (FR-VIEW-01, FR-HUB-01..03, FR-NOTES-01, FR-GRAPH-01, FR-GRAPH-04, FR-GRAPH-06, FR-VIEW-03, NFR-A11Y-01):
 * the strip, the orbit on its stage, and the connector cards and liner notes in the column beside it.
 *
 * One `Workspace` is built from the live snapshot, the role filters, the removals that are waiting out their undo and
 * the people who are hidden; the orbit, the cards, the notes and the Text view all read that one value, so they cannot
 * disagree.
 */
export function GraphView({ session }: { session: GraphSession }) {
  const graph = useLiveGraph(session)
  const snapshot = graph.snapshot
  const removeSong = useRemoveSong(session)

  const roles = useRoleFilters((state) => state.active)
  const resetRoles = useRoleFilters((state) => state.reset)
  const hidden = useHiddenPeople(session.id)
  const pending = useRemovals((state) => state.pending)
  const removalFailed = useRemovals((state) => state.failed)
  const dismissFailure = useRemovals((state) => state.dismissFailure)
  const removed = useMemo(() => new Set(pending.map((entry) => entry.mbid)), [pending])

  const workspace = useMemo(
    () => (snapshot === undefined ? null : buildWorkspace(snapshot, { roles, removed, hidden })),
    [snapshot, roles, removed, hidden],
  )
  const { centre, crumbs, goTo } = useCentre(workspace)
  const status = useLiveStatus(workspace, snapshot, graph.live)
  const [view, setView] = useView()
  // The credits that have just arrived, for the liner notes to highlight (FR-NOTES-01).
  const freshCredits = useFreshCredits(snapshot)

  const [textView, setTextView] = useState(false)
  const [peopleExpanded, setPeopleExpanded] = useState(false)

  // Leaving the workspace, or the page, does not lose a removal that is still inside its undo time.
  useEffect(() => {
    window.addEventListener('pagehide', flushRemovals)
    return () => {
      window.removeEventListener('pagehide', flushRemovals)
      flushRemovals()
    }
  }, [])

  const songCount = workspace?.songs.length ?? 0
  const lastRemoved = pending.at(-1)

  return (
    <Box
      component="section"
      aria-label="Your graph"
      aria-busy={graph.isPending}
      sx={{
        display: 'grid',
        gridTemplateRows: { xs: 'auto auto', md: 'auto minmax(0, 1fr)' },
        gap: 1.75,
        width: '100%',
        maxWidth: 1660,
        mx: 'auto',
        minHeight: 0,
        flex: { md: '1 1 0' },
      }}
    >
      {workspace !== null && songCount > 0 ? (
        <Box sx={{ display: 'grid', gap: 1.25 }}>
          <Strip
            workspace={workspace}
            filtered={roles.size < creditRoles.length}
            hidden={workspace.hiddenPeople}
            onShow={(mbid) => showPerson(session.id, mbid)}
            onShowEveryone={() => showEveryone(session.id)}
          />
          <RoleFilterBar active={roles} onReset={resetRoles} />
        </Box>
      ) : (
        <Typography variant="h1" sx={{ fontSize: 'clamp(26px, 3.2vw, 42px)', m: 0 }}>
          Your graph
        </Typography>
      )}

      {graph.isPending && <LinearProgress aria-label="Loading your graph" />}

      {graph.isError && snapshot === undefined && (
        <Alert
          severity="warning"
          action={
            <Button color="inherit" size="small" onClick={graph.refetch}>
              Try again
            </Button>
          }
        >
          Your graph could not be loaded.
        </Alert>
      )}

      {workspace !== null && songCount > 0 && <GraphTools workspace={workspace} view={view} onView={setView} onFind={goTo} />}

      {workspace !== null && songCount === 0 && (
        <Typography color="text.secondary">Your graph is empty. Search for a song and choose “Add to graph”.</Typography>
      )}

      {workspace !== null && songCount > 0 && centre !== null && (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(0, 1fr) 390px' },
            gap: 2,
            minHeight: 0,
          }}
        >
          <Box
            sx={(theme) => ({
              position: 'relative',
              minHeight: { xs: 460, md: 0 },
              height: { xs: '70svh', md: 'auto' },
              borderRadius: '16px',
              overflow: 'hidden',
              border: `1px solid ${theme.vars.palette.divider}`,
              backgroundColor: theme.vars.palette.background.paper,
            })}
          >
            {view === 'orbit' ? (
              <>
                <OrbitView
                  workspace={workspace}
                  centre={centre}
                  onCentre={goTo}
                  onMore={() => {
                    setTextView(true)
                    setPeopleExpanded(true)
                  }}
                />
                <StageHeading>
                  <Breadcrumbs workspace={workspace} crumbs={crumbs} onGo={goTo} />
                  <Caption workspace={workspace} centre={centre} onHide={(mbid) => hidePerson(session.id, mbid)} />
                </StageHeading>
              </>
            ) : (
              <>
                <Suspense fallback={<LinearProgress aria-label="Loading the constellation" sx={{ position: 'absolute', top: 0, left: 0, right: 0 }} />}>
                  <ConstellationView workspace={workspace} onCentre={goTo} />
                </Suspense>
                <StageHeading>
                  <Caption workspace={workspace} centre={rootRef} onHide={(mbid) => hidePerson(session.id, mbid)} />
                </StageHeading>
              </>
            )}
            <StageChips>
              <LiveChip text={status.text} pulsing={status.pulsing} />
              {view === 'orbit' && <ConnectionChip workspace={workspace} centre={centre} onGo={goTo} />}
            </StageChips>
            <LegendChips
              hint={
                view === 'orbit'
                  ? 'Click anyone to put them at the centre · scroll to zoom'
                  : 'Click anyone to open them in the orbit · drag to move · scroll to zoom'
              }
            />
          </Box>

          <Box
            component="aside"
            aria-label="Credits"
            sx={{
              display: 'flex',
              flexDirection: 'column',
              gap: 2.5,
              minHeight: 0,
              overflow: { md: 'auto' },
              // Room for a card's outline and its hover lift: the container clips whatever pokes out of it. No padding
              // on top, so the sticky headings sit flush against it.
              px: '3px',
              pb: '3px',
              scrollbarWidth: 'thin',
              // A link that is scrolled into view lands below the sticky heading, not under it.
              scrollPaddingTop: '48px',
            }}
          >
            <ConnectorCards workspace={workspace} centre={centre} onCentre={goTo} onHide={(mbid) => hidePerson(session.id, mbid)} />

            <LinerNotes
              workspace={workspace}
              centre={centre}
              failures={graph.failures}
              fresh={freshCredits}
              textView={textView}
              onToggleTextView={() => setTextView((on) => !on)}
              onCentre={goTo}
              onRemove={(song) => removeSong({ mbid: song.mbid, title: song.title, artist: song.artist })}
            />

            {textView && (
              <TextView
                workspace={workspace}
                failures={graph.failures}
                peopleExpanded={peopleExpanded}
                onExpandPeople={() => setPeopleExpanded(true)}
                onRemove={(song) => removeSong({ mbid: song.mbid, title: song.title, artist: song.artist })}
                onHide={(mbid) => hidePerson(session.id, mbid)}
              />
            )}
          </Box>
        </Box>
      )}

      <Snackbar
        open={lastRemoved !== undefined}
        message={lastRemoved === undefined ? '' : `Removed “${lastRemoved.title}” from your graph`}
        action={
          // The bar's own colours are an inverse surface, so the button takes its text colour (the accent yellow would not
          // reach 3:1 on it) and is marked as a control by weight and underline.
          <Button
            color="inherit"
            size="small"
            onClick={() => lastRemoved !== undefined && undoRemoval(lastRemoved.mbid)}
            sx={{ fontWeight: 800, textDecoration: 'underline' }}
          >
            Undo
          </Button>
        }
        // No automatic close: the bar goes when the removal is sent or undone, which is what the store says.
        slotProps={{ clickAwayListener: { onClickAway: () => undefined } }}
      />

      <Snackbar open={removalFailed !== null} onClose={dismissFailure} autoHideDuration={8000}>
        <Alert severity="warning" onClose={dismissFailure}>
          {removalFailed} could not be removed. It is back in your graph; try again.
        </Alert>
      </Snackbar>
    </Box>
  )
}
