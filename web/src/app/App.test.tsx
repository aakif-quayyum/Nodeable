import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { App } from './App.tsx'

describe('App', () => {
  // Screen readers jump between landmarks, so the page needs a main landmark with the app name as its heading (NFR-A11Y-01).
  it('NFR_A11Y_01 renders a main landmark with the app name as its heading', () => {
    render(<App />)

    expect(screen.getByRole('main')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Nodeable' })).toBeInTheDocument()
  })
})
