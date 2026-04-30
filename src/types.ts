import {
  UNCATEGORIZED_CATEGORY_NAME,
  UNKNOWN_TASK_PROVIDER_NAME,
} from './store/taskRecordConstants'
import { DEFAULT_PARAMS } from './store/taskParams'

// ===== 设置 =====

export interface AppSettings {
  baseUrl: string
  apiKey: string
  model: string
  responsesImageModel: string
  responsesTransport: ResponsesTransportMode
  responsesImageInputMode: ResponsesImageInputMode
  responsesPromptRevisionMode: ResponsesPromptRevisionMode
  timeout: number
  apiProtocol: ApiProtocol
  requestMode: RequestMode
}

export type ApiProtocol = 'images' | 'responses'
export type RequestMode = 'direct' | 'local_proxy'
export type ResponsesTransportMode = 'auto' | 'stream' | 'json'
export type ResponsesImageInputMode = 'auto' | 'file_id'
export type ResponsesPromptRevisionMode = 'allow' | 'compat'
export type TaskView = 'gallery' | 'trash'
export type GalleryDisplayMode = 'standard' | 'image'

export interface ImageEditSelection {
  x: number
  y: number
  width: number
  height: number
}

export interface ImageEditSession {
  taskId: string
  providerId: string | null
  sourceImageId: string
  sourceImageDataUrl: string
  sourceImageIds?: string[] | null
  lineageParentTaskId?: string | null
  lineageParentImageId?: string | null
  prompt: string
  params: TaskParams
  initialSelection?: ImageEditSelection | null
}

export interface ProviderConfig extends AppSettings {
  id: string
  name: string
}

export interface CategoryConfig {
  id: string
  name: string
  createdAt: number
}

export interface PromptLibraryItem {
  id: string
  title: string
  content: string
  createdAt: number
  updatedAt: number
}

export const ALL_CATEGORY_FILTER = '__all__'
export const FAVORITES_CATEGORY_FILTER = '__favorites__'
export const UNCATEGORIZED_CATEGORY_FILTER = '__uncategorized__'
export { DEFAULT_PARAMS, UNCATEGORIZED_CATEGORY_NAME, UNKNOWN_TASK_PROVIDER_NAME }

const DEFAULT_BASE_URL = import.meta.env.VITE_DEFAULT_API_URL?.trim() || 'https://api.openai.com'
const DEFAULT_REQUEST_MODE: RequestMode = import.meta.env.DEV ? 'local_proxy' : 'direct'

export const DEFAULT_SETTINGS: AppSettings = {
  baseUrl: DEFAULT_BASE_URL,
  apiKey: '',
  model: 'gpt-image-2',
  responsesImageModel: 'gpt-image-2',
  responsesTransport: 'auto',
  responsesImageInputMode: 'auto',
  responsesPromptRevisionMode: 'allow',
  timeout: 900,
  apiProtocol: 'images',
  requestMode: DEFAULT_REQUEST_MODE,
}

// ===== 任务参数 =====

export interface TaskParams {
  size: string
  quality: 'auto' | 'low' | 'medium' | 'high'
  output_format: 'png' | 'jpeg' | 'webp'
  output_compression: number | null
  moderation: 'auto' | 'low'
  n: number
}

export interface AppliedImageParams {
  size?: string | null
  quality?: string | null
  output_format?: string | null
  background?: string | null
  action?: string | null
}

export interface AppliedTransportMeta {
  requested?: ResponsesTransportMode | null
  actual?: 'stream' | 'json' | null
  fallbackFromStream?: boolean | null
}

export interface TaskResponseMeta {
  appliedImageParams?: AppliedImageParams | null
  revisedPrompt?: string | null
  transport?: AppliedTransportMeta | null
}

export interface TaskErrorDebugImageSummary {
  index?: number
  kind: 'data_url' | 'remote_url' | 'unknown'
  mime?: string | null
  sizeBytes?: number | null
  url?: string | null
}

export interface TaskErrorDebugRequestSnapshot {
  baseUrl: string
  requestMode: RequestMode
  apiProtocol: ApiProtocol
  model: string
  responsesImageModel?: string | null
  responsesTransport?: ResponsesTransportMode | null
  responsesImageInputMode?: ResponsesImageInputMode | null
  responsesPromptRevisionMode?: ResponsesPromptRevisionMode | null
  prompt: string
  params: TaskParams
  inputImages: TaskErrorDebugImageSummary[]
  editMask?: (TaskErrorDebugImageSummary & { present: boolean }) | null
}

export interface TaskErrorDebugRequestLogEntry {
  stage: string
  method: string
  url: string
  requestHeaders?: Record<string, unknown> | null
  requestBody?: unknown
  responseStatus?: number | null
  responseRequestId?: string | null
  responseBody?: unknown
  responseText?: string | null
}

export interface TaskErrorDebugFailure {
  message: string
  status?: number | null
  requestId?: string | null
  details?: unknown
}

export interface TaskErrorDebugInfo {
  createdAt?: number
  requestId?: string | null
  status?: number | null
  requestMode?: RequestMode
  apiProtocol?: ApiProtocol
  baseUrl?: string
  model?: string
  responsesImageModel?: string | null
  responsesTransport?: ResponsesTransportMode | null
  responsesImageInputMode?: ResponsesImageInputMode | null
  responsesPromptRevisionMode?: ResponsesPromptRevisionMode | null
  request?: TaskErrorDebugRequestSnapshot | null
  requestLog?: TaskErrorDebugRequestLogEntry[] | null
  failure?: TaskErrorDebugFailure | null
  details?: unknown
}

// ===== 输入图片（UI 层面） =====

export interface InputImage {
  /** IndexedDB image store 的 id（SHA-256 hash） */
  id: string
  /** 可直接用于预览的图片地址（data URL 或公网 http(s) URL） */
  dataUrl: string
  /** 局部编辑时使用的蒙版图，仅在提交阶段参与请求 */
  maskDataUrl?: string | null
  /** 蒙版对应的选区，使用 0-1 相对坐标 */
  editSelection?: ImageEditSelection | null
  /** 追踪它来自哪条任务/哪张输出图，方便回到编辑器继续调整 */
  sourceTaskId?: string | null
  sourceImageId?: string | null
  /** 输入区内部保留的父任务链信息，后续手动提交时优先据此建立 lineage */
  lineageParentTaskId?: string | null
  lineageParentImageId?: string | null
}

// ===== 任务记录 =====

export type TaskStatus = 'running' | 'done' | 'error' | 'partial_error'
export type TaskKind = 'generation' | 'image'

export interface TaskRecord {
  id: string
  /** 任务类型：普通生成任务 / 单图任务 */
  taskKind?: TaskKind
  /** 任务提交时选中的供应商 ID */
  providerId?: string | null
  /** 任务提交时记录的供应商名称快照 */
  providerName?: string | null
  /** 任务提交时记录的分类 ID */
  categoryId?: string | null
  /** 任务提交时记录的分类名称快照 */
  categoryName?: string | null
  /** 移入回收站时间，null 表示仍在画廊 */
  deletedAt?: number | null
  /** 收藏状态，独立于分类存在 */
  isFavorite?: boolean
  /** 这条任务直接来源于哪条上游任务，例如编辑输出后新建的任务 */
  parentTaskId?: string | null
  /** 若这条任务来源于上游任务中的某张图片，则记录那张图片 id */
  parentImageId?: string | null
  prompt: string
  params: TaskParams
  /** 输入图片的 image store id 列表 */
  inputImageIds: string[]
  /** 局部编辑蒙版图片 id */
  editMaskImageId?: string | null
  /** 蒙版对应的输出图 id */
  editSourceImageId?: string | null
  /** 蒙版选区，使用 0-1 相对坐标 */
  editSelection?: ImageEditSelection | null
  /** 输出图片的 image store id 列表 */
  outputImages: string[]
  /** API 返回的实际生效图片参数与附加元信息 */
  responseMeta?: TaskResponseMeta | null
  /** 失败时记录的请求与响应调试上下文 */
  errorDebug?: TaskErrorDebugInfo | null
  /** 用户主动中止的任务会标记为 true */
  isAborted?: boolean
  status: TaskStatus
  error: string | null
  createdAt: number
  finishedAt: number | null
  /** 总耗时毫秒 */
  elapsed: number | null
}

export interface TaskImageProgress {
  completed: number
  total: number
  countLabel: string | null
}

// ===== IndexedDB 存储的图片 =====

export type StoredImageKind = 'local_blob' | 'remote_url' | 'legacy_data_url'
export type StoredImageSource = 'upload' | 'generated'

export interface StoredImageBase {
  id: string
  kind: StoredImageKind
  /** 图片首次存储时间（ms） */
  createdAt?: number
  /** 图片来源：用户上传 / API 生成 */
  source?: StoredImageSource
  /** 本地二进制内容 hash；remote URL 记录允许为空 */
  contentHash?: string | null
  mimeType?: string | null
  byteSize?: number | null
  width?: number | null
  height?: number | null
}

export interface StoredLocalBlobImage extends StoredImageBase {
  kind: 'local_blob'
  blob: Blob
  thumbnailBlob?: Blob | null
  thumbnailMimeType?: string | null
  thumbnailWidth?: number | null
  thumbnailHeight?: number | null
  migratedFromLegacyAt?: number | null
}

export interface StoredRemoteUrlImage extends StoredImageBase {
  kind: 'remote_url'
  remoteUrl: string
}

export interface StoredLegacyDataUrlImage extends StoredImageBase {
  kind: 'legacy_data_url'
  dataUrl: string
}

export type StoredImage =
  | StoredLocalBlobImage
  | StoredRemoteUrlImage
  | StoredLegacyDataUrlImage

export interface ExportImageFileEntry {
  kind?: StoredImageKind
  path?: string
  thumbnailPath?: string
  url?: string
  createdAt?: number
  source?: StoredImageSource
  mimeType?: string | null
  width?: number | null
  height?: number | null
  byteSize?: number | null
  contentHash?: string | null
}

// ===== API 请求体 =====

export interface ImageGenerationRequest {
  model: string
  prompt: string
  size: string
  quality: string
  output_format: string
  moderation: string
  output_compression?: number
  n?: number
}

// ===== API 响应 =====

export interface ImageResponseItem {
  b64_json?: string
  url?: string
}

export interface ImageApiResponse {
  data: ImageResponseItem[]
}

// ===== 导出数据 =====

/** ZIP manifest.json 格式 */
export interface ExportData {
  version: number
  exportedAt: string
  settings: AppSettings
  providers?: ProviderConfig[]
  activeProviderId?: string
  categories?: CategoryConfig[]
  activeCategoryFilter?: string
  params?: TaskParams
  promptLibrary?: PromptLibraryItem[]
  persistedState?: Record<string, unknown>
  tasks: TaskRecord[]
  /** imageId → 图片信息 */
  imageFiles: Record<string, ExportImageFileEntry>
}

export function resolveCategoryFilterName(
  filter: string,
  categories: CategoryConfig[],
): string {
  if (filter === ALL_CATEGORY_FILTER) return '全部分类'
  if (filter === FAVORITES_CATEGORY_FILTER) return '收藏'
  if (filter === UNCATEGORIZED_CATEGORY_FILTER) return UNCATEGORIZED_CATEGORY_NAME

  const category = categories.find((item) => item.id === filter)
  return category?.name?.trim() || UNCATEGORIZED_CATEGORY_NAME
}

export {
  canEditTaskOutputs,
  isTaskInRecycleBin,
  resolveTaskAppliedImageParam,
  resolveTaskCategoryName,
  resolveTaskDisplayImageParam,
  resolveTaskImageProgress,
  resolveTaskKind,
  resolveTaskProviderName,
  resolveTaskStatusLabel,
  resolveTaskTransportLabel,
  resolveTaskTransportMeta,
} from './store/taskRecords'
