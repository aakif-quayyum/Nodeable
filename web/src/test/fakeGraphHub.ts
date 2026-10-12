import type { GraphHubConnection } from '../features/graph/graphConnection.ts'

/**
 * A stand-in for the SignalR connection: it records what the page does to it and lets a test play the server's part.
 * `calls` is the order of the page's actions, which is what the join-then-load rule is tested against.
 */
export class FakeGraphHub implements GraphHubConnection {
  readonly calls: string[] = []
  private readonly handlers = new Map<string, (message: unknown) => void>()
  private reconnected: (() => void) | null = null
  private reconnecting: (() => void) | null = null
  private closed: (() => void) | null = null

  /** What JoinGraph should do: resolve, or reject with this message (a refused join). */
  joinFails: string | null = null

  on(method: string, handler: (message: unknown) => void) {
    this.handlers.set(method, handler)
  }
  onreconnecting(handler: () => void) {
    this.reconnecting = handler
  }
  onreconnected(handler: () => void) {
    this.reconnected = handler
  }
  onclose(handler: () => void) {
    this.closed = handler
  }

  start() {
    this.calls.push('start')
    return Promise.resolve()
  }

  invoke(method: string, ...args: unknown[]) {
    this.calls.push(`${method}(${args.map((arg) => String(arg)).join(', ')})`)
    return this.joinFails === null ? Promise.resolve(undefined) : Promise.reject(new Error(this.joinFails))
  }

  stop() {
    this.calls.push('stop')
    return Promise.resolve()
  }

  /** The server sends an event. */
  emit(method: string, message: object) {
    const handler = this.handlers.get(method)
    if (handler === undefined) throw new Error(`The page is not listening for ${method}`)
    handler(message)
  }

  simulateReconnecting() {
    this.reconnecting?.()
  }
  simulateReconnected() {
    this.reconnected?.()
  }
  simulateClosed() {
    this.closed?.()
  }
}
