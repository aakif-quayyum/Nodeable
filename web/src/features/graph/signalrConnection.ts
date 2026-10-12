import { HubConnectionBuilder, LogLevel } from '@microsoft/signalr'
import type { GraphHubConnection } from './graphConnection.ts'

/**
 * The real connection to the hub. The address is the app's own origin (decision 0004): Vite proxies `/hubs` in
 * development and Caddy does in production, so there is no CORS and no second host to configure.
 *
 * The token is never in this address: it travels as an argument of `JoinGraph` (decision 0019).
 */
export function createSignalrConnection(): GraphHubConnection {
  return (
    new HubConnectionBuilder()
      .withUrl('/hubs/graph')
      // Retries after 0, 2, 10 and 30 seconds, then gives up; `onclose` tells the page, which shows the graph as it was.
      .withAutomaticReconnect()
      .configureLogging(LogLevel.Warning)
      .build()
  )
}
