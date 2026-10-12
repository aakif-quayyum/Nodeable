import { describe, expect, it } from 'vitest'
import { createLayoutWorkerHandler, type FromLayoutWorker } from './layoutProtocol.ts'

function setup() {
  const sent: FromLayoutWorker[] = []
  const transfers: (Transferable[] | undefined)[] = []
  const handle = createLayoutWorkerHandler((message, transfer) => {
    sent.push(message)
    transfers.push(transfer)
  })
  return { sent, transfers, handle }
}

const input = {
  nodes: [
    { id: 's1', r: 10 },
    { id: 'p1', r: 6 },
  ],
  links: [{ source: 's1', target: 'p1' }],
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe('layout worker handler', () => {
  it('NFR_PERF_03 answers an update with the node ids once, then ticks with two numbers per node', async () => {
    const { sent, handle } = setup()

    handle({ type: 'update', gen: 7, input })
    await wait(100)
    handle({ type: 'dispose' })

    expect(sent[0]).toEqual({ type: 'layout', gen: 7, ids: ['s1', 'p1'] })
    const ticks = sent.filter((message) => message.type === 'tick')
    expect(ticks.length).toBeGreaterThan(0)
    for (const tick of ticks) {
      expect(tick.gen).toBe(7)
      expect(tick.xy).toHaveLength(4)
    }
  })

  it("NFR_PERF_03 hands each tick's buffer over instead of copying it", async () => {
    const { sent, transfers, handle } = setup()

    handle({ type: 'update', gen: 1, input })
    await wait(60)
    handle({ type: 'dispose' })

    const index = sent.findIndex((message) => message.type === 'tick')
    expect(index).toBeGreaterThan(-1)
    expect(transfers[index]).toHaveLength(1)
  })

  it('NFR_PERF_03 stamps later messages with the generation of the latest update', async () => {
    const { sent, handle } = setup()

    handle({ type: 'update', gen: 1, input })
    handle({ type: 'update', gen: 2, input: { ...input, nodes: [...input.nodes, { id: 'p2', r: 6 }] } })
    await wait(60)
    handle({ type: 'dispose' })

    expect(sent.filter((message) => message.type === 'layout').map((message) => message.gen)).toEqual([1, 2])
    expect(sent.filter((message) => message.type === 'tick').at(-1)?.gen).toBe(2)
  })
})
