import { describe, expect, it } from 'vitest'
import { cutAtWord, fitName } from './labelFit.ts'

describe('name fitting', () => {
  it('FR_VIEW_01 shows the whole name when it fits', () => {
    expect(fitName('William Earl Collins', 24, false)).toEqual(['William Earl Collins'])
    expect(fitName('Me and Your Mama', 16, true)).toEqual(['Me and Your Mama'])
  })

  it('FR_VIEW_01 wraps at a word boundary into two balanced lines before it cuts anything', () => {
    expect(fitName('William Earl Collins', 13, true)).toEqual(['William Earl', 'Collins'])
    expect(fitName('Gary “Mudbone” Cooper', 14, true)).toEqual(['Gary “Mudbone”', 'Cooper'])
    expect(fitName('Me and Your Mama', 10, true)).toEqual(['Me and', 'Your Mama'])
  })

  it('FR_VIEW_01 cuts at the end of a word, not inside one, when it may not wrap', () => {
    expect(fitName('William Earl Collins', 14, false)).toEqual(['William Earl…'])
    expect(cutAtWord('Brent Jones and The Best Life Singers', 20)).toBe('Brent Jones and The…')
  })

  it('FR_VIEW_01 cuts inside a word only when the boundary would leave next to nothing, or the first word alone is too long', () => {
    expect(cutAtWord('Per Gunnar Juliusson', 8)).toBe('Per Gun…')
    expect(cutAtWord('Supercalifragilistic', 9)).toBe('Supercal…')
    // A boundary that would leave "Me…" is not worth keeping when more of the name fits.
    expect(cutAtWord('Me and Your Mama', 9)).toBe('Me and…')
  })

  it('FR_VIEW_01 keeps the first line whole and cuts only the second when the second is the one that is too long', () => {
    expect(fitName('Ludwig Göransson and The Orchestra', 16, true)).toEqual(['Ludwig Göransson', 'and The…'])
    expect(fitName('Brent Jones and The Best Life Singers', 20, true)).toEqual(['Brent Jones and The', 'Best Life Singers'])
  })

  it('FR_VIEW_01 draws no name where there is no room for four characters', () => {
    expect(fitName('Riley Mackin', 3, true)).toEqual([])
    expect(fitName('', 30, true)).toEqual([])
  })
})
