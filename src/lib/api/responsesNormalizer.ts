import type { ActualTransportKind, ApiDebugRequestLogEntry, ApiImageAsset } from "./types"
import { readResponsesPayloadStream } from "./sseReader"
import { readResponsesPayload } from "./payloadText"
import {
  collectImageGenerationCallsFromPayload,
  parseImagesFromPayload,
} from "./imagePayload"
import { sanitizeDebugValue, readDevProxyRequestId } from "./debug"
import { createApiError } from "./imageTransforms"
import type { ResponseImageGenerationCallMeta } from "./payloadFacts"

/**
 * 一次 Responses 调用的归一化结果。
 * 无论原始数据是流式还是 JSON，调用方拿到的都是统一格式。
 */
export interface NormalizedResponsesResult {
  /** 已提取的图片列表，可直接使用 */
  images: ApiImageAsset[]
  /** 响应中每张图片的元信息（尺寸、质量、修正提示词等） */
  imageGenerationCalls: ResponseImageGenerationCallMeta[]
  /** 实际使用的传输方式 */
  actualTransport: ActualTransportKind
}

/**
 * 归一化 Responses 接口的返回结果。
 *
 * 内部自动处理流式和 JSON 两种传输模式，调用方不需要关心：
 * - 该用哪个函数读响应
 * - 图片是从流式事件里即时提取的，还是从 JSON 里解析的
 * - 元信息怎么收集
 *
 * 如果解析后没有可用图片，会直接抛出错误。
 */
export async function normalizeResponsesResponse(
  response: Response,
  mime: string,
  signal: AbortSignal,
  shouldReadAsStream: boolean,
  debugLogEntry?: ApiDebugRequestLogEntry,
): Promise<NormalizedResponsesResult> {
  let actualTransport: ActualTransportKind = "json"

  const streamResult = shouldReadAsStream
    ? await readResponsesPayloadStream(response, mime, signal, debugLogEntry)
    : null

  const payload = streamResult?.payload ?? (await readResponsesPayload(response, debugLogEntry))
  const streamedImages = streamResult?.streamedImages ?? []
  actualTransport = streamResult?.actualTransport ?? "json"

  const imageGenerationCalls = collectImageGenerationCallsFromPayload(payload)

  const images: ApiImageAsset[] =
    actualTransport === "stream" && streamedImages.length > 0
      ? streamedImages
      : await parseImagesFromPayload(payload, mime, signal)

  if (!images.length) {
    if (debugLogEntry) {
      debugLogEntry.responseBody = sanitizeDebugValue(payload)
    }
    const requestId = readDevProxyRequestId(response.headers)
    throw createApiError("Responses API 未返回可用图片数据", response.status, {
      requestId,
      details: { responseBody: payload },
    })
  }

  return { images, imageGenerationCalls, actualTransport }
}
