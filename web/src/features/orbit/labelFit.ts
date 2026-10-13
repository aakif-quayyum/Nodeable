/**
 * Cuts `text` to at most `cap` characters, at the end of a word when one ends early enough to be worth keeping
 * ("William Earl…", not "William Ear…"); inside a word only when the first word alone is longer than the room.
 */
export function cutAtWord(text: string, cap: number): string {
  if (text.length <= cap) return text
  const room = Math.max(1, cap - 1)
  const space = text.slice(0, room + 1).lastIndexOf(' ')
  // A boundary that leaves only a letter or two ("Me…") is worse than a longer cut.
  const head = space >= Math.min(4, room) ? text.slice(0, space) : text.slice(0, room)
  return `${head.trimEnd()}…`
}

/**
 * The lines a name is drawn in, for a label that has room for `cap` characters on a line (spec section 12).
 *
 * In order of preference: the whole name on one line; when `twoLines`, the name wrapped at a word boundary into two
 * balanced lines (wrapping beats cutting); the first line whole and the second cut at a word; and last, one line cut at
 * a word. Fewer than four characters of room is no label at all (the tooltip and the accessible name give the name).
 */
export function fitName(full: string, cap: number, twoLines: boolean): string[] {
  if (cap < 4 || full === '') return []
  if (full.length <= cap) return [full]

  const words = full.split(/\s+/).filter((word) => word !== '')
  if (twoLines && words.length > 1) {
    let best: [string, string] | null = null
    for (let at = 1; at < words.length; at += 1) {
      const first = words.slice(0, at).join(' ')
      const second = words.slice(at).join(' ')
      if (best === null || Math.max(first.length, second.length) <= Math.max(best[0].length, best[1].length)) best = [first, second]
    }
    if (best !== null) {
      const [first, second] = best
      if (first.length <= cap && second.length <= cap) return [first, second]
      if (first.length <= cap) return [first, cutAtWord(second, cap)]
    }
  }
  return [cutAtWord(full, cap)]
}
