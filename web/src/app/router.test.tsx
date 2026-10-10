import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { renderAt } from '../test/renderApp.tsx'

describe('app shell and routes', () => {
  // Screen readers jump between landmarks, so every page needs a banner, navigation and main, with one h1 (NFR-A11Y-01).
  it('NFR_A11Y_01 gives the home page banner, navigation and main landmarks and a single h1', async () => {
    renderAt('/')

    expect(await screen.findByRole('banner')).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeInTheDocument()
    expect(screen.getByRole('main')).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 1, name: 'Nodeable' })).toBeInTheDocument()
  })

  it('NFR_A11Y_01 offers a skip link that targets the main landmark', async () => {
    renderAt('/')

    const skipLink = await screen.findByRole('link', { name: 'Skip to main content' })

    expect(skipLink).toHaveAttribute('href', '#main-content')
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content')
  })

  // The About page is a lazy route (ADR 0002): findBy waits for its code to download.
  it('FR_ABOUT_01 loads the About page when its link is followed', async () => {
    const user = userEvent.setup()
    renderAt('/')

    await user.click(await screen.findByRole('link', { name: 'About' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'About Nodeable' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'About' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current')
  })

  it('NFR_A11Y_01 shows a not-found page with a way back for unknown addresses', async () => {
    renderAt('/this/does/not/exist')

    expect(await screen.findByRole('heading', { level: 1, name: 'Page not found' })).toBeInTheDocument()
    const main = screen.getByRole('main')
    expect(within(main).getByRole('link', { name: 'Back to home' })).toHaveAttribute('href', '/')
  })

  it('NFR_A11Y_01 labels the theme toggle with the action it performs and switches scheme', async () => {
    const user = userEvent.setup()
    renderAt('/')

    // The studio theme starts dark, so the button offers the light theme.
    await user.click(await screen.findByRole('button', { name: 'Switch to light theme' }))

    expect(await screen.findByRole('button', { name: 'Switch to dark theme' })).toBeInTheDocument()
  })
})
