import { zipSync, unzipSync, strFromU8, strToU8 } from 'fflate'
import {
  clearTasks as dbClearTasks,
  getAllTasks,
  putTask,
} from '../lib/db'
import type {
  AppSettings,
  CategoryConfig,
  ExportData,
  ExportImageFileEntry,
  ProviderConfig,
  StoredImage,
  TaskParams,
} from '../types'
import {
  getImportedCategoriesFromExport,
  getImportedPromptLibraryFromExport,
  getImportedProvidersFromExport,
  getTaskReferencedImageIds,
  mergeImportedCategories,
  mergePromptLibraryItems,
  mergeImportedProviders,
  remapImportedTaskRelations,
} from './domain'
import {
  clearImageAssets,
  listImageAssetRecords,
  saveImageAssetBlob,
  saveRemoteImageAsset,
  stageImageAssetReference,
} from './imageAssets'
import { buildPersistedAppStateSnapshot, readPersistedAppStateSnapshot } from './persistedState'
import { useStore } from './state'
import { repairCategoryStateFromTasks } from './taskStoreUtils'
import {
  getImageExtensionFromMimeType,
  getImageMimeTypeFromPath,
} from '../lib/imageMime'
import { isRemoteImageUrl } from '../lib/imageUrl'
import { DEFAULT_PARAMS } from './taskParams'

interface PreparedImportedRemoteImage {
  id: string
  mode: 'remote_url'
  remoteUrl: string
  info: ExportImageFileEntry
}

interface PreparedImportedBlobImage {
  id: string
  mode: 'local_blob'
  originalBlob: Blob
  thumbnailBlob?: Blob | null
  info: ExportImageFileEntry
}

type PreparedImportedImage = PreparedImportedRemoteImage | PreparedImportedBlobImage

function toOwnedArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const ownedBytes = new Uint8Array(bytes.length)
  ownedBytes.set(bytes)
  return ownedBytes.buffer
}

export async function clearAllData() {
  await dbClearTasks()
  await clearImageAssets()

  const {
    setTasks,
    clearInputImages,
    replaceProviderState,
    replaceCategoryState,
    replacePromptLibrary,
    setParams,
    setTaskView,
    setImageEditSession,
    setShowPromptLibrary,
    showToast,
  } = useStore.getState()

  setTasks([])
  clearInputImages()
  replaceProviderState([])
  replaceCategoryState([])
  replacePromptLibrary([])
  setParams({ ...DEFAULT_PARAMS })
  setTaskView('gallery')
  setImageEditSession(null)
  setShowPromptLibrary(false)
  showToast('所有数据已清空', 'success')
}

function dataUrlToBytes(dataUrl: string): { mimeType: string; ext: string; bytes: Uint8Array } {
  const normalized = dataUrl.trim()
  const headerMatch = /^data:([^;,]+);base64,/i.exec(normalized)
  if (!headerMatch) {
    throw new Error('只支持 base64 data URL 图片导出')
  }

  const mimeType = headerMatch[1].toLowerCase()
  const ext = resolveExtensionFromMimeType(mimeType)
  const base64 = normalized.slice(headerMatch[0].length)
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }

  return { mimeType, ext, bytes }
}

async function blobToBytes(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer())
}

function resolveExtensionFromMimeType(mimeType: string | null | undefined): string {
  return getImageExtensionFromMimeType(mimeType)
}

function resolveMimeTypeFromPath(filePath: string, fallbackMimeType?: string | null): string {
  return getImageMimeTypeFromPath(filePath, fallbackMimeType ?? 'image/png')
}

function createImageArchivePath(id: string, mimeType: string | null | undefined, suffix?: string): string {
  const ext = resolveExtensionFromMimeType(mimeType)
  return suffix ? `images/${id}.${suffix}.${ext}` : `images/${id}.${ext}`
}

function normalizeOptionalFiniteNumber(value: unknown): number | null | undefined {
  if (value === undefined || value === null) {
    return value
  }
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function normalizeOptionalSource(value: unknown): 'upload' | 'generated' | undefined {
  if (value === 'upload' || value === 'generated') {
    return value
  }
  return undefined
}

function normalizeOptionalString(value: unknown): string | null | undefined {
  if (value === undefined || value === null) {
    return value
  }
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

async function exportImageRecord(
  image: StoredImage,
  createdAt: number,
  zipFiles: Record<string, Uint8Array | [Uint8Array, { mtime: Date }]>,
): Promise<ExportImageFileEntry> {
  if (image.kind === 'remote_url') {
    return {
      kind: 'remote_url',
      url: image.remoteUrl,
      createdAt,
      source: image.source,
      mimeType: image.mimeType ?? null,
      width: image.width ?? null,
      height: image.height ?? null,
      byteSize: image.byteSize ?? null,
      contentHash: image.contentHash ?? null,
    }
  }

  if (image.kind === 'local_blob') {
    const mimeType = (image.mimeType ?? image.blob.type) || 'image/png'
    const path = createImageArchivePath(image.id, mimeType)
    zipFiles[path] = [await blobToBytes(image.blob), { mtime: new Date(createdAt) }]

    const thumbnailMimeType = image.thumbnailMimeType ?? image.thumbnailBlob?.type ?? null
    const thumbnailPath = image.thumbnailBlob
      ? createImageArchivePath(image.id, thumbnailMimeType, 'thumb')
      : undefined
    if (thumbnailPath && image.thumbnailBlob) {
      zipFiles[thumbnailPath] = [await blobToBytes(image.thumbnailBlob), { mtime: new Date(createdAt) }]
    }

    return {
      kind: 'local_blob',
      path,
      thumbnailPath,
      createdAt,
      source: image.source,
      mimeType,
      width: image.width ?? null,
      height: image.height ?? null,
      byteSize: image.byteSize ?? image.blob.size,
      contentHash: image.contentHash ?? null,
    }
  }

  const { mimeType, bytes } = dataUrlToBytes(image.dataUrl)
  const path = createImageArchivePath(image.id, image.mimeType ?? mimeType)
  zipFiles[path] = [bytes, { mtime: new Date(createdAt) }]

  return {
    kind: 'legacy_data_url',
    path,
    createdAt,
    source: image.source,
    mimeType: image.mimeType ?? mimeType,
    width: image.width ?? null,
    height: image.height ?? null,
    byteSize: image.byteSize ?? bytes.byteLength,
    contentHash: image.contentHash ?? null,
  }
}

async function prepareImportedImage(
  id: string,
  info: ExportImageFileEntry,
  unzipped: Record<string, Uint8Array>,
): Promise<PreparedImportedImage> {
  const normalizedUrl = normalizeOptionalString(info.url)
  if (normalizedUrl) {
    if (!isRemoteImageUrl(normalizedUrl)) {
      throw new Error(`导入图片 ${id} 的 url 不是合法的 http(s) 地址`)
    }

    return {
      id,
      mode: 'remote_url',
      remoteUrl: normalizedUrl,
      info,
    }
  }

  const normalizedPath = normalizeOptionalString(info.path)
  if (!normalizedPath) {
    throw new Error(`导入图片 ${id} 缺少 path/url，无法恢复`)
  }

  const originalBytes = unzipped[normalizedPath]
  if (!originalBytes) {
    throw new Error(`导入包缺少图片文件：${normalizedPath}`)
  }

  const originalMimeType = resolveMimeTypeFromPath(normalizedPath, normalizeOptionalString(info.mimeType) ?? undefined)
  const originalBlob = new Blob([toOwnedArrayBuffer(originalBytes)], { type: originalMimeType })

  const normalizedThumbnailPath = normalizeOptionalString(info.thumbnailPath)
  let thumbnailBlob: Blob | null | undefined
  if (normalizedThumbnailPath) {
    const thumbnailBytes = unzipped[normalizedThumbnailPath]
    if (!thumbnailBytes) {
      throw new Error(`导入包缺少缩略图文件：${normalizedThumbnailPath}`)
    }

    thumbnailBlob = new Blob([toOwnedArrayBuffer(thumbnailBytes)], {
      type: resolveMimeTypeFromPath(normalizedThumbnailPath),
    })
  }

  return {
    id,
    mode: 'local_blob',
    originalBlob,
    thumbnailBlob,
    info,
  }
}

async function writeImportedImage(image: PreparedImportedImage): Promise<string> {
  if (image.mode === 'remote_url') {
    return saveRemoteImageAsset(image.remoteUrl, {
      id: image.id,
      createdAt: normalizeOptionalFiniteNumber(image.info.createdAt) ?? undefined,
      source: normalizeOptionalSource(image.info.source),
      mimeType: normalizeOptionalString(image.info.mimeType),
      byteSize: normalizeOptionalFiniteNumber(image.info.byteSize) ?? null,
      width: normalizeOptionalFiniteNumber(image.info.width) ?? null,
      height: normalizeOptionalFiniteNumber(image.info.height) ?? null,
      contentHash: normalizeOptionalString(image.info.contentHash),
    })
  }

  const thumbnailBlob = image.thumbnailBlob ?? null
  const width = normalizeOptionalFiniteNumber(image.info.width) ?? null
  const height = normalizeOptionalFiniteNumber(image.info.height) ?? null
  const thumbnailWidth: number | null = null
  const thumbnailHeight: number | null = null

  return saveImageAssetBlob(image.originalBlob, {
    id: image.id,
    createdAt: normalizeOptionalFiniteNumber(image.info.createdAt) ?? undefined,
    source: normalizeOptionalSource(image.info.source),
    mimeType: (normalizeOptionalString(image.info.mimeType) ?? image.originalBlob.type) || null,
    byteSize: normalizeOptionalFiniteNumber(image.info.byteSize) ?? image.originalBlob.size,
    width,
    height,
    contentHash: normalizeOptionalString(image.info.contentHash),
    thumbnailBlob,
    thumbnailMimeType: thumbnailBlob?.type || null,
    thumbnailWidth,
    thumbnailHeight,
  })
}

export async function exportData() {
  try {
    const tasks = await getAllTasks()
    const images = await listImageAssetRecords()
    const appStateSnapshot = buildPersistedAppStateSnapshot(useStore.getState())
    const exportedAt = Date.now()
    const imageCreatedAtFallback = new Map<string, number>()

    for (const task of tasks) {
      for (const id of getTaskReferencedImageIds(task)) {
        const previous = imageCreatedAtFallback.get(id)
        if (previous == null || task.createdAt < previous) {
          imageCreatedAtFallback.set(id, task.createdAt)
        }
      }
    }

    const imageFiles: ExportData['imageFiles'] = {}
    const zipFiles: Record<string, Uint8Array | [Uint8Array, { mtime: Date }]> = {}

    for (const image of images) {
      const createdAt = image.createdAt ?? imageCreatedAtFallback.get(image.id) ?? exportedAt
      imageFiles[image.id] = await exportImageRecord(image, createdAt, zipFiles)
    }

    const manifest: ExportData = {
      version: 9,
      exportedAt: new Date(exportedAt).toISOString(),
      settings: appStateSnapshot.settings as AppSettings,
      providers: appStateSnapshot.providers as ProviderConfig[] | undefined,
      activeProviderId: appStateSnapshot.activeProviderId as string | undefined,
      categories: appStateSnapshot.categories as CategoryConfig[] | undefined,
      activeCategoryFilter: appStateSnapshot.activeCategoryFilter as string | undefined,
      params: appStateSnapshot.params as TaskParams | undefined,
      promptLibrary: appStateSnapshot.promptLibrary as ExportData['promptLibrary'],
      persistedState: appStateSnapshot,
      tasks,
      imageFiles,
    }

    zipFiles['manifest.json'] = [
      strToU8(JSON.stringify(manifest, null, 2)),
      { mtime: new Date(exportedAt) },
    ]

    const zipped = zipSync(zipFiles, { level: 6 })
    const blob = new Blob([zipped.buffer as ArrayBuffer], { type: 'application/zip' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `gpt-image-playground-${Date.now()}.zip`
    anchor.click()
    URL.revokeObjectURL(url)
    useStore.getState().showToast('数据已导出', 'success')
  } catch (error) {
    useStore
      .getState()
      .showToast(`导出失败：${error instanceof Error ? error.message : String(error)}`, 'error')
  }
}

export async function importData(file: File) {
  try {
    const buffer = await file.arrayBuffer()
    const unzipped = unzipSync(new Uint8Array(buffer))

    const manifestBytes = unzipped['manifest.json']
    if (!manifestBytes) {
      throw new Error('ZIP 中缺少 manifest.json')
    }

    const data: ExportData = JSON.parse(strFromU8(manifestBytes))
    if (!Array.isArray(data.tasks) || !data.imageFiles || typeof data.imageFiles !== 'object') {
      throw new Error('无效的数据格式')
    }

    const persistedStateSnapshot = readPersistedAppStateSnapshot(data.persistedState)
    const currentState = useStore.getState()
    const existingTasks = await getAllTasks()
    const existingTaskIds = new Set(existingTasks.map((task) => task.id))
    const importedProviders = getImportedProvidersFromExport(data, persistedStateSnapshot)
    const importedCategories = getImportedCategoriesFromExport(data, persistedStateSnapshot)
    const importedPromptLibrary = getImportedPromptLibraryFromExport(data, persistedStateSnapshot)
    const { providers: mergedProviders, providerIdMap, addedProviderCount } = mergeImportedProviders(
      currentState.providers,
      importedProviders,
    )
    const { categories: mergedCategories, categoryIdMap, addedCategoryCount } = mergeImportedCategories(
      currentState.categories,
      importedCategories,
    )
    const { promptLibrary: mergedPromptLibrary, addedCount: addedPromptLibraryCount } =
      mergePromptLibraryItems(currentState.promptLibrary, importedPromptLibrary)

    const tasksToImport = data.tasks
      .filter((task) => !existingTaskIds.has(task.id))
      .map((task) =>
        remapImportedTaskRelations(
          task,
          mergedProviders,
          providerIdMap,
          mergedCategories,
          categoryIdMap,
        ),
      )
    const skippedTaskCount = data.tasks.length - tasksToImport.length
    const referencedImageIds = new Set<string>()

    for (const task of tasksToImport) {
      for (const id of getTaskReferencedImageIds(task)) {
        referencedImageIds.add(id)
      }
    }

    for (const referencedImageId of referencedImageIds) {
      if (!(referencedImageId in data.imageFiles)) {
        throw new Error(`导入包缺少被任务引用的图片条目：${referencedImageId}`)
      }
    }

    const preparedImages: PreparedImportedImage[] = []
    for (const [id, info] of Object.entries(data.imageFiles)) {
      if (!referencedImageIds.has(id)) {
        continue
      }

      preparedImages.push(await prepareImportedImage(id, info, unzipped))
    }

    for (const preparedImage of preparedImages) {
      await writeImportedImage(preparedImage)
    }

    for (const task of tasksToImport) {
      await putTask(task)
    }

    useStore.getState().replaceProviderState(mergedProviders, currentState.activeProviderId)
    useStore.getState().replaceCategoryState(mergedCategories, currentState.activeCategoryFilter)
    useStore.getState().replacePromptLibrary(mergedPromptLibrary)

    const tasks = await getAllTasks()
    useStore.getState().setTasks(tasks)
    repairCategoryStateFromTasks(tasks)

    const summaryParts = [`已导入 ${tasksToImport.length} 条记录`]
    if (data.version === 6) {
      summaryParts.push('已兼容导入 v6 备份')
    }
    if (skippedTaskCount > 0) {
      summaryParts.push(`跳过 ${skippedTaskCount} 条重复记录`)
    }
    if (addedProviderCount > 0) {
      summaryParts.push(`新增 ${addedProviderCount} 个供应商`)
    }
    if (addedCategoryCount > 0) {
      summaryParts.push(`新增 ${addedCategoryCount} 个分类`)
    }
    if (addedPromptLibraryCount > 0) {
      summaryParts.push(`新增 ${addedPromptLibraryCount} 条提示词`)
    }
    useStore.getState().showToast(summaryParts.join('，'), 'success')
  } catch (error) {
    useStore
      .getState()
      .showToast(`导入失败：${error instanceof Error ? error.message : String(error)}`, 'error')
  }
}

export async function addImageFromFile(file: File): Promise<void> {
  if (!file.type.startsWith('image/')) {
    return
  }

  const dataUrl = await fileToDataUrl(file)
  const id = await stageImageAssetReference(dataUrl)
  useStore.getState().addInputImage({ id, dataUrl })
}

export function normalizeImageUrl(url: string): string {
  const trimmed = url.trim()
  if (!trimmed) {
    throw new Error('图片 URL 不能为空')
  }

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    throw new Error('图片 URL 格式无效')
  }

  if (!/^https?:$/i.test(parsed.protocol)) {
    throw new Error('只支持 http 或 https 的公网图片 URL')
  }

  return parsed.toString()
}

export async function addImageFromUrl(url: string): Promise<void> {
  const normalizedUrl = normalizeImageUrl(url)
  const id = await stageImageAssetReference(normalizedUrl)
  useStore.getState().addInputImage({ id, dataUrl: normalizedUrl })
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
