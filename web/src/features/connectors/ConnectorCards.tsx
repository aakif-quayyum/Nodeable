import InfoOutlined from '@mui/icons-material/InfoOutlined'
import VisibilityOff from '@mui/icons-material/VisibilityOff'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Typography from '@mui/material/Typography'
import { keyframes } from '@mui/material/styles'
import { useRef, useState } from 'react'
import { useCountUp } from '../../motion/useCountUp.ts'
import { useFlip } from '../../motion/useFlip.ts'
import { creditRoleStyles } from '../../app/creditRoles.ts'
import { AlbumArt } from '../art/AlbumArt.tsx'
import { deezerCoverUrl } from '../art/artSources.ts'
import { type NodeRef } from '../orbit/orbitLayout.ts'
import { initials } from '../orbit/initials.ts'
import { roleVars } from '../orbit/orbitStyles.ts'
import type { Workspace, WorkspacePerson } from '../graph/workspaceModel.ts'

const rise = keyframes`from { opacity: 0; transform: translateY(12px); }`

/** Cards shown at first; the rest are one click away, so a graph of 700 people does not draw 700 cards at once. */
const firstCards = 24

interface ConnectorCardsProps {
  workspace: Workspace
  centre: NodeRef | null
  onCentre: (ref: NodeRef) => void
  onHide: (personMbid: string) => void
  /** "Details": opens the person drawer (FR-PERSON-01). */
  onDetails: (personMbid: string) => void
}

/**
 * Connector cards (FR-HUB-02): one for each person credited on two or more songs, most songs first. A card has the
 * person's initials in a ring with one segment for each role, their song count, a bar of their role colours, and the
 * small covers of their songs. Choosing a card puts that person at the centre of the orbit.
 */
export function ConnectorCards({ workspace, centre, onCentre, onHide, onDetails }: ConnectorCardsProps) {
  const [all, setAll] = useState(false)
  const connectors = workspace.connectors
  const shown = all ? connectors : connectors.slice(0, firstCards)
  // The cards slide to their new places when the order changes (a person who has just become the most connected).
  const list = useRef<HTMLUListElement>(null)
  useFlip(list, shown.map((person) => person.mbid).join('|'))

  return (
    <Box component="section" aria-labelledby="connectors-heading" sx={(theme) => ({ ...roleVars(theme) })}>
      <Heading id="connectors-heading">Connectors</Heading>

      {connectors.length === 0 ? (
        <Typography color="text.secondary" sx={{ fontSize: 13.5 }}>
          Add a second song. People who worked on both will show up here.
        </Typography>
      ) : (
        <>
          <Box
            ref={list}
            component="ul"
            sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))', md: 'repeat(2, minmax(0, 1fr))' }, gap: 1, listStyle: 'none', m: 0, p: 0 }}
          >
            {shown.map((person, index) => (
              <Card
                key={person.mbid}
                person={person}
                workspace={workspace}
                index={index}
                active={centre?.type === 'person' && centre.id === person.mbid}
                onCentre={onCentre}
                onHide={onHide}
                onDetails={onDetails}
              />
            ))}
          </Box>
          {connectors.length > firstCards && (
            <Button size="small" onClick={() => setAll((open) => !open)} sx={{ mt: 1 }}>
              {all ? 'Show fewer connectors' : `Show all ${connectors.length} connectors`}
            </Button>
          )}
        </>
      )}
    </Box>
  )
}

function Card({
  person,
  workspace,
  index,
  active,
  onCentre,
  onHide,
  onDetails,
}: {
  person: WorkspacePerson
  workspace: Workspace
  index: number
  active: boolean
  onCentre: (ref: NodeRef) => void
  onHide: (personMbid: string) => void
  onDetails: (personMbid: string) => void
}) {
  const step = 360 / Math.max(1, person.roles.length)
  const gap = person.roles.length > 1 ? 6 : 0
  const ring =
    person.roles.length === 0
      ? 'var(--mui-palette-divider)'
      : `conic-gradient(${person.roles
          .map((role, at) => `var(--role-${role}) ${at * step}deg ${(at + 1) * step - gap}deg, transparent ${(at + 1) * step - gap}deg ${(at + 1) * step}deg`)
          .join(', ')})`
  const roleNames = person.roles.map((role) => creditRoleStyles[role].label)
  const songCount = person.songs.length
  // The number the eye sees counts up to the real one; the card's accessible name already carries the real one.
  const counted = useCountUp(songCount)

  return (
    <Box
      component="li"
      data-flip={person.mbid}
      sx={(theme) => ({
        position: 'relative',
        minWidth: 0,
        borderRadius: '12px',
        border: `1px solid ${active ? theme.vars.palette.text.primary : theme.vars.palette.divider}`,
        backgroundColor: theme.vars.palette.background.paper,
        '&:hover': { borderColor: active ? theme.vars.palette.text.primary : theme.vars.palette.lineStrong },
        '@media (prefers-reduced-motion: no-preference)': {
          transition: 'border-color 200ms, transform 200ms cubic-bezier(0.2, 0.8, 0.2, 1)',
          animation: `${rise} 500ms cubic-bezier(0.2, 0.8, 0.2, 1) both`,
          animationDelay: `${Math.min(index, 8) * 55}ms`,
          '&:hover': { transform: 'translateY(-2px)' },
        },
      })}
    >
      <Box
        component="button"
        type="button"
        onClick={() => onCentre({ type: 'person', id: person.mbid })}
        aria-label={`Explore ${person.name}: on ${songCount} songs; ${roleNames.join(', ')}`}
        aria-current={active ? 'true' : undefined}
        sx={{
          display: 'flex',
          flexDirection: 'column',
          gap: 1,
          width: '100%',
          minWidth: 0,
          p: 1.5,
          textAlign: 'left',
          cursor: 'pointer',
          background: 'none',
          border: 0,
          color: 'inherit',
          font: 'inherit',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
          <Box
            aria-hidden="true"
            sx={{ width: 40, height: 40, borderRadius: '50%', p: '3px', boxSizing: 'border-box', flex: 'none', background: ring }}
          >
            <Box
              component="span"
              sx={(theme) => ({
                display: 'grid',
                placeItems: 'center',
                width: '100%',
                height: '100%',
                borderRadius: '50%',
                backgroundColor: theme.vars.palette.raised,
                fontWeight: 800,
                fontSize: 13,
              })}
            >
              {initials(person.name)}
            </Box>
          </Box>
          <Box aria-hidden="true" sx={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
            <Box
              component="b"
              sx={(theme) => ({
                fontFamily: theme.typography.display.fontFamily,
                fontStretch: '62%',
                fontWeight: 900,
                fontSize: 40,
                lineHeight: 0.85,
                fontVariantNumeric: 'tabular-nums',
              })}
            >
              {counted}
            </Box>
            <Typography variant="kicker" component="small" color="text.secondary" sx={{ fontWeight: 700 }}>
              songs
            </Typography>
          </Box>
        </Box>

        <Box
          component="span"
          sx={(theme) => ({
            fontFamily: theme.typography.display.fontFamily,
            fontStretch: '72%',
            fontWeight: 850,
            fontSize: 18,
            textTransform: 'uppercase',
            lineHeight: 1,
            overflowWrap: 'anywhere',
          })}
        >
          {person.name}
        </Box>

        <Box aria-hidden="true" sx={{ display: 'flex', gap: '2px', height: 4 }}>
          {person.roles.map((role) => (
            <Box key={role} component="i" sx={{ flex: 1, borderRadius: '1px', backgroundColor: `var(--role-${role})` }} />
          ))}
        </Box>

        <Box aria-hidden="true" sx={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
          {person.songs.slice(0, 12).map((mbid) => {
            const song = workspace.songById.get(mbid)
            return song === undefined ? null : (
              <AlbumArt key={mbid} seed={mbid} size={20} alt="" releaseMbid={song.artReleaseMbid} releaseGroupMbid={song.artReleaseGroupMbid} deezerCoverUrl={deezerCoverUrl(song.deezerCoverMd5)} />
            )
          })}
        </Box>
      </Box>

      <IconButton
        size="small"
        aria-label={`Details for ${person.name}`}
        onClick={() => onDetails(person.mbid)}
        sx={{ position: 'absolute', top: 2, right: 28, opacity: 0.6, '&:hover, &:focus-visible': { opacity: 1 } }}
      >
        <InfoOutlined fontSize="inherit" />
      </IconButton>

      <IconButton
        size="small"
        aria-label={`Hide from view: ${person.name}`}
        onClick={() => onHide(person.mbid)}
        sx={{ position: 'absolute', top: 2, right: 2, opacity: 0.6, '&:hover, &:focus-visible': { opacity: 1 } }}
      >
        <VisibilityOff fontSize="inherit" />
      </IconButton>
    </Box>
  )
}

/**
 * A column heading: capitals, a rule under it, as the prototype's panel headings are. It sticks to the top of the
 * scrolling column on an opaque background, so cards slide under it instead of being cut off at the container's edge;
 * its section is its limit, so the next section's heading takes its place.
 */
export function Heading({ id, children, action }: { id: string; children: string; action?: React.ReactNode }) {
  return (
    <Box
      sx={(theme) => ({
        // Only where the column scrolls on its own (md and up); on a phone the page scrolls and nothing sticks.
        position: { xs: 'static', md: 'sticky' },
        top: 0,
        zIndex: 3,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 1,
        pt: '6px',
        pb: 1,
        mb: 1.25,
        backgroundColor: theme.vars.palette.background.default,
        borderBottom: `1px solid ${theme.vars.palette.lineStrong}`,
        // The gap under the rule fades, so a card that is passing under it does not appear from nowhere.
        '&::after': {
          content: '""',
          position: 'absolute',
          left: 0,
          right: 0,
          top: '100%',
          height: 10,
          pointerEvents: 'none',
          background: `linear-gradient(${theme.vars.palette.background.default}, transparent)`,
        },
      })}
    >
      <Typography id={id} variant="h3" component="h2" sx={{ fontSize: 22, lineHeight: 1 }}>
        {children}
      </Typography>
      {action}
    </Box>
  )
}
