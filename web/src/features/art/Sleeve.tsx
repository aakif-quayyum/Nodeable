import { sleeveFor, type SleevePattern } from './sleeveSpec.ts'

// Each mark is drawn in a 100 by 100 box and scaled by the SVG, so one definition serves every size.
function Mark({ pattern, colour }: { pattern: SleevePattern; colour: string }) {
  switch (pattern) {
    case 'sun':
      return (
        <>
          <circle cx="64" cy="38" r="22" fill={colour} />
          <rect x="0" y="78" width="100" height="22" fill={colour} />
        </>
      )
    case 'bars':
      return (
        <>
          <rect x="12" y="54" width="76" height="8" fill={colour} />
          <rect x="12" y="68" width="56" height="8" fill={colour} />
          <rect x="12" y="82" width="36" height="8" fill={colour} />
        </>
      )
    case 'half':
      return <path d="M0,100 A50,50 0 0 1 100,100 Z" fill={colour} />
    case 'grid':
      return (
        <>
          {[0, 1, 2].flatMap((row) =>
            [0, 1, 2].map((column) => (
              <rect key={`${row}-${column}`} x={16 + column * 26} y={16 + row * 26} width="16" height="16" fill={colour} />
            )),
          )}
        </>
      )
    case 'stripe':
      return <polygon points="0,64 64,0 100,0 100,22 22,100 0,100" fill={colour} />
    case 'ring':
      return <circle cx="50" cy="50" r="27" fill="none" stroke={colour} strokeWidth="13" />
    case 'dot':
      return <circle cx="74" cy="74" r="14" fill={colour} />
    case 'split':
      return <rect x="0" y="0" width="50" height="100" fill={colour} />
  }
}

/**
 * A flat generated sleeve: what a song shows while its cover loads and when it has none (FR-ART-01). It is decorative,
 * so it is hidden from assistive technology; the song's name is always next to it.
 */
export function Sleeve({ seed, size }: { seed: string; size: number }) {
  const { background, mark, pattern } = sleeveFor(seed)

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      aria-hidden="true"
      focusable="false"
      data-pattern={pattern}
      style={{ display: 'block' }}
    >
      <rect width="100" height="100" fill={background} />
      <Mark pattern={pattern} colour={mark} />
    </svg>
  )
}
