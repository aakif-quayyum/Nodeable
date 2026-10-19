import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { useId } from 'react'
import { boxes, edges, groups } from './architecture.ts'

const title = 'How Nodeable is put together'
const description =
  'A browser reaches Caddy, which passes requests to the Api. The Api and the Worker share PostgreSQL and Redis and ask MusicBrainz and Deezer for data. The browser, the Api and the Worker send traces to the Aspire Dashboard. The numbered list below the figure says every connection in words.'

/**
 * The architecture of spec section 7, drawn from data (architecture.ts) as an inline SVG, so it takes its colours from the
 * theme in both schemes and costs no request. A line is a request or data when it is solid and telemetry when it is dashed,
 * and each carries a number that the list under the figure uses, so the figure is never the only copy of a fact (NFR-A11Y-01,
 * NFR-A11Y-02). It has no Collector and no Grafana: both were dropped by decision 0023.
 */
// LEARN: LG-04 svg-diagram-component | A diagram drawn from data in an inline SVG takes its colours from the theme like any other component, scales with the page, can be tested like any other markup, and the same data renders the list that says it in words, so the picture and the text cannot drift apart
export function ArchitectureDiagram() {
  const titleId = useId()
  const descId = useId()
  const arrowId = useId()

  return (
    <Box component="figure" sx={{ m: 0, display: 'grid', gap: 2 }}>
      {/* On a phone the figure keeps a readable size and scrolls sideways; the list below is what a phone reads. */}
      <Box sx={{ overflowX: 'auto' }}>
        <Box
          component="svg"
          viewBox="0 0 960 420"
          role="img"
          aria-labelledby={titleId}
          aria-describedby={descId}
          sx={(theme) => ({
            display: 'block',
            width: '100%',
            minWidth: 720,
            height: 'auto',
            color: theme.vars.palette.text.primary,
            '& text': { fill: theme.vars.palette.text.primary, fontFamily: 'inherit', fontSize: 13 },
            '& .sub': { fill: theme.vars.palette.text.secondary, fontSize: 11.5 },
            '& .name': { fontWeight: 700, fontSize: 14 },
            '& .box': { fill: theme.vars.palette.background.paper, stroke: theme.vars.palette.lineStrong, strokeWidth: 1.5 },
            '& .group': { fill: 'none', stroke: theme.vars.palette.lineStrong, strokeWidth: 1, strokeDasharray: '2 5' },
            '& .edge': { fill: 'none', stroke: theme.vars.palette.text.primary, strokeWidth: 1.6 },
            '& .telemetry': { strokeDasharray: '7 5' },
            '& .badge circle': { fill: theme.vars.palette.background.default, stroke: theme.vars.palette.text.primary, strokeWidth: 1.5 },
            '& .badge text': { fontSize: 12, fontWeight: 700, textAnchor: 'middle', dominantBaseline: 'central' },
          })}
        >
          <title id={titleId}>{title}</title>
          <desc id={descId}>{description}</desc>
          <defs>
            <marker id={arrowId} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
              <path d="M0 0 L10 5 L0 10 z" fill="currentColor" />
            </marker>
          </defs>

          {groups.map((group) => (
            <g key={group.title}>
              <rect className="group" x={group.x} y={group.y} width={group.w} height={group.h} rx={10} />
              <text className="sub" x={group.x + 15} y={group.y + 24}>
                {group.title}
              </text>
            </g>
          ))}

          {edges.map((edge) => (
            <path key={edge.n} className={edge.kind === 'telemetry' ? 'edge telemetry' : 'edge'} d={edge.path} markerEnd={`url(#${arrowId})`} />
          ))}

          {boxes.map((box) => (
            <g key={box.id}>
              <rect className="box" x={box.x} y={box.y} width={box.w} height={box.h} rx={8} />
              {box.lines.map((line, index) => (
                <text key={line} className={index === 0 ? 'name' : 'sub'} x={box.x + 12} y={box.y + 26 + index * 17}>
                  {line}
                </text>
              ))}
            </g>
          ))}

          {edges.map((edge) => (
            <g key={edge.n} className="badge" transform={`translate(${edge.at[0]} ${edge.at[1]})`}>
              <circle r={10} />
              <text>{edge.n}</text>
            </g>
          ))}

          <g transform="translate(640 345)">
            <path className="edge" d="M0 10 H40" markerEnd={`url(#${arrowId})`} />
            <text className="sub" x={52} y={14}>
              request or data
            </text>
            <path className="edge telemetry" d="M0 34 H40" markerEnd={`url(#${arrowId})`} />
            <text className="sub" x={52} y={38}>
              traces and logs
            </text>
          </g>
        </Box>
      </Box>

      <Box component="details" open sx={{ '& summary': { cursor: 'pointer', fontWeight: 600, mb: 1 } }}>
        <summary>Read it as a list</summary>
        <Box component="ol" sx={{ m: 0, pl: 3, display: 'grid', gap: 0.75 }}>
          {edges.map((edge) => (
            <Typography key={edge.n} component="li" sx={{ fontSize: 14 }}>
              {edge.sentence} <Typography component="span" color="text.secondary" sx={{ fontSize: 13 }}>({edge.kind === 'telemetry' ? 'traces and logs' : 'request or data'})</Typography>
            </Typography>
          ))}
        </Box>
      </Box>
    </Box>
  )
}
