/** Up to two capitals: the first letter of the first and of the last capitalised word of a name. */
export function initials(name: string): string {
  const words = name
    .replace(/[“”"]/g, '')
    .split(/\s+/)
    .filter((word) => /^[A-ZÀ-Þ]/.test(word))
  const first = words[0] ?? name
  const last = words.length > 1 ? (words.at(-1)?.[0] ?? '') : ''
  return `${first[0] ?? ''}${last}`.toUpperCase()
}
