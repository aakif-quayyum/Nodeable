/** A name that wants to be drawn: its box in the drawing's own units, in the order of importance. */
export interface LabelBox {
  id: string
  /** The middle of the box. */
  x: number
  /** The top of the box. */
  y: number
  width: number
  height: number
}

/**
 * Which names fit: they are looked at in order of importance and one that would cover a name that has already been
 * placed is left out (FR-VIEW-02). A graph's names are then readable at the size they are drawn at, instead of being
 * drawn over each other, and the ones left out are still given by the tooltip, the focus and the accessible name.
 */
export function declutter(candidates: readonly LabelBox[], pad = 2): Set<string> {
  const placed: LabelBox[] = []
  const hidden = new Set<string>()

  for (const box of candidates) {
    const left = box.x - box.width / 2 - pad
    const right = box.x + box.width / 2 + pad
    const top = box.y - pad
    const bottom = box.y + box.height + pad
    const clash = placed.some((other) => {
      const oLeft = other.x - other.width / 2
      const oRight = other.x + other.width / 2
      return left < oRight && right > oLeft && top < other.y + other.height && bottom > other.y
    })
    if (clash) hidden.add(box.id)
    else placed.push(box)
  }
  return hidden
}
