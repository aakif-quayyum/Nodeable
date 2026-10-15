import Box from '@mui/material/Box'
import { keyframes } from '@mui/material/styles'
import type { Ref } from 'react'
import type { CreditRoleKey } from '../../app/creditRoles.ts'
import { RoleSwatch } from '../graph/RoleSwatch.tsx'

const fade = keyframes`from { opacity: 0; }`

export type TooltipContent =
  | { kind: 'song'; title: string; artist: string; year: number | null; credits: number }
  | { kind: 'person'; name: string; songs: number; roles: { role: CreditRoleKey; text: string }[] }

/**
 * What a hovered or focused node says (spec section 12): a person's roles on the centre song, with the instrument or
 * detail, or a song's year and number of credits. It repeats what the node's accessible label already says, so it is
 * hidden from assistive technology; it is for the eyes, on hover and on keyboard focus alike.
 */
export function OrbitTooltip({ content, x, y, ref }: { content: TooltipContent; x: number; y: number; ref?: Ref<HTMLDivElement> }) {
  return (
    <Box
      ref={ref}
      aria-hidden="true"
      sx={(theme) => ({
        position: 'absolute',
        top: 0,
        left: 0,
        zIndex: 4,
        pointerEvents: 'none',
        maxWidth: 250,
        p: '10px 12px',
        fontSize: 13,
        borderRadius: '10px',
        border: `1px solid ${theme.vars.palette.lineStrong}`,
        backgroundColor: theme.vars.palette.background.default,
        '@media (prefers-reduced-motion: no-preference)': { animation: `${fade} 150ms both` },
      })}
      // The position is a transform, not top and left: it is moved on every mouse move without a layout.
      style={{ transform: `translate(${x}px, ${y}px)` }}
    >
      <Box
        component="b"
        sx={(theme) => ({
          display: 'block',
          mb: 0.5,
          fontFamily: theme.typography.display.fontFamily,
          fontStretch: '70%',
          fontWeight: 850,
          fontSize: 17,
          lineHeight: 1.05,
          textTransform: 'uppercase',
        })}
      >
        {content.kind === 'song' ? content.title : content.name}
      </Box>

      {content.kind === 'song' ? (
        <>
          <Line>{[content.artist, content.year].filter((part) => part !== null && part !== '').join(' · ')}</Line>
          <Line>{content.credits > 0 ? `${content.credits} credits` : 'No credits yet'}</Line>
        </>
      ) : (
        <>
          <Line>{`On ${content.songs} of your songs`}</Line>
          {content.roles.map((entry, index) => (
            <Line key={`${entry.text}-${index}`} swatch={entry.role}>
              {entry.text}
            </Line>
          ))}
          <Line>Click to centre · Enter for details</Line>
        </>
      )}
    </Box>
  )
}

function Line({ children, swatch }: { children: string; swatch?: CreditRoleKey }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: '7px', color: 'text.secondary', fontSize: 12.5 }}>
      {swatch !== undefined && <RoleSwatch role={swatch} />}
      {children}
    </Box>
  )
}
