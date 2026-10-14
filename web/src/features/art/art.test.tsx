import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Providers } from '../../app/providers.tsx'
import { setReducedMotion } from '../../test/viewport.ts'
import { AlbumArt } from './AlbumArt.tsx'
import { artSources, deezerCoverUrl } from './artSources.ts'
import { sleeveFor, sleevePatterns } from './sleeveSpec.ts'

const release = '2017e952-42c9-41e0-9e39-69d5aa7b17a6'
const group = 'fd817615-3d43-4f07-9509-d0a46b2bc278'
const deezer = 'https://cdn-images.dzcdn.net/images/cover/57ae3715e73c0486616bab8c2d6c6159/250x250-000000-80-0-0.jpg'
const seed = '7408f11c-6c4e-41e5-b81b-6a15bf6cb268'

function show(props: Partial<React.ComponentProps<typeof AlbumArt>> = {}) {
  return render(
    <Providers>
      <AlbumArt seed={seed} size={52} alt="Cover of Awaken, My Love!" releaseMbid={release} releaseGroupMbid={group} {...props} />
    </Providers>,
  )
}

// An <img> in jsdom never loads or fails by itself: the test plays the browser's part with load and error events.
function image(container: HTMLElement): HTMLImageElement | null {
  return container.querySelector('img')
}

describe('artSources', () => {
  it('FR_ART_01 tries the release, then the release group, then the Deezer cover', () => {
    const sources = artSources({ releaseMbid: release, releaseGroupMbid: group, deezerCoverUrl: deezer }, 52)

    expect(sources.map((source) => source.origin)).toEqual(['release', 'release-group', 'deezer'])
    expect(sources[0]?.url).toBe(`https://coverartarchive.org/release/${release}/front-250`)
    expect(sources[1]?.url).toBe(`https://coverartarchive.org/release-group/${group}/front-250`)
    expect(sources[2]?.url).toBe(deezer)
  })

  it('FR_ART_01 leaves out a step that has no id', () => {
    expect(artSources({ releaseMbid: null, releaseGroupMbid: group }, 52).map((source) => source.origin)).toEqual(['release-group'])
    expect(artSources({}, 52)).toEqual([])
  })

  it('FR_ART_01 offers the 500 px image only above 125 CSS pixels', () => {
    const small = artSources({ releaseMbid: release }, 125)[0]
    const large = artSources({ releaseMbid: release }, 126)[0]

    expect(small?.srcSet).toBeUndefined()
    expect(large?.srcSet).toBe(
      `https://coverartarchive.org/release/${release}/front-250 250w, https://coverartarchive.org/release/${release}/front-500 500w`,
    )
  })

  it('FR_ART_01 derives the large Deezer image from the small one', () => {
    const source = artSources({ deezerCoverUrl: deezer }, 200)[0]

    expect(source?.srcSet).toContain('/500x500-000000-80-0-0.jpg 500w')
  })

  it.each([
    ['another host', 'https://evil.example/images/cover/a/250x250-000000-80-0-0.jpg'],
    ['plain http', 'http://cdn-images.dzcdn.net/images/cover/a/250x250-000000-80-0-0.jpg'],
    ['a host that only ends with the right name', 'https://cdn-images.dzcdn.net.evil.example/a.jpg'],
    ['text that is not a URL', 'not a url'],
  ])('FR_ART_01 ignores a Deezer cover on %s', (_, url) => {
    expect(artSources({ deezerCoverUrl: url }, 52)).toEqual([])
  })
})

describe('deezerCoverUrl', () => {
  it('FR_ART_01 builds the cover address from the stored album image id, on the one host a cover may come from', () => {
    expect(deezerCoverUrl('57ae3715e73c0486616bab8c2d6c6159')).toBe(deezer)
  })

  it('FR_ART_01 gives no address for a missing or malformed id, so nothing else can be named', () => {
    expect(deezerCoverUrl(null)).toBeNull()
    expect(deezerCoverUrl(undefined)).toBeNull()
    expect(deezerCoverUrl('../../evil')).toBeNull()
    expect(deezerCoverUrl('57AE3715E73C0486616BAB8C2D6C6159')).toBeNull()
  })

  it('FR_ART_01 the third step of the chain comes from the stored id', () => {
    const sources = artSources({ deezerCoverUrl: deezerCoverUrl('57ae3715e73c0486616bab8c2d6c6159') }, 52)
    expect(sources.map((source) => source.origin)).toEqual(['deezer'])
  })
})

describe('sleeveFor', () => {
  it('FR_ART_01 gives a song the same sleeve every time, whatever the case of its id', () => {
    expect(sleeveFor(seed)).toEqual(sleeveFor(seed))
    expect(sleeveFor(seed.toUpperCase())).toEqual(sleeveFor(seed))
  })

  it('FR_ART_01 gives different songs a spread of colours and patterns', () => {
    const specs = Array.from({ length: 64 }, (_, index) => sleeveFor(`00000000-0000-4000-8000-${String(index).padStart(12, '0')}`))

    expect(new Set(specs.map((spec) => spec.background)).size).toBeGreaterThanOrEqual(6)
    expect(new Set(specs.map((spec) => spec.pattern)).size).toBeGreaterThanOrEqual(6)
    expect(specs.every((spec) => sleevePatterns.includes(spec.pattern))).toBe(true)
  })
})

describe('AlbumArt', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('FR_ART_01 loads the release cover lazily, at a fixed size, without a referrer', () => {
    const { container } = show()
    const img = image(container)

    expect(img).not.toBeNull()
    expect(img).toHaveAttribute('src', `https://coverartarchive.org/release/${release}/front-250`)
    expect(img).toHaveAttribute('loading', 'lazy')
    expect(img).toHaveAttribute('width', '52')
    expect(img).toHaveAttribute('height', '52')
    expect(img).toHaveAttribute('referrerpolicy', 'no-referrer')
  })

  it('FR_ART_01 draws the generated sleeve underneath from the start', () => {
    const { container } = show()

    expect(container.querySelector('svg[data-pattern]')).not.toBeNull()
  })

  it('FR_ART_01 gives the image its alt text only once it has loaded', () => {
    const { container } = show()
    const img = image(container)!

    expect(img).toHaveAttribute('alt', '')

    fireEvent.load(img)

    expect(screen.getByAltText('Cover of Awaken, My Love!')).toBeInTheDocument()
  })

  it('FR_ART_01 moves to the release group when the release has no cover, then to Deezer', () => {
    const { container } = show({ deezerCoverUrl: deezer })

    fireEvent.error(image(container)!)
    expect(image(container)).toHaveAttribute('src', `https://coverartarchive.org/release-group/${group}/front-250`)

    fireEvent.error(image(container)!)
    expect(image(container)).toHaveAttribute('src', deezer)
  })

  it('FR_ART_01 ends on the generated sleeve with no image and no error when every source fails', () => {
    const { container } = show()

    fireEvent.error(image(container)!)
    fireEvent.error(image(container)!)

    expect(image(container)).toBeNull()
    expect(container.querySelector('svg[data-pattern]')).not.toBeNull()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('FR_ART_01 shows only the sleeve for a song with no release yet', () => {
    const { container } = show({ releaseMbid: null, releaseGroupMbid: null })

    expect(image(container)).toBeNull()
    expect(container.querySelector('svg[data-pattern]')).not.toBeNull()
  })

  it('FR_ART_01 starts the chain again when the song changes', () => {
    const { container, rerender } = render(
      <Providers>
        <AlbumArt seed={seed} size={52} alt="a" releaseMbid={release} />
      </Providers>,
    )
    fireEvent.error(image(container)!)
    expect(image(container)).toBeNull()

    rerender(
      <Providers>
        <AlbumArt seed={seed} size={52} alt="b" releaseMbid="11111111-1111-4111-8111-111111111111" />
      </Providers>,
    )

    expect(image(container)).toHaveAttribute('src', 'https://coverartarchive.org/release/11111111-1111-4111-8111-111111111111/front-250')
  })

  it('NFR_MOTION_01 fades the cover in with opacity, and not at all when reduced motion is on', () => {
    const normal = show().container
    expect(image(normal)!.style.transition).toContain('opacity')
    document.body.innerHTML = ''

    setReducedMotion(true)

    const reduced = show().container
    expect(image(reduced)!.style.transition).toBe('none')
  })
})
