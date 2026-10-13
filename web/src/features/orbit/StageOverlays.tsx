import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Link from '@mui/material/Link'
import Typography from '@mui/material/Typography'
import { keyframes } from '@mui/material/styles'
import { Fragment } from 'react'
import { creditRoles, creditRoleStyles } from '../../app/creditRoles.ts'
import { useRoleFilters } from '../../stores/roleFilters.ts'
import { AlbumArt } from '../art/AlbumArt.tsx'
import type { Workspace, WorkspaceSong } from '../graph/workspaceModel.ts'
import { nodeKey, type EmptyCentre as EmptyCentreReason, type NodeRef } from './orbitLayout.ts'

const swap = keyframes`from { opacity: 0; transform: translateY(8px); }`
const blink = keyframes`50% { opacity: 0.25; }`

function nameOf(workspace: Workspace, ref: NodeRef): string {
  if (ref.type === 'graph') return 'Your graph'
  return ref.type === 'song' ? (workspace.songById.get(ref.id)?.title ?? '') : (workspace.personById.get(ref.id)?.name ?? '')
}

/** How many crumbs after "Your graph" are shown; earlier ones are folded into "…". */
const crumbsAfterRoot = 3

/**
 * The trail of centres (FR-VIEW-01, FR-VIEW-04): "Your graph" first, always, so there is a way back to the overview,
 * then the last few centres, each a button that goes back to that centre.
 */
export function Breadcrumbs({ workspace, crumbs, onGo }: { workspace: Workspace; crumbs: readonly NodeRef[]; onGo: (ref: NodeRef) => void }) {
  const folded = Math.max(0, crumbs.length - 1 - crumbsAfterRoot)
  const visible = crumbs.filter((_, index) => index === 0 || index > folded)
  const start = folded

  return (
    <Box
      component="nav"
      aria-label="Exploration path"
      sx={{
        position: 'absolute',
        top: 12,
        left: 12,
        right: { xs: 12, md: 220 },
        zIndex: 2,
        display: 'flex',
        flexWrap: 'wrap',
        gap: 0.5,
        alignItems: 'center',
      }}
    >
      {visible.map((ref, index) => {
        const current = ref === crumbs[crumbs.length - 1]
        return (
          <Fragment key={nodeKey(ref)}>
            {index > 0 && (
              <Box component="span" aria-hidden="true" sx={{ color: 'text.secondary', fontSize: 12 }}>
                {index === 1 && start > 0 ? '/ … /' : '/'}
              </Box>
            )}
            <Box
              component="button"
              type="button"
              aria-current={current ? 'true' : undefined}
              onClick={() => onGo(ref)}
              sx={(theme) => ({
                maxWidth: 180,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                cursor: 'pointer',
                borderRadius: '6px',
                px: '9px',
                py: '4px',
                fontSize: 12,
                fontWeight: 600,
                font: 'inherit',
                fontFamily: theme.typography.fontFamily,
                border: `1px solid ${current ? theme.vars.palette.text.primary : theme.vars.palette.divider}`,
                backgroundColor: current ? theme.vars.palette.text.primary : theme.vars.palette.background.default,
                color: current ? theme.vars.palette.background.default : theme.vars.palette.text.secondary,
              })}
            >
              {nameOf(workspace, ref)}
            </Box>
          </Fragment>
        )
      })}
    </Box>
  )
}

/**
 * The caption on the stage: "Now spinning" and the song, or "Following" and the person (FR-VIEW-01). It swaps with a
 * small rise when the centre changes, because it is re-mounted under a new key.
 */
export function Caption({
  workspace,
  centre,
  onHide,
}: {
  workspace: Workspace
  centre: NodeRef
  /** "Hide from view" for the person at the centre (FR-VIEW-03). */
  onHide: (personMbid: string) => void
}) {
  const song = centre.type === 'song' ? workspace.songById.get(centre.id) : undefined
  const person = centre.type === 'person' ? workspace.personById.get(centre.id) : undefined
  const people = song === undefined ? 0 : (workspace.peopleBySong.get(song.mbid)?.length ?? 0)
  const overview = centre.type === 'graph'

  return (
    <Box
      key={nodeKey(centre)}
      sx={{
        position: 'absolute',
        top: 48,
        left: 14,
        zIndex: 2,
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        maxWidth: 'min(340px, 60%)',
        pointerEvents: 'none',
        '@media (prefers-reduced-motion: no-preference)': { animation: `${swap} 450ms cubic-bezier(0.2, 0.8, 0.2, 1) both` },
      }}
    >
      <Kicker>{overview ? 'The whole graph' : song !== undefined ? 'Now spinning' : 'Following'}</Kicker>
      <Box
        component="p"
        sx={(theme) => ({
          m: 0,
          fontFamily: theme.typography.display.fontFamily,
          fontStretch: '64%',
          fontWeight: 900,
          fontSize: 'clamp(30px, 3.6vw, 46px)',
          lineHeight: 0.88,
          textTransform: 'uppercase',
          textWrap: 'balance',
        })}
      >
        {overview ? 'Your graph' : (song?.title ?? person?.name ?? '')}
      </Box>

      {overview && (
        // The strip above the stage has these numbers; on a phone the room is the orbit's.
        <Typography variant="body2" color="text.secondary" component="p" sx={{ m: 0, display: { xs: 'none', md: 'block' } }}>
          {workspace.songs.length} {workspace.songs.length === 1 ? 'song' : 'songs'} · {workspace.people.length}{' '}
          {workspace.people.length === 1 ? 'person' : 'people'} · {workspace.connectors.length}{' '}
          {workspace.connectors.length === 1 ? 'connector' : 'connectors'}
        </Typography>
      )}

      {song !== undefined && (
        <Typography variant="body2" color="text.secondary" component="p" sx={{ m: 0 }}>
          {[song.artist, song.year].filter((part) => part !== null).join(' · ')}
          {people > 0 && ` · ${people} ${people === 1 ? 'person' : 'people'} credited`}
          {people === 0 && song.creditsStatus === 'loading' && ' · Loading credits…'}
          {people === 0 && song.creditsStatus !== 'loading' && (
            <>
              {' · '}
              <Link
                href={`https://musicbrainz.org/recording/${song.mbid}`}
                target="_blank"
                rel="noopener noreferrer"
                color="inherit"
                sx={{ pointerEvents: 'auto' }}
                aria-label={`Credits incomplete: add credits on MusicBrainz for ${song.title} (opens in a new tab)`}
              >
                credits incomplete
              </Link>
            </>
          )}
        </Typography>
      )}

      {person !== undefined && (
        <>
          <Typography variant="body2" color="text.secondary" component="p" sx={{ m: 0 }}>
            On {person.songs.length} of your {person.songs.length === 1 ? 'song' : 'songs'}
            {person.roles.length > 0 && ` · ${person.roles.map((role) => creditRoleStyles[role].label).join(', ')}`}
          </Typography>
          <Button
            size="small"
            variant="outlined"
            onClick={() => onHide(person.mbid)}
            aria-label={`Hide from view: ${person.name} (the centre)`}
            sx={{ alignSelf: 'flex-start', pointerEvents: 'auto', mt: 0.5, py: 0.25 }}
          >
            Hide from view
          </Button>
        </>
      )}
    </Box>
  )
}

/**
 * A song at the centre with nothing to draw around it (FR-GRAPH-04, FR-VIEW-01): its cover large, and a sentence big
 * enough to read that says why and what can be done, instead of a dot with a ring and a line of small print.
 */
export function EmptyCentre({
  song,
  reason,
  origin,
  compact,
}: {
  song: WorkspaceSong
  reason: EmptyCentreReason
  origin: { x: number; y: number }
  compact: boolean
}) {
  const reset = useRoleFilters((state) => state.reset)
  const size = compact ? 132 : 188

  return (
    <Box
      sx={{
        position: 'absolute',
        left: origin.x,
        top: origin.y,
        transform: 'translate(-50%, -50%)',
        zIndex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 1.75,
        width: 'max-content',
        maxWidth: 'min(380px, calc(100% - 32px))',
        textAlign: 'center',
        pointerEvents: 'none',
        '@media (prefers-reduced-motion: no-preference)': { animation: `${swap} 450ms cubic-bezier(0.2, 0.8, 0.2, 1) both` },
      }}
    >
      <Box sx={(theme) => ({ borderRadius: '8px', overflow: 'hidden', lineHeight: 0, boxShadow: '0 14px 44px #0009', outline: `1px solid ${theme.vars.palette.lineStrong}` })}>
        <AlbumArt
          seed={song.mbid}
          size={size}
          alt={`Cover of ${song.title}`}
          releaseMbid={song.artReleaseMbid}
          releaseGroupMbid={song.artReleaseGroupMbid}
        />
      </Box>

      {reason === 'noCredits' ? (
        <Typography component="p" sx={{ m: 0, fontSize: { xs: 15, md: 17 }, fontWeight: 600, lineHeight: 1.35 }}>
          No credits on MusicBrainz yet
          {' · '}
          <Link
            href={`https://musicbrainz.org/recording/${song.mbid}`}
            target="_blank"
            rel="noopener noreferrer"
            underline="always"
            sx={{ pointerEvents: 'auto', fontWeight: 800 }}
            // The visible words start the name (WCAG 2.5.3); the rest says which song, and that it opens a tab.
            aria-label={`Add them on MusicBrainz: credits for ${song.title} (opens in a new tab)`}
          >
            Add them
          </Link>
        </Typography>
      ) : (
        <>
          <Typography component="p" sx={{ m: 0, fontSize: { xs: 15, md: 17 }, fontWeight: 600, lineHeight: 1.35 }}>
            Every credit on this song is filtered out or hidden
          </Typography>
          <Button size="small" variant="outlined" onClick={reset} sx={{ pointerEvents: 'auto' }}>
            Show all roles
          </Button>
        </>
      )}
    </Box>
  )
}

function Kicker({ children }: { children: string }) {
  return (
    <Typography
      variant="kicker"
      component="span"
      sx={(theme) => {
        const { colors } = creditRoleStyles.producer
        // The accent yellow in the dark scheme, its deepened value on the light surface (3:1, NFR-A11Y-02).
        return { color: colors.dark, ...theme.applyStyles('light', { color: colors.light }) }
      }}
    >
      {children}
    </Typography>
  )
}

/**
 * The live chip (FR-GRAPH-02): what is arriving, or what just did. A status region, so a screen reader hears it without
 * focus moving, and a pulsing dot that stops with reduced motion.
 */
export function LiveChip({ text, pulsing }: { text: string | null; pulsing: boolean }) {
  if (text === null) return null

  return (
    <Box
      role="status"
      sx={(theme) => ({
        position: 'absolute',
        top: { xs: 'auto', md: 12 },
        bottom: { xs: 52, md: 'auto' },
        right: 12,
        zIndex: 2,
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        maxWidth: 'calc(100% - 24px)',
        px: '11px',
        py: '6px',
        borderRadius: '8px',
        border: `1px solid ${theme.vars.palette.lineStrong}`,
        backgroundColor: theme.vars.palette.background.default,
        fontFamily: theme.typography.kicker.fontFamily,
        fontSize: 12,
        fontVariantNumeric: 'tabular-nums',
      })}
    >
      <Box
        component="i"
        aria-hidden="true"
        sx={(theme) => ({
          flex: 'none',
          width: 8,
          height: 8,
          borderRadius: '50%',
          backgroundColor: theme.vars.palette.success.main,
          '@media (prefers-reduced-motion: no-preference)': pulsing ? { animation: `${blink} 1s steps(2, end) infinite` } : {},
        })}
      />
      {text}
    </Box>
  )
}

/**
 * The role legend, and the role filters (FR-HUB-03): a chip with the role's icon and name, each a toggle with
 * `aria-pressed`. A chip that is off is outlined and struck through, so the state is not carried by colour alone.
 */
export function LegendChips() {
  const active = useRoleFilters((state) => state.active)
  const toggle = useRoleFilters((state) => state.toggle)
  const reset = useRoleFilters((state) => state.reset)
  const someOff = active.size < creditRoles.length

  return (
    <Box
      component="ul"
      aria-label="Roles"
      sx={{
        position: 'absolute',
        left: 12,
        right: 12,
        bottom: 10,
        zIndex: 2,
        display: 'flex',
        flexWrap: 'wrap',
        gap: { xs: '4px', md: '6px' },
        alignItems: 'center',
        listStyle: 'none',
        m: 0,
        p: 0,
      }}
    >
      {creditRoles.map((role) => {
        const { Icon, label, colors } = creditRoleStyles[role]
        const on = active.has(role)
        return (
          <li key={role}>
            <Box
              component="button"
              type="button"
              aria-pressed={on}
              onClick={() => toggle(role)}
              sx={(theme) => ({
                display: 'inline-flex',
                alignItems: 'center',
                gap: { xs: '4px', md: '6px' },
                cursor: 'pointer',
                borderRadius: 999,
                px: { xs: '7px', md: '9px' },
                py: '3px',
                fontFamily: theme.typography.kicker.fontFamily,
                fontSize: { xs: 9, md: 10 },
                fontWeight: 700,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: theme.vars.palette.text.secondary,
                backgroundColor: on ? theme.vars.palette.background.default : 'transparent',
                border: `1px solid ${on ? colors.dark : theme.vars.palette.divider}`,
                opacity: on ? 1 : 0.65,
                textDecoration: on ? 'none' : 'line-through',
                '& svg': { width: 12, height: 12, color: colors.dark },
                ...theme.applyStyles('light', { borderColor: on ? colors.light : undefined, '& svg': { width: 12, height: 12, color: colors.light } }),
              })}
            >
              <Icon aria-hidden="true" />
              {label}
            </Box>
          </li>
        )
      })}
      {someOff && (
        <li>
          <Button size="small" onClick={reset} sx={{ fontSize: 11, py: 0 }}>
            Show all roles
          </Button>
        </li>
      )}
      <Box component="li" sx={{ ml: 'auto', display: { xs: 'none', md: 'block' }, fontSize: 12, color: 'text.secondary', textTransform: 'none' }}>
        Click anyone to put them at the centre · scroll to zoom
      </Box>
    </Box>
  )
}
