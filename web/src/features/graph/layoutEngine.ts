import { GraphLayout, type LayoutInput } from './forceLayout.ts'
import type { FromLayoutWorker, ToLayoutWorker } from './layoutProtocol.ts'

/** Above this many nodes the simulation runs in a Web Worker (spec section 12, NFR-PERF-03). */
export const WORKER_NODE_THRESHOLD = 500

/**
 * A layout that reports where each node is. `update` is called whenever the graph changes; positions come back through
 * the callbacks, on whichever thread the engine runs, as ids and a flat array of x, y pairs in the same order.
 */
export interface LayoutEngine {
  readonly kind: 'inline' | 'worker'
  update(input: LayoutInput): void
  dispose(): void
}

export interface LayoutCallbacks {
  onPositions(ids: readonly string[], xy: Float32Array): void
  onSettled(): void
}

export function createInlineEngine(callbacks: LayoutCallbacks): LayoutEngine {
  const layout = new GraphLayout(
    (nodes) => {
      const xy = new Float32Array(nodes.length * 2)
      nodes.forEach((node, index) => {
        xy[index * 2] = node.x
        xy[index * 2 + 1] = node.y
      })
      callbacks.onPositions(
        nodes.map((node) => node.id),
        xy,
      )
    },
    () => callbacks.onSettled(),
  )

  return {
    kind: 'inline',
    update: (input) => void layout.update(input),
    dispose: () => layout.stop(),
  }
}

export function createWorkerEngine(callbacks: LayoutCallbacks): LayoutEngine {
  // `new URL(..., import.meta.url)` is the form Vite recognises: it bundles the worker file as its own chunk.
  const worker = new Worker(new URL('./layout.worker.ts', import.meta.url), { type: 'module' })
  let generation = 0
  let ids: string[] = []
  let idsGeneration = -1

  worker.onmessage = (event: MessageEvent<FromLayoutWorker>) => {
    const message = event.data
    // Messages of an older update are ignored: the page has already sent a newer graph.
    if (message.gen !== generation) return

    if (message.type === 'layout') {
      ids = message.ids
      idsGeneration = message.gen
    } else if (message.type === 'tick') {
      if (idsGeneration === generation) callbacks.onPositions(ids, message.xy)
    } else {
      callbacks.onSettled()
    }
  }

  const send = (message: ToLayoutWorker) => worker.postMessage(message)

  return {
    kind: 'worker',
    update: (input) => {
      generation += 1
      send({ type: 'update', gen: generation, input })
    },
    dispose: () => {
      send({ type: 'dispose' })
      worker.terminate()
    },
  }
}

export function createLayoutEngine(useWorker: boolean, callbacks: LayoutCallbacks): LayoutEngine {
  return useWorker && typeof Worker !== 'undefined' ? createWorkerEngine(callbacks) : createInlineEngine(callbacks)
}
