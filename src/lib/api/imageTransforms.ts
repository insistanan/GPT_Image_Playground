import type { ImageEditSelection } from '../../types'
import { MIME_MAP } from './config'
import { throwIfSignalAborted } from './abort'
import { getImageExtensionFromMimeType } from '../imageMime'
import { isRemoteImageUrl } from '../imageUrl'
import type {
  ApiImageAsset,
  ApiError,
  CallApiOptions,
  DecodedImageAsset,
  ResponsesStreamImageEvent,
} from './types'

const RESPONSES_INLINE_IMAGE_MAX_DIMENSION = 1280
const RESPONSES_INLINE_IMAGE_TARGET_BYTES = 700 * 1024
const RESPONSES_INLINE_IMAGE_TOTAL_TARGET_BYTES = 1500 * 1024
const RESPONSES_INLINE_IMAGE_MIN_DIMENSION = 768
const RESPONSES_INLINE_IMAGE_MIN_QUALITY = 0.55
const MASK_ALPHA_THRESHOLD = 8
const IMAGE_SIGNATURE_PREVIEW_SIZE = 64

export function isHttpUrl(value: unknown): value is string {
  return typeof value === 'string' && /^https?:\/\//i.test(value)
}

export function normalizeBase64Image(value: string, fallbackMime: string): string {
  return value.startsWith('data:') ? value : `data:${fallbackMime};base64,${value}`
}

export function isDataUrl(value: string): boolean {
  return /^data:/i.test(value)
}

export async function dataUrlToBlob(dataUrl: string, signal?: AbortSignal): Promise<Blob> {
  const response = await fetch(dataUrl, { signal })
  return response.blob()
}

export function getDataUrlByteSize(dataUrl: string): number {
  const base64 = dataUrl.split(',')[1] || ''
  return getBase64ByteLength(base64)
}

function getBase64ByteLength(base64: string): number {
  const paddingLength = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0
  return Math.max(0, Math.floor((base64.length * 3) / 4) - paddingLength)
}

export function getFileExtensionFromMime(mimeType: string): string {
  return getImageExtensionFromMimeType(mimeType)
}

export async function emitFinalImages(
  opts: CallApiOptions,
  images: ApiImageAsset[],
): Promise<void> {
  if (!images.length || typeof opts.onFinalImages !== 'function') {
    return
  }

  try {
    await opts.onFinalImages(images)
  } catch (error) {
    if (
      error instanceof Error &&
      (error.name === 'AbortError' ||
        error.name === 'TaskAbortError' ||
        error.message === '任务已中止')
    ) {
      throw error
    }
    console.warn('图片增量回调失败，已回退到最终结果同步。', error)
  }
}

export async function base64ToBlob(
  base64: string,
  mimeType: string,
  signal?: AbortSignal,
): Promise<Blob> {
  const normalizedBase64 = normalizeBase64Payload(base64)
  if (signal) {
    throwIfSignalAborted(signal)
  }

  try {
    const bytes = decodeBase64ToBytes(normalizedBase64, signal)
    if (signal) {
      throwIfSignalAborted(signal)
    }
    const stableBytes = new Uint8Array(bytes.byteLength)
    stableBytes.set(bytes)
    return new Blob([stableBytes], { type: mimeType })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw error
    }
    throw createApiError('图片 base64 解码失败')
  }
}

export async function fetchImageUrlAsDataUrl(
  url: string,
  fallbackMime: string,
  signal: AbortSignal,
): Promise<string> {
  const blob = normalizeBlobMimeType(await fetchImageUrlAsBlob(url, signal), fallbackMime)
  return blobToDataUrl(blob, fallbackMime, signal)
}

export async function shrinkDataUrlForResponses(
  dataUrl: string,
  targetBytes = RESPONSES_INLINE_IMAGE_TARGET_BYTES,
  signal?: AbortSignal,
): Promise<string> {
  if (signal) {
    throwIfSignalAborted(signal)
  }
  const originalBytes = getDataUrlByteSize(dataUrl)
  const image = await loadImageElement(dataUrl)
  if (signal) {
    throwIfSignalAborted(signal)
  }
  const largestSide = Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height)

  if (originalBytes <= targetBytes && largestSide <= RESPONSES_INLINE_IMAGE_MAX_DIMENSION) {
    return dataUrl
  }

  let scale = Math.min(1, RESPONSES_INLINE_IMAGE_MAX_DIMENSION / Math.max(largestSide, 1))
  let quality = 0.82
  let bestDataUrl = dataUrl
  let bestBytes = originalBytes

  for (let attempt = 0; attempt < 5; attempt += 1) {
    if (signal) {
      throwIfSignalAborted(signal)
    }
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
    if (signal) {
      throwIfSignalAborted(signal)
    }
    const nextDataUrl = await blobToDataUrl(blob, 'image/webp', signal)
    if (signal) {
      throwIfSignalAborted(signal)
    }
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
  signal?: AbortSignal,
): Promise<{ imageDataUrl: string; maskDataUrl: string }> {
  if (signal) {
    throwIfSignalAborted(signal)
  }
  const originalImageBytes = getDataUrlByteSize(imageDataUrl)
  const originalMaskBytes = getDataUrlByteSize(maskDataUrl)
  const sourceImage = await loadImageElement(imageDataUrl)
  const maskImage = await loadImageElement(maskDataUrl)
  if (signal) {
    throwIfSignalAborted(signal)
  }
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
    if (signal) {
      throwIfSignalAborted(signal)
    }
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
      signal,
    )
    const nextMaskDataUrl = await blobToDataUrl(
      await canvasToBlob(maskCanvas, 'image/png'),
      'image/png',
      signal,
    )
    if (signal) {
      throwIfSignalAborted(signal)
    }
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

export async function normalizeEditMaskForProvider(
  maskDataUrl: string,
  selection?: ImageEditSelection | null,
  signal?: AbortSignal,
): Promise<string> {
  if (signal) {
    throwIfSignalAborted(signal)
  }
  const maskImage = await loadImageElement(maskDataUrl)
  if (signal) {
    throwIfSignalAborted(signal)
  }
  const width = Math.max(1, maskImage.naturalWidth || maskImage.width)
  const height = Math.max(1, maskImage.naturalHeight || maskImage.height)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const context = canvas.getContext('2d')
  if (!context) {
    return maskDataUrl
  }

  const selectionBounds = resolveSelectionBounds(selection, width, height)
  if (selectionBounds) {
    paintCanonicalEditMask(context, width, height, selectionBounds)
    return canvas.toDataURL('image/png')
  }

  context.clearRect(0, 0, width, height)
  context.drawImage(maskImage, 0, 0, width, height)
  const sourceImageData = context.getImageData(0, 0, width, height)
  const transparentBounds = createEmptyAlphaBounds(width, height)
  const opaqueBounds = createEmptyAlphaBounds(width, height)

  for (let offset = 0; offset < sourceImageData.data.length; offset += 4) {
    if (signal && offset % 4096 === 0) {
      throwIfSignalAborted(signal)
    }
    const alpha = sourceImageData.data[offset + 3]
    const pixelIndex = offset / 4
    const x = pixelIndex % width
    const y = Math.floor(pixelIndex / width)

    if (alpha <= MASK_ALPHA_THRESHOLD) {
      includeAlphaBounds(transparentBounds, x, y)
      continue
    }

    includeAlphaBounds(opaqueBounds, x, y)
  }

  if (transparentBounds.count === 0 || opaqueBounds.count === 0) {
    return maskDataUrl
  }

  const opaqueCoversWholeCanvas = coversFullCanvas(opaqueBounds, width, height)
  const transparentCoversWholeCanvas = coversFullCanvas(transparentBounds, width, height)
  const editPixelsAreOpaque =
    opaqueCoversWholeCanvas !== transparentCoversWholeCanvas
      ? !opaqueCoversWholeCanvas
      : opaqueBounds.count <= transparentBounds.count

  const normalizedMask = context.createImageData(width, height)
  for (let offset = 0; offset < sourceImageData.data.length; offset += 4) {
    if (signal && offset % 4096 === 0) {
      throwIfSignalAborted(signal)
    }
    const alpha = sourceImageData.data[offset + 3]
    const isEditPixel = editPixelsAreOpaque ? alpha > MASK_ALPHA_THRESHOLD : alpha <= MASK_ALPHA_THRESHOLD
    normalizedMask.data[offset] = 255
    normalizedMask.data[offset + 1] = 255
    normalizedMask.data[offset + 2] = 255
    normalizedMask.data[offset + 3] = isEditPixel ? 0 : 255
  }

  context.putImageData(normalizedMask, 0, 0)
  if (signal) {
    throwIfSignalAborted(signal)
  }
  return canvas.toDataURL('image/png')
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

export function resolveImageMimeType(outputFormat: unknown, fallbackMime: string): string {
  const normalizedOutputFormat = readOptionalText(outputFormat)?.toLowerCase()
  if (!normalizedOutputFormat) {
    if (!/^image\//i.test(fallbackMime)) {
      throw createApiError(`不支持的图片 MIME 类型：${String(fallbackMime)}`)
    }
    return fallbackMime
  }

  if (normalizedOutputFormat.startsWith('image/')) {
    return normalizedOutputFormat
  }

  const mimeType = MIME_MAP[normalizedOutputFormat]
  if (!mimeType) {
    throw createApiError(`不支持的图片输出格式：${String(outputFormat)}`)
  }

  return mimeType
}

export function normalizeBlobMimeType(blob: Blob, fallbackMime: string): Blob {
  if (blob.type) {
    return blob
  }

  return new Blob([blob], { type: fallbackMime })
}

export function buildDecodedImageAsset(
  blob: Blob,
  signature: string,
  meta: {
    mimeType: string
    outputFormat?: string
    itemId?: string
    outputIndex?: number
  },
  sourceUrl?: string,
): DecodedImageAsset {
  const normalizedBlob = normalizeBlobMimeType(blob, meta.mimeType)

  return {
    signature,
    blob: normalizedBlob,
    mimeType: normalizedBlob.type || meta.mimeType,
    outputFormat: meta.outputFormat,
    sourceUrl,
    itemId: meta.itemId,
    outputIndex: meta.outputIndex,
  }
}

export function stripDecodedImageAssetSignature(asset: DecodedImageAsset): ApiImageAsset {
  return {
    blob: asset.blob,
    mimeType: asset.mimeType,
    outputFormat: asset.outputFormat,
    sourceUrl: asset.sourceUrl,
    itemId: asset.itemId,
    outputIndex: asset.outputIndex,
  }
}

export function buildCompactImagePayloadSignature(prefix: string, value: string): string {
  if (value.length <= IMAGE_SIGNATURE_PREVIEW_SIZE * 2) {
    return `${prefix}:${value}`
  }

  const head = value.slice(0, IMAGE_SIGNATURE_PREVIEW_SIZE)
  const tail = value.slice(-IMAGE_SIGNATURE_PREVIEW_SIZE)
  return `${prefix}:length=${value.length}:head=${head}:tail=${tail}`
}

export function buildStreamImageEventSignature(streamEvent: ResponsesStreamImageEvent): string {
  if (streamEvent.itemId && typeof streamEvent.outputIndex === 'number') {
    return `id:${streamEvent.itemId}:output_index:${streamEvent.outputIndex}`
  }
  if (streamEvent.itemId) {
    return `id:${streamEvent.itemId}`
  }

  return buildCompactImagePayloadSignature('result', streamEvent.base64 ?? '')
}

export async function decodeResponsesOutputDoneImageEventToAsset(
  streamEvent: ResponsesStreamImageEvent,
  fallbackMime: string,
  signal: AbortSignal,
): Promise<ApiImageAsset | null> {
  if (!streamEvent.base64 || streamEvent.isPartial) {
    return null
  }

  throwIfSignalAborted(signal)
  const mimeType = resolveImageMimeType(streamEvent.outputFormat, fallbackMime)
  const blob = await base64ToBlob(streamEvent.base64, mimeType, signal)

  return stripDecodedImageAssetSignature(
    buildDecodedImageAsset(blob, buildStreamImageEventSignature(streamEvent), {
      mimeType,
      outputFormat: streamEvent.outputFormat,
      itemId: streamEvent.itemId,
      outputIndex: typeof streamEvent.outputIndex === 'number' ? streamEvent.outputIndex : undefined,
    }),
  )
}

export async function buildDecodedImageAssetFromUrlValue(
  urlValue: string,
  fieldName: 'url' | 'image_url',
  signature: string,
  meta: {
    mimeType: string
    outputFormat?: string
    itemId?: string
    outputIndex?: number
  },
  signal: AbortSignal,
): Promise<DecodedImageAsset> {
  if (isDataUrl(urlValue)) {
    return buildDecodedImageAsset(await dataUrlToBlob(urlValue, signal), signature, meta)
  }

  if (isHttpUrl(urlValue) || isRemoteImageUrl(urlValue)) {
    return buildDecodedImageAsset(
      await fetchImageUrlAsBlob(urlValue, signal),
      signature,
      meta,
      urlValue,
    )
  }

  throw createApiError(`接口返回了不支持的图片 ${fieldName} 格式：${urlValue}`)
}

function normalizeBase64Payload(base64: string): string {
  const normalized = base64.trim().replace(/\s+/g, '')
  if (!normalized) {
    throw createApiError('图片 base64 数据为空')
  }
  if (normalized.length % 4 !== 0) {
    throw createApiError('图片 base64 数据格式无效')
  }

  const paddingIndex = normalized.indexOf('=')
  if (paddingIndex >= 0 && !/^={1,2}$/.test(normalized.slice(paddingIndex))) {
    throw createApiError('图片 base64 数据格式无效')
  }
  if (/[^A-Za-z0-9+/=]/.test(normalized)) {
    throw createApiError('图片 base64 数据格式无效')
  }

  return normalized
}

function decodeBase64ToBytes(base64: string, signal?: AbortSignal): Uint8Array {
  const chunkSize = 0x8000
  const bytes = new Uint8Array(getBase64ByteLength(base64))
  let writeOffset = 0

  for (let index = 0; index < base64.length; index += chunkSize) {
    if (signal) {
      throwIfSignalAborted(signal)
    }

    const binaryChunk = atob(base64.slice(index, index + chunkSize))
    for (let chunkIndex = 0; chunkIndex < binaryChunk.length; chunkIndex += 1) {
      bytes[writeOffset] = binaryChunk.charCodeAt(chunkIndex)
      writeOffset += 1
    }
  }

  return writeOffset === bytes.length ? bytes : bytes.slice(0, writeOffset)
}

async function fetchImageUrlAsBlob(
  url: string,
  signal: AbortSignal,
): Promise<Blob> {
  const response = await fetch(url, {
    cache: 'no-store',
    signal,
  })

  if (!response.ok) {
    throw new Error(`图片 URL 下载失败：HTTP ${response.status}`)
  }

  return await response.blob()
}

async function blobToDataUrl(blob: Blob, fallbackMime: string, signal?: AbortSignal): Promise<string> {
  const blobToRead = blob.type ? blob : new Blob([blob], { type: fallbackMime })

  return await new Promise((resolve, reject) => {
    const reader = new FileReader()

    const cleanupAbort = (abortHandler?: () => void) => {
      if (signal && abortHandler) {
        signal.removeEventListener('abort', abortHandler)
      }
    }

    const abortHandler = signal
      ? () => {
          reader.abort()
          reject(new DOMException('Aborted', 'AbortError'))
        }
      : undefined

    if (signal) {
      throwIfSignalAborted(signal)
      signal.addEventListener('abort', abortHandler!, { once: true })
    }

    reader.onload = () => {
      cleanupAbort(abortHandler)
      if (typeof reader.result !== 'string') {
        reject(new Error('Blob 转 data URL 失败：读取结果不是字符串'))
        return
      }
      resolve(reader.result)
    }
    reader.onerror = () => {
      cleanupAbort(abortHandler)
      reject(reader.error ?? new Error('Blob 转 data URL 失败'))
    }
    reader.onabort = () => {
      cleanupAbort(abortHandler)
      reject(new DOMException('Aborted', 'AbortError'))
    }

    reader.readAsDataURL(blobToRead)
  })
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

function readOptionalText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function clampMaskCoordinate(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function resolveSelectionBounds(
  selection: ImageEditSelection | null | undefined,
  width: number,
  height: number,
): { left: number; top: number; width: number; height: number } | null {
  if (!selection) {
    return null
  }

  if (
    !Number.isFinite(selection.x) ||
    !Number.isFinite(selection.y) ||
    !Number.isFinite(selection.width) ||
    !Number.isFinite(selection.height)
  ) {
    return null
  }

  const left = clampMaskCoordinate(Math.round(selection.x * width), 0, width)
  const top = clampMaskCoordinate(Math.round(selection.y * height), 0, height)
  const selectionWidth = clampMaskCoordinate(Math.round(selection.width * width), 1, width - left)
  const selectionHeight = clampMaskCoordinate(Math.round(selection.height * height), 1, height - top)

  if (selectionWidth <= 0 || selectionHeight <= 0) {
    return null
  }

  return {
    left,
    top,
    width: selectionWidth,
    height: selectionHeight,
  }
}

function paintCanonicalEditMask(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  selectionBounds: { left: number; top: number; width: number; height: number },
) {
  context.clearRect(0, 0, width, height)
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, width, height)
  context.clearRect(
    selectionBounds.left,
    selectionBounds.top,
    selectionBounds.width,
    selectionBounds.height,
  )
}

interface AlphaBounds {
  count: number
  left: number
  top: number
  right: number
  bottom: number
}

function createEmptyAlphaBounds(width: number, height: number): AlphaBounds {
  return {
    count: 0,
    left: width,
    top: height,
    right: -1,
    bottom: -1,
  }
}

function includeAlphaBounds(bounds: AlphaBounds, x: number, y: number) {
  bounds.count += 1
  bounds.left = Math.min(bounds.left, x)
  bounds.top = Math.min(bounds.top, y)
  bounds.right = Math.max(bounds.right, x)
  bounds.bottom = Math.max(bounds.bottom, y)
}

function coversFullCanvas(bounds: AlphaBounds, width: number, height: number): boolean {
  return (
    bounds.count > 0 &&
    bounds.left === 0 &&
    bounds.top === 0 &&
    bounds.right === width - 1 &&
    bounds.bottom === height - 1
  )
}
