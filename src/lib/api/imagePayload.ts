import type { TaskResponseMeta } from '@/types'
import { isRecord } from '@/lib/guards'
import { throwIfSignalAborted } from './abort'
import {
  base64ToBlob,
  buildCompactImagePayloadSignature,
  buildDecodedImageAsset,
  buildDecodedImageAssetFromUrlValue,
  createApiError,
  resolveImageMimeType,
  stripDecodedImageAssetSignature,
} from './imageTransforms'
import {
  extractImageGenerationCallMeta,
  hasUsableImagePayload,
  readOptionalText,
  type ResponseImageGenerationCallMeta,
} from './payloadFacts'
import type {
  ApiImageAsset,
  DecodedImageAsset,
} from './types'

interface ImageItemAssetMeta {
  mimeType: string
  outputFormat?: string
  itemId?: string
  outputIndex?: number
}

function buildImageItemAssetMeta(
  item: Record<string, unknown>,
  fallbackMime: string,
): ImageItemAssetMeta {
  const outputFormat = readOptionalText(item.output_format) ?? undefined
  const outputIndex =
    typeof item.output_index === 'number' && Number.isFinite(item.output_index)
      ? item.output_index
      : undefined

  return {
    mimeType: resolveImageMimeType(outputFormat, fallbackMime),
    outputFormat,
    itemId: readOptionalText(item.id) ?? undefined,
    outputIndex,
  }
}

async function decodeImageAssetFromItem(
  item: unknown,
  fallbackMime: string,
  signal: AbortSignal,
): Promise<DecodedImageAsset | null> {
  throwIfSignalAborted(signal)

  if (!isRecord(item)) {
    return null
  }

  if (typeof item.type === 'string' && item.type.includes('partial_image')) {
    return null
  }

  if (
    item.type === 'image_generation_call' &&
    typeof item.status === 'string' &&
    item.status !== 'completed' &&
    !hasUsableImagePayload(item)
  ) {
    return null
  }

  const signatures = collectImageSignaturesFromItem(item)
  if (!signatures.length) {
    return null
  }

  const signature = signatures[0]
  const meta = buildImageItemAssetMeta(item, fallbackMime)

  const b64 = item.b64_json
  if (typeof b64 === 'string' && b64) {
    throwIfSignalAborted(signal)
    return buildDecodedImageAsset(await base64ToBlob(b64, meta.mimeType, signal), signature, meta)
  }

  const result = item.result
  if (typeof result === 'string' && result) {
    throwIfSignalAborted(signal)
    return buildDecodedImageAsset(await base64ToBlob(result, meta.mimeType, signal), signature, meta)
  }

  if (typeof item.url === 'string' && item.url) {
    return await buildDecodedImageAssetFromUrlValue(item.url, 'url', signature, meta, signal)
  }

  if (typeof item.image_url === 'string' && item.image_url) {
    return await buildDecodedImageAssetFromUrlValue(
      item.image_url,
      'image_url',
      signature,
      meta,
      signal,
    )
  }

  throw createApiError('接口返回了不支持的图片载荷格式')
}

function collectImageSignaturesFromItem(item: unknown): string[] {
  if (!isRecord(item) || (typeof item.type === 'string' && item.type.includes('partial_image'))) {
    return []
  }

  if (
    item.type === 'image_generation_call' &&
    typeof item.status === 'string' &&
    item.status !== 'completed' &&
    !hasUsableImagePayload(item)
  ) {
    return []
  }

  if (!hasUsableImagePayload(item)) {
    return []
  }

  const id = readOptionalText(item.id)
  const outputIndex =
    typeof item.output_index === 'number' && Number.isFinite(item.output_index)
      ? item.output_index
      : null
  if (id && outputIndex != null) {
    return [`id:${id}:output_index:${outputIndex}`]
  }
  if (id) {
    return [`id:${id}`]
  }

  if (typeof item.b64_json === 'string' && item.b64_json) {
    return [buildCompactImagePayloadSignature('b64_json', item.b64_json)]
  }
  if (typeof item.result === 'string' && item.result) {
    return [buildCompactImagePayloadSignature('result', item.result)]
  }
  if (typeof item.url === 'string' && item.url) {
    return [`url:${item.url}`]
  }
  if (typeof item.image_url === 'string' && item.image_url) {
    return [`image_url:${item.image_url}`]
  }
  return []
}

function collectNewImageItemsFromPayload(
  payload: unknown,
  emittedImageSignatures: Set<string>,
): Record<string, unknown>[] {
  const itemsToEmit: Record<string, unknown>[] = []

  forEachPayloadRecord(payload, (item) => {
    const signatures = collectImageSignaturesFromItem(item)
    if (!signatures.length) {
      return
    }

    const hasNewImage = signatures.some((signature) => !emittedImageSignatures.has(signature))
    if (!hasNewImage) {
      return
    }

    for (const signature of signatures) {
      emittedImageSignatures.add(signature)
    }
    itemsToEmit.push(item)
  })

  return itemsToEmit
}

export async function emitNewImagesFromPayload(
  payload: unknown,
  fallbackMime: string,
  signal: AbortSignal,
  emittedImageSignatures: Set<string>,
  onImages?: (images: ApiImageAsset[]) => void | Promise<void>,
): Promise<number> {
  throwIfSignalAborted(signal)

  if (typeof onImages !== 'function') {
    return 0
  }

  const itemsToEmit = collectNewImageItemsFromPayload(payload, emittedImageSignatures)
  if (!itemsToEmit.length) {
    return 0
  }

  const images: ApiImageAsset[] = []
  for (const item of itemsToEmit) {
    throwIfSignalAborted(signal)
    const imageAsset = await decodeImageAssetFromItem(item, fallbackMime, signal)
    if (imageAsset) {
      images.push(stripDecodedImageAssetSignature(imageAsset))
    }
  }

  if (!images.length) {
    return 0
  }

  throwIfSignalAborted(signal)
  await onImages(images)
  return images.length
}

function pushPayloadChildren(queue: unknown[], items: unknown[]): void {
  for (const item of items) {
    queue.push(item)
  }
}

function forEachPayloadRecord(
  payload: unknown,
  visitor: (item: Record<string, unknown>) => void,
) {
  const queue: unknown[] = [payload]
  const visited = new WeakSet<object>()

  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index]
    if (!isRecord(current) || visited.has(current)) {
      continue
    }

    visited.add(current)
    visitor(current)

    const data = current.data
    if (Array.isArray(data)) {
      pushPayloadChildren(queue, data)
    }

    const output = current.output
    if (Array.isArray(output)) {
      pushPayloadChildren(queue, output)
    }

    const content = current.content
    if (Array.isArray(content)) {
      pushPayloadChildren(queue, content)
    }

    if (current.item !== undefined) {
      queue.push(current.item)
    }

    if (current.response !== undefined) {
      queue.push(current.response)
    }
  }
}

function appendImageGenerationCallsFromItem(
  calls: ResponseImageGenerationCallMeta[],
  item: unknown,
) {
  if (!isRecord(item)) {
    return
  }

  const call = extractImageGenerationCallMeta(item)
  if (call) {
    calls.push(call)
  }
}

function dedupeImageGenerationCalls(
  calls: ResponseImageGenerationCallMeta[],
): ResponseImageGenerationCallMeta[] {
  const seen = new Set<string>()
  const deduped: ResponseImageGenerationCallMeta[] = []

  for (const call of calls) {
    const signature = JSON.stringify(call)
    if (seen.has(signature)) {
      continue
    }
    seen.add(signature)
    deduped.push(call)
  }

  return deduped
}

export function collectImageGenerationCallsFromPayload(payload: unknown): ResponseImageGenerationCallMeta[] {
  const calls: ResponseImageGenerationCallMeta[] = []
  forEachPayloadRecord(payload, (item) => {
    appendImageGenerationCallsFromItem(calls, item)
  })

  return dedupeImageGenerationCalls(calls)
}

function summarizeImageGenerationCallValue(
  calls: ResponseImageGenerationCallMeta[],
  key: keyof NonNullable<TaskResponseMeta['appliedImageParams']>,
): string | null {
  const values = Array.from(
    new Set(
      calls
        .map((call) => readOptionalText(call[key]))
        .filter((value): value is string => Boolean(value)),
    ),
  )

  if (!values.length) {
    return null
  }
  return values.join(' / ')
}

export function buildTaskResponseMetaFromCalls(
  calls: ResponseImageGenerationCallMeta[],
): TaskResponseMeta | undefined {
  const normalizedCalls = dedupeImageGenerationCalls(calls)
  if (!normalizedCalls.length) {
    return undefined
  }

  const appliedImageParams: NonNullable<TaskResponseMeta['appliedImageParams']> = {}

  const size = summarizeImageGenerationCallValue(normalizedCalls, 'size')
  if (size) appliedImageParams.size = size

  const quality = summarizeImageGenerationCallValue(normalizedCalls, 'quality')
  if (quality) appliedImageParams.quality = quality

  const outputFormat = summarizeImageGenerationCallValue(normalizedCalls, 'output_format')
  if (outputFormat) appliedImageParams.output_format = outputFormat

  const background = summarizeImageGenerationCallValue(normalizedCalls, 'background')
  if (background) appliedImageParams.background = background

  const action = summarizeImageGenerationCallValue(normalizedCalls, 'action')
  if (action) appliedImageParams.action = action

  const revisedPrompt =
    normalizedCalls
      .map((call) => readOptionalText(call.revised_prompt))
      .find((value): value is string => Boolean(value)) ?? null

  const responseMeta: TaskResponseMeta = {}
  if (Object.keys(appliedImageParams).length > 0) {
    responseMeta.appliedImageParams = appliedImageParams
  }
  if (revisedPrompt) {
    responseMeta.revisedPrompt = revisedPrompt
  }

  return Object.keys(responseMeta).length > 0 ? responseMeta : undefined
}

export async function parseImagesFromPayload(
  payload: unknown,
  fallbackMime: string,
  signal: AbortSignal,
): Promise<ApiImageAsset[]> {
  throwIfSignalAborted(signal)

  const images: ApiImageAsset[] = []
  const imageItems = collectNewImageItemsFromPayload(payload, new Set<string>())

  for (const item of imageItems) {
    throwIfSignalAborted(signal)
    const imageAsset = await decodeImageAssetFromItem(item, fallbackMime, signal)
    if (imageAsset) {
      images.push(stripDecodedImageAssetSignature(imageAsset))
    }
  }

  return images
}
