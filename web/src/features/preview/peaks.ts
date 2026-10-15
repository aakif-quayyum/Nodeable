/** How many bars the waveform has (decision 0022: 160 peaks for FR-WAVE-01). */
export const peakCount = 160

/**
 * Folds the channels of a decoded clip to mono and reduces it to `buckets` peaks: the largest absolute sample in each
 * bucket, scaled so the loudest bucket is 1 (FR-WAVE-01). The result is the same for the same audio, so it is computed
 * once, before the first frame is drawn, and nothing is stored.
 */
// LEARN: LG-04 typed-arrays | A Float32Array is a fixed-length block of 32-bit floats: decoded audio is a million of them, and a plain JavaScript array of numbers would be several times larger and slower to loop over
export function peaksOf(channels: readonly Float32Array[], buckets: number = peakCount): number[] {
  const first = channels[0]
  if (first === undefined || first.length === 0 || buckets <= 0) return []

  const length = first.length
  const peaks = new Array<number>(buckets).fill(0)

  for (let bucket = 0; bucket < buckets; bucket++) {
    // Integer bounds, so every sample belongs to exactly one bucket and the last bucket ends at the last sample.
    const from = Math.floor((bucket * length) / buckets)
    const to = Math.max(from + 1, Math.floor(((bucket + 1) * length) / buckets))

    let largest = 0
    for (let i = from; i < to && i < length; i++) {
      let sum = 0
      for (const channel of channels) sum += channel[i] ?? 0
      const sample = Math.abs(sum / channels.length)
      if (sample > largest) largest = sample
    }
    peaks[bucket] = largest
  }

  const loudest = Math.max(...peaks)
  return loudest === 0 ? peaks : peaks.map((peak) => peak / loudest)
}

/** The parts of a decoded clip that the reduction needs (Web Audio's `AudioBuffer` has all of them). */
export interface DecodedClip {
  numberOfChannels: number
  duration: number
  getChannelData(channel: number): Float32Array
}

/** Peaks and length of a clip that Web Audio has decoded. */
export function describeClip(clip: DecodedClip, buckets: number = peakCount): { peaks: number[]; duration: number } {
  const channels = Array.from({ length: clip.numberOfChannels }, (_, channel) => clip.getChannelData(channel))
  return { peaks: peaksOf(channels, buckets), duration: clip.duration }
}

/**
 * Decodes MP3 bytes with Web Audio and reduces them to peaks. An `OfflineAudioContext` is enough to decode and, unlike an
 * `AudioContext`, is not limited by the browser's autoplay rules or by how many contexts a page may hold.
 *
 * @throws when the browser has no Web Audio or the bytes cannot be decoded: the caller plays without a waveform.
 */
export async function decodePeaks(bytes: ArrayBuffer): Promise<{ peaks: number[]; duration: number }> {
  const Offline = window.OfflineAudioContext
  if (typeof Offline === 'undefined') throw new Error('Web Audio is not available')

  const context = new Offline(1, 1, 44100)
  // decodeAudioData detaches the buffer it is given, so it gets a copy and the caller keeps the bytes to play.
  const clip = await context.decodeAudioData(bytes.slice(0))
  return describeClip(clip)
}
