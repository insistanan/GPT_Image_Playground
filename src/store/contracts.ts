import type {
  AppSettings,
  CategoryConfig,
  ImageEditSession,
  InputImage,
  ProviderConfig,
  TaskParams,
  TaskRecord,
  TaskView,
} from '../types'

export interface AppState {
  settings: AppSettings
  providers: ProviderConfig[]
  activeProviderId: string
  setSettings: (settings: Partial<AppSettings>) => void
  setActiveProvider: (id: string) => void
  createProvider: () => void
  updateProviderName: (id: string, name: string) => void
  removeProvider: (id: string) => void
  replaceProviderState: (providers: ProviderConfig[], activeProviderId?: string) => void

  prompt: string
  setPrompt: (prompt: string) => void
  inputImages: InputImage[]
  addInputImage: (image: InputImage) => void
  removeInputImage: (index: number) => void
  clearInputImages: () => void
  setInputImages: (images: InputImage[]) => void

  params: TaskParams
  setParams: (params: Partial<TaskParams>) => void

  tasks: TaskRecord[]
  setTasks: (tasks: TaskRecord[]) => void
  selectedTaskIds: string[]
  setSelectedTaskIds: (ids: string[]) => void
  toggleTaskSelection: (id: string) => void
  clearSelectedTasks: () => void

  categories: CategoryConfig[]
  activeCategoryFilter: string
  setActiveCategoryFilter: (filter: string) => void
  replaceCategoryState: (categories: CategoryConfig[], activeCategoryFilter?: string) => void
  searchQuery: string
  setSearchQuery: (query: string) => void
  filterStatus: 'all' | 'running' | 'done' | 'error'
  setFilterStatus: (status: AppState['filterStatus']) => void
  taskView: TaskView
  setTaskView: (view: TaskView) => void

  imageEditSession: ImageEditSession | null
  setImageEditSession: (session: ImageEditSession | null) => void
  detailTaskId: string | null
  setDetailTaskId: (id: string | null) => void
  lightboxImageId: string | null
  lightboxImageList: string[]
  setLightboxImageId: (id: string | null, list?: string[]) => void
  showSettings: boolean
  setShowSettings: (visible: boolean) => void

  toast: { message: string; type: 'info' | 'success' | 'error' } | null
  showToast: (message: string, type?: 'info' | 'success' | 'error') => void

  confirmDialog: {
    title: string
    message: string
    confirmText?: string
    action: () => void
  } | null
  setConfirmDialog: (dialog: AppState['confirmDialog']) => void
}

export type PersistedAppStateSnapshot = Partial<
  Pick<
    AppState,
    'settings' | 'providers' | 'activeProviderId' | 'categories' | 'activeCategoryFilter' | 'params'
  >
> &
  Record<string, unknown>

export type StoreApiError = Error & {
  status?: number
  requestId?: string
  details?: unknown
}
