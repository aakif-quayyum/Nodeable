/** "2013 to 2022", or the one year, or nothing when none of the stored recordings has a date. */
export function yearsText(first: number | null | undefined, last: number | null | undefined): string | null {
  if (first == null || last == null) return null
  return first === last ? String(first) : `${first} to ${last}`
}
