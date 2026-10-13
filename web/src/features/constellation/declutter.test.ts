import { describe, expect, it } from 'vitest'
import { declutter, type LabelBox } from './declutter.ts'

const box = (id: string, x: number, y: number, width = 60, height = 14): LabelBox => ({ id, x, y, width, height })

describe('label decluttering', () => {
  it('FR_VIEW_02 keeps names that do not touch and leaves out one that would cover an earlier one', () => {
    const hidden = declutter([box('song', 0, 0), box('far', 200, 0), box('near', 20, 6)])

    expect([...hidden]).toEqual(['near'])
  })

  it('FR_VIEW_02 lets the more important name win, whatever the order on the page', () => {
    const hidden = declutter([box('important', 0, 0), box('less', 10, 0)])

    expect(hidden.has('less')).toBe(true)
    expect(hidden.has('important')).toBe(false)
  })

  it('FR_VIEW_02 does not count names that only share an edge line as touching', () => {
    expect(declutter([box('a', 0, 0), box('b', 0, 40)]).size).toBe(0)
  })
})
