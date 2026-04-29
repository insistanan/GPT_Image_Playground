import { zipSync, unzipSync, strFromU8, strToU8 } from 'fflate'
import { clearImages, clearTasks as dbClearTasks, getAllImages, getAllTasks, hashDataUrl, putImage, putTask } from '../lib/db'
import type { AppSettings, CategoryConfig, ExportData, ProviderConfig, TaskParams } from '../types'
import { DEFAULT_PARAMS } from '../types'
import { clearImageCaches, setCachedImage } from './cache'
import {
  getImportedCategoriesFromExport,
  getImportedProvidersFromExport,
  getTaskReferencedImageIds,
  isRemoteImageUrl,
  mergeImportedCategories,
  mergeImportedProviders,
  remapImportedTaskRelations,
} from './domain'
import { buildPersistedAppStateSnapshot, readPersistedAppStateSnapshot } from './persistedState'
import { useStore } from './state'
import { repairCategoryStateFromTasks } from './taskStoreUtils'

export async function clearAllData() {
  await dbClearTasks()
  await clearImages()
  clearImageCaches()

  const {
    setTasks,
    clearInputImages,
    replaceProviderState,
    replaceCategoryState,
    setParams,
    setTaskView,
    setImageEditSession,
    showToast,
  } = useStore.getState()

  setTasks([])
  clearInputImages()
  replaceProviderState([])
  replaceCategoryState([])
  setParams({ ...DEFAULT_PARAMS })
  setTaskView('gallery')
  setImageEditSession(null)
  showToast('所有数据已清空', 'success')
}

function dataUrlToBytes(dataUrl: string): { ext: string; bytes: Uint8Array } {
  const match = dataUrl.match(/^data:image\/(\w+);base64,/)
  const ext = match?.[1] ?? 'png'
  const base64 = dataUrl.replace(/^data:[^;]+;base64,/, '')
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return { ext, bytes }
}

function bytesToDataUrl(bytes: Uint8Array, filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? 'png'
  const mimeMap: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
  }
  const mime = mimeMap[ext] ?? 'image/png'
  let binary = ''
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index])
  }
  return `data:${mime};base64,${btoa(binary)}`
}

export async function exportData() {
  try {
    const tasks = await getAllTasks()
    const images = await getAllImages()
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
      if (isRemoteImageUrl(image.dataUrl)) {
        imageFiles[image.id] = { url: image.dataUrl, createdAt, source: image.source }
        continue
      }

      const { ext, bytes } = dataUrlToBytes(image.dataUrl)
      const path = `images/${image.id}.${ext}`
      imageFiles[image.id] = { path, createdAt, source: image.source }
      zipFiles[path] = [bytes, { mtime: new Date(createdAt) }]
    }

    const manifest: ExportData = {
      version: 5,
      exportedAt: new Date(exportedAt).toISOString(),
      settings: appStateSnapshot.settings as AppSettings,
      providers: appStateSnapshot.providers as ProviderConfig[] | undefined,
      activeProviderId: appStateSnapshot.activeProviderId as string | undefined,
      categories: appStateSnapshot.categories as CategoryConfig[] | undefined,
      activeCategoryFilter: appStateSnapshot.activeCategoryFilter as string | undefined,
      params: appStateSnapshot.params as TaskParams | undefined,
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
    const { providers: mergedProviders, providerIdMap, addedProviderCount } = mergeImportedProviders(
      currentState.providers,
      importedProviders,
    )
    const { categories: mergedCategories, categoryIdMap, addedCategoryCount } = mergeImportedCategories(
      currentState.categories,
      importedCategories,
    )

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

    for (const [id, info] of Object.entries(data.imageFiles)) {
      if (!referencedImageIds.has(id)) {
        continue
      }

      if (info.url) {
        await putImage({ id, dataUrl: info.url, createdAt: info.createdAt, source: info.source })
        setCachedImage(id, info.url)
        continue
      }

      if (!info.path) {
        continue
      }

      const bytes = unzipped[info.path]
      if (!bytes) {
        continue
      }

      const dataUrl = bytesToDataUrl(bytes, info.path)
      await putImage({ id, dataUrl, createdAt: info.createdAt, source: info.source })
      setCachedImage(id, dataUrl)
    }

    for (const task of tasksToImport) {
      await putTask(task)
    }

    useStore.getState().replaceProviderState(mergedProviders, currentState.activeProviderId)
    useStore.getState().replaceCategoryState(mergedCategories, currentState.activeCategoryFilter)

    const tasks = await getAllTasks()
    useStore.getState().setTasks(tasks)
    repairCategoryStateFromTasks(tasks)

    const summaryParts = [`已导入 ${tasksToImport.length} 条记录`]
    if (skippedTaskCount > 0) {
      summaryParts.push(`跳过 ${skippedTaskCount} 条重复记录`)
    }
    if (addedProviderCount > 0) {
      summaryParts.push(`新增 ${addedProviderCount} 个供应商`)
    }
    if (addedCategoryCount > 0) {
      summaryParts.push(`新增 ${addedCategoryCount} 个分类`)
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
  const id = await hashDataUrl(dataUrl)
  setCachedImage(id, dataUrl)
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
  const id = await hashDataUrl(normalizedUrl)
  setCachedImage(id, normalizedUrl)
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
