import { describe, expect, it, vi } from 'vitest'
import { readResponsesPayloadStream } from '../sseReader'

function event(name: string, payload: unknown): Uint8Array {
  return new TextEncoder().encode(`event: ${name}\ndata: ${JSON.stringify(payload)}\n\n`)
}

const completedItem = {
  type: 'response.output_item.done', output_index: 0,
  item: { id: 'img-1', type: 'image_generation_call', status: 'completed', result: 'aW1hZ2U=', output_format: 'png' },
}

describe('流式最终图片交付', () => {
  it('流断开前立即交付最终图片', async () => {
    let source!: ReadableStreamDefaultController<Uint8Array>
    const body = new ReadableStream<Uint8Array>({ start(controller) { source = controller } })
    let delivered!: () => void
    const firstImage = new Promise<void>((resolve) => { delivered = resolve })
    const finalImages = vi.fn(async () => { delivered() })
    const pending = readResponsesPayloadStream(
      new Response(body), 'image/png', new AbortController().signal,
      undefined, undefined, finalImages,
    )
    const failure = expect(pending).rejects.toThrow('连接断开')
    source.enqueue(event('response.output_item.done', completedItem))
    await firstImage
    expect(finalImages).toHaveBeenCalledTimes(1)
    source.error(new Error('连接断开'))
    await failure
  })

  it('完成事件到达后结束读取，并且不重复交付 output_item.done 的图片', async () => {
    const cancel = vi.fn()
    const body = new ReadableStream<Uint8Array>({
      start(source) {
        source.enqueue(event('response.output_item.done', completedItem))
        source.enqueue(event('response.output_item.done', completedItem))
        source.enqueue(event('response.completed', {
          type: 'response.completed', response: { id: 'resp-1', status: 'completed', output: [completedItem.item] },
        }))
        // 不关闭流：读取器应在完成事件后主动结束。
      },
      cancel,
    })
    const finalImages = vi.fn()
    const result = await readResponsesPayloadStream(
      new Response(body), 'image/png', new AbortController().signal,
      undefined, undefined, finalImages,
    )
    expect(result.streamedImages).toHaveLength(1)
    expect(finalImages).toHaveBeenCalledTimes(1)
    expect(cancel).toHaveBeenCalled()
  })
})
