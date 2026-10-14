/** Seconds as m:ss. */
export function clock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds))
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}

/** Where a person can look for the song at Deezer when there is no preview here (the risk table's "open in service" fallback). */
export function deezerSearchUrl(song: { title: string; artist: string }): string {
  return `https://www.deezer.com/search/${encodeURIComponent(`${song.artist} ${song.title}`)}`
}
