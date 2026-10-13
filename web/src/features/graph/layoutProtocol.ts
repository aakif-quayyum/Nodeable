import { GraphLayout, type LayoutInput } from './forceLayout.ts'

/** Messages from the page to the layout worker. */
export type ToLayoutWorker =
  | { type: 'update'; gen: number; input: LayoutInput; rest?: boolean }
  | { type: 'pin'; id: string; x: number; y: number }
  | { type: 'release'; id: string }
  | { type: 'dispose' }

/**
 * Messages from the worker to the page. `layout` says which node each pair of numbers in the following `tick` messages
 * belongs to, so a tick is only two floats per node: the ids do not travel again.
 */
export type FromLayoutWorker =
  | { type: 'layout'; gen: number; ids: string[] }
  | { type: 'tick'; gen: number; xy: Float32Array }
  | { type: 'settled'; gen: number }

type Post = (message: FromLayoutWorker, transfer?: Transferable[]) => void

/**
 * The worker's whole behaviour as a function of "a message arrived" and "send a message", with no reference to the
 * worker global scope, so it can be tested in Node like any other module. `layout.worker.ts` only connects it to
 * `self`.
 */
export function createLayoutWorkerHandler(post: Post): (message: ToLayoutWorker) => void {
  let generation = 0
  let layout: GraphLayout | null = null

  return (message) => {
    if (message.type === 'dispose') {
      layout?.stop()
      layout = null
      return
    }

    if (message.type === 'pin') {
      layout?.pin(message.id, message.x, message.y)
      return
    }
    if (message.type === 'release') {
      layout?.release(message.id)
      return
    }

    generation = message.gen
    layout ??= new GraphLayout(
      (nodes) => {
        const xy = new Float32Array(nodes.length * 2)
        nodes.forEach((node, index) => {
          xy[index * 2] = node.x
          xy[index * 2 + 1] = node.y
        })
        // Transferring the buffer moves it to the page without copying it.
        post({ type: 'tick', gen: generation, xy }, [xy.buffer])
      },
      () => post({ type: 'settled', gen: generation }),
    )

    layout.update(message.input)
    post({ type: 'layout', gen: generation, ids: message.input.nodes.map((node) => node.id) })
    if (message.rest === true) {
      layout.step(300)
      post({ type: 'settled', gen: generation })
    }
  }
}
