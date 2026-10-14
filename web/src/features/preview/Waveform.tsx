import Box from '@mui/material/Box'
import { keyframes } from '@mui/material/styles'
import { scaleLinear } from 'd3-scale'
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { clock } from './previewFormat.ts'
import { playbackTime } from './previewPlayback.ts'

// Bars rise from the middle when the waveform first appears. transform and opacity only (NFR-MOTION-01), and only with
// no-preference below: with reduced motion the bars are simply there.
const drawIn = keyframes`from { opacity: 0; transform: scaleY(0.15); }`

const width = 640
const height = 44
const gap = 0.35

interface WaveformProps {
  /** Peaks from 0 to 1 (`peaksOf`). */
  peaks: readonly number[]
  /** Seconds in the clip, from the audio element; 0 until it is known. */
  duration: number
  /** Seconds played, as the store last heard it (about four times a second). */
  position: number
  playing: boolean
  title: string
  onSeek: (seconds: number) => void
}

/**
 * The preview's waveform with a playhead (FR-WAVE-01). The peaks are drawn as bars with D3's linear scale, and the
 * whole thing is one slider: a click or drag seeks, and the arrow keys move a second (Page Up and Page Down five).
 * The audio element is the only clock: while playing, the playhead reads its time every frame, so the picture and the
 * sound cannot drift apart.
 */
export function Waveform({ peaks, duration, position, playing, title, onSeek }: WaveformProps) {
  const root = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const [live, setLive] = useState(position)

  // One animation frame at a time while playing; otherwise the playhead is where the store says it is.
  useEffect(() => {
    if (!playing) return
    let frame = 0
    const tick = () => {
      setLive(playbackTime())
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playing])

  const shown = playing ? live : position
  const fraction = duration > 0 ? Math.min(1, Math.max(0, shown / duration)) : 0

  const bars = useMemo(() => {
    const x = scaleLinear().domain([0, peaks.length]).range([0, width])
    const barWidth = (width / peaks.length) * (1 - gap)
    return peaks.map((peak, index) => {
      const h = Math.max(3, peak * (height - 4))
      return { key: index, x: x(index), y: (height - h) / 2, w: barWidth, h, at: (index + 0.5) / peaks.length }
    })
  }, [peaks])

  // The element's clamped time is what the playhead shows at once, without waiting for the next frame.
  const seek = (seconds: number) => {
    onSeek(seconds)
    setLive(playbackTime())
  }

  const seekToPointer = (event: PointerEvent<HTMLDivElement>) => {
    const box = root.current?.getBoundingClientRect()
    if (box === undefined || box.width === 0 || duration <= 0) return
    seek(Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)) * duration)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step: Record<string, number> = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 5, PageDown: -5 }
    if (event.key in step) {
      event.preventDefault()
      seek((playing ? playbackTime() : position) + (step[event.key] ?? 0))
    } else if (event.key === 'Home') {
      event.preventDefault()
      seek(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      seek(duration)
    }
  }

  return (
    <Box
      ref={root}
      role="slider"
      tabIndex={0}
      aria-label={`Preview position of ${title}`}
      aria-orientation="horizontal"
      aria-valuemin={0}
      aria-valuemax={Math.round(duration * 10) / 10}
      aria-valuenow={Math.round(shown * 10) / 10}
      aria-valuetext={duration > 0 ? `${clock(shown)} of ${clock(duration)}` : 'Not started'}
      onKeyDown={onKeyDown}
      onPointerDown={(event) => {
        dragging.current = true
        event.currentTarget.setPointerCapture(event.pointerId)
        // A press focuses the slider, so the arrow keys work straight after a click.
        event.currentTarget.focus()
        seekToPointer(event)
      }}
      onPointerMove={(event) => {
        if (dragging.current) seekToPointer(event)
      }}
      onPointerUp={() => {
        dragging.current = false
      }}
      onPointerCancel={() => {
        dragging.current = false
      }}
      sx={(theme) => ({
        position: 'relative',
        height,
        cursor: duration > 0 ? 'pointer' : 'default',
        touchAction: 'none',
        borderRadius: '6px',
        outlineOffset: 2,
        '&:focus-visible': { outline: `2px solid ${theme.vars.palette.text.primary}` },
        '& svg': { display: 'block', width: '100%', height: '100%' },
        '& .bar': { fill: theme.vars.palette.text.disabled },
        '& .bar.played': { fill: theme.vars.palette.text.primary },
        '& .head': { stroke: theme.vars.palette.text.primary, strokeWidth: 2 },
        '@media (prefers-reduced-motion: no-preference)': {
          '& .bars': { animation: `${drawIn} 450ms cubic-bezier(0.2, 0.8, 0.2, 1) both`, transformBox: 'fill-box', transformOrigin: 'center' },
        },
      })}
    >
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden focusable="false">
        <g className="bars">
          {bars.map((bar) => (
            <rect key={bar.key} className={bar.at <= fraction ? 'bar played' : 'bar'} x={bar.x} y={bar.y} width={bar.w} height={bar.h} rx={1} />
          ))}
        </g>
        <line className="head" vectorEffect="non-scaling-stroke" x1={fraction * width} x2={fraction * width} y1={0} y2={height} />
      </svg>
    </Box>
  )
}
