// WCAG 2.x contrast maths: https://www.w3.org/TR/WCAG22/#dfn-contrast-ratio

function toLinear(channel: number): number {
  const c = channel / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

/** Relative luminance of a #rrggbb colour, from 0 (black) to 1 (white). */
export function relativeLuminance(hex: string): number {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
  if (!match) {
    throw new Error(`Expected a #rrggbb colour, got "${hex}"`)
  }
  // After the match check, groups 1 to 3 exist, but noUncheckedIndexedAccess still types them as string | undefined.
  const [r, g, b] = [match[1], match[2], match[3]].map((part) => toLinear(Number.parseInt(part ?? '0', 16)))
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0)
}

/** Contrast ratio between two colours, from 1 (identical) to 21 (black on white). */
export function contrastRatio(foreground: string, background: string): number {
  const [lighter, darker] = [relativeLuminance(foreground), relativeLuminance(background)].sort((a, b) => b - a)
  return ((lighter ?? 0) + 0.05) / ((darker ?? 0) + 0.05)
}
