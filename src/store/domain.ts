import type {
  ApiProtocol,
  AppSettings,
  CategoryConfig,
  ExportData,
  PromptLibraryItem,
  ProviderConfig,
  ResponsesPromptRevisionMode,
  TaskRecord,
} from '../types'
import {
  ALL_CATEGORY_FILTER,
  DEFAULT_SETTINGS,
  FAVORITES_CATEGORY_FILTER,
  UNCATEGORIZED_CATEGORY_FILTER,
} from '../types'
import type { PersistedAppStateSnapshot } from './contracts'
import { DEFAULT_PROVIDER_NAME, genId } from './constants'

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function isRemoteImageUrl(value: string): boolean {
  return /^https?:\/\//i.test(value)
}

function genProviderId(): string {
  return `provider-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function genCategoryId(): string {
  return `category-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function normalizeApiProtocol(value: unknown): ApiProtocol {
  return value === 'responses' ? 'responses' : 'images'
}

function normalizeRequestMode(value: unknown): AppSettings['requestMode'] {
  return value === 'direct' ? 'direct' : 'local_proxy'
}

export function getProviderSettings(provider: ProviderConfig): AppSettings {
  const { id, name, ...settings } = provider
  return settings
}

export function findProviderById(
  providers: ProviderConfig[],
  providerId: string | null | undefined,
): ProviderConfig | undefined {
  if (!providerId) {
    return undefined
  }

  return providers.find((provider) => provider.id === providerId)
}

export function findCategoryById(
  categories: CategoryConfig[],
  categoryId: string | null | undefined,
): CategoryConfig | undefined {
  if (!categoryId) {
    return undefined
  }

  return categories.find((category) => category.id === categoryId)
}

export function normalizeCategoryName(name: string): string {
  return name.trim()
}

export function createCategoryConfig(
  name: string,
  id = genCategoryId(),
  createdAt = Date.now(),
): CategoryConfig {
  const normalizedName = normalizeCategoryName(name)
  if (!normalizedName) {
    throw new Error('分类名称不能为空')
  }

  return {
    id,
    name: normalizedName,
    createdAt,
  }
}

export function normalizeCategoryList(categories: unknown): CategoryConfig[] {
  if (!Array.isArray(categories)) {
    return []
  }

  const seen = new Set<string>()
  const normalized: CategoryConfig[] = []

  for (let index = 0; index < categories.length; index += 1) {
    const category = categories[index]
    if (!category || typeof category !== 'object') {
      continue
    }

    const record = category as Partial<CategoryConfig> & Record<string, unknown>
    if (typeof record.id !== 'string' || !record.id.trim() || seen.has(record.id)) {
      continue
    }

    const normalizedName = normalizeCategoryName(typeof record.name === 'string' ? record.name : '')
    if (!normalizedName) {
      continue
    }

    normalized.push({
      ...record,
      id: record.id,
      name: normalizedName,
      createdAt:
        typeof record.createdAt === 'number' && Number.isFinite(record.createdAt)
          ? record.createdAt
          : Date.now() + index,
    })
    seen.add(record.id)
  }

  return normalized
}

export function mergeCategoriesFromTasks(
  categories: CategoryConfig[],
  tasks: Array<Pick<TaskRecord, 'categoryId' | 'categoryName' | 'createdAt'>>,
): CategoryConfig[] {
  const normalizedCategories = normalizeCategoryList(categories)
  const seen = new Set(normalizedCategories.map((category) => category.id))
  const derivedCategories: CategoryConfig[] = []
  const sortedTasks = [...tasks].sort((left, right) => left.createdAt - right.createdAt)

  for (const task of sortedTasks) {
    const categoryId = typeof task.categoryId === 'string' ? task.categoryId.trim() : ''
    const categoryName =
      typeof task.categoryName === 'string' ? normalizeCategoryName(task.categoryName) : ''
    if (!categoryId || !categoryName || seen.has(categoryId)) {
      continue
    }

    derivedCategories.push(
      createCategoryConfig(
        categoryName,
        categoryId,
        typeof task.createdAt === 'number' && Number.isFinite(task.createdAt)
          ? task.createdAt
          : Date.now(),
      ),
    )
    seen.add(categoryId)
  }

  return derivedCategories.length > 0
    ? [...normalizedCategories, ...derivedCategories]
    : normalizedCategories
}

function normalizePromptLibraryContent(content: unknown): string {
  return typeof content === 'string' ? content.replace(/\r\n/g, '\n').trim() : ''
}

function normalizePromptLibraryTitle(title: unknown, content: string): string {
  const normalizedTitle =
    typeof title === 'string' ? title.trim().replace(/\s+/g, ' ').slice(0, 48) : ''
  if (normalizedTitle) {
    return normalizedTitle
  }

  const fallbackTitle = content
    .split('\n')
    .map((line) => line.trim().replace(/\s+/g, ' '))
    .find(Boolean)

  if (!fallbackTitle) {
    throw new Error('提示词标题不能为空')
  }

  return fallbackTitle.slice(0, 48)
}

export function createPromptLibraryItem(
  content: string,
  title?: string,
  id = `prompt-${genId()}`,
  createdAt = Date.now(),
  updatedAt = createdAt,
): PromptLibraryItem {
  const normalizedContent = normalizePromptLibraryContent(content)
  if (!normalizedContent) {
    throw new Error('提示词不能为空')
  }

  return {
    id,
    title: normalizePromptLibraryTitle(title, normalizedContent),
    content: normalizedContent,
    createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
    updatedAt: Number.isFinite(updatedAt) ? updatedAt : createdAt,
  }
}

export function normalizePromptLibraryItems(items: unknown): PromptLibraryItem[] {
  if (!Array.isArray(items)) {
    return []
  }

  const seenIds = new Set<string>()
  const normalized: PromptLibraryItem[] = []

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]
    if (!item || typeof item !== 'object') {
      continue
    }

    const record = item as Partial<PromptLibraryItem> & Record<string, unknown>
    const content = normalizePromptLibraryContent(record.content)
    if (!content) {
      continue
    }

    const id =
      typeof record.id === 'string' && record.id.trim() && !seenIds.has(record.id)
        ? record.id
        : `prompt-${genId()}`

    try {
      normalized.push(
        createPromptLibraryItem(
          content,
          record.title,
          id,
          typeof record.createdAt === 'number' && Number.isFinite(record.createdAt)
            ? record.createdAt
            : Date.now() + index,
          typeof record.updatedAt === 'number' && Number.isFinite(record.updatedAt)
            ? record.updatedAt
            : typeof record.createdAt === 'number' && Number.isFinite(record.createdAt)
              ? record.createdAt
              : Date.now() + index,
        ),
      )
      seenIds.add(id)
    } catch {
      continue
    }
  }

  return normalized.sort((left, right) => right.updatedAt - left.updatedAt)
}

function getPromptLibraryItemSignature(item: PromptLibraryItem): string {
  return `${item.title.trim().toLocaleLowerCase()}\u0000${normalizePromptLibraryContent(item.content)}`
}

export function mergePromptLibraryItems(
  currentItems: PromptLibraryItem[],
  importedItems: PromptLibraryItem[],
): { promptLibrary: PromptLibraryItem[]; addedCount: number } {
  const merged = [...normalizePromptLibraryItems(currentItems)]
  const seenSignatures = new Set(merged.map(getPromptLibraryItemSignature))
  let addedCount = 0

  for (const importedItem of normalizePromptLibraryItems(importedItems)) {
    const signature = getPromptLibraryItemSignature(importedItem)
    if (seenSignatures.has(signature)) {
      continue
    }

    const nextItem = merged.some((item) => item.id === importedItem.id)
      ? { ...importedItem, id: `prompt-${genId()}` }
      : importedItem

    merged.push(nextItem)
    seenSignatures.add(signature)
    addedCount += 1
  }

  return {
    promptLibrary: merged.sort((left, right) => right.updatedAt - left.updatedAt),
    addedCount,
  }
}

export function getTaskReferencedImageIds(task: TaskRecord): string[] {
  return [
    ...(task.inputImageIds || []),
    ...(task.outputImages || []),
    ...(task.editMaskImageId ? [task.editMaskImageId] : []),
  ]
}

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

export function resolveActiveCategoryFilter(
  filter: unknown,
  categories: CategoryConfig[],
): string {
  if (
    filter === ALL_CATEGORY_FILTER ||
    filter === FAVORITES_CATEGORY_FILTER ||
    filter === UNCATEGORIZED_CATEGORY_FILTER
  ) {
    return filter
  }

  if (typeof filter === 'string' && categories.some((category) => category.id === filter)) {
    return filter
  }

  return ALL_CATEGORY_FILTER
}

export function ensureCategoryNameAvailable(
  categories: CategoryConfig[],
  name: string,
  excludeId?: string,
): string {
  const normalizedName = normalizeCategoryName(name)
  if (!normalizedName) {
    throw new Error('分类名称不能为空')
  }

  const normalizedLower = normalizedName.toLocaleLowerCase()
  const exists = categories.some(
    (category) =>
      category.id !== excludeId && category.name.trim().toLocaleLowerCase() === normalizedLower,
  )
  if (exists) {
    throw new Error('分类名称已存在')
  }

  return normalizedName
}

export function createProviderConfig(
  settings: Partial<AppSettings>,
  name: string,
  id = genProviderId(),
): ProviderConfig {
  const legacySettings = settings as Partial<AppSettings> & { allowResponsesPromptRevision?: unknown }
  const responsesPromptRevisionMode: ResponsesPromptRevisionMode =
    legacySettings.responsesPromptRevisionMode === 'allow' ||
    legacySettings.responsesPromptRevisionMode === 'compat'
      ? legacySettings.responsesPromptRevisionMode
      : legacySettings.allowResponsesPromptRevision === false
        ? 'compat'
        : DEFAULT_SETTINGS.responsesPromptRevisionMode

  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    apiProtocol: normalizeApiProtocol(settings.apiProtocol),
    requestMode: normalizeRequestMode(settings.requestMode),
    responsesPromptRevisionMode,
    id,
    name: name.trim() || '未命名供应商',
  }
}

export function getNextProviderName(providers: ProviderConfig[]): string {
  let index = providers.length + 1
  while (providers.some((provider) => provider.name === `供应商 ${index}`)) {
    index += 1
  }
  return `供应商 ${index}`
}

export function createInitialProviderState(settings: Partial<AppSettings> = DEFAULT_SETTINGS) {
  const provider = createProviderConfig(settings, DEFAULT_PROVIDER_NAME)
  return {
    providers: [provider],
    activeProviderId: provider.id,
    settings: getProviderSettings(provider),
  }
}

export function normalizeProviderList(providers: unknown): ProviderConfig[] {
  if (!Array.isArray(providers)) {
    return []
  }

  return providers
    .map((provider, index) => {
      if (!provider || typeof provider !== 'object') {
        return null
      }

      const record = provider as Partial<ProviderConfig> & Record<string, unknown>
      const { id, name, ...settings } = record
      return createProviderConfig(
        settings as Partial<AppSettings>,
        typeof name === 'string' ? name : `供应商 ${index + 1}`,
        typeof id === 'string' && id ? id : undefined,
      )
    })
    .filter((provider): provider is ProviderConfig => provider !== null)
}

function getProviderNameKey(name: string): string {
  return name.trim().toLocaleLowerCase()
}

function hasProviderName(providers: ProviderConfig[], name: string): boolean {
  const nameKey = getProviderNameKey(name)
  return providers.some((provider) => getProviderNameKey(provider.name) === nameKey)
}

function isSameProviderConfig(left: ProviderConfig, right: ProviderConfig): boolean {
  const leftSettings = getProviderSettings(left)
  const rightSettings = getProviderSettings(right)

  return (
    getProviderNameKey(left.name) === getProviderNameKey(right.name) &&
    leftSettings.baseUrl === rightSettings.baseUrl &&
    leftSettings.apiKey === rightSettings.apiKey &&
    leftSettings.model === rightSettings.model &&
    leftSettings.responsesImageModel === rightSettings.responsesImageModel &&
    leftSettings.responsesTransport === rightSettings.responsesTransport &&
    leftSettings.responsesImageInputMode === rightSettings.responsesImageInputMode &&
    leftSettings.responsesPromptRevisionMode === rightSettings.responsesPromptRevisionMode &&
    leftSettings.timeout === rightSettings.timeout &&
    leftSettings.apiProtocol === rightSettings.apiProtocol &&
    leftSettings.requestMode === rightSettings.requestMode
  )
}

function getNextImportedProviderName(
  providers: ProviderConfig[],
  preferredName: string,
): string {
  const normalizedName = preferredName.trim() || '未命名供应商'
  if (!hasProviderName(providers, normalizedName)) {
    return normalizedName
  }

  const importedName = `${normalizedName} (导入)`
  if (!hasProviderName(providers, importedName)) {
    return importedName
  }

  let index = 2
  while (hasProviderName(providers, `${normalizedName} (导入 ${index})`)) {
    index += 1
  }
  return `${normalizedName} (导入 ${index})`
}

function getCategoryNameKey(name: string): string {
  return normalizeCategoryName(name).toLocaleLowerCase()
}

export function findCategoryByName(
  categories: CategoryConfig[],
  categoryName: string,
): CategoryConfig | undefined {
  const nameKey = getCategoryNameKey(categoryName)
  if (!nameKey) {
    return undefined
  }

  return categories.find((category) => getCategoryNameKey(category.name) === nameKey)
}

export function mergeImportedProviders(
  currentProviders: ProviderConfig[],
  importedProviders: ProviderConfig[],
): {
  providers: ProviderConfig[]
  providerIdMap: Map<string, string>
  addedProviderCount: number
} {
  const mergedProviders = normalizeProviderList(currentProviders)
  const providerIdMap = new Map<string, string>()
  const baseCount = mergedProviders.length

  for (const importedProvider of normalizeProviderList(importedProviders)) {
    const providerWithSameId = mergedProviders.find((provider) => provider.id === importedProvider.id)
    if (providerWithSameId) {
      if (isSameProviderConfig(providerWithSameId, importedProvider)) {
        providerIdMap.set(importedProvider.id, providerWithSameId.id)
        continue
      }

      const providerWithSameConfig = mergedProviders.find((provider) =>
        isSameProviderConfig(provider, importedProvider),
      )
      if (providerWithSameConfig) {
        providerIdMap.set(importedProvider.id, providerWithSameConfig.id)
        continue
      }

      const renamedProvider = createProviderConfig(
        getProviderSettings(importedProvider),
        getNextImportedProviderName(mergedProviders, importedProvider.name),
      )
      mergedProviders.push(renamedProvider)
      providerIdMap.set(importedProvider.id, renamedProvider.id)
      continue
    }

    const providerWithSameConfig = mergedProviders.find((provider) =>
      isSameProviderConfig(provider, importedProvider),
    )
    if (providerWithSameConfig) {
      providerIdMap.set(importedProvider.id, providerWithSameConfig.id)
      continue
    }

    mergedProviders.push(importedProvider)
    providerIdMap.set(importedProvider.id, importedProvider.id)
  }

  return {
    providers: mergedProviders,
    providerIdMap,
    addedProviderCount: mergedProviders.length - baseCount,
  }
}

export function mergeImportedCategories(
  currentCategories: CategoryConfig[],
  importedCategories: CategoryConfig[],
): {
  categories: CategoryConfig[]
  categoryIdMap: Map<string, string>
  addedCategoryCount: number
} {
  const mergedCategories = normalizeCategoryList(currentCategories)
  const categoryIdMap = new Map<string, string>()
  const baseCount = mergedCategories.length

  for (const importedCategory of normalizeCategoryList(importedCategories)) {
    const categoryWithSameId = mergedCategories.find((category) => category.id === importedCategory.id)
    const categoryWithSameName = findCategoryByName(mergedCategories, importedCategory.name)

    if (categoryWithSameId && categoryWithSameId.name === importedCategory.name) {
      categoryIdMap.set(importedCategory.id, categoryWithSameId.id)
      continue
    }

    if (categoryWithSameName) {
      categoryIdMap.set(importedCategory.id, categoryWithSameName.id)
      continue
    }

    if (categoryWithSameId) {
      const createdCategory = createCategoryConfig(
        importedCategory.name,
        undefined,
        importedCategory.createdAt,
      )
      mergedCategories.push(createdCategory)
      categoryIdMap.set(importedCategory.id, createdCategory.id)
      continue
    }

    mergedCategories.push(importedCategory)
    categoryIdMap.set(importedCategory.id, importedCategory.id)
  }

  return {
    categories: mergedCategories,
    categoryIdMap,
    addedCategoryCount: mergedCategories.length - baseCount,
  }
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
