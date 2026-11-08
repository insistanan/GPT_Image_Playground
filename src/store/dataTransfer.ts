import { strFromU8, strToU8 } from 'fflate'
import { getAllTasks, putTasks } from '@/lib/db'
import { commitImportedRecords } from '@/lib/db/archive'
import { STORE_IMAGES, STORE_TASKS, writeDbBatch } from '@/lib/db/schema'
import type { AppSettings, CategoryConfig, ExportData, GalleryDisplayMode, ProviderConfig, StoredImage, TaskParams } from '@/types'
import type { PersistedAppStateSnapshot } from './contracts'
import {
  getImportedCategoriesFromExport, getImportedPromptLibraryFromExport, getImportedProvidersFromExport,
  getTaskReferencedImageIds, mergeImportedCategories, mergePromptLibraryItems,
  mergeImportedProviders, remapImportedTaskRelations, mergeImportedItemsWithLiveState,
} from './domain'
import { clearImageAssetCaches, listImages, storeImage } from './imageAssets'
import { buildPersistedAppStateSnapshot, readPersistedAppStateSnapshot } from './persistedState'
import { useStore } from './state'
import { repairCategoryStateFromTasks } from './taskStoreUtils'
import { DEFAULT_PARAMS } from './taskParams'
import { assertDataVersion, getDataVersion, resetLocalData, withDataMutation } from './dataMutation'
import { cancelAllTaskExecutions } from './taskExecutor'
import { initStore } from './taskMaintenance'
import { assertImportedImageIdsCompatible, exportImageRecord, prepareImportedImageRecord, toOwnedArrayBuffer, unzipArchive, zipArchive } from './data-transfer/archive'
import { parseExportManifest, parseImportedParams } from './data-transfer/manifest'
import { recoverInterruptedTask } from './taskRecords'

export async function clearAllData() {
  cancelAllTaskExecutions()
  await resetLocalData(async () => {
    try {
      await writeDbBatch([STORE_TASKS, STORE_IMAGES], (transaction) => {
        transaction.objectStore(STORE_TASKS).clear()
        transaction.objectStore(STORE_IMAGES).clear()
      })
    } catch (error) {
      // 请求已取消且旧版本不可再写回，清空失败也必须结束这些任务。
      const { tasks, setTasks } = useStore.getState()
      const now = Date.now()
      const recoveredTasks = tasks.map((task) => recoverInterruptedTask(task, now))
      setTasks(recoveredTasks)
      try {
        await putTasks(recoveredTasks.filter((task, index) => task !== tasks[index]))
      } catch (saveError) {
        throw new Error(`清空失败：${error instanceof Error ? error.message : String(error)}；中断任务状态保存失败：${saveError instanceof Error ? saveError.message : String(saveError)}`)
      }
      throw error
    }
    clearImageAssetCaches()

    const {
      setTasks,
      setPrompt,
      clearInputImages,
      replaceProviderState,
      replaceCategoryState,
      replacePromptLibrary,
      setParams,
      setTaskView,
      setImageEditSession,
      setShowPromptLibrary,
      setLightboxImageId,
      setShareToSquareTarget,
      showToast,
    } = useStore.getState()

    setTasks([])
    setPrompt('')
    clearInputImages()
    replaceProviderState([])
    replaceCategoryState([])
    replacePromptLibrary([])
    setParams({ ...DEFAULT_PARAMS })
    setTaskView('gallery')
    setImageEditSession(null)
    setShowPromptLibrary(false)
    setLightboxImageId(null)
    setShareToSquareTarget(null)
    showToast('所有数据已清空', 'success')
  })
}

function normalizeOptionalString(value: unknown): string | null | undefined {
  if (value === undefined || value === null) {
    return value
  }
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function getImportedActiveProviderId(
  data: ExportData,
  persistedStateSnapshot: PersistedAppStateSnapshot | null,
  providerIdMap: Map<string, string>,
): string | undefined {
  const activeProviderId =
    normalizeOptionalString(persistedStateSnapshot?.activeProviderId) ??
    normalizeOptionalString(data.activeProviderId)

  return activeProviderId ? providerIdMap.get(activeProviderId) ?? activeProviderId : undefined
}

function getImportedActiveCategoryFilter(
  data: ExportData,
  persistedStateSnapshot: PersistedAppStateSnapshot | null,
  categoryIdMap: Map<string, string>,
): string | undefined {
  const activeCategoryFilter =
    normalizeOptionalString(persistedStateSnapshot?.activeCategoryFilter) ??
    normalizeOptionalString(data.activeCategoryFilter)

  return activeCategoryFilter
    ? categoryIdMap.get(activeCategoryFilter) ?? activeCategoryFilter
    : undefined
}

function getImportedGalleryDisplayMode(
  persistedStateSnapshot: PersistedAppStateSnapshot | null,
): GalleryDisplayMode | null {
  const galleryDisplayMode = persistedStateSnapshot?.galleryDisplayMode
  return galleryDisplayMode === 'image' || galleryDisplayMode === 'standard'
    ? galleryDisplayMode
    : null
}

export async function exportData() {
  const version = getDataVersion()
  try {
    await initStore()
    const { tasks, images, appStateSnapshot } = await withDataMutation(async () => ({
      tasks: await getAllTasks(),
      images: await listImages(),
      appStateSnapshot: buildPersistedAppStateSnapshot(useStore.getState()),
    }), version)
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

    const zipped = await zipArchive(zipFiles)
    const blob = new Blob([toOwnedArrayBuffer(zipped)], { type: 'application/zip' })
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
  const version = getDataVersion()
  let recordsCommitted = false
  try {
    const buffer = await file.arrayBuffer()
    const unzipped = await unzipArchive(new Uint8Array(buffer))

    const manifestBytes = unzipped['manifest.json']
    if (!manifestBytes) {
      throw new Error('ZIP 中缺少 manifest.json')
    }

    const data = parseExportManifest(JSON.parse(strFromU8(manifestBytes)))
    const preparedRecords: StoredImage[] = []
    for (const [id, info] of Object.entries(data.imageFiles)) {
      preparedRecords.push(await prepareImportedImageRecord(id, info, unzipped))
    }

    await initStore()
    await withDataMutation(async () => {
      const persistedStateSnapshot = readPersistedAppStateSnapshot(data.persistedState)
      const existingTasks = await getAllTasks()
      const existingTaskIds = new Set(existingTasks.map((task) => task.id))
      const existingImages = await listImages()
      const existingImageIds = new Set(existingImages.map((image) => image.id))
      const currentState = useStore.getState()
      const importedProviders = getImportedProvidersFromExport(data, persistedStateSnapshot)
      const importedCategories = getImportedCategoriesFromExport(data, persistedStateSnapshot)
      const importedPromptLibrary = getImportedPromptLibraryFromExport(data, persistedStateSnapshot)
      const {
        providers: mergedProviders,
        providerIdMap,
        addedProviderCount,
        skippedProviderCount,
      } = mergeImportedProviders(currentState.providers, importedProviders)
      const { categories: mergedCategories, categoryIdMap, addedCategoryCount } = mergeImportedCategories(
        currentState.categories,
        importedCategories,
      )
      const { promptLibrary: mergedPromptLibrary, addedCount: addedPromptLibraryCount } =
        mergePromptLibraryItems(currentState.promptLibrary, importedPromptLibrary)
      const importedActiveProviderId = getImportedActiveProviderId(data, persistedStateSnapshot, providerIdMap)
      const importedActiveCategoryFilter = getImportedActiveCategoryFilter(
        data,
        persistedStateSnapshot,
        categoryIdMap,
      )
      const rawParams = persistedStateSnapshot?.params ?? data.params
      const importedParams = rawParams ? parseImportedParams(rawParams) : null
      const importedGalleryDisplayMode = getImportedGalleryDisplayMode(persistedStateSnapshot)

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
        if (!(referencedImageId in data.imageFiles) && !existingImageIds.has(referencedImageId)) {
          throw new Error(`导入包缺少被任务引用的图片条目：${referencedImageId}`)
        }
      }

      const preparedImages = preparedRecords.filter((image) => !existingImageIds.has(image.id))
      const skippedImageCount = Object.keys(data.imageFiles).length - preparedImages.length

      await assertImportedImageIdsCompatible(preparedRecords, existingImages)
      assertDataVersion(version)
      await commitImportedRecords(tasksToImport, preparedImages)
      recordsCommitted = true

      const liveState = useStore.getState()
      const tasks = [...tasksToImport, ...liveState.tasks]
      liveState.setTasks(tasks)
      useStore
        .getState()
        .replaceProviderState(
          mergeImportedItemsWithLiveState(currentState.providers, mergedProviders, liveState.providers),
          importedActiveProviderId ?? liveState.activeProviderId,
        )
      useStore
        .getState()
        .replaceCategoryState(
          mergeImportedItemsWithLiveState(currentState.categories, mergedCategories, liveState.categories),
          importedActiveCategoryFilter ?? liveState.activeCategoryFilter,
        )
      useStore.getState().replacePromptLibrary(
        mergeImportedItemsWithLiveState(currentState.promptLibrary, mergedPromptLibrary, liveState.promptLibrary),
      )
      if (importedParams) {
        useStore.getState().setParams(importedParams)
      }
      if (importedGalleryDisplayMode) {
        useStore.getState().setGalleryDisplayMode(importedGalleryDisplayMode)
      }

      repairCategoryStateFromTasks(tasks)

      const summaryParts = [`已导入 ${tasksToImport.length} 条记录`]
      if (data.version === 6) {
        summaryParts.push('已兼容导入 v6 备份')
      }
      if (skippedTaskCount > 0) {
        summaryParts.push(`跳过 ${skippedTaskCount} 条重复记录`)
      }
      if (preparedImages.length > 0) {
        summaryParts.push(`导入 ${preparedImages.length} 张图片`)
      }
      if (skippedImageCount > 0) {
        summaryParts.push(`跳过 ${skippedImageCount} 张重复图片`)
      }
      if (addedProviderCount > 0) {
        summaryParts.push(`新增 ${addedProviderCount} 个供应商`)
      }
      if (skippedProviderCount > 0) {
        summaryParts.push(`跳过 ${skippedProviderCount} 个重复供应商`)
      }
      if (addedCategoryCount > 0) {
        summaryParts.push(`新增 ${addedCategoryCount} 个分类`)
      }
      if (addedPromptLibraryCount > 0) {
        summaryParts.push(`新增 ${addedPromptLibraryCount} 条提示词`)
      }
      useStore.getState().showToast(summaryParts.join('，'), 'success')
    }, version)
  } catch (error) {
    useStore
      .getState()
      .showToast(`${recordsCommitted ? '图片与任务已写入，但配置恢复未完成' : '导入失败'}：${error instanceof Error ? error.message : String(error)}`, 'error')
  }
}

export async function addImageFromFile(file: File): Promise<void> {
  const version = getDataVersion()
  if (!file.type.startsWith('image/')) {
    throw new Error('请选择图片文件')
  }

  const dataUrl = await fileToDataUrl(file)
  await withDataMutation(async () => {
    const id = await storeImage(dataUrl, { stageOnly: true })
    useStore.getState().addInputImage({ id, dataUrl })
  }, version)
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
  const version = getDataVersion()
  const normalizedUrl = normalizeImageUrl(url)
  await withDataMutation(async () => {
    const id = await storeImage(normalizedUrl, { stageOnly: true })
    useStore.getState().addInputImage({ id, dataUrl: normalizedUrl })
  }, version)
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === 'string'
      ? resolve(reader.result) : reject(new Error('图片文件读取结果无效'))
    reader.onerror = () => reject(reader.error ?? new Error('图片文件读取失败'))
    reader.readAsDataURL(file)
  })
}
