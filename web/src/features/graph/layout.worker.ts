import { createLayoutWorkerHandler, type FromLayoutWorker, type ToLayoutWorker } from './layoutProtocol.ts'

// The project compiles with the DOM library, where `self` is typed as a Window. Inside a worker it is the worker's
// global scope, which has the same postMessage and onmessage with a different signature, so it is described here.
interface WorkerScope {
  postMessage(message: FromLayoutWorker, transfer: Transferable[]): void
  onmessage: ((event: MessageEvent<ToLayoutWorker>) => void) | null
}
const scope = self as unknown as WorkerScope

// LEARN: LG-03 web-worker | A Worker is a separate thread with its own global scope and no DOM: the force simulation runs there so a large graph never blocks the page's thread, and the two sides share nothing except messages (a typed array's buffer is handed over without copying); the page and the worker are as isolated as two Node processes, with the message API of a browser
const handle = createLayoutWorkerHandler((message, transfer = []) => scope.postMessage(message, transfer))

scope.onmessage = (event) => handle(event.data)
