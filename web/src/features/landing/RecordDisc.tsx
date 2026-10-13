import Box from '@mui/material/Box'
import { keyframes } from '@mui/material/styles'
import { creditRoles, creditRoleStyles } from '../../app/creditRoles.ts'

const spin = keyframes`to { transform: rotate(360deg); }`

const point = (radius: number, angle: number): [number, number] => [radius * Math.sin(angle), -radius * Math.cos(angle)]

const ticks = Array.from({ length: 56 }, (_, index) => index)
const crew: readonly { initials: string; role: (typeof creditRoles)[number] }[] = [
  { initials: 'DG', role: 'producer' },
  { initials: 'LG', role: 'producer' },
  { initials: 'RM', role: 'mixing' },
  { initials: 'RR', role: 'engineering' },
  { initials: 'WC', role: 'songwriter' },
  { initials: 'GC', role: 'songwriter' },
  { initials: 'BP', role: 'other' },
  { initials: 'DG', role: 'vocal' },
]

/**
 * The landing page's picture: a record turning in the middle, with the crew that made a song orbiting it. It is plain
 * SVG with CSS rotation, so it adds no JavaScript to the first load, and it is decoration (hidden from assistive
 * technology). The rotations only run when the person has not asked for reduced motion.
 */
export function RecordDisc() {
  return (
    <Box
      aria-hidden
      sx={(theme) => {
        const roleVars: Record<string, string> = {}
        for (const role of creditRoles) {
          roleVars[`--role-${role}`] = creditRoleStyles[role].colors.dark
        }
        const lightVars: Record<string, string> = {}
        for (const role of creditRoles) {
          lightVars[`--role-${role}`] = creditRoleStyles[role].colors.light
        }

        return {
          position: 'relative',
          aspectRatio: '1',
          width: '100%',
          maxWidth: 520,
          justifySelf: 'center',
          ...roleVars,
          ...theme.applyStyles('light', lightVars),
          '& svg': { width: '100%', height: '100%', display: 'block', overflow: 'visible' },
          '& .turn': { transformBox: 'view-box', transformOrigin: '0 0' },
          '@media (prefers-reduced-motion: no-preference)': {
            '& .turn.slow': { animation: `${spin} 170s linear infinite` },
            '& .turn.mid': { animation: `${spin} 120s linear infinite reverse` },
            '& .turn.crew': { animation: `${spin} 80s linear infinite` },
            '& .turn.record': { animation: `${spin} 4.5s linear infinite` },
          },
        }
      }}
    >
      <svg viewBox="-300 -300 600 600" focusable="false">
        <g fill="none" stroke="currentColor" strokeOpacity="0.14" style={{ color: 'inherit' }}>
          <circle r="292" strokeDasharray="1 6" />
          <circle r="240" />
          <circle r="186" strokeDasharray="1 6" />
        </g>

        <g className="turn slow">
          {ticks.map((index) => {
            const [x, y] = point(272, (index / 56) * Math.PI * 2)
            const long = index % 7 === 0
            return (
              <rect
                key={index}
                x={x - 2}
                y={y - 2}
                width={long ? 7 : 3}
                height={long ? 7 : 3}
                fill={long ? `var(--role-${creditRoles[(index / 7) % creditRoles.length | 0]})` : 'currentColor'}
                fillOpacity={long ? 1 : 0.3}
              />
            )
          })}
        </g>

        <g className="turn mid">
          <path id="landing-ring" fill="none" d="M0,-218 A218,218 0 1,1 0,218 A218,218 0 1,1 0,-218" />
          <text
            fill="currentColor"
            style={{ font: '700 10.5px "JetBrains Mono Variable", ui-monospace, monospace', letterSpacing: '0.24em', textTransform: 'uppercase' }}
          >
            <textPath href="#landing-ring">
              Produced by Donald Glover · Ludwig Göransson ✦ Written by William Earl Collins · Gary Cooper ✦ Mixed by Riley Mackin ✦
              Engineered by Ruben Rivera ✦
            </textPath>
          </text>
        </g>

        <g className="turn crew">
          {crew.map(({ initials, role }, index) => {
            const angle = (index / crew.length) * Math.PI * 2 + 0.3
            const [x, y] = point(168, angle)
            const [x0, y0] = point(128, angle)
            return (
              <g key={index}>
                <line x1={x0} y1={y0} x2={x} y2={y} stroke={`var(--role-${role})`} strokeWidth="1.5" />
                <circle cx={x} cy={y} r="15" fill={`var(--role-${role})`} />
                <text x={x} y={y} dy=".36em" textAnchor="middle" fill="#101113" style={{ font: '700 10px "Archivo Variable", system-ui, sans-serif' }}>
                  {initials}
                </text>
              </g>
            )
          })}
        </g>

        <g className="turn record">
          <circle r="122" fill="#0A0A0B" stroke="currentColor" strokeOpacity="0.15" />
          {Array.from({ length: 9 }, (_, index) => (
            <circle key={index} r={116 - index * 7.5} fill="none" stroke="#fff" strokeOpacity="0.07" />
          ))}
          <circle r="46" fill="#E4572E" />
          <circle cy="-26" r="10" fill="#101113" />
          <rect x="-30" y="14" width="60" height="6" fill="#101113" />
          <circle r="4" fill="#0A0A0B" />
        </g>
      </svg>
    </Box>
  )
}
