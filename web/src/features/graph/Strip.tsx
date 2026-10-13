import VisibilityOff from '@mui/icons-material/VisibilityOff'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Typography from '@mui/material/Typography'
import { useId, useState } from 'react'
import { useCountUp } from '../../motion/useCountUp.ts'
import { headlineOf, type Workspace } from './workspaceModel.ts'

function Stat({ label, value }: { label: string; value: number }) {
  const shown = useCountUp(value)

  return (
    <Box sx={(theme) => ({ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', minWidth: 64, px: '14px', py: '6px', '& + &': { borderLeft: `1px solid ${theme.vars.palette.divider}` } })}>
      <Box
        component="b"
        // The real number is in the accessible name below; the counting digits are for the eyes.
        aria-hidden="true"
        sx={(theme) => ({
          fontFamily: theme.typography.display.fontFamily,
          fontStretch: '66%',
          fontWeight: 900,
          fontSize: 24,
          lineHeight: 1,
          fontVariantNumeric: 'tabular-nums',
        })}
      >
        {shown}
      </Box>
      <Typography variant="kicker" component="span" color="text.secondary" aria-hidden="true">
        {label}
      </Typography>
      <Box component="span" sx={visuallyHidden}>{`${value} ${label}`}</Box>
    </Box>
  )
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

interface StripProps {
  workspace: Workspace
  /** What shows when there is no connector yet: the graph is still being read, or has fewer than two songs. */
  hidden: { mbid: string; name: string }[]
  onShow: (personMbid: string) => void
  onShowEveryone: () => void
}

/**
 * The strip above the stage (FR-HUB-01): a headline that names who connects the most songs, four counts that count up
 * when they change, and the "n hidden · show" control when someone is hidden (FR-VIEW-03). The headline is the page's
 * `h1`, and the only part of the strip that is a live region, so a screen reader hears one sentence, not four counters.
 */
export function Strip({ workspace, hidden, onShow, onShowEveryone }: StripProps) {
  const headline = headlineOf(workspace)
  const songs = workspace.songs.length
  const people = workspace.people.length
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const menuId = useId()

  const names =
    headline === null
      ? ''
      : headline.more > 0
        ? `${headline.names.join(', ')} and ${headline.more} more`
        : headline.names.length > 1
          ? `${headline.names.slice(0, -1).join(', ')} & ${headline.names.at(-1)}`
          : headline.names[0]

  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: '10px 24px' }}>
      <Typography
        variant="h1"
        aria-live="polite"
        sx={{ fontSize: 'clamp(26px, 3.2vw, 42px)', fontStretch: '66%', lineHeight: 0.95, textWrap: 'balance', m: 0 }}
      >
        {headline !== null ? (
          <>
            <Box
              component="em"
              sx={(theme) => ({
                fontStyle: 'normal',
                px: '0.1em',
                backgroundColor: theme.vars.palette.secondary.main,
                color: theme.vars.palette.secondary.contrastText,
              })}
            >
              {names}
            </Box>{' '}
            {headline.names.length + headline.more > 1 ? 'each connect' : 'connects'} {headline.connects} of your {songs} songs
          </>
        ) : songs > 0 ? (
          `${songs} ${songs === 1 ? 'song' : 'songs'}, ${people} ${people === 1 ? 'person' : 'people'} behind ${songs === 1 ? 'it' : 'them'}`
        ) : (
          'Your graph'
        )}
      </Typography>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
        {hidden.length > 0 && (
          <>
            <Button
              size="small"
              variant="outlined"
              startIcon={<VisibilityOff />}
              aria-haspopup="menu"
              aria-expanded={anchor !== null}
              aria-controls={anchor !== null ? menuId : undefined}
              onClick={(event) => setAnchor(event.currentTarget)}
            >
              {hidden.length} hidden · show
            </Button>
            <Menu id={menuId} anchorEl={anchor} open={anchor !== null} onClose={() => setAnchor(null)}>
              <MenuItem
                onClick={() => {
                  onShowEveryone()
                  setAnchor(null)
                }}
              >
                Show everyone
              </MenuItem>
              {hidden.map((person) => (
                <MenuItem
                  key={person.mbid}
                  onClick={() => {
                    onShow(person.mbid)
                    setAnchor(null)
                  }}
                >
                  Show {person.name}
                </MenuItem>
              ))}
            </Menu>
          </>
        )}

        <Box
          role="group"
          aria-label="Totals"
          sx={(theme) => ({ display: 'flex', border: `1px solid ${theme.vars.palette.divider}`, borderRadius: '10px', overflow: 'hidden' })}
        >
          <Stat label="songs" value={songs} />
          <Stat label="people" value={people} />
          <Stat label="credits" value={workspace.creditCount} />
          <Stat label="connectors" value={workspace.connectors.length} />
        </Box>
      </Box>
    </Box>
  )
}
