import { setupServer } from 'msw/node'
import { handlers } from './handlers.ts'

// LEARN: LG-01 msw | MSW intercepts fetch at the network layer, so the real client, hooks and components run unchanged against a fake Api; the backend tests never call MusicBrainz, and these never call the Api
export const server = setupServer(...handlers)
