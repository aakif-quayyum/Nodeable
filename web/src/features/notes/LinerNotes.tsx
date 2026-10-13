import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Link from '@mui/material/Link'
import Typography from '@mui/material/Typography'
import { keyframes } from '@mui/material/styles'
import { useMemo } from 'react'
import { useExiting } from '../../motion/useExiting.ts'
import { creditRoleStyles } from '../../app/creditRoles.ts'
import { AlbumArt } from '../art/AlbumArt.tsx'
import { Heading } from '../connectors/ConnectorCards.tsx'
import { RoleSwatch } from '../graph/RoleSwatch.tsx'
import { noteRows, type Workspace, type WorkspaceSong } from '../graph/workspaceModel.ts'
import type { NodeRef } from '../orbit/orbitLayout.ts'

const rise = keyframes`from { opacity: 0; transform: translateY(12px); }`
const leave = keyframes`to { opacity: 0; transform: translateX(16px); }`

const statusText: Record<WorkspaceSong['creditsStatus'], string> = {
  complete: 'Credits complete',
  partial: 'Some credits',
  none: 'No credits',
  loading: 'Loading credits',
}

const visuallyHidden = {
  position: 'absolute',
  // Pixels, as strings: in sx a bare 1 means 100%.
  width: '1px',
  height: '1px',
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
} as const

interface LinerNotesProps {
  workspace: Workspace
  centre: NodeRef | null
  /** Why a song's credits could not be fetched, by song MBID (CrawlFailed). */
  failures: Readonly<Record<string, string>>
  textView: boolean
  onToggleTextView: () => void
  onCentre: (ref: NodeRef) => void
  /** "Remove from graph" (FR-GRAPH-01, FR-GRAPH-06). */
  onRemove: (song: WorkspaceSong) => void
}

/**
 * Liner notes (FR-NOTES-01, FR-GRAPH-04): one card for each song, with its status and the credits grouped by role, as on
 * the back of a record sleeve. A name is a button that puts that person at the centre of the orbit. The song that is
 * loading is first, so what is arriving is at the top.
 */
export function LinerNotes({ workspace, centre, failures, textView, onToggleTextView, onCentre, onRemove }: LinerNotesProps) {
  // Memoised: the exit bookkeeping compares the list it was given with the last one, so it must change only when the songs do.
  const ordered = useMemo(
    () => [...workspace.songs].sort((a, b) => Number(b.creditsStatus === 'loading') - Number(a.creditsStatus === 'loading')),
    [workspace.songs],
  )
  const presence = useExiting(ordered, (song) => song.mbid)

  return (
    <Box component="section" aria-labelledby="notes-heading">
      <Heading
        id="notes-heading"
        action={
          <Button size="small" variant="outlined" aria-pressed={textView} onClick={onToggleTextView} sx={{ py: 0.25, fontSize: 12 }}>
            Text view
          </Button>
        }
      >
        Liner notes
      </Heading>

      {!textView && (
        <Box component="ul" sx={{ display: 'grid', gap: 1, listStyle: 'none', m: 0, p: 0 }}>
          {presence.map(({ item: song, leaving }, index) => (
            <Card
              key={song.mbid}
              song={song}
              workspace={workspace}
              index={index}
              leaving={leaving}
              active={centre?.type === 'song' && centre.id === song.mbid}
              failure={failures[song.mbid]}
              onCentre={onCentre}
              onRemove={onRemove}
            />
          ))}
        </Box>
      )}
    </Box>
  )
}

function Card({
  song,
  workspace,
  index,
  leaving,
  active,
  failure,
  onCentre,
  onRemove,
}: {
  song: WorkspaceSong
  workspace: Workspace
  index: number
  leaving: boolean
  active: boolean
  failure: string | undefined
  onCentre: (ref: NodeRef) => void
  onRemove: (song: WorkspaceSong) => void
}) {
  const rows = noteRows(workspace, song.mbid)
  const loading = song.creditsStatus === 'loading'

  return (
    <Box
      component="li"
      // A song that is leaving is on its way out: it is not something to read or press any more.
      aria-hidden={leaving ? true : undefined}
      inert={leaving || undefined}
      sx={(theme) => ({
        overflow: 'hidden',
        borderRadius: '12px',
        border: `1px solid ${active ? theme.vars.palette.text.primary : theme.vars.palette.divider}`,
        backgroundColor: theme.vars.palette.background.paper,
        transition: 'border-color 250ms',
        '@media (prefers-reduced-motion: no-preference)': {
          animation: leaving
            ? `${leave} 260ms cubic-bezier(0.2, 0.8, 0.2, 1) both`
            : `${rise} 500ms cubic-bezier(0.2, 0.8, 0.2, 1) both`,
          animationDelay: leaving ? '0ms' : `${Math.min(index, 6) * 55}ms`,
        },
      })}
    >
      <Box
        component="article"
        aria-label={`${song.title}, liner notes`}
      >
        <Box
          component="button"
          type="button"
          onClick={() => onCentre({ type: 'song', id: song.mbid })}
          aria-label={`Spin ${song.title} at the centre`}
          sx={{
            display: 'grid',
            gridTemplateColumns: '64px minmax(0, 1fr)',
            gap: 1.5,
            alignItems: 'center',
            width: '100%',
            p: 1.5,
            textAlign: 'left',
            cursor: 'pointer',
            background: 'none',
            border: 0,
            color: 'inherit',
            font: 'inherit',
          }}
        >
          <AlbumArt seed={song.mbid} size={64} alt={`Cover of ${song.title}`} releaseMbid={song.artReleaseMbid} releaseGroupMbid={song.artReleaseGroupMbid} />
          <Box component="span" sx={{ display: 'flex', flexDirection: 'column', gap: '3px', minWidth: 0 }}>
            <Box
              component="b"
              sx={(theme) => ({
                fontFamily: theme.typography.display.fontFamily,
                fontStretch: '70%',
                fontWeight: 900,
                fontSize: 24,
                lineHeight: 0.95,
                textTransform: 'uppercase',
                overflowWrap: 'anywhere',
              })}
            >
              {song.title}
            </Box>
            <Typography variant="caption" color="text.secondary" component="span">
              {[song.artist, song.year].filter((part) => part !== null).join(' · ')}
            </Typography>
            <StatusChip status={song.creditsStatus} />
          </Box>
        </Box>

        {rows.length > 0 ? (
          <Box
            component="dl"
            sx={(theme) => ({ m: 0, borderTop: `1px solid ${theme.vars.palette.divider}` })}
          >
            {rows.map((row) => (
              <Box
                key={row.role}
                sx={(theme) => ({
                  display: 'grid',
                  gridTemplateColumns: { xs: '4px minmax(0, 1fr)', sm: '4px 104px minmax(0, 1fr)' },
                  columnGap: '10px',
                  alignItems: 'baseline',
                  py: '7px',
                  pr: 1.5,
                  '& + &': { borderTop: `1px solid ${theme.vars.palette.divider}` },
                })}
              >
                <RoleSwatch role={row.role} width={4} height="100%" />
                <Typography component="dt" variant="kicker" color="text.secondary" sx={{ fontWeight: 700, letterSpacing: '0.1em', pt: '2px' }}>
                  {creditRoleStyles[row.role].phrase}
                </Typography>
                <Box component="dd" sx={{ m: 0, fontSize: 14, lineHeight: 1.5, fontWeight: 500, gridColumn: { xs: 2, sm: 3 } }}>
                  {row.people.map(({ person, details }, at) => (
                    <Box component="span" key={person.mbid}>
                      {at > 0 && ', '}
                      <Box
                        component="button"
                        type="button"
                        onClick={() => onCentre({ type: 'person', id: person.mbid })}
                        sx={(theme) => ({
                          p: 0,
                          cursor: 'pointer',
                          background: 'none',
                          border: 0,
                          borderBottom: '1px solid #ffffff2e',
                          color: 'inherit',
                          font: 'inherit',
                          fontWeight: 600,
                          '&:hover': { borderBottomColor: theme.vars.palette.text.primary },
                        })}
                      >
                        {person.name}
                      </Box>
                      {person.songs.length >= 2 && (
                        <Box
                          component="span"
                          sx={(theme) => ({
                            ml: '4px',
                            px: '3px',
                            borderRadius: '3px',
                            verticalAlign: '2px',
                            fontFamily: theme.typography.kicker.fontFamily,
                            fontSize: 9,
                            fontWeight: 700,
                            backgroundColor: theme.vars.palette.text.primary,
                            color: theme.vars.palette.background.default,
                          })}
                        >
                          <span aria-hidden="true">×{person.songs.length}</span>
                          <Box component="span" sx={visuallyHidden}>{` (on ${person.songs.length} of your songs)`}</Box>
                        </Box>
                      )}
                      {details.length > 0 && (
                        <Box component="span" sx={{ color: 'text.secondary', fontWeight: 400 }}>{` (${details.join(', ')})`}</Box>
                      )}
                    </Box>
                  ))}
                </Box>
              </Box>
            ))}
          </Box>
        ) : (
          <Typography
            component="p"
            color="text.secondary"
            sx={(theme) => ({ m: 0, px: 1.5, py: 1.25, fontSize: 13.5, borderTop: `1px solid ${theme.vars.palette.divider}` })}
          >
            {loading ? 'Listening for credits…' : 'No credits on MusicBrainz yet.'}
          </Typography>
        )}

        {(song.incomplete || failure !== undefined) && (
          <Box sx={(theme) => ({ px: 1.5, py: 1, display: 'grid', gap: 0.5, borderTop: `1px solid ${theme.vars.palette.divider}`, fontSize: 13.5 })}>
            {failure !== undefined && (
              <Typography variant="body2" color="warning.main">
                {failure}
              </Typography>
            )}
            {song.incomplete && (
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                <Typography variant="kicker" component="span" sx={{ fontWeight: 700 }}>
                  Credits incomplete
                </Typography>
                <Link
                  href={`https://musicbrainz.org/recording/${song.mbid}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  variant="body2"
                  // The visible words start the name (WCAG 2.5.3); the rest says which song, and that it opens a tab.
                  aria-label={`Add credits on MusicBrainz for ${song.title} (opens in a new tab)`}
                >
                  Add credits on MusicBrainz
                </Link>
              </Box>
            )}
          </Box>
        )}

        <Box sx={(theme) => ({ display: 'flex', justifyContent: 'flex-end', px: 1, py: 0.5, borderTop: `1px solid ${theme.vars.palette.divider}` })}>
          <Button
            size="small"
            color="inherit"
            onClick={() => onRemove(song)}
            aria-label={`Remove from graph: ${song.title} by ${song.artist}`}
            sx={{ color: 'text.secondary', fontSize: 12 }}
          >
            Remove from graph
          </Button>
        </Box>
      </Box>
    </Box>
  )
}

function StatusChip({ status }: { status: WorkspaceSong['creditsStatus'] }) {
  return (
    <Box
      component="span"
      sx={(theme) => ({
        alignSelf: 'flex-start',
        mt: '2px',
        px: '6px',
        py: '3px',
        borderRadius: '3px',
        fontFamily: theme.typography.kicker.fontFamily,
        fontSize: 9.5,
        fontWeight: 700,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        color: theme.vars.palette.ink,
        backgroundColor:
          status === 'complete'
            ? theme.vars.palette.success.main
            : status === 'partial'
              ? theme.vars.palette.secondary.main
              : status === 'none'
                ? '#FF6B4A'
                : '#3EC6E0',
      })}
    >
      {statusText[status]}
    </Box>
  )
}
