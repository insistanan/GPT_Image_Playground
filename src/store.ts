import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  ApiProtocol,
  AppSettings,
  CategoryConfig,
  ImageEditSelection,
  ImageEditSession,
  ProviderConfig,
  ResponsesPromptRevisionMode,
  TaskParams,
  TaskErrorDebugInfo,
  InputImage,
  TaskRecord,
  ExportData,
  TaskView,
} from './types'
import {
  ALL_CATEGORY_FILTER,
  DEFAULT_SETTINGS,
  DEFAULT_PARAMS,
  FAVORITES_CATEGORY_FILTER,
  UNCATEGORIZED_CATEGORY_FILTER,
  UNKNOWN_TASK_PROVIDER_NAME,
  isTaskInRecycleBin,
} from './types'
import {
  getAllTasks,
  putTask,
  deleteTask as dbDeleteTask,
  clearTasks as dbClearTasks,
  getImage,
  getAllImages,
  putImage,
  deleteImage,
  clearImages,
  storeImage,
  hashDataUrl,
} from './lib/db'
import { callImageApi } from './lib/api'
import { normalizeImageSize } from './lib/size'
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate'

// ===== Image cache =====
// 内存缓存，id → dataUrl，避免每次从 IndexedDB 读取

const imageCache = new Map<string, string>()
const imageLoadPromiseCache = new Map<string, Promise<string | undefined>>()
const RECYCLE_BIN_RETENTION_MS = 7 * 24 * 60 * 60 * 1000
const RECYCLE_BIN_POLL_INTERVAL_MS = 10 * 60 * 1000
const ERROR_LOG_RETENTION_MS = 7 * 24 * 60 * 60 * 1000
const ERROR_LOG_POLL_INTERVAL_MS = 12 * 60 * 60 * 1000
let recycleBinJanitorId: number | null = null
let errorLogJanitorId: number | null = null

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function getCachedImage(id: string): string | undefined {
  return imageCache.get(id)
}

export async function ensureImageCached(id: string): Promise<string | undefined> {
  if (imageCache.has(id)) return imageCache.get(id)
  const pending = imageLoadPromiseCache.get(id)
  if (pending) return pending

  const nextPromise = getImage(id)
    .then((rec) => {
      if (rec) {
        imageCache.set(id, rec.dataUrl)
        return rec.dataUrl
      }
      return undefined
    })
    .finally(() => {
      imageLoadPromiseCache.delete(id)
    })

  imageLoadPromiseCache.set(id, nextPromise)
  return nextPromise
}

function isRemoteImageUrl(value: string): boolean {
  return /^https?:\/\//i.test(value)
}

const DEFAULT_PROVIDER_NAME = '供应商 1'

function genProviderId(): string {
  return `provider-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function genCategoryId(): string {
  return `category-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function getProviderSettings(provider: ProviderConfig): AppSettings {
  const { id, name, ...settings } = provider
  return settings
}

function findProviderById(
  providers: ProviderConfig[],
  providerId: string | null | undefined,
): ProviderConfig | undefined {
  if (!providerId) return undefined
  return providers.find((provider) => provider.id === providerId)
}

function findCategoryById(
  categories: CategoryConfig[],
  categoryId: string | null | undefined,
): CategoryConfig | undefined {
  if (!categoryId) return undefined
  return categories.find((category) => category.id === categoryId)
}

function normalizeCategoryName(name: string): string {
  return name.trim()
}

function createCategoryConfig(
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

function normalizeCategoryList(categories: unknown): CategoryConfig[] {
  if (!Array.isArray(categories)) return []

  const seen = new Set<string>()
  const normalized: CategoryConfig[] = []

  for (let index = 0; index < categories.length; index += 1) {
    const category = categories[index]
    if (!category || typeof category !== 'object') continue
    const record = category as Partial<CategoryConfig> & Record<string, unknown>
    if (typeof record.id !== 'string' || !record.id.trim()) continue
    if (seen.has(record.id)) continue

    const normalizedName = normalizeCategoryName(typeof record.name === 'string' ? record.name : '')
    if (!normalizedName) continue

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

function mergeCategoriesFromTasks(
  categories: CategoryConfig[],
  tasks: Array<Pick<TaskRecord, 'categoryId' | 'categoryName' | 'createdAt'>>,
): CategoryConfig[] {
  const normalizedCategories = normalizeCategoryList(categories)
  const seen = new Set(normalizedCategories.map((category) => category.id))
  const derivedCategories: CategoryConfig[] = []
  const sortedTasks = [...tasks].sort((a, b) => a.createdAt - b.createdAt)

  for (const task of sortedTasks) {
    const categoryId = typeof task.categoryId === 'string' ? task.categoryId.trim() : ''
    const categoryName = typeof task.categoryName === 'string' ? normalizeCategoryName(task.categoryName) : ''
    if (!categoryId || !categoryName || seen.has(categoryId)) continue

    derivedCategories.push(
      createCategoryConfig(
        categoryName,
        categoryId,
        typeof task.createdAt === 'number' && Number.isFinite(task.createdAt) ? task.createdAt : Date.now(),
      ),
    )
    seen.add(categoryId)
  }

  return derivedCategories.length > 0
    ? [...normalizedCategories, ...derivedCategories]
    : normalizedCategories
}

function getTaskReferencedImageIds(task: TaskRecord): string[] {
  return [
    ...(task.inputImageIds || []),
    ...(task.outputImages || []),
    ...(task.editMaskImageId ? [task.editMaskImageId] : []),
  ]
}

function resolveActiveCategoryFilter(
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

function ensureCategoryNameAvailable(
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

function normalizeApiProtocol(value: unknown): ApiProtocol {
  return value === 'responses' ? 'responses' : 'images'
}

function createProviderConfig(
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
    responsesPromptRevisionMode,
    id,
    name: name.trim() || '未命名供应商',
  }
}

function getNextProviderName(providers: ProviderConfig[]): string {
  let index = providers.length + 1
  while (providers.some((provider) => provider.name === `供应商 ${index}`)) {
    index += 1
  }
  return `供应商 ${index}`
}

function createInitialProviderState(settings: Partial<AppSettings> = DEFAULT_SETTINGS) {
  const provider = createProviderConfig(settings, DEFAULT_PROVIDER_NAME)
  return {
    providers: [provider],
    activeProviderId: provider.id,
    settings: getProviderSettings(provider),
  }
}

type StoreApiError = Error & {
  status?: number
  requestId?: string
  details?: unknown
}

function readLocalDebugFromErrorDetails(details: unknown): TaskErrorDebugInfo | null {
  if (!isRecord(details)) return null
  return isRecord(details.localDebug) ? (details.localDebug as TaskErrorDebugInfo) : null
}

function buildTaskErrorDebugInfo(
  requestSettings: AppSettings,
  err: unknown,
): TaskErrorDebugInfo {
  const apiError = (err instanceof Error ? err : new Error(String(err))) as StoreApiError
  const localDebug = readLocalDebugFromErrorDetails(apiError.details)
  if (localDebug) {
    return localDebug
  }

  const debugInfo: TaskErrorDebugInfo = {
    createdAt: Date.now(),
    requestId: apiError.requestId || null,
    status: typeof apiError.status === 'number' ? apiError.status : null,
    requestMode: requestSettings.requestMode || DEFAULT_SETTINGS.requestMode,
    apiProtocol: requestSettings.apiProtocol || DEFAULT_SETTINGS.apiProtocol,
    baseUrl: requestSettings.baseUrl,
    model: requestSettings.model,
    responsesImageModel: requestSettings.responsesImageModel || null,
    responsesTransport: requestSettings.responsesTransport || null,
    responsesImageInputMode: requestSettings.responsesImageInputMode || null,
    responsesPromptRevisionMode: requestSettings.responsesPromptRevisionMode || null,
  }

  if (apiError.details !== undefined) {
    debugInfo.details = apiError.details
  }

  return debugInfo
}

function resolveErrorDebugCreatedAt(task: Pick<TaskRecord, 'createdAt' | 'finishedAt' | 'errorDebug'>): number {
  if (typeof task.errorDebug?.createdAt === 'number' && Number.isFinite(task.errorDebug.createdAt)) {
    return task.errorDebug.createdAt
  }
  if (typeof task.finishedAt === 'number' && Number.isFinite(task.finishedAt)) {
    return task.finishedAt
  }
  return task.createdAt
}

async function cleanupExpiredErrorDebugLogs(tasks: TaskRecord[]): Promise<TaskRecord[]> {
  const cutoff = Date.now() - ERROR_LOG_RETENTION_MS
  const expiredTaskIds = new Set(
    tasks
      .filter((task) => task.errorDebug && resolveErrorDebugCreatedAt(task) < cutoff)
      .map((task) => task.id),
  )

  if (!expiredTaskIds.size) {
    return tasks
  }

  const updatedTasks = tasks.map((task) =>
    expiredTaskIds.has(task.id)
      ? {
          ...task,
          errorDebug: null,
        }
      : task,
  )

  await Promise.all(
    updatedTasks
      .filter((task) => expiredTaskIds.has(task.id))
      .map((task) => putTask(task)),
  )

  return updatedTasks
}

function ensureErrorLogJanitorStarted() {
  if (errorLogJanitorId != null) return

  errorLogJanitorId = window.setInterval(() => {
    void (async () => {
      const { tasks, setTasks } = useStore.getState()
      const updatedTasks = await cleanupExpiredErrorDebugLogs(tasks)
      if (updatedTasks !== tasks) {
        setTasks(updatedTasks)
      }
    })()
  }, ERROR_LOG_POLL_INTERVAL_MS)
}

function normalizeProviderList(providers: unknown): ProviderConfig[] {
  if (!Array.isArray(providers)) return []

  return providers
    .map((provider, index) => {
      if (!provider || typeof provider !== 'object') return null
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

function findCategoryByName(
  categories: CategoryConfig[],
  categoryName: string,
): CategoryConfig | undefined {
  const nameKey = getCategoryNameKey(categoryName)
  if (!nameKey) return undefined
  return categories.find((category) => getCategoryNameKey(category.name) === nameKey)
}

function mergeImportedProviders(
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

function mergeImportedCategories(
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
      const createdCategory = createCategoryConfig(importedCategory.name, undefined, importedCategory.createdAt)
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

function getImportedProvidersFromExport(
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

function getImportedCategoriesFromExport(
  data: ExportData,
  persistedStateSnapshot: PersistedAppStateSnapshot | null,
): CategoryConfig[] {
  const snapshotCategories = normalizeCategoryList(persistedStateSnapshot?.categories)
  if (snapshotCategories.length > 0) {
    return snapshotCategories
  }

  return normalizeCategoryList(data.categories)
}

function remapImportedTaskRelations(
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
    providerName: mappedProvider?.name ?? task.providerName ?? null,
    categoryId: mappedCategory?.id ?? mappedCategoryId,
    categoryName: mappedCategory?.name ?? task.categoryName ?? null,
  }
}

// ===== Store 类型 =====

interface AppState {
  // 设置
  settings: AppSettings
  providers: ProviderConfig[]
  activeProviderId: string
  setSettings: (s: Partial<AppSettings>) => void
  setActiveProvider: (id: string) => void
  createProvider: () => void
  updateProviderName: (id: string, name: string) => void
  removeProvider: (id: string) => void
  replaceProviderState: (providers: ProviderConfig[], activeProviderId?: string) => void

  // 输入
  prompt: string
  setPrompt: (p: string) => void
  inputImages: InputImage[]
  addInputImage: (img: InputImage) => void
  removeInputImage: (idx: number) => void
  clearInputImages: () => void
  setInputImages: (imgs: InputImage[]) => void

  // 参数
  params: TaskParams
  setParams: (p: Partial<TaskParams>) => void

  // 任务列表
  tasks: TaskRecord[]
  setTasks: (t: TaskRecord[]) => void
  selectedTaskIds: string[]
  setSelectedTaskIds: (ids: string[]) => void
  toggleTaskSelection: (id: string) => void
  clearSelectedTasks: () => void

  // 搜索和筛选
  categories: CategoryConfig[]
  activeCategoryFilter: string
  setActiveCategoryFilter: (filter: string) => void
  replaceCategoryState: (categories: CategoryConfig[], activeCategoryFilter?: string) => void
  searchQuery: string
  setSearchQuery: (q: string) => void
  filterStatus: 'all' | 'running' | 'done' | 'error'
  setFilterStatus: (status: AppState['filterStatus']) => void
  taskView: TaskView
  setTaskView: (view: TaskView) => void

  // UI
  imageEditSession: ImageEditSession | null
  setImageEditSession: (session: ImageEditSession | null) => void
  detailTaskId: string | null
  setDetailTaskId: (id: string | null) => void
  lightboxImageId: string | null
  lightboxImageList: string[]
  setLightboxImageId: (id: string | null, list?: string[]) => void
  showSettings: boolean
  setShowSettings: (v: boolean) => void

  // Toast
  toast: { message: string; type: 'info' | 'success' | 'error' } | null
  showToast: (message: string, type?: 'info' | 'success' | 'error') => void

  // Confirm dialog
  confirmDialog: {
    title: string
    message: string
    confirmText?: string
    action: () => void
  } | null
  setConfirmDialog: (d: AppState['confirmDialog']) => void
}

type PersistedAppStateSnapshot = Partial<
  Pick<
    AppState,
    'settings' | 'providers' | 'activeProviderId' | 'categories' | 'activeCategoryFilter' | 'params'
  >
> &
  Record<string, unknown>

function buildPersistedAppStateSnapshot(state: AppState): PersistedAppStateSnapshot {
  return {
    settings: state.settings,
    providers: state.providers,
    activeProviderId: state.activeProviderId,
    categories: state.categories,
    activeCategoryFilter: state.activeCategoryFilter,
    params: state.params,
  }
}

function readPersistedAppStateSnapshot(input: unknown): PersistedAppStateSnapshot | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  return input as PersistedAppStateSnapshot
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Settings
      ...createInitialProviderState(),
      setSettings: (s) =>
        set((st) => {
          const settings = { ...st.settings, ...s }
          const providers = st.providers.map((provider) =>
            provider.id === st.activeProviderId ? { ...provider, ...s } : provider,
          )
          return { settings, providers }
        }),
      setActiveProvider: (id) =>
        set((st) => {
          const provider = st.providers.find((item) => item.id === id)
          if (!provider) return st
          return {
            activeProviderId: provider.id,
            settings: getProviderSettings(provider),
          }
        }),
      createProvider: () =>
        set((st) => {
          const provider = createProviderConfig(st.settings, getNextProviderName(st.providers))
          return {
            providers: [...st.providers, provider],
            activeProviderId: provider.id,
            settings: getProviderSettings(provider),
          }
        }),
      updateProviderName: (id, name) =>
        set((st) => ({
          providers: st.providers.map((provider) =>
            provider.id === id ? { ...provider, name: name.trim() || provider.name } : provider,
          ),
        })),
      removeProvider: (id) =>
        set((st) => {
          if (st.providers.length <= 1) return st

          const providers = st.providers.filter((provider) => provider.id !== id)
          if (providers.length === st.providers.length) return st

          const activeProvider =
            providers.find((provider) => provider.id === st.activeProviderId) ?? providers[0]

          return {
            providers,
            activeProviderId: activeProvider.id,
            settings: getProviderSettings(activeProvider),
          }
        }),
      replaceProviderState: (providers, activeProviderId) =>
        set(() => {
          const normalizedProviders = normalizeProviderList(providers)
          const nextState =
            normalizedProviders.length > 0
              ? {
                  providers: normalizedProviders,
                  activeProviderId:
                    normalizedProviders.find((provider) => provider.id === activeProviderId)?.id ??
                    normalizedProviders[0].id,
                }
              : createInitialProviderState()

          const activeProvider = nextState.providers.find(
            (provider) => provider.id === nextState.activeProviderId,
          ) ?? nextState.providers[0]

          return {
            providers: nextState.providers,
            activeProviderId: activeProvider.id,
            settings: getProviderSettings(activeProvider),
          }
        }),

      // Input
      prompt: '',
      setPrompt: (prompt) => set({ prompt }),
      inputImages: [],
      addInputImage: (img) =>
        set((s) => {
          if (s.inputImages.find((i) => i.id === img.id)) return s
          return { inputImages: [...s.inputImages, img] }
        }),
      removeInputImage: (idx) =>
        set((s) => ({
          inputImages: s.inputImages.filter((_, i) => i !== idx),
        })),
      clearInputImages: () =>
        set((s) => {
          for (const img of s.inputImages) imageCache.delete(img.id)
          return { inputImages: [] }
        }),
      setInputImages: (imgs) => set({ inputImages: imgs }),

      // Params
      params: { ...DEFAULT_PARAMS },
      setParams: (p) => set((s) => ({ params: { ...s.params, ...p } })),

      // Tasks
      tasks: [],
      setTasks: (tasks) =>
        set((state) => {
          const taskIds = new Set(tasks.map((task) => task.id))
          return {
            tasks,
            selectedTaskIds: state.selectedTaskIds.filter((id) => taskIds.has(id)),
            imageEditSession:
              state.imageEditSession && taskIds.has(state.imageEditSession.taskId)
                ? state.imageEditSession
                : null,
            detailTaskId:
              state.detailTaskId && taskIds.has(state.detailTaskId) ? state.detailTaskId : null,
          }
        }),
      selectedTaskIds: [],
      setSelectedTaskIds: (ids) =>
        set((state) => {
          const taskIds = new Set(state.tasks.map((task) => task.id))
          return {
            selectedTaskIds: Array.from(new Set(ids)).filter((id) => taskIds.has(id)),
          }
        }),
      toggleTaskSelection: (id) =>
        set((state) => {
          if (!state.tasks.some((task) => task.id === id)) return state
          const selectedTaskIds = state.selectedTaskIds.includes(id)
            ? state.selectedTaskIds.filter((taskId) => taskId !== id)
            : [...state.selectedTaskIds, id]
          return { selectedTaskIds }
        }),
      clearSelectedTasks: () => set({ selectedTaskIds: [] }),

      // Search & Filter
      categories: [],
      activeCategoryFilter: ALL_CATEGORY_FILTER,
      setActiveCategoryFilter: (activeCategoryFilter) =>
        set((state) => ({
          activeCategoryFilter: resolveActiveCategoryFilter(activeCategoryFilter, state.categories),
        })),
      replaceCategoryState: (categories, activeCategoryFilter) =>
        set(() => {
          const normalizedCategories = normalizeCategoryList(categories)
          return {
            categories: normalizedCategories,
            activeCategoryFilter: resolveActiveCategoryFilter(
              activeCategoryFilter,
              normalizedCategories,
            ),
          }
        }),
      searchQuery: '',
      setSearchQuery: (searchQuery) => set({ searchQuery }),
      filterStatus: 'all',
      setFilterStatus: (filterStatus) => set({ filterStatus }),
      taskView: 'gallery',
      setTaskView: (taskView) =>
        set({
          taskView,
          selectedTaskIds: [],
          imageEditSession: null,
          detailTaskId: null,
        }),

      // UI
      imageEditSession: null,
      setImageEditSession: (imageEditSession) => set({ imageEditSession }),
      detailTaskId: null,
      setDetailTaskId: (detailTaskId) => set({ detailTaskId }),
      lightboxImageId: null,
      lightboxImageList: [],
      setLightboxImageId: (lightboxImageId, list) =>
        set({ lightboxImageId, lightboxImageList: list ?? (lightboxImageId ? [lightboxImageId] : []) }),
      showSettings: false,
      setShowSettings: (showSettings) => set({ showSettings }),

      // Toast
      toast: null,
      showToast: (message, type = 'info') => {
        set({ toast: { message, type } })
        setTimeout(() => {
          set((s) => (s.toast?.message === message ? { toast: null } : s))
        }, 3000)
      },

      // Confirm
      confirmDialog: null,
      setConfirmDialog: (confirmDialog) => set({ confirmDialog }),
    }),
    {
      name: 'gpt-image-playground',
      partialize: (state) => buildPersistedAppStateSnapshot(state),
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<AppState> | undefined
        const normalizedProviders = normalizeProviderList(persisted?.providers)
        const normalizedCategories = normalizeCategoryList(persisted?.categories)
        const providerState =
          normalizedProviders.length > 0
            ? (() => {
                const activeProvider =
                  normalizedProviders.find((provider) => provider.id === persisted?.activeProviderId) ??
                  normalizedProviders[0]

                return {
                  providers: normalizedProviders,
                  activeProviderId: activeProvider.id,
                  settings: getProviderSettings(activeProvider),
                }
              })()
            : createInitialProviderState({
                ...currentState.settings,
                ...persisted?.settings,
              })

        return {
          ...currentState,
          ...persisted,
          settings: providerState.settings,
          providers: providerState.providers,
          activeProviderId: providerState.activeProviderId,
          categories: normalizedCategories,
          activeCategoryFilter: resolveActiveCategoryFilter(
            persisted?.activeCategoryFilter,
            normalizedCategories,
          ),
          params: {
            ...currentState.params,
            ...persisted?.params,
          },
        }
      },
    },
  ),
)

// ===== Actions =====

let uid = 0
function genId(): string {
  return Date.now().toString(36) + (++uid).toString(36) + Math.random().toString(36).slice(2, 6)
}

/** 初始化：从 IndexedDB 加载任务和图片缓存，清理孤立图片 */
export async function initStore() {
  const tasks = await cleanupExpiredErrorDebugLogs(await getAllTasks())
  useStore.getState().setTasks(tasks)
  repairCategoryStateFromTasks(tasks)
  ensureErrorLogJanitorStarted()

  // 图片改为按需懒加载，避免启动时把整个图库都塞进内存，拖慢画廊首屏。
  window.setTimeout(() => {
    void cleanupOrphanImages(tasks)
  }, 1000)
}

async function cleanupOrphanImages(tasks: TaskRecord[]) {
  // 收集所有任务引用的图片 id
  const referencedIds = new Set<string>()
  for (const t of tasks) {
    for (const id of getTaskReferencedImageIds(t)) referencedIds.add(id)
  }

  // 仅清理孤立图片，不再预加载所有图片数据到内存缓存。
  const images = await getAllImages()
  for (const img of images) {
    if (!referencedIds.has(img.id)) {
      await deleteImage(img.id)
    }
  }
}

/** 提交新任务 */
export async function submitTask() {
  const {
    settings,
    providers,
    categories,
    activeProviderId,
    activeCategoryFilter,
    prompt,
    inputImages,
    params,
    tasks,
    setTasks,
    showToast,
  } =
    useStore.getState()

  if (!settings.apiKey) {
    showToast('请先在设置中配置 API Key', 'error')
    useStore.getState().setShowSettings(true)
    return
  }

  if (!prompt.trim() && !inputImages.length) {
    showToast('请输入提示词或添加参考图', 'error')
    return
  }

  const maskedInputs = inputImages.filter((img) => Boolean(img.maskDataUrl))
  if (maskedInputs.length > 1) {
    showToast('当前仅支持 1 张带蒙版的局部编辑参考图，请先清理多余蒙版后再提交', 'error')
    return
  }

  // 持久化输入图片到 IndexedDB（此前只在内存缓存中）
  for (const img of inputImages) {
    await storeImage(img.dataUrl)
  }
  const maskedInput = maskedInputs[0]
  const editMaskImageId = maskedInput?.maskDataUrl
    ? await storeImage(maskedInput.maskDataUrl, 'upload')
    : null

  const normalizedParams = {
    ...params,
    size: normalizeImageSize(params.size) || DEFAULT_PARAMS.size,
  }
  if (normalizedParams.size !== params.size) {
    useStore.getState().setParams({ size: normalizedParams.size })
  }

  const taskId = genId()
  const selectedProvider = findProviderById(providers, activeProviderId)
  const selectedCategory =
    activeCategoryFilter !== ALL_CATEGORY_FILTER &&
    activeCategoryFilter !== FAVORITES_CATEGORY_FILTER &&
    activeCategoryFilter !== UNCATEGORIZED_CATEGORY_FILTER
      ? findCategoryById(categories, activeCategoryFilter)
      : undefined
  const requestSettings = selectedProvider ? getProviderSettings(selectedProvider) : settings
  const task: TaskRecord = {
    id: taskId,
    providerId: selectedProvider?.id ?? null,
    providerName: selectedProvider?.name?.trim() || UNKNOWN_TASK_PROVIDER_NAME,
    categoryId: selectedCategory?.id ?? null,
    categoryName: selectedCategory?.name ?? null,
    deletedAt: null,
    isFavorite: false,
    prompt: prompt.trim(),
    params: normalizedParams,
    inputImageIds: inputImages.map((i) => i.id),
    editMaskImageId,
    editSourceImageId: maskedInput?.sourceImageId ?? maskedInput?.id ?? null,
    editSelection: maskedInput?.editSelection ?? null,
    outputImages: [],
    requestSettingsSnapshot: {
      apiProtocol: requestSettings.apiProtocol || DEFAULT_SETTINGS.apiProtocol,
      model: requestSettings.model,
      responsesImageModel: requestSettings.responsesImageModel || null,
    },
    responseMeta: null,
    errorDebug: null,
    status: 'running',
    error: null,
    createdAt: Date.now(),
    finishedAt: null,
    elapsed: null,
  }

  const newTasks = [task, ...tasks]
  setTasks(newTasks)
  await putTask(task)

  // 异步调用 API
  executeTask(taskId, requestSettings)
}

async function executeTask(taskId: string, requestSettings?: AppSettings) {
  const { settings, providers } = useStore.getState()
  const task = useStore.getState().tasks.find((t) => t.id === taskId)
  if (!task) return

  const taskProvider = findProviderById(providers, task.providerId)
  const providerSettings =
    requestSettings ?? (taskProvider ? getProviderSettings(taskProvider) : settings)

  try {
    // 获取输入图片地址（data URL 或公网 URL）
    const inputDataUrls: string[] = []
    const loadedInputIds: string[] = []
    for (const imgId of task.inputImageIds) {
      const dataUrl = await ensureImageCached(imgId)
      if (dataUrl) {
        inputDataUrls.push(dataUrl)
        loadedInputIds.push(imgId)
      }
    }
    const editMaskDataUrl = task.editMaskImageId
      ? await ensureImageCached(task.editMaskImageId)
      : undefined
    if (task.editMaskImageId && !editMaskDataUrl) {
      throw new Error('局部编辑蒙版缺失，请重新选择编辑区域后再试')
    }
    const editSourceImageIndex =
      task.editSourceImageId != null ? loadedInputIds.indexOf(task.editSourceImageId) : -1

    const result = await callImageApi({
      settings: providerSettings,
      prompt: task.prompt,
      params: task.params,
      inputImageDataUrls: inputDataUrls,
      editMaskDataUrl,
      editSourceImageIndex: editSourceImageIndex >= 0 ? editSourceImageIndex : undefined,
    })

    // 存储输出图片
    const outputIds: string[] = []
    for (const dataUrl of result.images) {
      const imgId = await storeImage(dataUrl, 'generated')
      imageCache.set(imgId, dataUrl)
      outputIds.push(imgId)
    }

    // 更新任务
    updateTaskInStore(taskId, {
      outputImages: outputIds,
      responseMeta: result.responseMeta ?? null,
      error: null,
      errorDebug: null,
      status: 'done',
      finishedAt: Date.now(),
      elapsed: Date.now() - task.createdAt,
    })

    useStore.getState().showToast(`生成完成，共 ${outputIds.length} 张图片`, 'success')
  } catch (err) {
    updateTaskInStore(taskId, {
      status: 'error',
      error: err instanceof Error ? err.message : String(err),
      errorDebug: buildTaskErrorDebugInfo(providerSettings, err),
      finishedAt: Date.now(),
      elapsed: Date.now() - task.createdAt,
    })
    useStore.getState().setDetailTaskId(taskId)
  }

  // 释放输入图片的内存缓存（已持久化到 IndexedDB，后续按需从 DB 加载）
  for (const imgId of task.inputImageIds) {
    imageCache.delete(imgId)
  }
}

function updateTaskInStore(taskId: string, patch: Partial<TaskRecord>) {
  const { tasks, setTasks } = useStore.getState()
  const updated = tasks.map((t) =>
    t.id === taskId ? { ...t, ...patch } : t,
  )
  setTasks(updated)
  const task = updated.find((t) => t.id === taskId)
  if (task) putTask(task)
}

function collectReferencedImageIds(tasks: TaskRecord[], inputImages: InputImage[]): Set<string> {
  const referenced = new Set<string>()
  for (const task of tasks) {
    for (const id of getTaskReferencedImageIds(task)) referenced.add(id)
  }
  for (const img of inputImages) {
    referenced.add(img.id)
  }
  return referenced
}

function clearTaskUiState(taskIds: Set<string>) {
  useStore.setState((state) => ({
    selectedTaskIds: state.selectedTaskIds.filter((id) => !taskIds.has(id)),
    detailTaskId:
      state.detailTaskId && taskIds.has(state.detailTaskId) ? null : state.detailTaskId,
  }))
}

function repairCategoryStateFromTasks(tasks: TaskRecord[]) {
  const { categories, activeCategoryFilter } = useStore.getState()
  const nextCategories = mergeCategoriesFromTasks(categories, tasks)
  const hasChanged =
    nextCategories.length !== categories.length ||
    nextCategories.some(
      (category, index) =>
        categories[index]?.id !== category.id ||
        categories[index]?.name !== category.name ||
        categories[index]?.createdAt !== category.createdAt,
    )

  if (!hasChanged) return

  useStore.setState({
    categories: nextCategories,
    activeCategoryFilter: resolveActiveCategoryFilter(activeCategoryFilter, nextCategories),
  })
}

function applyPersistedAppStateSnapshot(snapshot: PersistedAppStateSnapshot) {
  const normalizedProviders = normalizeProviderList(snapshot.providers)
  const providerState =
    normalizedProviders.length > 0
      ? (() => {
          const activeProvider =
            normalizedProviders.find((provider) => provider.id === snapshot.activeProviderId) ??
            normalizedProviders[0]

          return {
            providers: normalizedProviders,
            activeProviderId: activeProvider.id,
            settings: getProviderSettings(activeProvider),
          }
        })()
      : createInitialProviderState(
          snapshot.settings && typeof snapshot.settings === 'object'
            ? (snapshot.settings as Partial<AppSettings>)
            : DEFAULT_SETTINGS,
        )
  const normalizedCategories = normalizeCategoryList(snapshot.categories)
  const nextParams =
    snapshot.params && typeof snapshot.params === 'object'
      ? (snapshot.params as Partial<TaskParams>)
      : undefined

  useStore.setState((state) => ({
    ...state,
    ...snapshot,
    settings: providerState.settings,
    providers: providerState.providers,
    activeProviderId: providerState.activeProviderId,
    categories: normalizedCategories,
    activeCategoryFilter: resolveActiveCategoryFilter(
      snapshot.activeCategoryFilter,
      normalizedCategories,
    ),
    params: nextParams ? { ...state.params, ...nextParams } : state.params,
  }))
}

export function createCategory(name: string): CategoryConfig {
  const { categories, showToast } = useStore.getState()
  const normalizedName = ensureCategoryNameAvailable(categories, name)
  const category = createCategoryConfig(normalizedName)

  useStore.setState({
    categories: [...categories, category],
    activeCategoryFilter: category.id,
  })

  showToast(`已创建分类「${category.name}」`, 'success')
  return category
}

export async function renameCategory(id: string, name: string) {
  const { categories, tasks, setTasks, showToast } = useStore.getState()
  const category = findCategoryById(categories, id)
  if (!category) {
    throw new Error('分类不存在')
  }

  const normalizedName = ensureCategoryNameAvailable(categories, name, id)
  if (normalizedName === category.name) {
    showToast('分类名称未变化', 'info')
    return
  }

  const nextCategories = categories.map((item) =>
    item.id === id ? { ...item, name: normalizedName } : item,
  )
  const updatedTasks = tasks.map((task) =>
    task.categoryId === id ? { ...task, categoryName: normalizedName } : task,
  )
  const affectedTasks = updatedTasks.filter((task) => task.categoryId === id)

  useStore.setState({ categories: nextCategories })
  setTasks(updatedTasks)
  await Promise.all(affectedTasks.map((task) => putTask(task)))
  showToast(`已重命名为「${normalizedName}」`, 'success')
}

export async function deleteCategory(id: string) {
  const {
    categories,
    activeCategoryFilter,
    tasks,
    setTasks,
    showToast,
  } = useStore.getState()
  const category = findCategoryById(categories, id)
  if (!category) {
    throw new Error('分类不存在')
  }

  const nextCategories = categories.filter((item) => item.id !== id)
  const updatedTasks = tasks.map((task) =>
    task.categoryId === id ? { ...task, categoryId: null, categoryName: null } : task,
  )
  const nextFilter =
    activeCategoryFilter === id
      ? UNCATEGORIZED_CATEGORY_FILTER
      : resolveActiveCategoryFilter(activeCategoryFilter, nextCategories)

  useStore.setState({
    categories: nextCategories,
    activeCategoryFilter: nextFilter,
  })
  setTasks(updatedTasks)
  await Promise.all(
    tasks
      .filter((task) => task.categoryId === id)
      .map((task) =>
        putTask({
          ...task,
          categoryId: null,
          categoryName: null,
        }),
      ),
  )

  const movedCount = tasks.filter((task) => task.categoryId === id).length
  showToast(
    movedCount > 0
      ? `已删除分类「${category.name}」，${movedCount} 条记录移入未分类`
      : `已删除分类「${category.name}」`,
    'success',
  )
}

export async function moveTasksToCategory(
  tasksToMove: TaskRecord[],
  categoryId: string | null,
) {
  const { categories, tasks, setTasks, showToast } = useStore.getState()
  if (!tasksToMove.length) return 0

  const targetCategory = categoryId ? findCategoryById(categories, categoryId) : undefined
  if (categoryId && !targetCategory) {
    throw new Error('目标分类不存在')
  }

  const taskIds = new Set(tasksToMove.map((task) => task.id))
  const matchedTasks = tasks.filter((task) => taskIds.has(task.id))
  if (!matchedTasks.length) return 0

  const nextCategoryId = targetCategory?.id ?? null
  const nextCategoryName = targetCategory?.name ?? null
  const changedTasks = matchedTasks.filter(
    (task) =>
      (task.categoryId ?? null) !== nextCategoryId ||
      (task.categoryName ?? null) !== nextCategoryName,
  )

  if (!changedTasks.length) {
    showToast(
      targetCategory
        ? `所选记录已在分类「${targetCategory.name}」下`
        : '所选记录已在未分类中',
      'info',
    )
    return 0
  }

  const changedTaskIds = new Set(changedTasks.map((task) => task.id))
  const nextTasks = tasks.map((task) =>
    changedTaskIds.has(task.id)
      ? {
          ...task,
          categoryId: nextCategoryId,
          categoryName: nextCategoryName,
        }
      : task,
  )

  setTasks(nextTasks)
  await Promise.all(
    changedTasks.map((task) =>
      putTask({
        ...task,
        categoryId: nextCategoryId,
        categoryName: nextCategoryName,
      }),
    ),
  )

  showToast(
    nextCategoryName
      ? `已将 ${changedTasks.length} 条记录移到「${nextCategoryName}」`
      : `已将 ${changedTasks.length} 条记录移到未分类`,
    'success',
  )
  return changedTasks.length
}

export async function moveTaskToCategory(task: TaskRecord, categoryId: string | null) {
  return moveTasksToCategory([task], categoryId)
}

async function purgeTasksPermanently(
  tasksToRemove: TaskRecord[],
  options?: {
    silent?: boolean
    successMessage?: string
    taskUniverse?: TaskRecord[]
  },
) {
  const { tasks, setTasks, inputImages, showToast } = useStore.getState()
  if (!tasksToRemove.length) return 0

  const taskIdsToRemove = new Set(tasksToRemove.map((task) => task.id))
  const taskUniverse = options?.taskUniverse ?? tasks
  const matchedTasks = taskUniverse.filter((task) => taskIdsToRemove.has(task.id))
  if (!matchedTasks.length) return 0

  const taskImageIds = new Set<string>()
  for (const task of matchedTasks) {
    for (const id of getTaskReferencedImageIds(task)) taskImageIds.add(id)
  }

  const remainingStoreTasks = tasks.filter((task) => !taskIdsToRemove.has(task.id))
  const remainingTasks = taskUniverse.filter((task) => !taskIdsToRemove.has(task.id))
  setTasks(remainingStoreTasks)
  clearTaskUiState(taskIdsToRemove)
  await Promise.all(matchedTasks.map((task) => dbDeleteTask(task.id)))

  const stillUsed = collectReferencedImageIds(remainingTasks, inputImages)
  for (const imgId of taskImageIds) {
    if (!stillUsed.has(imgId)) {
      await deleteImage(imgId)
      imageCache.delete(imgId)
      imageLoadPromiseCache.delete(imgId)
    }
  }

  if (!options?.silent) {
    showToast(
      options?.successMessage ??
        (matchedTasks.length === 1 ? '记录已彻底删除' : `已彻底删除 ${matchedTasks.length} 条记录`),
      'success',
    )
  }

  return matchedTasks.length
}

export async function cleanupExpiredRecycleBinTasks() {
  const tasks = await getAllTasks()
  const cutoff = Date.now() - RECYCLE_BIN_RETENTION_MS
  const expiredTasks = tasks.filter(
    (task) => isTaskInRecycleBin(task) && (task.deletedAt ?? 0) <= cutoff,
  )

  if (!expiredTasks.length) return 0
  return purgeTasksPermanently(expiredTasks, { silent: true, taskUniverse: tasks })
}

export function startRecycleBinJanitor() {
  if (recycleBinJanitorId != null) {
    return () => {
      if (recycleBinJanitorId != null) {
        window.clearInterval(recycleBinJanitorId)
        recycleBinJanitorId = null
      }
    }
  }

  void cleanupExpiredRecycleBinTasks()
  recycleBinJanitorId = window.setInterval(() => {
    void cleanupExpiredRecycleBinTasks()
  }, RECYCLE_BIN_POLL_INTERVAL_MS)

  return () => {
    if (recycleBinJanitorId != null) {
      window.clearInterval(recycleBinJanitorId)
      recycleBinJanitorId = null
    }
  }
}

async function buildInputImagesFromTask(task: TaskRecord): Promise<InputImage[]> {
  const maskDataUrl = task.editMaskImageId ? await ensureImageCached(task.editMaskImageId) : null
  const imgs: InputImage[] = []

  for (const imgId of task.inputImageIds) {
    const dataUrl = await ensureImageCached(imgId)
    if (!dataUrl) continue

    const isEditSourceImage =
      Boolean(maskDataUrl) && (task.editSourceImageId ? task.editSourceImageId === imgId : task.inputImageIds[0] === imgId)
    imgs.push({
      id: imgId,
      dataUrl,
      maskDataUrl: isEditSourceImage ? maskDataUrl : null,
      editSelection: isEditSourceImage ? task.editSelection ?? null : null,
      sourceTaskId: isEditSourceImage ? task.id : null,
      sourceImageId: isEditSourceImage ? task.editSourceImageId ?? imgId : null,
    })
  }

  return imgs
}

/** 复用配置 */
export async function reuseConfig(task: TaskRecord) {
  const { providers, setActiveProvider, setPrompt, setParams, setInputImages, showToast } =
    useStore.getState()

  const provider = findProviderById(providers, task.providerId)
  if (provider) {
    setActiveProvider(provider.id)
  }

  setPrompt(task.prompt)
  setParams(task.params)

  setInputImages(await buildInputImagesFromTask(task))
  showToast('已复用配置到输入框', 'success')
}

export async function setTasksFavorite(tasksToUpdate: TaskRecord[], isFavorite: boolean) {
  const { tasks, setTasks, showToast } = useStore.getState()
  if (!tasksToUpdate.length) return 0

  const taskIds = new Set(tasksToUpdate.map((task) => task.id))
  const matchedTasks = tasks.filter((task) => taskIds.has(task.id))
  const changedTasks = matchedTasks.filter((task) => Boolean(task.isFavorite) !== isFavorite)
  if (!changedTasks.length) {
    showToast(isFavorite ? '所选记录已在收藏中' : '所选记录已取消收藏', 'info')
    return 0
  }

  const changedTaskIds = new Set(changedTasks.map((task) => task.id))
  const nextTasks = tasks.map((task) =>
    changedTaskIds.has(task.id)
      ? {
          ...task,
          isFavorite,
        }
      : task,
  )

  setTasks(nextTasks)
  await Promise.all(
    changedTasks.map((task) =>
      putTask({
        ...task,
        isFavorite,
      }),
    ),
  )

  showToast(
    isFavorite
      ? `已收藏 ${changedTasks.length} 条记录`
      : `已取消收藏 ${changedTasks.length} 条记录`,
    'success',
  )
  return changedTasks.length
}

export async function toggleTaskFavorite(task: TaskRecord) {
  return setTasksFavorite([task], !task.isFavorite)
}

/** 编辑输出：打开局部编辑器 */
export async function editOutputs(task: TaskRecord, preferredImageId?: string) {
  const { setImageEditSession, showToast } = useStore.getState()
  const sourceImageId =
    preferredImageId && task.outputImages.includes(preferredImageId)
      ? preferredImageId
      : task.outputImages?.[0]
  if (!sourceImageId) return

  const sourceImageDataUrl = await ensureImageCached(sourceImageId)
  if (!sourceImageDataUrl) {
    showToast('输出图读取失败，无法进入编辑器', 'error')
    return
  }

  setImageEditSession({
    taskId: task.id,
    providerId: task.providerId ?? null,
    sourceImageId,
    sourceImageDataUrl,
    prompt: task.prompt,
    params: task.params,
    initialSelection: task.editSelection ?? null,
  })
}

export function reopenImageEditorFromInputImage(inputImage: InputImage) {
  const { activeProviderId, prompt, params, tasks, setImageEditSession, showToast } =
    useStore.getState()

  if (!inputImage.dataUrl) {
    showToast('当前参考图不可用，无法重新打开编辑器', 'error')
    return
  }

  const sourceTask = inputImage.sourceTaskId
    ? tasks.find((task) => task.id === inputImage.sourceTaskId)
    : null

  setImageEditSession({
    taskId: inputImage.sourceTaskId ?? 'input-image',
    providerId: sourceTask?.providerId ?? activeProviderId ?? null,
    sourceImageId: inputImage.sourceImageId ?? inputImage.id,
    sourceImageDataUrl: inputImage.dataUrl,
    prompt: sourceTask?.prompt ?? prompt.trim(),
    params: sourceTask?.params ?? params,
    initialSelection: inputImage.editSelection ?? null,
  })
}

export function closeImageEditor() {
  useStore.getState().setImageEditSession(null)
}

export function clearInputImageEdit(index: number) {
  const { inputImages, setInputImages, showToast } = useStore.getState()
  const targetImage = inputImages[index]
  if (!targetImage) return

  if (!targetImage.maskDataUrl && !targetImage.editSelection) {
    showToast('这张参考图当前没有局部编辑蒙版', 'info')
    return
  }

  setInputImages(
    inputImages.map((image, imageIndex) =>
      imageIndex === index
        ? {
            ...image,
            maskDataUrl: null,
            editSelection: null,
          }
        : image,
    ),
  )
  showToast('已移除该参考图的局部编辑区域', 'success')
}

export async function applyImageEditToInput(options: {
  session: ImageEditSession
  prompt: string
  providerId?: string | null
  maskDataUrl?: string | null
  selection?: ImageEditSelection | null
  sourceSize?: string
  submit?: boolean
}) {
  const {
    providers,
    setActiveProvider,
    setPrompt,
    setParams,
    setInputImages,
    setImageEditSession,
    showToast,
  } = useStore.getState()

  const provider = findProviderById(providers, options.providerId ?? options.session.providerId)
  if (provider) {
    setActiveProvider(provider.id)
  }

  setPrompt(options.prompt.trim())
  setParams({
    ...options.session.params,
    size: options.sourceSize
      ? normalizeImageSize(options.sourceSize) || options.session.params.size
      : options.session.params.size,
  })
  setInputImages([
    {
      id: options.session.sourceImageId,
      dataUrl: options.session.sourceImageDataUrl,
      maskDataUrl: options.maskDataUrl ?? null,
      editSelection: options.selection ?? null,
      sourceTaskId: options.session.taskId,
      sourceImageId: options.session.sourceImageId,
    },
  ])
  setImageEditSession(null)
  showToast(
    options.submit
      ? options.maskDataUrl
        ? '已写入输入区，正在提交局部编辑任务'
        : '已写入输入区，正在提交整图编辑任务'
      : options.maskDataUrl
        ? '已写入局部编辑输入区'
        : '已写入整图编辑输入区',
    'success',
  )

  if (options.submit) {
    await submitTask()
  }
}

/** 批量移入回收站 */
export async function removeTasks(tasksToRemove: TaskRecord[]) {
  const { tasks, setTasks, showToast } = useStore.getState()
  if (!tasksToRemove.length) return

  const taskIdsToRemove = new Set(tasksToRemove.map((task) => task.id))
  const matchedTasks = tasks.filter(
    (task) => taskIdsToRemove.has(task.id) && !isTaskInRecycleBin(task),
  )
  if (!matchedTasks.length) return

  const deletedAt = Date.now()
  const updatedTasks = tasks.map((task) =>
    taskIdsToRemove.has(task.id) && !isTaskInRecycleBin(task)
      ? { ...task, deletedAt }
      : task,
  )
  setTasks(updatedTasks)
  clearTaskUiState(taskIdsToRemove)
  await Promise.all(
    matchedTasks.map((task) =>
      putTask({
        ...task,
        deletedAt,
      }),
    ),
  )

  showToast(
    matchedTasks.length === 1
      ? '记录已移入回收站'
      : `已将 ${matchedTasks.length} 条记录移入回收站`,
    'success',
  )
}

/** 删除单条任务 */
export async function removeTask(task: TaskRecord) {
  await removeTasks([task])
}

/** 批量恢复任务 */
export async function restoreTasks(tasksToRestore: TaskRecord[]) {
  const { tasks, setTasks, showToast } = useStore.getState()
  if (!tasksToRestore.length) return

  const taskIdsToRestore = new Set(tasksToRestore.map((task) => task.id))
  const matchedTasks = tasks.filter(
    (task) => taskIdsToRestore.has(task.id) && isTaskInRecycleBin(task),
  )
  if (!matchedTasks.length) return

  const updatedTasks = tasks.map((task) =>
    taskIdsToRestore.has(task.id) && isTaskInRecycleBin(task)
      ? { ...task, deletedAt: null }
      : task,
  )
  setTasks(updatedTasks)
  clearTaskUiState(taskIdsToRestore)
  await Promise.all(
    matchedTasks.map((task) =>
      putTask({
        ...task,
        deletedAt: null,
      }),
    ),
  )

  showToast(
    matchedTasks.length === 1 ? '记录已恢复' : `已恢复 ${matchedTasks.length} 条记录`,
    'success',
  )
}

/** 恢复单条任务 */
export async function restoreTask(task: TaskRecord) {
  await restoreTasks([task])
}

/** 清空所有数据（含配置重置） */
export async function clearAllData() {
  await dbClearTasks()
  await clearImages()
  imageCache.clear()
  imageLoadPromiseCache.clear()
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

/** 从 dataUrl 解析出 MIME 扩展名和二进制数据 */
function dataUrlToBytes(dataUrl: string): { ext: string; bytes: Uint8Array } {
  const match = dataUrl.match(/^data:image\/(\w+);base64,/)
  const ext = match?.[1] ?? 'png'
  const b64 = dataUrl.replace(/^data:[^;]+;base64,/, '')
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return { ext, bytes }
}

/** 将二进制数据还原为 dataUrl */
function bytesToDataUrl(bytes: Uint8Array, filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? 'png'
  const mimeMap: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' }
  const mime = mimeMap[ext] ?? 'image/png'
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return `data:${mime};base64,${btoa(binary)}`
}

/** 导出数据为 ZIP */
export async function exportData() {
  try {
    const tasks = await getAllTasks()
    const images = await getAllImages()
    const appStateSnapshot = buildPersistedAppStateSnapshot(useStore.getState())
    const exportedAt = Date.now()
    const imageCreatedAtFallback = new Map<string, number>()

    for (const task of tasks) {
      for (const id of getTaskReferencedImageIds(task)) {
        const prev = imageCreatedAtFallback.get(id)
        if (prev == null || task.createdAt < prev) {
          imageCreatedAtFallback.set(id, task.createdAt)
        }
      }
    }

    const imageFiles: ExportData['imageFiles'] = {}
    const zipFiles: Record<string, Uint8Array | [Uint8Array, { mtime: Date }]> = {}

    for (const img of images) {
      const createdAt = img.createdAt ?? imageCreatedAtFallback.get(img.id) ?? exportedAt
      if (isRemoteImageUrl(img.dataUrl)) {
        imageFiles[img.id] = { url: img.dataUrl, createdAt, source: img.source }
        continue
      }

      const { ext, bytes } = dataUrlToBytes(img.dataUrl)
      const path = `images/${img.id}.${ext}`
      imageFiles[img.id] = { path, createdAt, source: img.source }
      zipFiles[path] = [bytes, { mtime: new Date(createdAt) }]
    }

    const manifest: ExportData = {
      version: 4,
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

    zipFiles['manifest.json'] = [strToU8(JSON.stringify(manifest, null, 2)), { mtime: new Date(exportedAt) }]

    const zipped = zipSync(zipFiles, { level: 6 })
    const blob = new Blob([zipped.buffer as ArrayBuffer], { type: 'application/zip' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `gpt-image-playground-${Date.now()}.zip`
    a.click()
    URL.revokeObjectURL(url)
    useStore.getState().showToast('数据已导出', 'success')
  } catch (e) {
    useStore
      .getState()
      .showToast(
        `导出失败：${e instanceof Error ? e.message : String(e)}`,
        'error',
      )
  }
}

/** 导入 ZIP 数据 */
export async function importData(file: File) {
  try {
    const buffer = await file.arrayBuffer()
    const unzipped = unzipSync(new Uint8Array(buffer))

    const manifestBytes = unzipped['manifest.json']
    if (!manifestBytes) throw new Error('ZIP 中缺少 manifest.json')

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

    // 还原图片
    for (const [id, info] of Object.entries(data.imageFiles)) {
      if (!referencedImageIds.has(id)) continue

      if (info.url) {
        await putImage({ id, dataUrl: info.url, createdAt: info.createdAt, source: info.source })
        imageCache.set(id, info.url)
        continue
      }

      if (!info.path) continue
      const bytes = unzipped[info.path]
      if (!bytes) continue
      const dataUrl = bytesToDataUrl(bytes, info.path)
      await putImage({ id, dataUrl, createdAt: info.createdAt, source: info.source })
      imageCache.set(id, dataUrl)
    }

    for (const task of tasksToImport) {
      await putTask(task)
    }

    useStore.getState().replaceProviderState(mergedProviders, currentState.activeProviderId)
    useStore
      .getState()
      .replaceCategoryState(mergedCategories, currentState.activeCategoryFilter)

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
    useStore
      .getState()
      .showToast(summaryParts.join('，'), 'success')
  } catch (e) {
    useStore
      .getState()
      .showToast(
        `导入失败：${e instanceof Error ? e.message : String(e)}`,
        'error',
      )
  }
}

/** 添加图片到输入（文件上传）—— 仅放入内存缓存，不写 IndexedDB */
export async function addImageFromFile(file: File): Promise<void> {
  if (!file.type.startsWith('image/')) return
  const dataUrl = await fileToDataUrl(file)
  const id = await hashDataUrl(dataUrl)
  imageCache.set(id, dataUrl)
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
  imageCache.set(id, normalizedUrl)
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
