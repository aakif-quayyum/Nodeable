import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Link from '@mui/material/Link'
import Typography from '@mui/material/Typography'
import { keyframes } from '@mui/material/styles'
import { Fragment } from 'react'
import { creditRoles, creditRoleStyles } from '../../app/creditRoles.ts'
import { useRoleFilters } from '../../stores/roleFilters.ts'
import type { Workspace } from '../graph/workspaceModel.ts'
import { nodeKey, type NodeRef } from './orbitLayout.ts'

const swap = keyframes`from { opacity: 0; transform: translateY(8px); }`
const blink = keyframes`50% { opacity: 0.25; }`

function nameOf(workspace: Workspace, ref: NodeRef): string {
  return ref.type === 'song' ? (workspace.songById.get(ref.id)?.title ?? '') : (workspace.personById.get(ref.id)?.name ?? '')
}

/** The trail of centres, the last four of them, each a button that goes back to that centre (FR-VIEW-01). */
export function Breadcrumbs({ workspace, crumbs, onGo }: { workspace: Workspace; crumbs: readonly NodeRef[]; onGo: (ref: NodeRef) => void }) {
  const start = Math.max(0, crumbs.length - 4)

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
      {start > 0 && (
        <Box component="span" aria-hidden="true" sx={{ color: 'text.secondary', fontSize: 12 }}>
          …
        </Box>
      )}
      {crumbs.slice(start).map((ref, index) => {
        const current = start + index === crumbs.length - 1
        return (
          <Fragment key={nodeKey(ref)}>
            {index > 0 && (
              <Box component="span" aria-hidden="true" sx={{ color: 'lineStrong', fontSize: 12 }}>
                /
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
      <Kicker>{song !== undefined ? 'Now spinning' : 'Following'}</Kicker>
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
        {song?.title ?? person?.name ?? ''}
      </Box>

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
        gap: '6px',
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
                gap: '6px',
                cursor: 'pointer',
                borderRadius: 999,
                px: '9px',
                py: '3px',
                fontFamily: theme.typography.kicker.fontFamily,
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: theme.vars.palette.text.secondary,
                backgroundColor: on ? theme.vars.palette.background.default : 'transparent',
                border: `1px solid ${on ? colors.dark : theme.vars.palette.divider}`,
                opacity: on ? 1 : 0.65,
                textDecoration: on ? 'none' : 'line-through',
                '& svg': { width: 13, height: 13, color: colors.dark },
                ...theme.applyStyles('light', { borderColor: on ? colors.light : undefined, '& svg': { width: 13, height: 13, color: colors.light } }),
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
