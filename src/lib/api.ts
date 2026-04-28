import type {
  ApiProtocol,
  AppSettings,
  ImageApiResponse,
  ResponsesImageInputMode,
  ResponsesPromptRevisionMode,
  ResponsesTransportMode,
  TaskErrorDebugInfo,
  TaskResponseMeta,
  TaskParams,
} from '../types'
import {
  DEV_PROXY_REQUEST_ID_HEADER,
  buildApiUrl,
  normalizeProxyTargetBaseUrl,
  readClientDevProxyConfig,
} from './devProxy'

const MIME_MAP: Record<string, string> = {
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

export { normalizeBaseUrl } from './devProxy'

function isHttpUrl(value: unknown): value is string {
  return typeof value === 'string' && /^https?:\/\//i.test(value)
}

function normalizeBase64Image(value: string, fallbackMime: string): string {
  return value.startsWith('data:') ? value : `data:${fallbackMime};base64,${value}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isDataUrl(value: string): boolean {
  return /^data:/i.test(value)
}

async function blobToDataUrl(blob: Blob, fallbackMime: string): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''

  for (let i = 0; i < bytes.length; i += 0x8000) {
    const chunk = bytes.subarray(i, i + 0x8000)
    binary += String.fromCharCode(...chunk)
  }

  return `data:${blob.type || fallbackMime};base64,${btoa(binary)}`
}

async function fetchImageUrlAsDataUrl(url: string, fallbackMime: string, signal: AbortSignal): Promise<string> {
  const response = await fetch(url, {
    cache: 'no-store',
    signal,
  })

  if (!response.ok) {
    throw new Error(`图片 URL 下载失败：HTTP ${response.status}`)
  }

  return blobToDataUrl(await response.blob(), fallbackMime)
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl)
  return response.blob()
}

function getDataUrlByteSize(dataUrl: string): number {
  const base64 = dataUrl.split(',')[1] || ''
  const paddingLength = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0
  return Math.max(0, Math.floor((base64.length * 3) / 4) - paddingLength)
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

async function shrinkDataUrlForResponses(
  dataUrl: string,
  targetBytes = RESPONSES_INLINE_IMAGE_TARGET_BYTES,
): Promise<string> {
  const originalBytes = getDataUrlByteSize(dataUrl)
  const image = await loadImageElement(dataUrl)
  const largestSide = Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height)

  if (
    originalBytes <= targetBytes &&
    largestSide <= RESPONSES_INLINE_IMAGE_MAX_DIMENSION
  ) {
    return dataUrl
  }

  let scale = Math.min(1, RESPONSES_INLINE_IMAGE_MAX_DIMENSION / Math.max(largestSide, 1))
  let quality = 0.82
  let bestDataUrl = dataUrl
  let bestBytes = originalBytes

  for (let attempt = 0; attempt < 5; attempt++) {
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

async function shrinkImageAndMaskForResponses(
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

  for (let attempt = 0; attempt < 6; attempt++) {
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
    const nextTotalBytes =
      getDataUrlByteSize(nextImageDataUrl) + getDataUrlByteSize(nextMaskDataUrl)

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

async function normalizeEditMaskForProvider(
  maskDataUrl: string,
): Promise<string> {
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

  // 当前编辑器里存的是“透明底 + 选区实心”蒙版。
  // OpenAI 官方语义要求“透明区域 = 要编辑的区域”，因此这里反转 alpha。
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, width, height)
  context.globalCompositeOperation = 'destination-out'
  context.drawImage(maskImage, 0, 0, width, height)
  context.globalCompositeOperation = 'source-over'

  return canvas.toDataURL('image/png')
}

function getFileExtensionFromMime(mimeType: string): string {
  const subtype = mimeType.split('/')[1]?.toLowerCase()
  if (!subtype) return 'png'
  if (subtype === 'jpeg') return 'jpg'
  return subtype
}

export interface CallApiOptions {
  settings: AppSettings
  prompt: string
  params: TaskParams
  /** 输入图片的 data URL 列表 */
  inputImageDataUrls: string[]
  /** 局部编辑蒙版 data URL。存在时会按蒙版编辑模式组包 */
  editMaskDataUrl?: string
  /** 局部编辑时，蒙版对应源图在输入数组中的索引 */
  editSourceImageIndex?: number
}

export interface CallApiResult {
  /** base64 data URL 列表 */
  images: string[]
  /** API 实际返回的图片生成元信息 */
  responseMeta?: TaskResponseMeta
}

type ApiError = Error & {
  status?: number
  requestId?: string
  details?: unknown
}

type ApiDebugRequestLogEntry = NonNullable<TaskErrorDebugInfo['requestLog']>[number]
type ApiDebugRequestSnapshot = NonNullable<TaskErrorDebugInfo['request']>

function createApiError(
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

function readDevProxyRequestId(headers: Headers): string | undefined {
  const requestId = headers.get(DEV_PROXY_REQUEST_ID_HEADER)?.trim()
  return requestId || undefined
}

function summarizeDebugString(value: string): string {
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

function sanitizeDebugValue(value: unknown, depth = 0): unknown {
  if (value == null || typeof value === 'boolean' || typeof value === 'number') {
    return value
  }

  if (typeof value === 'string') {
    return summarizeDebugString(value)
  }

  if (depth >= 5) {
    return '[max-depth-reached]'
  }

  if (Array.isArray(value)) {
    const items = value
      .slice(0, DEBUG_ARRAY_ITEM_LIMIT)
      .map((item) => sanitizeDebugValue(item, depth + 1))

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
        .map(([key, nestedValue]) => [key, sanitizeDebugValue(nestedValue, depth + 1)] as const),
    )

    if (entries.length > DEBUG_OBJECT_KEY_LIMIT) {
      nextValue.__truncatedKeys = entries.length - DEBUG_OBJECT_KEY_LIMIT
    }

    return nextValue
  }

  return String(value)
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

function createDebugRequestLogEntry(
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

function attachDebugResponseMeta(entry: ApiDebugRequestLogEntry | undefined, response: Response): string | undefined {
  const requestId = readDevProxyRequestId(response.headers)
  if (entry) {
    entry.responseStatus = response.status
    entry.responseRequestId = requestId || null
  }
  return requestId
}

function attachLocalDebugToError(
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
  if (!trimmed) return undefined

  try {
    return JSON.parse(trimmed)
  } catch {
    return undefined
  }
}

interface ParsedSseEvent {
  event: string
  dataText: string
  json?: unknown
}

function parseSseEvents(text: string): ParsedSseEvent[] {
  const events: ParsedSseEvent[] = []
  const lines = text.split(/\r?\n/)
  let currentEvent = ''
  let dataLines: string[] = []

  const flush = () => {
    if (!currentEvent && dataLines.length === 0) return

    const dataText = dataLines.join('\n')
    events.push({
      event: currentEvent,
      dataText,
      json: tryParseJson(dataText),
    })

    currentEvent = ''
    dataLines = []
  }

  for (const line of lines) {
    if (!line) {
      flush()
      continue
    }

    if (line.startsWith('event:')) {
      currentEvent = line.slice('event:'.length).trim()
      continue
    }

    if (line.startsWith('data:')) {
      dataLines.push(line.slice('data:'.length).trimStart())
    }
  }

  flush()
  return events
}

function extractErrorMessage(payload: unknown): string | null {
  if (!isRecord(payload)) return null

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
        if (typeof item === 'string') return item.trim()
        if (isRecord(item)) {
          const nestedDetail = item.msg
          if (typeof nestedDetail === 'string') return nestedDetail.trim()
        }
        return ''
      })
      .filter(Boolean)
      .join('；')

    if (detailText) {
      return detailText
    }
  }

  const error = payload.error
  if (isRecord(error)) {
    const nestedMessage = error.message
    if (typeof nestedMessage === 'string' && nestedMessage.trim()) {
      return nestedMessage
    }
  }

  return null
}

async function buildApiErrorFromResponse(
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

  let errorMsg = `HTTP ${response.status}`
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
      errorMsg = extractErrorMessage(parsedPayload) || errorMsg
    } else if (text.trim()) {
      responseText = text
      if (logEntry) {
        logEntry.responseText = summarizeDebugString(text)
      }
      errorMsg = text
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

  return createApiError(errorMsg, response.status, {
    requestId,
    details: Object.keys(details).length > 0 ? details : undefined,
  })
}

async function appendImageFromItem(
  images: string[],
  item: unknown,
  fallbackMime: string,
  signal: AbortSignal,
) {
  if (!isRecord(item)) return

  const b64 = item.b64_json
  if (typeof b64 === 'string' && b64) {
    images.push(normalizeBase64Image(b64, fallbackMime))
    return
  }

  const result = item.result
  if (typeof result === 'string' && result) {
    images.push(normalizeBase64Image(result, fallbackMime))
    return
  }

  if (isHttpUrl(item.url)) {
    images.push(await fetchImageUrlAsDataUrl(item.url, fallbackMime, signal))
    return
  }

  if (isHttpUrl(item.image_url)) {
    images.push(await fetchImageUrlAsDataUrl(item.image_url, fallbackMime, signal))
    return
  }

  const content = item.content
  if (Array.isArray(content)) {
    for (const contentItem of content) {
      await appendImageFromItem(images, contentItem, fallbackMime, signal)
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
  if (!isRecord(item)) return

  const call = extractImageGenerationCallMeta(item)
  if (call) {
    calls.push(call)
  }

  const content = item.content
  if (Array.isArray(content)) {
    for (const contentItem of content) {
      appendImageGenerationCallsFromItem(calls, contentItem)
    }
  }
}

function dedupeImageGenerationCalls(
  calls: ResponseImageGenerationCallMeta[],
): ResponseImageGenerationCallMeta[] {
  const seen = new Set<string>()
  const deduped: ResponseImageGenerationCallMeta[] = []

  for (const call of calls) {
    const signature = JSON.stringify(call)
    if (seen.has(signature)) continue
    seen.add(signature)
    deduped.push(call)
  }

  return deduped
}

function collectImageGenerationCallsFromPayload(payload: unknown): ResponseImageGenerationCallMeta[] {
  const calls: ResponseImageGenerationCallMeta[] = []
  if (!isRecord(payload)) return calls

  const data = payload.data
  if (Array.isArray(data)) {
    for (const item of data) {
      appendImageGenerationCallsFromItem(calls, item)
    }
  }

  const output = payload.output
  if (Array.isArray(output)) {
    for (const item of output) {
      appendImageGenerationCallsFromItem(calls, item)
    }
  }

  const item = payload.item
  if (isRecord(item)) {
    appendImageGenerationCallsFromItem(calls, item)
  }

  const response = payload.response
  if (isRecord(response)) {
    calls.push(...collectImageGenerationCallsFromPayload(response))
  }

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

  if (!values.length) return null
  return values.join(' / ')
}

function buildTaskResponseMetaFromCalls(
  calls: ResponseImageGenerationCallMeta[],
): TaskResponseMeta | undefined {
  const normalizedCalls = dedupeImageGenerationCalls(calls)
  if (!normalizedCalls.length) return undefined

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

async function parseImagesFromPayload(
  payload: unknown,
  fallbackMime: string,
  signal: AbortSignal,
): Promise<string[]> {
  const images: string[] = []
  if (!isRecord(payload)) return images

  const data = payload.data
  if (Array.isArray(data)) {
    for (const item of data) {
      await appendImageFromItem(images, item, fallbackMime, signal)
    }
  }

  const output = payload.output
  if (Array.isArray(output)) {
    for (const item of output) {
      await appendImageFromItem(images, item, fallbackMime, signal)
    }
  }

  const item = payload.item
  if (isRecord(item)) {
    await appendImageFromItem(images, item, fallbackMime, signal)
  }

  const response = payload.response
  if (isRecord(response)) {
    const nestedImages = await parseImagesFromPayload(response, fallbackMime, signal)
    images.push(...nestedImages)
  }

  return images
}

interface SharedRequestContext {
  controller: AbortController
  requestHeaders: Record<string, string>
  proxyConfig: ReturnType<typeof readClientDevProxyConfig>
  mime: string
  forceProxy: boolean
  debugLog: ApiDebugRequestLogEntry[]
}

interface ResponsesInputImage {
  type: 'input_image'
  image_url?: string
  file_id?: string
}

interface ResponsesInputImageMask {
  image_url?: string
  file_id?: string
}

type ResponsesInputContent =
  | {
      type: 'input_text'
      text: string
    }
  | ResponsesInputImage

type ResponsesInputPayloadMode = 'compact-string' | 'message-list'
type ResponsesTransportKind = 'json' | 'stream'
type ResponsesActionMode = 'auto' | 'explicit'
type ResponsesToolChoiceMode = 'omit' | 'force'

interface ResponsesRequestPlan {
  id: string
  inputPayloadMode: ResponsesInputPayloadMode
  transport: ResponsesTransportKind
  actionMode: ResponsesActionMode
  toolChoiceMode: ResponsesToolChoiceMode
}

function getApiProtocol(settings: AppSettings): ApiProtocol {
  return settings.apiProtocol === 'responses' ? 'responses' : 'images'
}

function getResponsesImageModel(settings: AppSettings): string {
  return settings.responsesImageModel?.trim() || 'gpt-image-2'
}

function getResponsesTransportMode(settings: AppSettings): ResponsesTransportMode {
  return settings.responsesTransport || 'auto'
}

function getResponsesImageInputMode(settings: AppSettings): ResponsesImageInputMode {
  return settings.responsesImageInputMode || 'auto'
}

function getResponsesPromptRevisionMode(settings: AppSettings): ResponsesPromptRevisionMode {
  return settings.responsesPromptRevisionMode === 'compat' ? 'compat' : 'allow'
}

function buildResponsesPrompt(prompt: string, settings: AppSettings): string {
  if (getResponsesPromptRevisionMode(settings) !== 'compat') {
    return prompt
  }

  const trimmedPrompt = prompt.trim()
  if (!trimmedPrompt) {
    return prompt
  }

  return `${RESPONSES_PROMPT_REVISION_COMPAT_PREFIX}\n\n${prompt}`
}

function buildRequestUrl(baseUrl: string, path: string, ctx: SharedRequestContext): string {
  return buildApiUrl(baseUrl, path, ctx.proxyConfig, { forceProxy: ctx.forceProxy })
}

function shouldRetryResponsesWithCompatibility(error: unknown): boolean {
  if (!(error instanceof Error)) return false

  if (isResponsesRelayFailure(error)) {
    return false
  }

  const status = (error as ApiError).status
  if (status != null && [404, 405, 409, 415, 422, 500, 501].includes(status)) {
    return true
  }

  return /(?:HTTP 5\d{2}|tool(?:_choice)?|image_generation|response|internal|server error|input must be a list|input.*array|expected.*list|expected.*array|multipart|stream|sse|file_id)/i.test(
    error.message,
  )
}

function isResponsesRelayFailure(error: unknown): boolean {
  if (!(error instanceof Error)) return false

  const status = (error as ApiError).status
  if (status === 524) {
    return true
  }

  return /(?:do_request_failed|upstream error|cloudflare|timeout occurred|timed out|auth_not_found|no auth available)/i.test(
    error.message,
  )
}

function shouldFallbackResponsesStreamToJson(
  error: unknown,
  currentPlan: ResponsesRequestPlan,
  nextPlan?: ResponsesRequestPlan,
): boolean {
  if (currentPlan.transport !== 'stream' || nextPlan?.transport !== 'json') {
    return false
  }
  if (!(error instanceof Error)) {
    return false
  }

  const status = (error as ApiError).status
  if (status != null && [401, 403, 429, 524].includes(status)) {
    return false
  }

  return !/(?:auth_not_found|no auth available|invalid api key|insufficient|quota)/i.test(error.message)
}

function isPayloadTooLargeError(error: unknown): boolean {
  if (!(error instanceof Error)) return false

  const status = (error as ApiError).status
  if (status === 413) {
    return true
  }

  return /(?:payload too large|request entity too large|content too large|body too large|http 413)/i.test(
    error.message,
  )
}

function shouldRetryResponsesWithFileId(
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

async function readResponsesPayload(
  response: Response,
  logEntry?: ApiDebugRequestLogEntry,
): Promise<unknown> {
  const text = await response.text()
  const requestId = attachDebugResponseMeta(logEntry, response)
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
    throw createApiError('Responses API 返回了非 JSON 响应，且不是可解析的 SSE 数据', response.status, {
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
    if (payload.type === 'response.failed') return true
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
    throw createApiError(message, response.status, {
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
    if (existingOutput.length > 0 || outputItems.length === 0) {
      return completedResponse
    }

    return {
      ...completedResponse,
      output: outputItems,
    }
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
  throw createApiError('Responses API 返回了 SSE，但未包含可解析的 JSON 事件', response.status, {
    requestId,
    details: text.trim() ? { responseText: text } : undefined,
  })
}

async function callImagesApi(
  opts: CallApiOptions,
  ctx: SharedRequestContext,
): Promise<CallApiResult> {
  const { settings, prompt, params, inputImageDataUrls, editMaskDataUrl } = opts
  const isEdit = inputImageDataUrls.length > 0
  let response: Response
  let debugLogEntry: ApiDebugRequestLogEntry | undefined

  if (isEdit) {
    const formData = new FormData()
    formData.append('model', settings.model)
    formData.append('prompt', prompt)
    formData.append('size', params.size)
    formData.append('quality', params.quality)
    formData.append('output_format', params.output_format)
    formData.append('moderation', params.moderation)

    if (params.output_format !== 'png' && params.output_compression != null) {
      formData.append('output_compression', String(params.output_compression))
    }

    for (let i = 0; i < inputImageDataUrls.length; i++) {
      const dataUrl = inputImageDataUrls[i]
      const blob = await dataUrlToBlob(dataUrl)
      const ext = blob.type.split('/')[1] || 'png'
      formData.append('image[]', blob, `input-${i + 1}.${ext}`)
    }
    if (editMaskDataUrl) {
      const maskBlob = await dataUrlToBlob(editMaskDataUrl)
      formData.append('mask', maskBlob, 'mask.png')
    }

    const requestUrl = buildRequestUrl(settings.baseUrl, 'images/edits', ctx)
    debugLogEntry = createDebugRequestLogEntry(ctx, 'images.edit', 'POST', requestUrl, {
      model: settings.model,
      prompt,
      size: params.size,
      quality: params.quality,
      output_format: params.output_format,
      moderation: params.moderation,
      output_compression: params.output_format !== 'png' ? params.output_compression : undefined,
      imageCount: inputImageDataUrls.length,
      hasMask: Boolean(editMaskDataUrl),
    })

    response = await fetch(requestUrl, {
      method: 'POST',
      headers: ctx.requestHeaders,
      cache: 'no-store',
      body: formData,
      signal: ctx.controller.signal,
    })
  } else {
    const body: Record<string, unknown> = {
      model: settings.model,
      prompt,
      size: params.size,
      quality: params.quality,
      output_format: params.output_format,
      moderation: params.moderation,
    }

    if (params.output_format !== 'png' && params.output_compression != null) {
      body.output_compression = params.output_compression
    }
    if (params.n > 1) {
      body.n = params.n
    }

    const requestUrl = buildRequestUrl(settings.baseUrl, 'images/generations', ctx)
    debugLogEntry = createDebugRequestLogEntry(ctx, 'images.generate', 'POST', requestUrl, body)

    response = await fetch(requestUrl, {
      method: 'POST',
      headers: {
        ...ctx.requestHeaders,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
      body: JSON.stringify(body),
      signal: ctx.controller.signal,
    })
  }

  if (!response.ok) {
    throw await buildApiErrorFromResponse(response, debugLogEntry)
  }

  attachDebugResponseMeta(debugLogEntry, response)
  const payload = await response.json() as ImageApiResponse
  const images = await parseImagesFromPayload(payload, ctx.mime, ctx.controller.signal)
  if (!images.length) {
    if (debugLogEntry) {
      debugLogEntry.responseBody = sanitizeDebugValue(payload)
    }
    throw createApiError('接口未返回可用图片数据', response.status, {
      requestId: readDevProxyRequestId(response.headers),
      details: {
        responseBody: payload,
      },
    })
  }

  return { images }
}

async function uploadInputImageAsFileId(
  baseUrl: string,
  dataUrl: string,
  index: number,
  ctx: SharedRequestContext,
): Promise<string> {
  const blob = await dataUrlToBlob(dataUrl)
  const ext = getFileExtensionFromMime(blob.type)
  const formData = new FormData()
  formData.append('purpose', 'vision')
  formData.append('file', blob, `input-${index + 1}.${ext}`)
  const requestUrl = buildRequestUrl(baseUrl, 'files', ctx)
  const debugLogEntry = createDebugRequestLogEntry(ctx, 'files.upload', 'POST', requestUrl, {
    purpose: 'vision',
    index,
    fileName: `input-${index + 1}.${ext}`,
    mime: blob.type || null,
    sizeBytes: blob.size,
  })

  const response = await fetch(requestUrl, {
    method: 'POST',
    headers: ctx.requestHeaders,
    cache: 'no-store',
    body: formData,
    signal: ctx.controller.signal,
  })

  if (!response.ok) {
    throw await buildApiErrorFromResponse(response, debugLogEntry)
  }

  attachDebugResponseMeta(debugLogEntry, response)
  const payload = await response.json()
  if (!isRecord(payload) || typeof payload.id !== 'string' || !payload.id) {
    debugLogEntry.responseBody = sanitizeDebugValue(payload)
    throw createApiError('文件上传成功，但未返回 file_id', response.status, {
      requestId: readDevProxyRequestId(response.headers),
      details: {
        responseBody: payload,
      },
    })
  }

  return payload.id
}

async function deleteUploadedFile(baseUrl: string, fileId: string, ctx: SharedRequestContext): Promise<void> {
  try {
    await fetch(buildRequestUrl(baseUrl, `files/${fileId}`, ctx), {
      method: 'DELETE',
      headers: ctx.requestHeaders,
      cache: 'no-store',
      signal: ctx.controller.signal,
    })
  } catch {
    /* ignore cleanup errors */
  }
}

async function prepareResponsesInputImages(
  baseUrl: string,
  inputImageDataUrls: string[],
  imageInputMode: ResponsesImageInputMode,
  ctx: SharedRequestContext,
  options?: {
    preserveOriginalIndices?: Set<number>
  },
): Promise<{ inputImages: ResponsesInputImage[]; uploadedFileIds: string[] }> {
  if (!inputImageDataUrls.length) {
    return { inputImages: [], uploadedFileIds: [] }
  }

  const inputImages: ResponsesInputImage[] = []
  const uploadedFileIds: string[] = []
  const localDataUrlCount = inputImageDataUrls.filter((value) => isDataUrl(value)).length
  const inlineImageTargetBytes =
    localDataUrlCount > 0
      ? Math.max(
          RESPONSES_INLINE_IMAGE_MIN_TARGET_BYTES,
          Math.min(
            RESPONSES_INLINE_IMAGE_TARGET_BYTES,
            Math.floor(RESPONSES_INLINE_IMAGE_TOTAL_TARGET_BYTES / localDataUrlCount),
          ),
        )
      : RESPONSES_INLINE_IMAGE_TARGET_BYTES

  for (let i = 0; i < inputImageDataUrls.length; i++) {
    const inputImage = inputImageDataUrls[i]
    if (isHttpUrl(inputImage)) {
      inputImages.push({
        type: 'input_image',
        image_url: inputImage,
      })
      continue
    }

    if (isDataUrl(inputImage)) {
      if (imageInputMode === 'file_id') {
        try {
          const fileId = await uploadInputImageAsFileId(baseUrl, inputImage, i, ctx)
          uploadedFileIds.push(fileId)
          inputImages.push({
            type: 'input_image',
            file_id: fileId,
          })
          continue
        } catch (error) {
          const status = (error as ApiError | undefined)?.status
          const message = error instanceof Error ? error.message : String(error)
          if (
            (status != null && [400, 404, 405, 415, 422, 501].includes(status)) ||
            /(?:\/v1\/files|multipart|file upload|file_id|vision|unsupported|not implemented)/i.test(message)
          ) {
            throw createApiError(
              '当前中转站不支持 Responses 参考图 file_id 上传，请把“Responses 参考图输入”改回“自动”后重试。',
              status,
            )
          }
          throw error
        }
      }

      // Responses API 支持把 data URL 直接作为 input_image.image_url 传入，
      // 这样可避免依赖部分中转站未实现的 /v1/files。
      const optimizedDataUrl =
        options?.preserveOriginalIndices?.has(i)
          ? inputImage
          : await shrinkDataUrlForResponses(inputImage, inlineImageTargetBytes)
      inputImages.push({
        type: 'input_image',
        image_url: optimizedDataUrl,
      })
      continue
    }

    if (!isDataUrl(inputImage)) {
      throw createApiError('不支持的参考图格式，请使用本地图片或公网图片 URL')
    }
  }

  return { inputImages, uploadedFileIds }
}

async function prepareResponsesEditMask(
  baseUrl: string,
  maskDataUrl: string | undefined,
  imageInputMode: ResponsesImageInputMode,
  ctx: SharedRequestContext,
): Promise<{ editMask?: ResponsesInputImageMask; uploadedFileIds: string[] }> {
  if (!maskDataUrl) {
    return { editMask: undefined, uploadedFileIds: [] }
  }

  if (imageInputMode === 'file_id') {
    try {
      const fileId = await uploadInputImageAsFileId(baseUrl, maskDataUrl, 999, ctx)
      return {
        editMask: { file_id: fileId },
        uploadedFileIds: [fileId],
      }
    } catch (error) {
      const status = (error as ApiError | undefined)?.status
      const message = error instanceof Error ? error.message : String(error)
      if (
        (status != null && [400, 404, 405, 415, 422, 501].includes(status)) ||
        /(?:\/v1\/files|multipart|file upload|file_id|vision|unsupported|not implemented)/i.test(message)
      ) {
        throw createApiError(
          '当前中转站不支持 Responses 蒙版 file_id 上传，请把“Responses 参考图输入”改回“自动”后重试。',
          status,
        )
      }
      throw error
    }
  }

  return {
    editMask: { image_url: maskDataUrl },
    uploadedFileIds: [],
  }
}

async function prepareResponsesInlineEditAssets(
  opts: CallApiOptions,
  imageInputMode: ResponsesImageInputMode,
): Promise<{
  inputImageDataUrls: string[]
  editMaskDataUrl: string | undefined
  preserveOriginalIndices?: Set<number>
}> {
  if (!opts.editMaskDataUrl || imageInputMode === 'file_id') {
    return {
      inputImageDataUrls: opts.inputImageDataUrls,
      editMaskDataUrl: opts.editMaskDataUrl,
      preserveOriginalIndices:
        opts.editMaskDataUrl && opts.editSourceImageIndex != null
          ? new Set([opts.editSourceImageIndex])
          : undefined,
    }
  }

  const sourceIndex = opts.editSourceImageIndex ?? 0
  const sourceImage = opts.inputImageDataUrls[sourceIndex]
  if (!sourceImage || !isDataUrl(sourceImage)) {
    return {
      inputImageDataUrls: opts.inputImageDataUrls,
      editMaskDataUrl: opts.editMaskDataUrl,
      preserveOriginalIndices: new Set([sourceIndex]),
    }
  }

  const resized = await shrinkImageAndMaskForResponses(sourceImage, opts.editMaskDataUrl)
  const inputImageDataUrls = [...opts.inputImageDataUrls]
  inputImageDataUrls[sourceIndex] = resized.imageDataUrl

  return {
    inputImageDataUrls,
    editMaskDataUrl: resized.maskDataUrl,
    preserveOriginalIndices: new Set([sourceIndex]),
  }
}

function buildResponsesInput(prompt: string, inputImages: ResponsesInputImage[]) {
  const content: ResponsesInputContent[] = []

  if (prompt.trim()) {
    content.push({ type: 'input_text', text: prompt })
  }

  for (const inputImage of inputImages) {
    content.push(inputImage)
  }

  return [
    {
      role: 'user',
      content,
    },
  ]
}

function buildResponsesInputPayload(
  prompt: string,
  inputImages: ResponsesInputImage[],
  mode: ResponsesInputPayloadMode,
) {
  if (mode === 'compact-string' && !inputImages.length && prompt.trim()) {
    return prompt.trim()
  }

  return buildResponsesInput(prompt, inputImages)
}

function getPreferredResponsesTransports(settings: AppSettings): ResponsesTransportKind[] {
  const mode = getResponsesTransportMode(settings)
  if (mode === 'stream') return ['stream']
  if (mode === 'json') return ['json']
  return ['stream', 'json']
}

function buildResponsesRequestPlans(
  opts: CallApiOptions,
  inputImages: ResponsesInputImage[],
): ResponsesRequestPlan[] {
  const hasReferenceImages = inputImages.length > 0
  const hasEditMask = Boolean(opts.editMaskDataUrl)
  const defaultInputPayloadMode: ResponsesInputPayloadMode = hasReferenceImages ? 'message-list' : 'compact-string'
  const transports = getPreferredResponsesTransports(opts.settings)
  const primaryTransports: ResponsesTransportKind[] =
    hasEditMask && getResponsesTransportMode(opts.settings) === 'auto'
      ? ['json', 'stream']
      : transports
  const allowJsonCompatibilityFallback = getResponsesTransportMode(opts.settings) === 'auto'
  const compatibilityTransports: ResponsesTransportKind[] = allowJsonCompatibilityFallback ? ['json'] : transports
  const plans: ResponsesRequestPlan[] = []

  const pushPlan = (plan: ResponsesRequestPlan) => {
    if (!plans.some((item) => item.id === plan.id)) {
      plans.push(plan)
    }
  }

  for (const transport of primaryTransports) {
    pushPlan({
      id: `official-${transport}-${defaultInputPayloadMode}`,
      inputPayloadMode: defaultInputPayloadMode,
      transport,
      actionMode: hasEditMask ? 'explicit' : 'auto',
      toolChoiceMode: hasEditMask ? 'force' : 'omit',
    })
  }

  if (hasReferenceImages && !hasEditMask) {
    for (const transport of compatibilityTransports) {
      pushPlan({
        id: `explicit-action-${transport}`,
        inputPayloadMode: 'message-list',
        transport,
        actionMode: 'explicit',
        toolChoiceMode: 'omit',
      })
    }
  }

  if (!hasReferenceImages) {
    for (const transport of compatibilityTransports) {
      pushPlan({
        id: `message-list-${transport}`,
        inputPayloadMode: 'message-list',
        transport,
        actionMode: 'auto',
        toolChoiceMode: 'omit',
      })
    }
  }

  if (!hasEditMask) {
    for (const transport of compatibilityTransports) {
      pushPlan({
        id: `forced-tool-${transport}-${defaultInputPayloadMode}`,
        inputPayloadMode: defaultInputPayloadMode,
        transport,
        actionMode: hasReferenceImages ? 'explicit' : 'auto',
        toolChoiceMode: 'force',
      })
    }
  }

  return plans
}

function buildResponsesBody(
  opts: CallApiOptions,
  inputImages: ResponsesInputImage[],
  editMask: ResponsesInputImageMask | undefined,
  plan: ResponsesRequestPlan,
): Record<string, unknown> {
  const { settings, prompt, params } = opts
  const responsesPrompt = buildResponsesPrompt(prompt, settings)
  const hasReferenceImages = inputImages.length > 0
  const tool: Record<string, unknown> = {
    type: 'image_generation',
    model: getResponsesImageModel(settings),
  }

  if (params.size) {
    tool.size = params.size
  }
  if (params.quality) {
    tool.quality = params.quality
  }
  if (params.output_format) {
    tool.output_format = params.output_format
  }
  if (params.moderation) {
    tool.moderation = params.moderation
  }
  if (params.output_format !== 'png' && params.output_compression != null) {
    tool.output_compression = params.output_compression
  }
  if (editMask) {
    tool.input_image_mask = editMask
  }
  if (plan.actionMode === 'explicit') {
    tool.action = hasReferenceImages ? 'edit' : 'generate'
  }
  if (plan.transport === 'stream') {
    tool.partial_images = 1
  }

  const body: Record<string, unknown> = {
    model: settings.model,
    input: buildResponsesInputPayload(responsesPrompt, inputImages, plan.inputPayloadMode),
    tools: [tool],
  }

  if (plan.transport === 'stream') {
    body.stream = true
  }

  if (plan.toolChoiceMode === 'force') {
    body.tool_choice = { type: 'image_generation' }
  }

  return body
}

async function callResponsesApi(
  opts: CallApiOptions,
  ctx: SharedRequestContext,
): Promise<CallApiResult> {
  const responsesImageInputMode = getResponsesImageInputMode(opts.settings)

  try {
    return await callResponsesApiWithInputMode(opts, ctx, responsesImageInputMode)
  } catch (error) {
    if (!shouldRetryResponsesWithFileId(error, responsesImageInputMode, opts)) {
      throw error
    }

    try {
      return await callResponsesApiWithInputMode(opts, ctx, 'file_id')
    } catch (fallbackError) {
      if (fallbackError instanceof Error && /Responses .*file_id 上传/.test(fallbackError.message)) {
        throw createApiError(
          '当前供应商的 /v1/responses 会因原图和蒙版内联导致请求体过大，同时也不支持 /v1/files 上传。请改用更小图片，或更换为支持 file_id / images/edits 的供应商。',
          (error as ApiError | undefined)?.status ?? (fallbackError as ApiError | undefined)?.status,
        )
      }

      throw fallbackError
    }
  }
}

async function callResponsesApiWithInputMode(
  opts: CallApiOptions,
  ctx: SharedRequestContext,
  responsesImageInputMode: ResponsesImageInputMode,
): Promise<CallApiResult> {
  const requestCount = Math.max(1, opts.params.n || 1)
  const images: string[] = []
  const responseImageGenerationCalls: ResponseImageGenerationCallMeta[] = []
  const preparedEditAssets = await prepareResponsesInlineEditAssets(opts, responsesImageInputMode)
  const { inputImages, uploadedFileIds } = await prepareResponsesInputImages(
    opts.settings.baseUrl,
    preparedEditAssets.inputImageDataUrls,
    responsesImageInputMode,
    ctx,
    preparedEditAssets.preserveOriginalIndices
  )
  const { editMask, uploadedFileIds: uploadedMaskFileIds } = await prepareResponsesEditMask(
    opts.settings.baseUrl,
    preparedEditAssets.editMaskDataUrl,
    responsesImageInputMode,
    ctx,
  )
  const allUploadedFileIds = [...uploadedFileIds, ...uploadedMaskFileIds]
  const requestPlans = buildResponsesRequestPlans(opts, inputImages)

  try {
    for (let i = 0; i < requestCount; i++) {
      let lastError: unknown = null

      for (let planIndex = 0; planIndex < requestPlans.length; planIndex++) {
        const plan = requestPlans[planIndex]
        const nextPlan = requestPlans[planIndex + 1]

        try {
          const requestUrl = buildRequestUrl(opts.settings.baseUrl, 'responses', ctx)
          const requestBody = buildResponsesBody(opts, inputImages, editMask, plan)
          const debugLogEntry = createDebugRequestLogEntry(
            ctx,
            `responses.${plan.id}`,
            'POST',
            requestUrl,
            requestBody,
          )
          const response = await fetch(requestUrl, {
            method: 'POST',
            headers: {
              ...ctx.requestHeaders,
              'Content-Type': 'application/json',
            },
            cache: 'no-store',
            body: JSON.stringify(requestBody),
            signal: ctx.controller.signal,
          })

          if (!response.ok) {
            throw await buildApiErrorFromResponse(response, debugLogEntry)
          }

          const requestId = attachDebugResponseMeta(debugLogEntry, response)
          const payload = await readResponsesPayload(response, debugLogEntry)
          responseImageGenerationCalls.push(...collectImageGenerationCallsFromPayload(payload))
          const parsedImages = await parseImagesFromPayload(payload, ctx.mime, ctx.controller.signal)
          if (!parsedImages.length) {
            debugLogEntry.responseBody = sanitizeDebugValue(payload)
            throw createApiError('Responses API 未返回可用图片数据', response.status, {
              requestId,
              details: {
                responseBody: payload,
              },
            })
          }

          images.push(...parsedImages)
          lastError = null
          break
        } catch (error) {
          lastError = error
          const isLastPlan = planIndex === requestPlans.length - 1
          if (
            isLastPlan ||
            (!shouldRetryResponsesWithCompatibility(error) &&
              !shouldFallbackResponsesStreamToJson(error, plan, nextPlan))
          ) {
            throw error
          }
        }
      }

      if (lastError) {
        throw lastError
      }
    }
  } finally {
    await Promise.all(allUploadedFileIds.map((fileId) => deleteUploadedFile(opts.settings.baseUrl, fileId, ctx)))
  }

  if (!images.length) {
    throw createApiError('Responses API 未返回可用图片数据')
  }

  const responseMeta = buildTaskResponseMetaFromCalls(responseImageGenerationCalls)
  return responseMeta ? { images, responseMeta } : { images }
}

export async function callImageApi(opts: CallApiOptions): Promise<CallApiResult> {
  const { settings, params } = opts
  const mime = MIME_MAP[params.output_format] || 'image/png'
  const proxyConfig = readClientDevProxyConfig()
  const forceProxy = settings.requestMode === 'local_proxy'
  const debugLog: ApiDebugRequestLogEntry[] = []

  const requestHeaders: Record<string, string> = {
    Authorization: `Bearer ${settings.apiKey}`,
    'Cache-Control': 'no-store, no-cache, max-age=0',
    Pragma: 'no-cache',
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), settings.timeout * 1000)
  let normalizedOpts = opts

  try {
    if (forceProxy && !proxyConfig?.enabled) {
      throw createApiError(
        '本地代理模式已启用，但未检测到可用的开发代理。请确认 dev-proxy.config.json 存在，并重启 npm run dev。',
      )
    }

    if (forceProxy) {
      const proxyTargetBaseUrl = normalizeProxyTargetBaseUrl(settings.baseUrl)
      if (!proxyTargetBaseUrl) {
        throw createApiError('API URL 无效，请检查设置中的 API URL')
      }
      requestHeaders['X-Dev-Proxy-Target'] = proxyTargetBaseUrl
    }

    normalizedOpts =
      opts.editMaskDataUrl != null
        ? {
            ...opts,
            editMaskDataUrl: await normalizeEditMaskForProvider(opts.editMaskDataUrl),
          }
        : opts
    const ctx: SharedRequestContext = {
      controller,
      requestHeaders,
      proxyConfig,
      mime,
      forceProxy,
      debugLog,
    }
    const apiProtocol = getApiProtocol(settings)

    if (apiProtocol === 'responses') {
      return await callResponsesApi(normalizedOpts, ctx)
    }

    if (apiProtocol === 'images') {
      return await callImagesApi(normalizedOpts, ctx)
    }
    return await callImagesApi(normalizedOpts, ctx)
  } catch (error) {
    throw attachLocalDebugToError(error, normalizedOpts, debugLog)
  } finally {
    clearTimeout(timeoutId)
  }
}
