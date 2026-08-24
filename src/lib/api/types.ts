import type {
  AppliedTransportMeta,
  AppSettings,
  ImageEditSelection,
  TaskErrorDebugInfo,
  TaskParams,
  TaskResponseMeta,
} from '../../types'
import type { readClientDevProxyConfig } from '../devProxy'

export interface CallImageApiIntent {
  settings: AppSettings
  prompt: string
  params: TaskParams
  inputImages: ApiInputImage[]
  editMask?: ApiEditMask | null
  onFinalImages?: (images: ApiImageAsset[]) => void | Promise<void>
  registerAbort?: (abort: () => void) => void
}

export interface ApiInputImage {
  dataUrl: string
  id?: string
}

export interface ApiEditMask {
  dataUrl: string
  sourceImageId?: string | null
  selection?: ImageEditSelection | null
}

export interface CallApiOptions {
  settings: AppSettings
  prompt: string
  params: TaskParams
  inputImageDataUrls: string[]
  editMaskDataUrl?: string
  editSelection?: ImageEditSelection | null
  editSourceImageIndex?: number
  onFinalImages?: (images: ApiImageAsset[]) => void | Promise<void>
  registerAbort?: (abort: () => void) => void
}

export interface ApiImageAsset {
  blob: Blob
  mimeType: string
  outputFormat?: string
  sourceUrl?: string
  itemId?: string
  outputIndex?: number
}

export interface DecodedImageAsset extends ApiImageAsset {
  signature: string
}

export interface CallApiResult {
  images: ApiImageAsset[]
  responseMeta?: TaskResponseMeta
}

export type ApiError = Error & {
  status?: number
  requestId?: string
  details?: unknown
}

export type ApiDebugRequestLogEntry = NonNullable<TaskErrorDebugInfo['requestLog']>[number]
export type ApiDebugRequestSnapshot = NonNullable<TaskErrorDebugInfo['request']>
export type ActualTransportKind = NonNullable<AppliedTransportMeta['actual']>

export interface SharedRequestContext {
  controller: AbortController
  /**
   * 重置请求超时计时器。每个 RequestPlan 开始时调用，
   * 避免前面降级重试消耗掉后续 plan 的全部可用时间。
   */
  refreshTimeout: () => void
  requestHeaders: Record<string, string>
  proxyConfig: ReturnType<typeof readClientDevProxyConfig>
  mime: string
  forceProxy: boolean
  debugLog: ApiDebugRequestLogEntry[]
}

export interface ResponsesInputImage {
  type: 'input_image'
  image_url?: string
  file_id?: string
}

export interface ResponsesInputImageMask {
  image_url?: string
  file_id?: string
}

export type ResponsesInputContent =
  | {
      type: 'input_text'
      text: string
    }
  | ResponsesInputImage

export type ResponsesInputPayloadMode = 'compact-string' | 'message-list'
export type ResponsesTransportKind = 'json' | 'stream'
export type ResponsesActionMode = 'auto' | 'explicit'
export type ResponsesToolChoiceMode = 'omit' | 'force'
export type ImagesRequestBodyMode = 'json' | 'multipart'

export interface ResponsesRequestPlan {
  id: string
  inputPayloadMode: ResponsesInputPayloadMode
  transport: ResponsesTransportKind
  actionMode: ResponsesActionMode
  toolChoiceMode: ResponsesToolChoiceMode
}

export interface ImagesRequestPlan {
  id: string
  transport: ResponsesTransportKind
  bodyMode: ImagesRequestBodyMode
}

export interface ParsedSseEvent {
  event: string
  dataText: string
  json?: unknown
}

export interface ResponsesStreamImageEvent {
  event: string
  itemId?: string
  outputIndex?: number
  outputFormat?: string
  background?: string
  base64?: string
  isPartial: boolean
}

export interface StreamedPayloadResult {
  payload: unknown
  streamedFinalImageCount: number
  streamedImages: ApiImageAsset[]
  actualTransport: ActualTransportKind
}
