import Close from '@mui/icons-material/Close'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Drawer from '@mui/material/Drawer'
import IconButton from '@mui/material/IconButton'
import Typography from '@mui/material/Typography'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { creditRoleStyles, roleText } from '../../app/creditRoles.ts'
import { RoleSwatch } from '../graph/RoleSwatch.tsx'
import { yearsText } from './personFormat.ts'
import type { Workspace } from '../graph/workspaceModel.ts'
import {
  fetchPerson,
  fetchPersonRecordings,
  PersonRequestError,
  type PersonProfile,
  type PersonRecording,
} from './personApi.ts'

interface PersonDrawerProps {
  /** The person to show, or null when the drawer is closed. */
  personMbid: string | null
  workspace: Workspace
  onClose: () => void
  /** "Put at the centre": the orbit's own action, so the drawer is a way to read before re-rooting, not a replacement. */
  onCentre: (personMbid: string) => void
}

/**
 * The person drawer (FR-PERSON-01): a role summary, the years of what is stored, and the recordings they are credited
 * on. It reads the cache only (decision recorded in spec section 9), so the years are the years of the recordings
 * Nodeable has stored so far and are labelled as such; a click on a node in the orbit still puts that person at the
 * centre, and the drawer is opened by a "Details" button, or Enter on a focused node (D2, 2026-10-14).
 */
export function PersonDrawer({ personMbid, workspace, onClose, onCentre }: PersonDrawerProps) {
  const open = personMbid !== null
  const titleId = 'person-drawer-title'

  const profile = useQuery({
    queryKey: ['person', personMbid],
    queryFn: ({ signal }) => fetchPerson(personMbid ?? '', signal),
    enabled: open,
    retry: false,
  })

  const recordings = useInfiniteQuery({
    queryKey: ['person-recordings', personMbid],
    queryFn: ({ pageParam, signal }) => fetchPersonRecordings(personMbid ?? '', pageParam, signal),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page * last.pageSize < last.total ? last.page + 1 : undefined),
    enabled: open,
    retry: false,
  })

  const unknown = profile.error instanceof PersonRequestError && profile.error.status === 404
  const items: PersonRecording[] = recordings.data?.pages.flatMap((page) => page.items) ?? []
  const inWorkspace = personMbid !== null && workspace.personById.has(personMbid)

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      slotProps={{ paper: { 'aria-labelledby': titleId, sx: { width: { xs: '100vw', sm: 420 }, p: 2.5, display: 'flex', flexDirection: 'column', gap: 2 } } }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography id={titleId} component="h2" variant="h5" sx={{ overflowWrap: 'anywhere' }}>
            {profile.data?.name ?? (profile.isPending ? 'Loading…' : 'Person')}
          </Typography>
          {profile.data !== undefined && <Subtitle profile={profile.data} />}
        </Box>
        <IconButton aria-label="Close details" onClick={onClose} edge="end">
          <Close />
        </IconButton>
      </Box>

      {profile.isPending && open && (
        <Box role="status" sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <CircularProgress size={20} aria-hidden />
          <Typography variant="body2">Reading what is stored…</Typography>
        </Box>
      )}

      {unknown && (
        <Typography variant="body2" role="alert">
          Nodeable has not stored this person yet. They appear once a song they are credited on has been added.
        </Typography>
      )}

      {profile.isError && !unknown && (
        <Box role="alert" sx={{ display: 'grid', gap: 1 }}>
          <Typography variant="body2" color="warning.main">
            The details could not be loaded just now.
          </Typography>
          <Button size="small" onClick={() => void profile.refetch()} sx={{ justifySelf: 'start' }}>
            Try again
          </Button>
        </Box>
      )}

      {profile.data !== undefined && personMbid !== null && (
        <>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {inWorkspace && (
              <Button variant="outlined" size="small" onClick={() => onCentre(personMbid)}>
                Put at the centre
              </Button>
            )}
            <Button
              component="a"
              size="small"
              href={`https://musicbrainz.org/artist/${personMbid}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open on MusicBrainz
              <Box
                component="span"
                sx={{ position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}
              >
                {' '}
                (opens in a new tab)
              </Box>
            </Button>
          </Box>

          <RoleSummary profile={profile.data} />

          <Box component="section" aria-label="Active years">
            <Typography variant="overline" color="text.secondary">
              Active years
            </Typography>
            {yearsText(profile.data.firstYear, profile.data.lastYear) === null ? (
              <Typography variant="body2">None of the stored recordings has a date.</Typography>
            ) : (
              <>
                <Typography sx={{ fontWeight: 700 }}>{yearsText(profile.data.firstYear, profile.data.lastYear)}</Typography>
                <Typography variant="caption" color="text.secondary">
                  Partial: from the {profile.data.recordingCount} {profile.data.recordingCount === 1 ? 'recording' : 'recordings'} stored
                  so far, so their career is longer than this.
                </Typography>
              </>
            )}
          </Box>

          <Box component="section" aria-labelledby="person-recordings-heading" sx={{ minHeight: 0, display: 'grid', gap: 1 }}>
            <Typography id="person-recordings-heading" variant="overline" color="text.secondary">
              Credited recordings ({profile.data.recordingCount})
            </Typography>

            {recordings.isPending && (
              <Box role="status" sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <CircularProgress size={18} aria-hidden />
                <Typography variant="body2">Loading recordings…</Typography>
              </Box>
            )}

            {recordings.isError && (
              <Typography role="alert" variant="body2" color="warning.main">
                The recordings could not be loaded just now.
              </Typography>
            )}

            {items.length > 0 && (
              <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 1 }}>
                {items.map((item) => (
                  <RecordingRow key={item.mbid} item={item} inGraph={workspace.songById.has(item.mbid)} />
                ))}
              </Box>
            )}

            {recordings.hasNextPage && (
              <Button
                onClick={() => void recordings.fetchNextPage()}
                disabled={recordings.isFetchingNextPage}
                size="small"
                variant="outlined"
                sx={{ justifySelf: 'start' }}
              >
                {recordings.isFetchingNextPage ? 'Loading…' : `Show more (${profile.data.recordingCount - items.length} left)`}
              </Button>
            )}
          </Box>
        </>
      )}
    </Drawer>
  )
}

function Subtitle({ profile }: { profile: PersonProfile }) {
  const parts = [profile.type, profile.disambiguation].filter((part) => part !== null && part !== undefined && part !== '')
  return parts.length === 0 ? null : (
    <Typography variant="body2" color="text.secondary">
      {parts.join(' · ')}
    </Typography>
  )
}

function RoleSummary({ profile }: { profile: PersonProfile }) {
  const most = Math.max(1, ...profile.roles.map((role) => role.recordings))
  return (
    <Box component="section" aria-label="Roles">
      <Typography variant="overline" color="text.secondary">
        Roles on stored recordings
      </Typography>
      {profile.roles.length === 0 ? (
        <Typography variant="body2">No credits are stored for them yet.</Typography>
      ) : (
        <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 0.75 }}>
          {profile.roles.map((entry) => (
            <Box component="li" key={entry.role} sx={{ display: 'grid', gridTemplateColumns: '20px minmax(0, 1fr) auto', gap: 1, alignItems: 'center' }}>
              <RoleSwatch role={entry.role} />
              <Box>
                <Typography variant="body2">{creditRoleStyles[entry.role].label}</Typography>
                <Box
                  aria-hidden
                  sx={(theme) => ({
                    height: 4,
                    borderRadius: 2,
                    width: `${Math.round((entry.recordings / most) * 100)}%`,
                    minWidth: 4,
                    backgroundColor: theme.vars.palette.text.disabled,
                  })}
                />
              </Box>
              <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                {entry.recordings} {entry.recordings === 1 ? 'recording' : 'recordings'}
              </Typography>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  )
}

function RecordingRow({ item, inGraph }: { item: PersonRecording; inGraph: boolean }) {
  const roles = item.roles.map((role) => roleText(role.role, role.detail))
  return (
    <Box
      component="li"
      sx={(theme) => ({ p: 1, borderRadius: '10px', border: `1px solid ${theme.vars.palette.divider}`, display: 'grid', gap: 0.25 })}
    >
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <Typography sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{item.title}</Typography>
        {inGraph && (
          <Typography variant="caption" color="text.secondary">
            In your graph
          </Typography>
        )}
      </Box>
      <Typography variant="body2" color="text.secondary">
        {[item.artist, item.year].filter((part) => part !== null && part !== undefined && part !== '').join(' · ')}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {roles.join(', ')}
      </Typography>
    </Box>
  )
}
