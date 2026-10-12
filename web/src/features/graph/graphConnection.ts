import { createContext, useContext } from 'react'

/**
 * The part of a SignalR connection the graph uses. Naming it keeps the page independent of the SignalR package
 * (which is a separate, lazily loaded chunk) and lets tests supply a fake that needs no server.
 */
export interface GraphHubConnection {
  on(method: string, handler: (message: unknown) => void): void
  onreconnecting(handler: () => void): void
  onreconnected(handler: () => void): void
  onclose(handler: () => void): void
  start(): Promise<void>
  invoke(method: string, ...args: unknown[]): Promise<unknown>
  stop(): Promise<void>
}

export type GraphConnectionFactory = () => GraphHubConnection | Promise<GraphHubConnection>

/** Tests provide a fake factory; null means "use SignalR", which is imported only when a graph is shown. */
export const GraphConnectionContext = createContext<GraphConnectionFactory | null>(null)

export function useGraphConnectionFactory(): GraphConnectionFactory | null {
  return useContext(GraphConnectionContext)
}

export async function loadSignalrConnection(): Promise<GraphHubConnection> {
  const { createSignalrConnection } = await import('./signalrConnection.ts')
  return createSignalrConnection()
}
