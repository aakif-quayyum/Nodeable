import { arc, pie } from 'd3-shape'
import { useMemo, useState } from 'react'
import type { CreditRoleKey } from '../../app/creditRoles.ts'
import { artSources, type ArtSource } from '../art/artSources.ts'
import { sleeveFor } from '../art/sleeveSpec.ts'
import { initials } from './initials.ts'

/** The radius a record is drawn at, in its own units; a view scales the group it sits in. */
export const recordRadius = 22
/** The radius a person's disc is drawn at (ring included), in its own units. */
export const personRadius = 12.6
/** The cover is the record's label: this radius, in the record's own units, out of 22. */
const coverRadius = 14.6

/**
 * A record's label is the song's cover. The chain is the one `AlbumArt` uses (Cover Art Archive by release, by release
 * group, then Deezer) as an SVG `<image>`, which has no `loading` attribute but does fire `error`; when the list runs
 * out nothing is drawn and the generated sleeve underneath shows.
 */
function RecordCover({ sources }: { sources: readonly ArtSource[] }) {
  const [index, setIndex] = useState(0)
  const source = sources[index]
  if (source === undefined) return null

  return (
    <image
      key={source.url}
      href={source.url}
      x={-coverRadius}
      y={-coverRadius}
      width={coverRadius * 2}
      height={coverRadius * 2}
      preserveAspectRatio="xMidYMid slice"
      style={{ clipPath: 'circle(50%)' }}
      onError={() => setIndex((current) => current + 1)}
    />
  )
}

/**
 * A song as a record: a black disc with grooves and, as its label, the sleeve the song would get (the generated one,
 * drawn first so there is never a hole) with the real cover over it once that has loaded. The orbit and the
 * constellation draw the same record.
 */
export function RecordGlyph({ mbid, artRelease, artGroup }: { mbid: string; artRelease?: string | null; artGroup?: string | null }) {
  const palette = sleeveFor(mbid)
  const sources = useMemo(() => artSources({ releaseMbid: artRelease, releaseGroupMbid: artGroup }, 64), [artRelease, artGroup])
  // A different cover is a different chain: the component's state is keyed by what it will try.
  const sourcesKey = sources.map((source) => source.url).join('|')

  return (
    <>
      <circle className="hit" r={recordRadius} style={{ fill: 'var(--vinyl)' }} stroke="#ffffff30" />
      <g className="spin">
        {[20.4, 18.3, 16.2].map((r) => (
          <circle key={r} r={r} fill="none" stroke="#fff" strokeOpacity={0.08} />
        ))}
        <circle r={coverRadius} fill={palette.background} />
        <circle cx={0} cy={-coverRadius * 0.6} r={3.4} fill={palette.mark} />
        <RecordCover key={sourcesKey} sources={sources} />
      </g>
      <circle r={1.6} style={{ fill: 'var(--vinyl)' }} />
    </>
  )
}

/**
 * A person as a disc with their initials, ringed by one segment for each role they have; a connector (two or more
 * songs) has a ripple.
 */
export function PersonGlyph({ name, roles, connector }: { name: string; roles: readonly CreditRoleKey[]; connector: boolean }) {
  const segments = useMemo(() => {
    const kinds: CreditRoleKey[] = roles.length > 0 ? [...roles] : ['other']
    const slices = pie<CreditRoleKey>().value(1).sort(null).padAngle(roles.length > 1 ? 0.16 : 0)(kinds)
    const shape = arc<(typeof slices)[number]>().innerRadius(10).outerRadius(12.8)
    return slices.map((slice) => ({ role: slice.data, d: shape(slice) ?? '' }))
  }, [roles])

  return (
    <>
      {connector && <circle className="ripple" r={13} style={{ stroke: `var(--role-${roles[0] ?? 'other'})` }} />}
      <circle className="hit" r={10} style={{ fill: 'var(--raised)' }} />
      {segments.map((segment) => (
        <path key={segment.role} d={segment.d} style={{ fill: `var(--role-${segment.role})` }} />
      ))}
      <text className="ini" textAnchor="middle" dy=".36em">
        {initials(name)}
      </text>
    </>
  )
}
