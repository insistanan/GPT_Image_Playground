import type { CategoryConfig, ExportData, PromptLibraryItem, ProviderConfig, TaskRecord } from '@/types'
import type { PersistedAppStateSnapshot } from '../contracts'
import { DEFAULT_PROVIDER_NAME } from '../constants'
import { createProviderConfig, normalizeProviderList, findProviderById } from './providers'
import { normalizeCategoryList, findCategoryById, findCategoryByName } from './categories'
import { normalizePromptLibraryItems } from './promptLibrary'

/** 保留等待落库期间用户新增、编辑或删除的配置，只追加本次真正新增的条目。 */
export function mergeImportedItemsWithLiveState<T extends { id: string }>(
  initial: T[], planned: T[], live: T[],
): T[] {
  const existingIds = new Set([...initial, ...live].map((item) => item.id))
  return [...live, ...planned.filter((item) => !existingIds.has(item.id))]
}

export function getTaskReferencedImageIds(task: TaskRecord): string[] {
  return [
    ...(task.inputImageIds || []),
    ...(task.outputImages || []),
    ...(task.editMaskImageId ? [task.editMaskImageId] : []),
    ...(task.editMarkupImageId ? [task.editMarkupImageId] : []),
  ]
}

// ===== Import / Export =====

export function getImportedPromptLibraryFromExport(
  data: ExportData,
  persistedState: PersistedAppStateSnapshot | null,
): PromptLibraryItem[] {
  const explicitPromptLibrary = normalizePromptLibraryItems(data.promptLibrary)
  if (explicitPromptLibrary.length > 0) {
    return explicitPromptLibrary
  }

  return normalizePromptLibraryItems(persistedState?.promptLibrary)
}

export function getImportedProvidersFromExport(
  data: ExportData,
  persistedStateSnapshot: PersistedAppStateSnapshot | null,
): ProviderConfig[] {
  const snapshotProviders = normalizeProviderList(persistedStateSnapshot?.providers)
  if (snapshotProviders.length > 0) {
    return snapshotProviders
  }

  const manifestProviders = normalizeProviderList(data.providers)
  if (manifestProviders.length > 0) {
    return manifestProviders
  }

  return data.settings ? [createProviderConfig(data.settings, DEFAULT_PROVIDER_NAME)] : []
}

export function getImportedCategoriesFromExport(
  data: ExportData,
  persistedStateSnapshot: PersistedAppStateSnapshot | null,
): CategoryConfig[] {
  const snapshotCategories = normalizeCategoryList(persistedStateSnapshot?.categories)
  if (snapshotCategories.length > 0) {
    return snapshotCategories
  }

  return normalizeCategoryList(data.categories)
}

export function remapImportedTaskRelations(
  task: TaskRecord,
  mergedProviders: ProviderConfig[],
  providerIdMap: Map<string, string>,
  mergedCategories: CategoryConfig[],
  categoryIdMap: Map<string, string>,
): TaskRecord {
  const nextProviderId =
    task.providerId && providerIdMap.has(task.providerId)
      ? (providerIdMap.get(task.providerId) ?? task.providerId)
      : task.providerId ?? null
  const mappedProvider = findProviderById(mergedProviders, nextProviderId)

  const mappedCategoryId =
    task.categoryId && categoryIdMap.has(task.categoryId)
      ? (categoryIdMap.get(task.categoryId) ?? task.categoryId)
      : task.categoryId ?? null
  const mappedCategory =
    findCategoryById(mergedCategories, mappedCategoryId) ??
    findCategoryByName(mergedCategories, task.categoryName ?? '')

  return {
    ...task,
    providerId: nextProviderId,
    providerName: mappedProvider?.name?.trim() || task.providerName || '未知供应商',
    categoryId: mappedCategory?.id ?? null,
    categoryName: mappedCategory?.name ?? null,
  }
}
