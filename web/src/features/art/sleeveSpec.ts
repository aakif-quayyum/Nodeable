/** The flat geometric marks a generated sleeve can carry (from the design prototype). */
export const sleevePatterns = ['sun', 'bars', 'half', 'grid', 'stripe', 'ring', 'dot', 'split'] as const

export type SleevePattern = (typeof sleevePatterns)[number]

export interface SleeveSpec {
  background: string
  mark: string
  pattern: SleevePattern
}

// Background and mark colour pairs, all from the prototype's palette. Each pair keeps the mark readable on the
// background, so every generated sleeve looks designed rather than random.
const colourPairs: readonly (readonly [string, string])[] = [
  ['#E4572E', '#101113'],
  ['#F4F2EE', '#101113'],
  ['#3EC6E0', '#FFD23F'],
  ['#2A3BBF', '#F4F2EE'],
  ['#5B2A86', '#FF6B4A'],
  ['#C2362B', '#FFD23F'],
  ['#8B7BFF', '#101113'],
  ['#4CD07D', '#101113'],
  ['#FF7AC6', '#101113'],
  ['#2A2C31', '#FFD23F'],
]

// FNV-1a: a small, well-known string hash. It only has to spread MBIDs evenly and give the same answer every time.
function hash(text: string): number {
  let value = 2166136261
  for (let index = 0; index < text.length; index++) {
    value = Math.imul(value ^ text.charCodeAt(index), 16777619)
  }
  return value >>> 0
}

/**
 * The sleeve for a recording, chosen by hashing its MBID: the same song always gets the same sleeve (FR-ART-01), and
 * different songs mostly get different ones. The colour and the pattern come from different bits of the hash, so they
 * vary independently.
 */
export function sleeveFor(seed: string): SleeveSpec {
  const value = hash(seed.toLowerCase())
  const [background, mark] = colourPairs[value % colourPairs.length]!

  return { background, mark, pattern: sleevePatterns[(value >>> 8) % sleevePatterns.length]! }
}
