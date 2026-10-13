import { expect, test } from '@playwright/test'
import { donald, installFakeServer, ludwig, redboneMbid } from './fakeApi.ts'

// The one flow of the UI refresh (decision 0020): search, add, watch the crew arrive in the orbit, move around it, and
// remove the song. Requirement ids: FR-SEARCH-01, FR-GRAPH-02, FR-VIEW-01, FR-VIEW-02, FR-GRAPH-05, FR-GRAPH-06.
test('FR_VIEW_01 search, add, orbit and remove', async ({ page }) => {
  const server = await installFakeServer(page)

  // Search from the landing page.
  await page.goto('/')
  await page.getByRole('textbox', { name: 'Song title' }).fill('Redbone')
  await page.getByRole('button', { name: 'Search', exact: true }).click()

  // Add the song: the graph opens with the orbit on it, waiting for credits.
  await page.getByRole('button', { name: 'Add to graph: Redbone by Childish Gambino' }).click()
  await expect(page).toHaveURL(new RegExp(`/graph\\?focus=song(:|%3A)${redboneMbid}`))
  const orbit = page.getByRole('group', { name: 'Credits graph, centred on Redbone' })
  await expect(orbit).toBeVisible()
  await expect(page.getByText('Loading credits', { exact: true })).toBeVisible()

  // The crew arrives over the hub and blooms into the orbit.
  server.push('CreditsResolved', {
    songMbid: redboneMbid,
    people: [donald, ludwig],
    credits: [
      { personMbid: donald.mbid, role: 'songwriter', detail: '', level: 'recording' },
      { personMbid: ludwig.mbid, role: 'producer', detail: '', level: 'recording' },
    ],
  })
  server.push('SongStatusChanged', { songMbid: redboneMbid, creditsStatus: 'complete' })
  await expect(orbit.getByRole('button', { name: /Put Donald Glover at the centre/ })).toBeVisible()
  await expect(orbit.getByRole('button', { name: /Put Ludwig Göransson at the centre/ })).toBeVisible()

  // The same graph as a constellation: choosing a node opens the orbit on it, and so does finding it by name
  // (FR-VIEW-02, FR-GRAPH-05).
  await page.getByRole('button', { name: 'Constellation' }).click()
  const constellation = page.getByRole('group', { name: /as a constellation of 1 song and 2 people/ })
  await expect(constellation).toBeVisible()
  await constellation.getByRole('button', { name: /Open Ludwig Göransson in the orbit/ }).click()
  await expect(page.getByRole('group', { name: 'Credits graph, centred on Ludwig Göransson' })).toBeVisible()
  await page.getByRole('combobox', { name: 'Find in your graph' }).fill('Redbone')
  await page.getByRole('option', { name: /Redbone/ }).click()
  await expect(page.getByRole('group', { name: 'Credits graph, centred on Redbone' })).toBeVisible()

  // Choose a person: they become the centre, and the breadcrumbs remember the way back.
  await orbit.getByRole('button', { name: /Put Donald Glover at the centre/ }).click()
  await expect(page.getByRole('group', { name: 'Credits graph, centred on Donald Glover' })).toBeVisible()
  const trail = page.getByRole('navigation', { name: 'Exploration path' })
  await trail.getByRole('button', { name: 'Redbone' }).click()
  await expect(page.getByRole('group', { name: 'Credits graph, centred on Redbone' })).toBeVisible()

  // The first crumb is always the whole graph, with every song on its first ring (FR-VIEW-04).
  await trail.getByRole('button', { name: 'Your graph' }).click()
  const overview = page.getByRole('group', { name: 'Credits graph, centred on your graph' })
  await expect(overview).toBeVisible()
  await overview.getByRole('button', { name: /Put Redbone at the centre/ }).click()
  await expect(page.getByRole('group', { name: 'Credits graph, centred on Redbone' })).toBeVisible()

  // Remove the song: it leaves the views at once, and the request is sent when the undo time is up.
  await page.getByRole('button', { name: 'Remove from graph: Redbone by Childish Gambino' }).click()
  await expect(page.getByText('Removed “Redbone” from your graph')).toBeVisible()
  await expect(page.getByText(/Your graph is empty/)).toBeVisible()
  await expect.poll(() => server.songs().length, { timeout: 15_000 }).toBe(0)
})
