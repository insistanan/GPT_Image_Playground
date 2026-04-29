import type {
  AppliedTransportMeta,
  ApiProtocol,
  AppSettings,
  ResponsesImageInputMode,
  ResponsesPromptRevisionMode,
  ResponsesTransportMode,
  TaskErrorDebugInfo,
  TaskResponseMeta,
} from '../../types'
import {
  DEV_PROXY_REQUEST_ID_HEADER,
  buildApiUrl,
} from '../devProxy'
import type {
  ApiDebugRequestLogEntry,
  ApiDebugRequestSnapshot,
  ApiError,
  CallApiOptions,
  ImagesRequestPlan,
  ParsedSseEvent,
  ResponsesStreamImageEvent,
  SharedRequestContext,
  StreamedPayloadResult,
} from './types'

export const MIME_MAP: Record<string, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
}

const RESPONSES_INLINE_IMAGE_MAX_DIMENSION = 1280
const RESPONSES_INLINE_IMAGE_TARGET_BYTES = 700 * 1024
const RESPONSES_INLINE_IMAGE_TOTAL_TARGET_BYTES = 1500 * 1024
const RESPONSES_INLINE_IMAGE_MIN_TARGET_BYTES = 220 * 1024
const RESPONSES_INLINE_IMAGE_MIN_DIMENSION = 768
const RESPONSES_INLINE_IMAGE_MIN_QUALITY = 0.55
const DEBUG_STRING_PREVIEW_LIMIT = 1200
const DEBUG_ARRAY_ITEM_LIMIT = 10
const DEBUG_OBJECT_KEY_LIMIT = 30
const RESPONSES_PROMPT_REVISION_COMPAT_PREFIX = [
  '兼容模式要求：不要改写、重排、总结、翻译、润色或省略下面的“原始提示词”内容。',
  '请保留原始提示词中的段落结构、列表、标签、代码块、正向/负向要求、参数描述与措辞重点，并尽量按原文语义直接执行。',
  '原始提示词如下：',
].join('\n')

export function isHttpUrl(value: unknown): value is string {
  return typeof value === 'string' && /^https?:\/\//i.test(value)
}

export function normalizeBase64Image(value: string, fallbackMime: string): string {
  return value.startsWith('data:') ? value : `data:${fallbackMime};base64,${value}`
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function isDataUrl(value: string): boolean {
  return /^data:/i.test(value)
}

async function blobToDataUrl(blob: Blob, fallbackMime: string): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''

  for (let index = 0; index < bytes.length; index += 0x8000) {
    const chunk = bytes.subarray(index, index + 0x8000)
    binary += String.fromCharCode(...chunk)
  }

  return `data:${blob.type || fallbackMime};base64,${btoa(binary)}`
}

export async function fetchImageUrlAsDataUrl(
  url: string,
  fallbackMime: string,
  signal: AbortSignal,
): Promise<string> {
  const response = await fetch(url, {
    cache: 'no-store',
    signal,
  })

  if (!response.ok) {
    throw new Error(`图片 URL 下载失败：HTTP ${response.status}`)
  }

  return blobToDataUrl(await response.blob(), fallbackMime)
}

export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl)
  return response.blob()
}

export function getDataUrlByteSize(dataUrl: string): number {
  const base64 = dataUrl.split(',')[1] || ''
  const paddingLength = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0
  return Math.max(0, Math.floor((base64.length * 3) / 4) - paddingLength)
}

export function shouldUseSplitResponsesStreamPath(): boolean {
  return true
}

async function loadImageElement(src: string): Promise<HTMLImageElement> {
  return await new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('参考图解析失败'))
    image.src = src
  })
}

async function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return await new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('参考图压缩失败'))
        return
      }
      resolve(blob)
    }, type, quality)
  })
}

export async function shrinkDataUrlForResponses(
  dataUrl: string,
  targetBytes = RESPONSES_INLINE_IMAGE_TARGET_BYTES,
): Promise<string> {
  const originalBytes = getDataUrlByteSize(dataUrl)
  const image = await loadImageElement(dataUrl)
  const largestSide = Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height)

  if (originalBytes <= targetBytes && largestSide <= RESPONSES_INLINE_IMAGE_MAX_DIMENSION) {
    return dataUrl
  }

  let scale = Math.min(1, RESPONSES_INLINE_IMAGE_MAX_DIMENSION / Math.max(largestSide, 1))
  let quality = 0.82
  let bestDataUrl = dataUrl
  let bestBytes = originalBytes

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale))
    const height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height

    const context = canvas.getContext('2d')
    if (!context) {
      return dataUrl
    }

    context.drawImage(image, 0, 0, width, height)

    const blob = await canvasToBlob(canvas, 'image/webp', quality)
    const nextDataUrl = await blobToDataUrl(blob, 'image/webp')
    const nextBytes = getDataUrlByteSize(nextDataUrl)

    if (nextBytes < bestBytes) {
      bestDataUrl = nextDataUrl
      bestBytes = nextBytes
    }

    if (nextBytes <= targetBytes) {
      return nextDataUrl
    }

    const currentLargestSide = Math.max(width, height)
    if (
      currentLargestSide <= RESPONSES_INLINE_IMAGE_MIN_DIMENSION &&
      quality <= RESPONSES_INLINE_IMAGE_MIN_QUALITY
    ) {
      break
    }

    scale *= 0.82
    quality = Math.max(RESPONSES_INLINE_IMAGE_MIN_QUALITY, quality - 0.08)
  }

  return bestDataUrl
}

export async function shrinkImageAndMaskForResponses(
  imageDataUrl: string,
  maskDataUrl: string,
  targetTotalBytes = RESPONSES_INLINE_IMAGE_TOTAL_TARGET_BYTES,
): Promise<{ imageDataUrl: string; maskDataUrl: string }> {
  const originalImageBytes = getDataUrlByteSize(imageDataUrl)
  const originalMaskBytes = getDataUrlByteSize(maskDataUrl)
  const sourceImage = await loadImageElement(imageDataUrl)
  const maskImage = await loadImageElement(maskDataUrl)
  const largestSide = Math.max(
    sourceImage.naturalWidth || sourceImage.width,
    sourceImage.naturalHeight || sourceImage.height,
  )

  if (
    originalImageBytes + originalMaskBytes <= targetTotalBytes &&
    largestSide <= RESPONSES_INLINE_IMAGE_MAX_DIMENSION
  ) {
    return { imageDataUrl, maskDataUrl }
  }

  let scale = Math.min(1, RESPONSES_INLINE_IMAGE_MAX_DIMENSION / Math.max(largestSide, 1))
  let quality = 0.82
  let bestImageDataUrl = imageDataUrl
  let bestMaskDataUrl = maskDataUrl
  let bestTotalBytes = originalImageBytes + originalMaskBytes

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const width = Math.max(1, Math.round((sourceImage.naturalWidth || sourceImage.width) * scale))
    const height = Math.max(1, Math.round((sourceImage.naturalHeight || sourceImage.height) * scale))

    const imageCanvas = document.createElement('canvas')
    imageCanvas.width = width
    imageCanvas.height = height
    const imageContext = imageCanvas.getContext('2d')
    if (!imageContext) {
      return { imageDataUrl, maskDataUrl }
    }
    imageContext.drawImage(sourceImage, 0, 0, width, height)

    const maskCanvas = document.createElement('canvas')
    maskCanvas.width = width
    maskCanvas.height = height
    const maskContext = maskCanvas.getContext('2d')
    if (!maskContext) {
      return { imageDataUrl, maskDataUrl }
    }
    maskContext.imageSmoothingEnabled = false
    maskContext.clearRect(0, 0, width, height)
    maskContext.drawImage(maskImage, 0, 0, width, height)

    const nextImageDataUrl = await blobToDataUrl(
      await canvasToBlob(imageCanvas, 'image/webp', quality),
      'image/webp',
    )
    const nextMaskDataUrl = await blobToDataUrl(
      await canvasToBlob(maskCanvas, 'image/png'),
      'image/png',
    )
    const nextTotalBytes = getDataUrlByteSize(nextImageDataUrl) + getDataUrlByteSize(nextMaskDataUrl)

    if (nextTotalBytes < bestTotalBytes) {
      bestImageDataUrl = nextImageDataUrl
      bestMaskDataUrl = nextMaskDataUrl
      bestTotalBytes = nextTotalBytes
    }

    if (nextTotalBytes <= targetTotalBytes) {
      return {
        imageDataUrl: nextImageDataUrl,
        maskDataUrl: nextMaskDataUrl,
      }
    }

    const currentLargestSide = Math.max(width, height)
    if (
      currentLargestSide <= RESPONSES_INLINE_IMAGE_MIN_DIMENSION &&
      quality <= RESPONSES_INLINE_IMAGE_MIN_QUALITY
    ) {
      break
    }

    scale *= 0.82
    quality = Math.max(RESPONSES_INLINE_IMAGE_MIN_QUALITY, quality - 0.08)
  }

  return {
    imageDataUrl: bestImageDataUrl,
    maskDataUrl: bestMaskDataUrl,
  }
}

export async function normalizeEditMaskForProvider(maskDataUrl: string): Promise<string> {
  const maskImage = await loadImageElement(maskDataUrl)
  const width = Math.max(1, maskImage.naturalWidth || maskImage.width)
  const height = Math.max(1, maskImage.naturalHeight || maskImage.height)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const context = canvas.getContext('2d')
  if (!context) {
    return maskDataUrl
  }

  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, width, height)
  context.globalCompositeOperation = 'destination-out'
  context.drawImage(maskImage, 0, 0, width, height)
  context.globalCompositeOperation = 'source-over'

  return canvas.toDataURL('image/png')
}

export function getFileExtensionFromMime(mimeType: string): string {
  const subtype = mimeType.split('/')[1]?.toLowerCase()
  if (!subtype) {
    return 'png'
  }
  if (subtype === 'jpeg') {
    return 'jpg'
  }
  return subtype
}

export async function emitFinalImages(
  opts: CallApiOptions,
  images: string[],
): Promise<void> {
  if (!images.length || typeof opts.onFinalImages !== 'function') {
    return
  }

  // 增量图片同步属于本地辅助流程，不能反向中断真实 API 请求。
  try {
    await opts.onFinalImages(images)
  } catch (error) {
    console.warn('图片增量回调失败，已回退到最终结果同步。', error)
  }
}

export function createApiError(
  message: string,
  status?: number,
  extras?: Partial<Pick<ApiError, 'requestId' | 'details'>>,
): ApiError {
  const error = new Error(message) as ApiError
  if (status != null) {
    error.status = status
  }
  if (extras?.requestId) {
    error.requestId = extras.requestId
  }
  if (extras?.details !== undefined) {
    error.details = extras.details
  }
  return error
}

function createAbortError(message = '任务已中止'): Error {
  const error = new Error(message)
  error.name = 'AbortError'
  return error
}

function getAbortSignalMessage(signal: AbortSignal): string {
  const reason = signal.reason
  if (reason === 'timeout') {
    return '请求超时，已自动中止'
  }
  return '任务已中止'
}

function throwIfSignalAborted(signal: AbortSignal, message?: string): void {
  if (signal.aborted) {
    throw createAbortError(message ?? getAbortSignalMessage(signal))
  }
}

export function readDevProxyRequestId(headers: Headers): string | undefined {
  const requestId = headers.get(DEV_PROXY_REQUEST_ID_HEADER)?.trim()
  return requestId || undefined
}

export function isSseResponse(response: Response): boolean {
  const contentType = response.headers.get('content-type')?.toLowerCase() || ''
  return contentType.includes('text/event-stream')
}

export function summarizeDebugString(value: string): string {
  if (/^Bearer\s+/i.test(value)) {
    return '[REDACTED_BEARER_TOKEN]'
  }

  if (value.startsWith('data:')) {
    const mime = /^data:([^;,]+)[^,]*,/.exec(value)?.[1] || 'unknown'
    return `[data-url mime=${mime} length=${value.length}]`
  }

  if (/^[A-Za-z0-9+/=]{600,}$/.test(value)) {
    return `[base64 length=${value.length}]`
  }

  if (value.length > DEBUG_STRING_PREVIEW_LIMIT) {
    return `${value.slice(0, DEBUG_STRING_PREVIEW_LIMIT)}...[truncated ${value.length - DEBUG_STRING_PREVIEW_LIMIT} chars]`
  }

  return value
}

export function sanitizeDebugValue(value: unknown, depth = 0, visited?: WeakSet<object>): unknown {
  if (value == null || typeof value === 'boolean' || typeof value === 'number') {
    return value
  }

  if (typeof value === 'string') {
    return summarizeDebugString(value)
  }

  if (depth >= 5) {
    return '[max-depth-reached]'
  }

  const nextVisited = visited ?? new WeakSet<object>()
  if (typeof value === 'object' && value !== null) {
    if (nextVisited.has(value)) {
      return '[circular]'
    }
    nextVisited.add(value)
  }

  if (isRecord(value) && hasUsableImagePayload(value)) {
    const compact: Record<string, unknown> = {}
    const passthroughKeys = [
      'type',
      'id',
      'status',
      'size',
      'quality',
      'output_format',
      'background',
      'action',
      'revised_prompt',
    ] as const

    for (const key of passthroughKeys) {
      const fieldValue = value[key]
      if (typeof fieldValue === 'string' && fieldValue) {
        compact[key] = summarizeDebugString(fieldValue)
      }
    }

    if (typeof value.b64_json === 'string' && value.b64_json) {
      compact.b64_json = summarizeDebugString(value.b64_json)
    }
    if (typeof value.result === 'string' && value.result) {
      compact.result = summarizeDebugString(value.result)
    }
    if (typeof value.url === 'string' && value.url) {
      compact.url = summarizeDebugString(value.url)
    }
    if (typeof value.image_url === 'string' && value.image_url) {
      compact.image_url = summarizeDebugString(value.image_url)
    }

    return compact
  }

  if (Array.isArray(value)) {
    const items = value
      .slice(0, DEBUG_ARRAY_ITEM_LIMIT)
      .map((item) => sanitizeDebugValue(item, depth + 1, nextVisited))

    if (value.length > DEBUG_ARRAY_ITEM_LIMIT) {
      items.push(`[+${value.length - DEBUG_ARRAY_ITEM_LIMIT} more items]`)
    }

    return items
  }

  if (isRecord(value)) {
    const entries = Object.entries(value)
    const nextValue = Object.fromEntries(
      entries
        .slice(0, DEBUG_OBJECT_KEY_LIMIT)
        .map(([key, nestedValue]) => [key, sanitizeDebugValue(nestedValue, depth + 1, nextVisited)] as const),
    )

    if (entries.length > DEBUG_OBJECT_KEY_LIMIT) {
      nextValue.__truncatedKeys = entries.length - DEBUG_OBJECT_KEY_LIMIT
    }

    return nextValue
  }

  return String(value)
}

export function buildCompactResponsesPayload(
  response: Record<string, unknown>,
  outputOverride?: unknown[],
): Record<string, unknown> {
  const compact: Record<string, unknown> = {}

  if (typeof response.id === 'string' && response.id) {
    compact.id = response.id
  }
  if (typeof response.object === 'string' && response.object) {
    compact.object = response.object
  }
  if (typeof response.created_at === 'number' && Number.isFinite(response.created_at)) {
    compact.created_at = response.created_at
  }
  if (typeof response.status === 'string' && response.status) {
    compact.status = response.status
  }
  if (typeof response.model === 'string' && response.model) {
    compact.model = response.model
  }
  if (isRecord(response.error)) {
    compact.error = response.error
  }

  const output = outputOverride ?? (Array.isArray(response.output) ? response.output : [])
  if (output.length > 0) {
    compact.output = output
  }

  return Object.keys(compact).length > 0 ? compact : { output }
}

function compactResponsesPayloadIfNeeded(payload: unknown): unknown {
  if (!isRecord(payload)) {
    return payload
  }

  if (payload.type === 'response.completed' && isRecord(payload.response)) {
    return buildCompactResponsesPayload(payload.response)
  }

  if (Array.isArray(payload.output)) {
    return buildCompactResponsesPayload(payload)
  }

  return payload
}

function summarizeRequestHeadersForDebug(headers: Record<string, string>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [
      key,
      /authorization|api[-_]?key|token|secret|password/i.test(key)
        ? '[REDACTED]'
        : summarizeDebugString(value),
    ]),
  )
}

function summarizeInputImageForDebug(
  value: string,
  index: number,
): NonNullable<ApiDebugRequestSnapshot['inputImages']>[number] {
  if (isDataUrl(value)) {
    const mime = /^data:([^;,]+)[^,]*,/.exec(value)?.[1] || null
    return {
      index,
      kind: 'data_url',
      mime,
      sizeBytes: getDataUrlByteSize(value),
    }
  }

  if (isHttpUrl(value)) {
    return {
      index,
      kind: 'remote_url',
      url: value,
    }
  }

  return {
    index,
    kind: 'unknown',
  }
}

function summarizeMaskForDebug(
  value: string | undefined,
): NonNullable<ApiDebugRequestSnapshot['editMask']> {
  if (!value) {
    return {
      present: false,
      kind: 'unknown',
    }
  }

  const baseSummary = summarizeInputImageForDebug(value, 0)
  return {
    ...baseSummary,
    present: true,
  }
}

function buildLocalDebugRequestSnapshot(opts: CallApiOptions): ApiDebugRequestSnapshot {
  return {
    baseUrl: opts.settings.baseUrl,
    requestMode: opts.settings.requestMode,
    apiProtocol: getApiProtocol(opts.settings),
    model: opts.settings.model,
    responsesImageModel: opts.settings.responsesImageModel || null,
    responsesTransport: opts.settings.responsesTransport || null,
    responsesImageInputMode: opts.settings.responsesImageInputMode || null,
    responsesPromptRevisionMode: opts.settings.responsesPromptRevisionMode || null,
    prompt: opts.prompt,
    params: opts.params,
    inputImages: opts.inputImageDataUrls.map((value, index) => summarizeInputImageForDebug(value, index)),
    editMask: summarizeMaskForDebug(opts.editMaskDataUrl),
  }
}

export function createDebugRequestLogEntry(
  ctx: SharedRequestContext,
  stage: string,
  method: string,
  url: string,
  requestBody?: unknown,
): ApiDebugRequestLogEntry {
  const entry: ApiDebugRequestLogEntry = {
    stage,
    method,
    url,
    requestHeaders: summarizeRequestHeadersForDebug(ctx.requestHeaders),
    requestBody: requestBody === undefined ? null : sanitizeDebugValue(requestBody),
    responseStatus: null,
    responseRequestId: null,
    responseBody: null,
    responseText: null,
  }
  ctx.debugLog.push(entry)
  return entry
}

export function attachDebugResponseMeta(
  entry: ApiDebugRequestLogEntry | undefined,
  response: Response,
): string | undefined {
  const requestId = readDevProxyRequestId(response.headers)
  if (entry) {
    entry.responseStatus = response.status
    entry.responseRequestId = requestId || null
  }
  return requestId
}

export function attachLocalDebugToError(
  error: unknown,
  opts: CallApiOptions,
  requestLog: ApiDebugRequestLogEntry[],
): ApiError {
  const apiError =
    error instanceof Error ? (error as ApiError) : createApiError(typeof error === 'string' ? error : String(error))

  if (isRecord(apiError.details) && isRecord(apiError.details.localDebug)) {
    return apiError
  }

  const localDebug: TaskErrorDebugInfo = {
    createdAt: Date.now(),
    requestId: apiError.requestId || null,
    status: typeof apiError.status === 'number' ? apiError.status : null,
    requestMode: opts.settings.requestMode,
    apiProtocol: getApiProtocol(opts.settings),
    baseUrl: opts.settings.baseUrl,
    model: opts.settings.model,
    responsesImageModel: opts.settings.responsesImageModel || null,
    responsesTransport: opts.settings.responsesTransport || null,
    responsesImageInputMode: opts.settings.responsesImageInputMode || null,
    responsesPromptRevisionMode: opts.settings.responsesPromptRevisionMode || null,
    request: buildLocalDebugRequestSnapshot(opts),
    requestLog: requestLog.length > 0 ? requestLog : null,
    failure: {
      message: apiError.message,
      status: typeof apiError.status === 'number' ? apiError.status : null,
      requestId: apiError.requestId || null,
      details: apiError.details,
    },
    details: apiError.details,
  }

  apiError.details = {
    localDebug,
  }
  return apiError
}

function tryParseJson(text: string): unknown | undefined {
  const trimmed = text.trim()
  if (!trimmed) {
    return undefined
  }

  try {
    return JSON.parse(trimmed)
  } catch {
    return undefined
  }
}

function parseSseEvents(text: string): ParsedSseEvent[] {
  return feedIncrementalSseParser(createIncrementalSseParserState(), text, true)
}

interface IncrementalSseParserOptions {
  deferJsonParsing?: boolean
  discardPartialImageData?: boolean
}

interface IncrementalSseParserState {
  buffer: string
  event: string
  dataLines: string[]
  hasData: boolean
}

function createIncrementalSseParserState(): IncrementalSseParserState {
  return {
    buffer: '',
    event: 'message',
    dataLines: [],
    hasData: false,
  }
}

function isPartialImageSseEventName(event: string): boolean {
  return event.includes('partial_image')
}

function shouldCollectSseEventData(
  event: string,
  options?: IncrementalSseParserOptions,
): boolean {
  if (isPartialImageSseEventName(event)) {
    return !options?.discardPartialImageData
  }

  return true
}

function flushIncrementalSseEvent(
  state: IncrementalSseParserState,
  options?: IncrementalSseParserOptions,
): ParsedSseEvent | null {
  const event = state.event || 'message'
  const hasData = state.hasData
  const dataText = hasData && shouldCollectSseEventData(event, options) ? state.dataLines.join('\n') : ''
  state.event = 'message'
  state.dataLines = []
  state.hasData = false
  if (!hasData) {
    return null
  }

  return {
    event,
    dataText,
    json:
      isPartialImageSseEventName(event) || options?.deferJsonParsing
        ? undefined
        : tryParseJson(dataText),
  }
}

function processIncrementalSseLine(
  state: IncrementalSseParserState,
  line: string,
  options?: IncrementalSseParserOptions,
): ParsedSseEvent | null {
  if (!line) {
    return flushIncrementalSseEvent(state, options)
  }

  if (line.startsWith('event:')) {
    state.event = line.slice(6).trim() || 'message'
    return null
  }

  if (line.startsWith('data:')) {
    state.hasData = true
    if (shouldCollectSseEventData(state.event, options)) {
      state.dataLines.push(line.slice(5).trimStart())
    }
  }

  return null
}

function feedIncrementalSseParser(
  state: IncrementalSseParserState,
  chunk: string,
  flush = false,
  options?: IncrementalSseParserOptions,
): ParsedSseEvent[] {
  state.buffer += chunk.replace(/\r\n/g, '\n')
  const events: ParsedSseEvent[] = []

  while (true) {
    const newlineIndex = state.buffer.indexOf('\n')
    if (newlineIndex < 0) {
      break
    }

    const line = state.buffer.slice(0, newlineIndex)
    state.buffer = state.buffer.slice(newlineIndex + 1)
    const nextEvent = processIncrementalSseLine(state, line, options)
    if (nextEvent) {
      events.push(nextEvent)
    }
  }

  if (flush) {
    if (state.buffer) {
      const finalEvent = processIncrementalSseLine(state, state.buffer, options)
      state.buffer = ''
      if (finalEvent) {
        events.push(finalEvent)
      }
    }

    const trailingEvent = flushIncrementalSseEvent(state, options)
    if (trailingEvent) {
      events.push(trailingEvent)
    }
  }

  return events
}

function buildResponsesStreamEventPayloadForImages(
  payload: Record<string, unknown>,
): Record<string, unknown> | null {
  if (payload.type === 'response.output_item.done' && isRecord(payload.item)) {
    return { output: [payload.item] }
  }

  if (payload.type === 'response.completed' && isRecord(payload.response)) {
    return buildCompactResponsesPayload(payload.response)
  }

  return null
}

function extractSseImageStringField(dataText: string, fieldName: string): string | undefined {
  const marker = `"${fieldName}":"`
  const markerIndex = dataText.indexOf(marker)
  if (markerIndex < 0) {
    return undefined
  }

  const valueStart = markerIndex + marker.length
  let index = valueStart
  let escaped = false

  while (index < dataText.length) {
    const char = dataText[index]
    if (escaped) {
      escaped = false
      index += 1
      continue
    }

    if (char === '\\') {
      escaped = true
      index += 1
      continue
    }

    if (char === '"') {
      return dataText.slice(valueStart, index)
    }

    index += 1
  }

  return undefined
}

function extractSseImageNumberField(dataText: string, fieldName: string): number | undefined {
  const match = dataText.match(new RegExp(`"${fieldName}":(-?\\d+)`))
  if (!match) {
    return undefined
  }

  const parsed = Number(match[1])
  return Number.isFinite(parsed) ? parsed : undefined
}

function parseResponsesOutputDoneImageEvent(event: ParsedSseEvent): ResponsesStreamImageEvent | null {
  if (event.event !== 'response.output_item.done' || !event.dataText) {
    return null
  }

  const base64 =
    extractSseImageStringField(event.dataText, 'result') ??
    extractSseImageStringField(event.dataText, 'b64_json')
  if (!base64) {
    return null
  }

  return {
    event: event.event,
    itemId: extractSseImageStringField(event.dataText, 'id'),
    outputIndex: extractSseImageNumberField(event.dataText, 'output_index'),
    outputFormat: extractSseImageStringField(event.dataText, 'output_format'),
    background: extractSseImageStringField(event.dataText, 'background'),
    base64,
    isPartial: false,
  }
}

function sanitizeResponsesOutputItemFromDataText(dataText: string): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {
    type: 'image_generation_call',
  }

  const id = extractSseImageStringField(dataText, 'id')
  if (id) sanitized.id = id

  const status = extractSseImageStringField(dataText, 'status')
  if (status) sanitized.status = status

  const size = extractSseImageStringField(dataText, 'size')
  if (size) sanitized.size = size

  const quality = extractSseImageStringField(dataText, 'quality')
  if (quality) sanitized.quality = quality

  const outputFormat = extractSseImageStringField(dataText, 'output_format')
  if (outputFormat) sanitized.output_format = outputFormat

  const background = extractSseImageStringField(dataText, 'background')
  if (background) sanitized.background = background

  const action = extractSseImageStringField(dataText, 'action')
  if (action) sanitized.action = action

  const revisedPrompt = extractSseImageStringField(dataText, 'revised_prompt')
  if (revisedPrompt) sanitized.revised_prompt = revisedPrompt

  const outputIndex = extractSseImageNumberField(dataText, 'output_index')
  if (typeof outputIndex === 'number') {
    sanitized.output_index = outputIndex
  }

  return sanitized
}

function extractResponsesCompletedMetaFromDataText(dataText: string): Record<string, unknown> {
  const compact: Record<string, unknown> = {}

  const id = extractSseImageStringField(dataText, 'id')
  if (id) compact.id = id

  const status = extractSseImageStringField(dataText, 'status')
  if (status) compact.status = status

  const model = extractSseImageStringField(dataText, 'model')
  if (model) compact.model = model

  const createdAt = extractSseImageNumberField(dataText, 'created_at')
  if (typeof createdAt === 'number') {
    compact.created_at = createdAt
  }

  return compact
}

function buildImagePayloadFromStreamImageEvent(
  streamEvent: ResponsesStreamImageEvent,
): Record<string, unknown> | null {
  if (!streamEvent.base64) {
    return null
  }

  const item: Record<string, unknown> = {
    type: 'image_generation_call',
    status: streamEvent.isPartial ? 'in_progress' : 'completed',
  }

  if (streamEvent.itemId) {
    item.id = streamEvent.itemId
  }
  if (streamEvent.outputFormat) {
    item.output_format = streamEvent.outputFormat
  }
  if (streamEvent.background) {
    item.background = streamEvent.background
  }
  if (typeof streamEvent.outputIndex === 'number') {
    item.output_index = streamEvent.outputIndex
  }

  if (streamEvent.isPartial) {
    item.partial_image_b64 = streamEvent.base64
  } else {
    item.result = streamEvent.base64
  }

  return {
    output: [item],
  }
}

function sanitizeResponsesOutputItem(item: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {}

  if (typeof item.id === 'string' && item.id) sanitized.id = item.id
  if (typeof item.type === 'string' && item.type) sanitized.type = item.type
  if (typeof item.status === 'string' && item.status) sanitized.status = item.status
  if (typeof item.size === 'string' && item.size) sanitized.size = item.size
  if (typeof item.quality === 'string' && item.quality) sanitized.quality = item.quality
  if (typeof item.output_format === 'string' && item.output_format) sanitized.output_format = item.output_format
  if (typeof item.background === 'string' && item.background) sanitized.background = item.background
  if (typeof item.action === 'string' && item.action) sanitized.action = item.action
  if (typeof item.revised_prompt === 'string' && item.revised_prompt) sanitized.revised_prompt = item.revised_prompt

  return Object.keys(sanitized).length > 0 ? sanitized : { type: 'image_generation_call' }
}

function sanitizeResponsesCompletedResponse(response: Record<string, unknown>): Record<string, unknown> {
  return buildCompactResponsesPayload(response, [])
}

function buildLargeResponsesCompletedPayload(
  completedResponse: Record<string, unknown> | null,
  outputItems: Record<string, unknown>[],
  lastJsonPayload: Record<string, unknown> | null,
): unknown {
  if (completedResponse) {
    return buildCompactResponsesPayload(completedResponse, outputItems)
  }

  if (outputItems.length > 0) {
    return {
      output: outputItems,
    }
  }

  return lastJsonPayload ?? { output: [] }
}

function extractUpstreamErrorMessageFromDetails(details: unknown): string | null {
  if (!isRecord(details)) {
    return null
  }

  const upstreamResponse = details.upstream_response
  if (isRecord(upstreamResponse)) {
    return extractErrorMessage(upstreamResponse)
  }

  if (typeof upstreamResponse !== 'string' || !upstreamResponse.trim()) {
    return null
  }

  const parsedUpstreamResponse = tryParseJson(upstreamResponse)
  if (parsedUpstreamResponse !== undefined) {
    return extractErrorMessage(parsedUpstreamResponse)
  }

  return upstreamResponse.trim()
}

function extractErrorMessage(payload: unknown): string | null {
  if (!isRecord(payload)) {
    return null
  }

  const directMessage = payload.message
  if (typeof directMessage === 'string' && directMessage.trim()) {
    return directMessage
  }

  const directDetail = payload.detail
  if (typeof directDetail === 'string' && directDetail.trim()) {
    return directDetail
  }
  if (Array.isArray(directDetail)) {
    const detailText = directDetail
      .map((item) => {
        if (typeof item === 'string') {
          return item.trim()
        }
        if (isRecord(item)) {
          const nestedDetail = item.msg
          if (typeof nestedDetail === 'string') {
            return nestedDetail.trim()
          }
        }
        return ''
      })
      .filter(Boolean)
      .join('；')

    if (detailText) {
      return detailText
    }
  }

  const directUpstreamMessage = extractUpstreamErrorMessageFromDetails(payload.details)
  if (directUpstreamMessage) {
    return directUpstreamMessage
  }

  const error = payload.error
  if (isRecord(error)) {
    const upstreamMessage = extractUpstreamErrorMessageFromDetails(error.details)
    if (upstreamMessage) {
      return upstreamMessage
    }

    const nestedMessage = error.message
    if (typeof nestedMessage === 'string' && nestedMessage.trim()) {
      return nestedMessage
    }
  }

  return null
}

export async function buildApiErrorFromResponse(
  response: Response,
  logEntry?: ApiDebugRequestLogEntry,
): Promise<ApiError> {
  const requestId = attachDebugResponseMeta(logEntry, response)
  if (response.status === 524) {
    return createApiError(
      '上游站点处理超时（Cloudflare 524）。如果这次带了本地参考图，请优先改用公网图片 URL；若中转站支持 Responses 流式传输，也可优先启用 stream 模式后重试。',
      524,
      { requestId },
    )
  }

  let errorMessage = `HTTP ${response.status}`
  let responseBody: unknown = undefined
  let responseText: string | undefined

  try {
    const text = await response.text()
    const parsedPayload = tryParseJson(text)
    if (parsedPayload !== undefined) {
      responseBody = parsedPayload
      if (logEntry) {
        logEntry.responseBody = sanitizeDebugValue(parsedPayload)
      }
      errorMessage = extractErrorMessage(parsedPayload) || errorMessage
    } else if (text.trim()) {
      responseText = text
      if (logEntry) {
        logEntry.responseText = summarizeDebugString(text)
      }
      errorMessage = text
    }
  } catch {
    /* ignore */
  }

  const details: Record<string, unknown> = {}
  if (responseBody !== undefined) {
    details.responseBody = responseBody
  }
  if (responseText?.trim()) {
    details.responseText = responseText
  }

  return createApiError(errorMessage, response.status, {
    requestId,
    details: Object.keys(details).length > 0 ? details : undefined,
  })
}

function hasUsableImagePayload(item: Record<string, unknown>): boolean {
  if (typeof item.b64_json === 'string' && item.b64_json) {
    return true
  }
  if (typeof item.result === 'string' && item.result) {
    return true
  }
  if (typeof item.url === 'string' && item.url) {
    return true
  }
  if (typeof item.image_url === 'string' && item.image_url) {
    return true
  }

  return false
}

async function appendImageFromItem(
  images: string[],
  item: unknown,
  fallbackMime: string,
  signal: AbortSignal,
) {
  throwIfSignalAborted(signal)

  if (!isRecord(item)) {
    return
  }

  if (typeof item.type === 'string' && item.type.includes('partial_image')) {
    return
  }

  if (
    item.type === 'image_generation_call' &&
    typeof item.status === 'string' &&
    item.status !== 'completed' &&
    !hasUsableImagePayload(item)
  ) {
    return
  }

  const b64 = item.b64_json
  if (typeof b64 === 'string' && b64) {
    throwIfSignalAborted(signal)
    images.push(normalizeBase64Image(b64, fallbackMime))
    return
  }

  const result = item.result
  if (typeof result === 'string' && result) {
    throwIfSignalAborted(signal)
    images.push(normalizeBase64Image(result, fallbackMime))
    return
  }

  if (typeof item.url === 'string' && item.url) {
    if (isDataUrl(item.url)) {
      images.push(item.url)
      return
    }
    if (isHttpUrl(item.url)) {
      images.push(await fetchImageUrlAsDataUrl(item.url, fallbackMime, signal))
      return
    }
  }

  if (typeof item.image_url === 'string' && item.image_url) {
    if (isDataUrl(item.image_url)) {
      images.push(item.image_url)
      return
    }
    if (isHttpUrl(item.image_url)) {
      images.push(await fetchImageUrlAsDataUrl(item.image_url, fallbackMime, signal))
      return
    }
  }
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
    return [`b64_json:${item.b64_json}`]
  }
  if (typeof item.result === 'string' && item.result) {
    return [`result:${item.result}`]
  }
  if (typeof item.url === 'string' && item.url) {
    return [`url:${item.url}`]
  }
  if (typeof item.image_url === 'string' && item.image_url) {
    return [`image_url:${item.image_url}`]
  }
  return []
}

export async function emitNewImagesFromPayload(
  payload: unknown,
  fallbackMime: string,
  signal: AbortSignal,
  emittedImageSignatures: Set<string>,
  onImages?: (images: string[]) => void | Promise<void>,
): Promise<number> {
  throwIfSignalAborted(signal)

  if (typeof onImages !== 'function') {
    return 0
  }

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

  if (!itemsToEmit.length) {
    return 0
  }

  const images: string[] = []
  for (const item of itemsToEmit) {
    throwIfSignalAborted(signal)
    await appendImageFromItem(images, item, fallbackMime, signal)
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

interface ResponseImageGenerationCallMeta {
  id?: string
  status?: string
  size?: string
  quality?: string
  output_format?: string
  background?: string
  action?: string
  revised_prompt?: string
}

function readOptionalText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

function extractImageGenerationCallMeta(item: Record<string, unknown>): ResponseImageGenerationCallMeta | null {
  if (item.type !== 'image_generation_call') {
    return null
  }

  const call: ResponseImageGenerationCallMeta = {}

  const id = readOptionalText(item.id)
  if (id) call.id = id

  const status = readOptionalText(item.status)
  if (status) call.status = status

  const size = readOptionalText(item.size)
  if (size) call.size = size

  const quality = readOptionalText(item.quality)
  if (quality) call.quality = quality

  const outputFormat = readOptionalText(item.output_format)
  if (outputFormat) call.output_format = outputFormat

  const background = readOptionalText(item.background)
  if (background) call.background = background

  const action = readOptionalText(item.action)
  if (action) call.action = action

  const revisedPrompt = readOptionalText(item.revised_prompt)
  if (revisedPrompt) call.revised_prompt = revisedPrompt

  return Object.keys(call).length > 0 ? call : {}
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

export function buildAppliedTransportMeta(
  requested: ResponsesTransportMode,
  actual: NonNullable<AppliedTransportMeta['actual']>,
  fallbackFromStream: boolean,
): AppliedTransportMeta {
  return {
    requested,
    actual,
    fallbackFromStream,
  }
}

export function mergeTaskResponseMeta(
  baseMeta: TaskResponseMeta | undefined,
  transportMeta: AppliedTransportMeta,
): TaskResponseMeta {
  return {
    ...(baseMeta ?? {}),
    transport: transportMeta,
  }
}

export async function parseImagesFromPayload(
  payload: unknown,
  fallbackMime: string,
  signal: AbortSignal,
): Promise<string[]> {
  throwIfSignalAborted(signal)

  const images: string[] = []
  const imageItems: Record<string, unknown>[] = []

  forEachPayloadRecord(payload, (item) => {
    if (collectImageSignaturesFromItem(item).length > 0) {
      imageItems.push(item)
    }
  })

  for (const item of imageItems) {
    throwIfSignalAborted(signal)
    await appendImageFromItem(images, item, fallbackMime, signal)
  }

  return images
}

export function getApiProtocol(settings: AppSettings): ApiProtocol {
  return settings.apiProtocol === 'responses' ? 'responses' : 'images'
}

export function getResponsesImageModel(settings: AppSettings): string {
  return settings.responsesImageModel?.trim() || 'gpt-image-2'
}

export function getResponsesTransportMode(settings: AppSettings): ResponsesTransportMode {
  return settings.responsesTransport || 'auto'
}

export function getResponsesImageInputMode(settings: AppSettings): ResponsesImageInputMode {
  return settings.responsesImageInputMode || 'auto'
}

export function getResponsesPromptRevisionMode(settings: AppSettings): ResponsesPromptRevisionMode {
  return settings.responsesPromptRevisionMode === 'compat' ? 'compat' : 'allow'
}

export function buildResponsesPrompt(prompt: string, settings: AppSettings): string {
  if (getResponsesPromptRevisionMode(settings) !== 'compat') {
    return prompt
  }

  const trimmedPrompt = prompt.trim()
  if (!trimmedPrompt) {
    return prompt
  }

  return `${RESPONSES_PROMPT_REVISION_COMPAT_PREFIX}\n\n${prompt}`
}

export function buildRequestUrl(baseUrl: string, path: string, ctx: SharedRequestContext): string {
  return buildApiUrl(baseUrl, path, ctx.proxyConfig, { forceProxy: ctx.forceProxy })
}

export function shouldRetryResponsesWithCompatibility(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false
  }

  if (isResponsesRelayFailure(error)) {
    return false
  }

  const status = (error as ApiError).status
  if (status != null && [404, 405, 409, 415, 422, 500, 501].includes(status)) {
    return true
  }

  return /(?:HTTP 5\d{2}|tool(?:_choice)?|image_generation|response|internal|server error|input must be a list|input.*array|expected.*list|expected.*array|multipart|stream|sse|file_id|unknown parameter|invalid_request_error)/i.test(
    error.message,
  )
}

function isResponsesRelayFailure(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false
  }

  const status = (error as ApiError).status
  if (status === 524) {
    return true
  }

  return /(?:do_request_failed|upstream error|cloudflare|timeout occurred|timed out|auth_not_found|no auth available)/i.test(
    error.message,
  )
}

export function shouldFallbackResponsesStreamToJson(
  error: unknown,
  currentPlan: { transport: string },
  nextPlan?: { transport: string },
): boolean {
  if (currentPlan.transport !== 'stream' || nextPlan?.transport !== 'json') {
    return false
  }
  if (!(error instanceof Error)) {
    return false
  }
  if (error.name === 'AbortError' || /\babort(?:ed)?\b/i.test(error.message)) {
    return false
  }

  const status = (error as ApiError).status
  if (status != null && [401, 403, 429, 524].includes(status)) {
    return false
  }

  return !/(?:auth_not_found|no auth available|invalid api key|insufficient|quota)/i.test(error.message)
}

export function shouldFallbackImagesStreamToJson(
  error: unknown,
  currentPlan: ImagesRequestPlan,
  nextPlan?: ImagesRequestPlan,
): boolean {
  if (currentPlan.transport !== 'stream' || nextPlan?.transport !== 'json') {
    return false
  }
  if (!(error instanceof Error)) {
    return false
  }
  if (error.name === 'AbortError' || /\babort(?:ed)?\b/i.test(error.message)) {
    return false
  }

  const status = (error as ApiError).status
  if (status != null && [401, 403, 429, 524].includes(status)) {
    return false
  }

  return !/(?:auth_not_found|no auth available|invalid api key|insufficient|quota)/i.test(error.message)
}

export function shouldRetryNextImagesPlan(
  error: unknown,
  currentPlan: ImagesRequestPlan,
  nextPlan?: ImagesRequestPlan,
): boolean {
  if (!nextPlan || !(error instanceof Error)) {
    return false
  }

  if (currentPlan.transport === 'stream' && nextPlan.transport === 'json') {
    return shouldFallbackImagesStreamToJson(error, currentPlan, nextPlan)
  }

  if (error.name === 'AbortError' || /\babort(?:ed)?\b/i.test(error.message)) {
    return false
  }

  const status = (error as ApiError).status
  if (status != null && [401, 403, 429, 524].includes(status)) {
    return false
  }

  if (/(?:auth_not_found|no auth available|invalid api key|insufficient|quota)/i.test(error.message)) {
    return false
  }

  if (currentPlan.bodyMode === 'json' && nextPlan.bodyMode === 'multipart') {
    if (status != null && (status >= 500 || [400, 404, 405, 415, 422, 501].includes(status))) {
      return true
    }

    return /(?:接口未返回可用图片数据|no usable image|invalid_request|unsupported|not implemented|multipart|form|image\[\]|images\b)/i.test(
      error.message,
    )
  }

  if (currentPlan.transport !== 'json' || nextPlan.transport !== 'stream') {
    return false
  }

  if (status != null && (status >= 500 || [404, 405, 501].includes(status))) {
    return true
  }

  return /(?:接口未返回可用图片数据|no usable image|bad_response_body|unsupported|not implemented|stream|sse|server error|internal)/i.test(
    error.message,
  )
}

function isPayloadTooLargeError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false
  }

  const status = (error as ApiError).status
  if (status === 413) {
    return true
  }

  return /(?:payload too large|request entity too large|content too large|body too large|http 413)/i.test(
    error.message,
  )
}

export function shouldRetryResponsesWithFileId(
  error: unknown,
  imageInputMode: ResponsesImageInputMode,
  opts: CallApiOptions,
): boolean {
  if (imageInputMode !== 'auto') {
    return false
  }
  if (!isPayloadTooLargeError(error)) {
    return false
  }

  return opts.inputImageDataUrls.some((value) => isDataUrl(value)) || Boolean(opts.editMaskDataUrl)
}

function parseResponsesPayloadText(
  text: string,
  responseStatus: number,
  requestId: string | undefined,
  logEntry?: ApiDebugRequestLogEntry,
): unknown {
  const directJson = tryParseJson(text)
  if (directJson !== undefined) {
    const normalizedPayload = compactResponsesPayloadIfNeeded(directJson)
    if (logEntry) {
      logEntry.responseBody = sanitizeDebugValue(normalizedPayload)
    }
    return normalizedPayload
  }

  const sseEvents = parseSseEvents(text)
  if (!sseEvents.length) {
    if (logEntry && text.trim()) {
      logEntry.responseText = summarizeDebugString(text)
    }
    throw createApiError('Responses API 返回了非 JSON 响应，且不是可解析的 SSE 数据', responseStatus, {
      requestId,
      details: text.trim() ? { responseText: text } : undefined,
    })
  }

  const jsonPayloads = sseEvents
    .map((event) => event.json)
    .filter((payload): payload is Record<string, unknown> => isRecord(payload))
  const outputItems = jsonPayloads
    .filter((payload) => payload.type === 'response.output_item.done' && isRecord(payload.item))
    .map((payload) => payload.item as Record<string, unknown>)

  const failedPayload = [...jsonPayloads].reverse().find((payload) => {
    if (payload.type === 'response.failed') {
      return true
    }
    const nestedResponse = payload.response
    return isRecord(nestedResponse) && nestedResponse.status === 'failed'
  })

  if (failedPayload) {
    const nestedResponse = isRecord(failedPayload.response) ? failedPayload.response : null
    const message =
      extractErrorMessage(failedPayload) ||
      (nestedResponse ? extractErrorMessage(nestedResponse) : null) ||
      'Responses API 处理失败'
    if (logEntry) {
      logEntry.responseBody = sanitizeDebugValue(failedPayload)
    }
    throw createApiError(message, responseStatus, {
      requestId,
      details: {
        responseBody: failedPayload,
      },
    })
  }

  const completedPayload = [...jsonPayloads].reverse().find(
    (payload) => payload.type === 'response.completed' && isRecord(payload.response),
  )
  if (completedPayload && isRecord(completedPayload.response)) {
    const completedResponse = completedPayload.response as Record<string, unknown>
    const existingOutput = Array.isArray(completedResponse.output) ? completedResponse.output : []
    const normalizedOutput = outputItems.length > 0 ? outputItems : existingOutput
    const compactResponse = buildCompactResponsesPayload(completedResponse, normalizedOutput)
    if (logEntry) {
      logEntry.responseBody = sanitizeDebugValue(compactResponse)
    }
    return compactResponse
  }

  if (outputItems.length > 0) {
    return {
      output: outputItems,
    }
  }

  const lastJsonPayload = [...jsonPayloads].reverse().find(Boolean)
  if (lastJsonPayload) {
    if (logEntry) {
      logEntry.responseBody = sanitizeDebugValue(lastJsonPayload)
    }
    return lastJsonPayload
  }

  if (logEntry && text.trim()) {
    logEntry.responseText = summarizeDebugString(text)
  }
  throw createApiError('Responses API 返回了 SSE，但未包含可解析的 JSON 事件', responseStatus, {
    requestId,
    details: text.trim() ? { responseText: text } : undefined,
  })
}

export async function readResponsesPayload(
  response: Response,
  logEntry?: ApiDebugRequestLogEntry,
): Promise<unknown> {
  const text = await response.text()
  const requestId = attachDebugResponseMeta(logEntry, response)
  return parseResponsesPayloadText(text, response.status, requestId, logEntry)
}

function isImagesFailurePayload(payload: Record<string, unknown>): boolean {
  const type = readOptionalText(payload.type)
  if (type && /(?:^error$|failed$)/i.test(type)) {
    return true
  }

  return isRecord(payload.error)
}

function hasDirectImagePayload(payload: Record<string, unknown>): boolean {
  if (typeof payload.b64_json === 'string' && payload.b64_json) {
    return true
  }
  if (typeof payload.result === 'string' && payload.result) {
    return true
  }
  if (typeof payload.url === 'string' && payload.url && (isDataUrl(payload.url) || isHttpUrl(payload.url))) {
    return true
  }
  if (
    typeof payload.image_url === 'string' &&
    payload.image_url &&
    (isDataUrl(payload.image_url) || isHttpUrl(payload.image_url))
  ) {
    return true
  }

  return false
}

function isPartialImagePayloadType(type: unknown): boolean {
  return typeof type === 'string' && type.includes('partial_image')
}

function isCompletedImagesPayload(payload: Record<string, unknown>): boolean {
  const type = readOptionalText(payload.type)
  if (!type || isPartialImagePayloadType(type) || !hasDirectImagePayload(payload)) {
    return false
  }

  if (/^image_(?:generation|edit)\.completed$/i.test(type)) {
    return true
  }

  return /\.completed$/i.test(type)
}

function parseImagesPayloadText(
  text: string,
  responseStatus: number,
  requestId: string | undefined,
  logEntry?: ApiDebugRequestLogEntry,
): unknown {
  const directJson = tryParseJson(text)
  if (directJson !== undefined) {
    if (logEntry) {
      logEntry.responseBody = sanitizeDebugValue(directJson)
    }
    return directJson
  }

  const sseEvents = parseSseEvents(text)
  if (!sseEvents.length) {
    if (logEntry && text.trim()) {
      logEntry.responseText = summarizeDebugString(text)
    }
    throw createApiError('Images API 返回了非 JSON 响应，且不是可解析的 SSE 数据', responseStatus, {
      requestId,
      details: text.trim() ? { responseText: text } : undefined,
    })
  }

  const jsonPayloads = sseEvents
    .map((event) => event.json)
    .filter((payload): payload is Record<string, unknown> => isRecord(payload))

  const failedPayload = [...jsonPayloads].reverse().find((payload) => isImagesFailurePayload(payload))
  if (failedPayload) {
    const message = extractErrorMessage(failedPayload) || 'Images API 处理失败'
    if (logEntry) {
      logEntry.responseBody = sanitizeDebugValue(failedPayload)
    }
    throw createApiError(message, responseStatus, {
      requestId,
      details: {
        responseBody: failedPayload,
      },
    })
  }

  const completedItems = jsonPayloads.filter((payload) => isCompletedImagesPayload(payload))
  if (completedItems.length > 0) {
    const completedPayload = { data: completedItems }
    if (logEntry) {
      logEntry.responseBody = sanitizeDebugValue(completedPayload)
    }
    return completedPayload
  }

  const standaloneImages = jsonPayloads.filter(
    (payload) => payload.type == null && hasDirectImagePayload(payload),
  )
  if (standaloneImages.length > 0) {
    const standalonePayload = { data: standaloneImages }
    if (logEntry) {
      logEntry.responseBody = sanitizeDebugValue(standalonePayload)
    }
    return standalonePayload
  }

  const lastJsonPayload = [...jsonPayloads].reverse().find(Boolean)
  if (lastJsonPayload) {
    if (logEntry) {
      logEntry.responseBody = sanitizeDebugValue(lastJsonPayload)
    }
    return lastJsonPayload
  }

  if (logEntry && text.trim()) {
    logEntry.responseText = summarizeDebugString(text)
  }
  throw createApiError('Images API 返回了 SSE，但未包含可解析的 JSON 事件', responseStatus, {
    requestId,
    details: text.trim() ? { responseText: text } : undefined,
  })
}

export async function readImagesPayload(
  response: Response,
  logEntry?: ApiDebugRequestLogEntry,
): Promise<unknown> {
  const text = await response.text()
  const requestId = attachDebugResponseMeta(logEntry, response)
  return parseImagesPayloadText(text, response.status, requestId, logEntry)
}

async function consumeSseResponseText(
  response: Response,
  signal: AbortSignal,
  onEvent?: (event: ParsedSseEvent) => void | Promise<void>,
  options?: IncrementalSseParserOptions,
): Promise<{ text: string; sawAnyEvents: boolean }> {
  throwIfSignalAborted(signal)

  if (!response.body) {
    return {
      text: await response.text(),
      sawAnyEvents: false,
    }
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  const parserState = createIncrementalSseParserState()
  let text = ''
  let sawAnyEvents = false

  const readNextChunk = async (): Promise<ReadableStreamReadResult<Uint8Array>> => {
    throwIfSignalAborted(signal)

    return await new Promise<ReadableStreamReadResult<Uint8Array>>((resolve, reject) => {
      const onAbort = () => {
        void reader.cancel().catch(() => undefined)
        reject(createAbortError(getAbortSignalMessage(signal)))
      }

      signal.addEventListener('abort', onAbort, { once: true })
      reader
        .read()
        .then((result) => {
          signal.removeEventListener('abort', onAbort)
          resolve(result)
        })
        .catch((error) => {
          signal.removeEventListener('abort', onAbort)
          reject(error)
        })
    })
  }

  while (true) {
    const { done, value } = await readNextChunk()
    if (done) {
      break
    }

    throwIfSignalAborted(signal)
    const chunk = decoder.decode(value, { stream: true })
    const events = feedIncrementalSseParser(parserState, chunk, false, options)
    if (!sawAnyEvents && events.length === 0) {
      text += chunk
    }
    if (events.length > 0) {
      sawAnyEvents = true
      text = ''
    }
    if (typeof onEvent === 'function') {
      for (const event of events) {
        throwIfSignalAborted(signal)
        await onEvent(event)
      }
    }
  }

  throwIfSignalAborted(signal)
  const finalChunk = decoder.decode()
  const finalEvents = feedIncrementalSseParser(parserState, finalChunk, true, options)
  if (!sawAnyEvents && finalEvents.length === 0) {
    text += finalChunk
  }
  if (finalEvents.length > 0) {
    sawAnyEvents = true
    text = ''
  }
  if (typeof onEvent === 'function') {
    for (const event of finalEvents) {
      throwIfSignalAborted(signal)
      await onEvent(event)
    }
  }

  return { text, sawAnyEvents }
}

export async function readResponsesPayloadStream(
  response: Response,
  fallbackMime: string,
  signal: AbortSignal,
  useSplitStreamPath = false,
  logEntry?: ApiDebugRequestLogEntry,
): Promise<StreamedPayloadResult> {
  const requestId = attachDebugResponseMeta(logEntry, response)
  const emittedImageSignatures = new Set<string>()
  let streamedFinalImageCount = 0
  const streamedImages: string[] = []
  const outputItems: Record<string, unknown>[] = []
  let completedResponse: Record<string, unknown> | null = null
  let failedPayload: Record<string, unknown> | null = null
  let lastJsonPayload: Record<string, unknown> | null = null

  const { text, sawAnyEvents } = await consumeSseResponseText(
    response,
    signal,
    async (event) => {
      if (useSplitStreamPath) {
        if (isPartialImageSseEventName(event.event)) {
          return
        }

        const outputDoneImageEvent = parseResponsesOutputDoneImageEvent(event)
        if (outputDoneImageEvent?.base64) {
          const finalPayload = buildImagePayloadFromStreamImageEvent(outputDoneImageEvent)
          if (finalPayload) {
            streamedFinalImageCount += await emitNewImagesFromPayload(
              finalPayload,
              fallbackMime,
              signal,
              emittedImageSignatures,
              async (images) => {
                streamedImages.push(...images)
              },
            )
          }
        }
      }

      if (useSplitStreamPath && event.event === 'response.output_item.done' && event.dataText) {
        outputItems.push(sanitizeResponsesOutputItemFromDataText(event.dataText))
        return
      }
      if (useSplitStreamPath && event.event === 'response.completed' && event.dataText) {
        completedResponse = extractResponsesCompletedMetaFromDataText(event.dataText)
        if (completedResponse.status === 'failed') {
          failedPayload = {
            type: 'response.failed',
            response: completedResponse,
          }
        }
        return
      }

      const parsedJson =
        event.json ??
        (!isPartialImageSseEventName(event.event) && event.dataText ? tryParseJson(event.dataText) : undefined)

      if (!parsedJson || !isRecord(parsedJson)) {
        return
      }

      lastJsonPayload = parsedJson

      if (parsedJson.type === 'response.output_item.done' && isRecord(parsedJson.item)) {
        const outputItem = parsedJson.item as Record<string, unknown>
        outputItems.push(useSplitStreamPath ? sanitizeResponsesOutputItem(outputItem) : outputItem)
      }
      if (parsedJson.type === 'response.completed' && isRecord(parsedJson.response)) {
        completedResponse = useSplitStreamPath
          ? sanitizeResponsesCompletedResponse(parsedJson.response as Record<string, unknown>)
          : (parsedJson.response as Record<string, unknown>)
      }
      if (
        parsedJson.type === 'response.failed' ||
        (isRecord(parsedJson.response) && parsedJson.response.status === 'failed')
      ) {
        failedPayload = parsedJson
      }

      const imagePayload = buildResponsesStreamEventPayloadForImages(parsedJson)
      if (!imagePayload) {
        return
      }

      streamedFinalImageCount += await emitNewImagesFromPayload(
        imagePayload,
        fallbackMime,
        signal,
        emittedImageSignatures,
        async (images) => {
          streamedImages.push(...images)
        },
      )
    },
    useSplitStreamPath
      ? {
          deferJsonParsing: true,
          discardPartialImageData: true,
        }
      : undefined,
  )

  if (sawAnyEvents) {
    if (failedPayload !== null) {
      const currentFailedPayload = failedPayload as Record<string, unknown>
      const nestedResponse = isRecord(currentFailedPayload.response) ? currentFailedPayload.response : null
      const message =
        extractErrorMessage(currentFailedPayload) ||
        (nestedResponse ? extractErrorMessage(nestedResponse) : null) ||
        'Responses API 处理失败'
      if (logEntry) {
        logEntry.responseBody = sanitizeDebugValue(currentFailedPayload)
      }
      throw createApiError(message, response.status, {
        requestId,
        details: {
          responseBody: currentFailedPayload,
        },
      })
    }

    let payload: unknown
    if (useSplitStreamPath) {
      payload = buildLargeResponsesCompletedPayload(completedResponse, outputItems, lastJsonPayload)
    } else if (completedResponse !== null) {
      const currentCompletedResponse = completedResponse as Record<string, unknown>
      const existingOutput = Array.isArray(currentCompletedResponse.output)
        ? currentCompletedResponse.output
        : []
      payload = buildCompactResponsesPayload(
        currentCompletedResponse,
        outputItems.length > 0 ? outputItems : existingOutput,
      )
    } else if (outputItems.length > 0) {
      payload = { output: outputItems }
    } else if (lastJsonPayload) {
      payload = lastJsonPayload
    } else {
      payload = parseResponsesPayloadText(text, response.status, requestId, logEntry)
    }

    if (logEntry) {
      logEntry.responseBody = sanitizeDebugValue(payload)
    }

    return {
      payload,
      streamedFinalImageCount,
      streamedImages,
      actualTransport: 'stream',
    }
  }

  return {
    payload: parseResponsesPayloadText(text, response.status, requestId, logEntry),
    streamedFinalImageCount,
    streamedImages,
    actualTransport: sawAnyEvents ? 'stream' : 'json',
  }
}

export async function readImagesPayloadStream(
  response: Response,
  fallbackMime: string,
  signal: AbortSignal,
  logEntry?: ApiDebugRequestLogEntry,
): Promise<StreamedPayloadResult> {
  const requestId = attachDebugResponseMeta(logEntry, response)
  const emittedImageSignatures = new Set<string>()
  let streamedFinalImageCount = 0
  const streamedImages: string[] = []
  const completedItems: Record<string, unknown>[] = []
  const standaloneImages: Record<string, unknown>[] = []
  let failedPayload: Record<string, unknown> | null = null
  let lastJsonPayload: Record<string, unknown> | null = null

  const { text, sawAnyEvents } = await consumeSseResponseText(response, signal, async (event) => {
    if (!event.json || !isRecord(event.json)) {
      return
    }

    lastJsonPayload = event.json

    if (isImagesFailurePayload(event.json)) {
      failedPayload = event.json
    } else if (isCompletedImagesPayload(event.json)) {
      completedItems.push(event.json)
    } else if (event.json.type == null && hasDirectImagePayload(event.json)) {
      standaloneImages.push(event.json)
    }

    streamedFinalImageCount += await emitNewImagesFromPayload(
      event.json,
      fallbackMime,
      signal,
      emittedImageSignatures,
      async (images) => {
        streamedImages.push(...images)
      },
    )
  })

  if (sawAnyEvents) {
    if (failedPayload) {
      const message = extractErrorMessage(failedPayload) || 'Images API 处理失败'
      if (logEntry) {
        logEntry.responseBody = sanitizeDebugValue(failedPayload)
      }
      throw createApiError(message, response.status, {
        requestId,
        details: {
          responseBody: failedPayload,
        },
      })
    }

    let payload: unknown
    if (completedItems.length > 0) {
      payload = { data: completedItems }
    } else if (standaloneImages.length > 0) {
      payload = { data: standaloneImages }
    } else if (lastJsonPayload) {
      payload = lastJsonPayload
    } else {
      payload = parseImagesPayloadText(text, response.status, requestId, logEntry)
    }

    if (logEntry) {
      logEntry.responseBody = sanitizeDebugValue(payload)
    }

    return {
      payload,
      streamedFinalImageCount,
      streamedImages,
      actualTransport: 'stream',
    }
  }

  return {
    payload: parseImagesPayloadText(text, response.status, requestId, logEntry),
    streamedFinalImageCount,
    streamedImages,
    actualTransport: sawAnyEvents ? 'stream' : 'json',
  }
}

function getPreferredResponsesTransports(settings: AppSettings): Array<'json' | 'stream'> {
  const mode = getResponsesTransportMode(settings)
  if (mode === 'stream') {
    // 对图片任务优先走最终 JSON，避免中转在 SSE 中回传超大 partial_image 事件把浏览器拖垮。
    return ['json', 'stream']
  }
  if (mode === 'json') {
    return ['json']
  }
  return ['json', 'stream']
}

export function buildImagesRequestPlans(
  settings: AppSettings,
  options?: { isEdit?: boolean },
): ImagesRequestPlan[] {
  const mode = getResponsesTransportMode(settings)
  const plans: ImagesRequestPlan[] = []

  if (options?.isEdit) {
    if (mode === 'json') {
      plans.push(
        { id: 'json-body-json', transport: 'json', bodyMode: 'json' },
        { id: 'multipart-body-json', transport: 'json', bodyMode: 'multipart' },
      )
    } else if (mode === 'stream') {
      plans.push(
        { id: 'json-body-json', transport: 'json', bodyMode: 'json' },
        { id: 'multipart-body-json', transport: 'json', bodyMode: 'multipart' },
        { id: 'json-body-stream', transport: 'stream', bodyMode: 'json' },
        { id: 'multipart-body-stream', transport: 'stream', bodyMode: 'multipart' },
      )
    } else {
      plans.push(
        { id: 'json-body-json', transport: 'json', bodyMode: 'json' },
        { id: 'multipart-body-json', transport: 'json', bodyMode: 'multipart' },
        { id: 'json-body-stream', transport: 'stream', bodyMode: 'json' },
        { id: 'multipart-body-stream', transport: 'stream', bodyMode: 'multipart' },
      )
    }
  } else {
    for (const transport of getPreferredResponsesTransports(settings)) {
      plans.push({
        id: transport,
        transport,
        bodyMode: 'json',
      })
    }
  }

  return plans
}
