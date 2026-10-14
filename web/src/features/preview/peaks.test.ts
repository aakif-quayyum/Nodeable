import { describe, expect, it } from 'vitest'
import { describeClip, peakCount, peaksOf } from './peaks.ts'

describe('peaksOf', () => {
  it('FR_WAVE_01 reduces a clip to 160 peaks by default, the loudest scaled to 1', () => {
    const samples = new Float32Array(48000)
    samples[30000] = -0.5
    samples[100] = 0.25

    const peaks = peaksOf([samples])

    expect(peaks).toHaveLength(peakCount)
    expect(peakCount).toBe(160)
    expect(Math.max(...peaks)).toBe(1)
    expect(peaks[Math.floor((30000 * 160) / 48000)]).toBe(1)
    expect(peaks[Math.floor((100 * 160) / 48000)]).toBe(0.5)
  })

  it('FR_WAVE_01 a peak is the largest absolute sample of its bucket, so a negative spike counts', () => {
    const samples = Float32Array.from([0.1, -0.9, 0.3, 0.2])

    const peaks = peaksOf([samples], 2)
    expect(peaks[0]).toBe(1)
    expect(peaks[1]).toBeCloseTo(0.3 / 0.9, 5)
  })

  it('FR_WAVE_01 channels are folded to mono by averaging, so opposite channels cancel', () => {
    const left = Float32Array.from([1, 1, 1, 1])
    const right = Float32Array.from([-1, -1, -1, -1])

    expect(peaksOf([left, right], 2)).toEqual([0, 0])
    expect(peaksOf([left, left], 2)).toEqual([1, 1])
  })

  it('FR_WAVE_01 every sample falls in exactly one bucket, and the last sample is in the last one', () => {
    const samples = new Float32Array(1000)
    samples[999] = 1

    const peaks = peaksOf([samples], 160)

    expect(peaks[159]).toBe(1)
    expect(peaks.slice(0, 159).every((peak) => peak === 0)).toBe(true)
  })

  it('FR_WAVE_01 silence stays silent instead of dividing by zero, and nothing gives nothing', () => {
    expect(peaksOf([new Float32Array(100)], 4)).toEqual([0, 0, 0, 0])
    expect(peaksOf([], 4)).toEqual([])
    expect(peaksOf([new Float32Array(0)], 4)).toEqual([])
  })

  it('FR_WAVE_01 a clip shorter than the bucket count still has that many peaks', () => {
    expect(peaksOf([Float32Array.from([0.5, 1])], 4)).toHaveLength(4)
  })
})

describe('describeClip', () => {
  it('FR_WAVE_01 reads the channels and the length of a decoded clip', () => {
    const clip = { numberOfChannels: 1, duration: 29.99, getChannelData: () => Float32Array.from([0, 1, 0, 0]) }

    expect(describeClip(clip, 2)).toEqual({ peaks: [1, 0], duration: 29.99 })
  })
})
