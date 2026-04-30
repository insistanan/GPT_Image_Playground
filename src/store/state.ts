import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { ALL_CATEGORY_FILTER } from '../types'
import type { AppState } from './contracts'
import {
  createPromptLibraryItem,
  createInitialProviderState,
  createProviderConfig,
  getNextProviderName,
  getProviderSettings,
  normalizeCategoryList,
  normalizePromptLibraryItems,
  normalizeProviderList,
  resolveActiveCategoryFilter,
} from './domain'
import { evictImageAsset } from './imageAssets'
import { buildPersistedAppStateSnapshot, mergePersistedAppState } from './persistedState'
import { DEFAULT_PARAMS } from './taskParams'

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      ...createInitialProviderState(),
      setSettings: (settings) =>
        set((state) => {
          const nextSettings = { ...state.settings, ...settings }
          const providers = state.providers.map((provider) =>
            provider.id === state.activeProviderId ? { ...provider, ...settings } : provider,
          )
          return {
            settings: nextSettings,
            providers,
          }
        }),
      setActiveProvider: (id) =>
        set((state) => {
          const provider = state.providers.find((item) => item.id === id)
          if (!provider) {
            return state
          }

          return {
            activeProviderId: provider.id,
            settings: getProviderSettings(provider),
          }
        }),
      createProvider: () =>
        set((state) => {
          const provider = createProviderConfig(state.settings, getNextProviderName(state.providers))
          return {
            providers: [...state.providers, provider],
            activeProviderId: provider.id,
            settings: getProviderSettings(provider),
          }
        }),
      updateProviderName: (id, name) =>
        set((state) => ({
          providers: state.providers.map((provider) =>
            provider.id === id ? { ...provider, name: name.trim() || provider.name } : provider,
          ),
        })),
      removeProvider: (id) =>
        set((state) => {
          if (state.providers.length <= 1) {
            return state
          }

          const providers = state.providers.filter((provider) => provider.id !== id)
          if (providers.length === state.providers.length) {
            return state
          }

          const activeProvider =
            providers.find((provider) => provider.id === state.activeProviderId) ?? providers[0]

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

          const activeProvider =
            nextState.providers.find((provider) => provider.id === nextState.activeProviderId) ??
            nextState.providers[0]

          return {
            providers: nextState.providers,
            activeProviderId: activeProvider.id,
            settings: getProviderSettings(activeProvider),
          }
        }),

      prompt: '',
      setPrompt: (prompt) => set({ prompt }),
      promptLibrary: [],
      replacePromptLibrary: (promptLibrary) =>
        set(() => ({
          promptLibrary: normalizePromptLibraryItems(promptLibrary),
        })),
      savePromptLibraryItem: ({ title, content }) => {
        const nextItem = createPromptLibraryItem(content, title)
        set((state) => ({
          promptLibrary: [nextItem, ...state.promptLibrary.filter((item) => item.id !== nextItem.id)],
        }))
        return nextItem
      },
      removePromptLibraryItem: (id) =>
        set((state) => ({
          promptLibrary: state.promptLibrary.filter((item) => item.id !== id),
        })),
      inputImages: [],
      addInputImage: (image) =>
        set((state) => {
          if (state.inputImages.find((item) => item.id === image.id)) {
            return state
          }
          return { inputImages: [...state.inputImages, image] }
        }),
      removeInputImage: (index) =>
        set((state) => ({
          inputImages: state.inputImages.filter((_, currentIndex) => currentIndex !== index),
        })),
      clearInputImages: () =>
        set((state) => {
          for (const image of state.inputImages) {
            evictImageAsset(image.id)
          }
          return { inputImages: [] }
        }),
      setInputImages: (inputImages) => set({ inputImages }),

      params: { ...DEFAULT_PARAMS },
      setParams: (params) => set((state) => ({ params: { ...state.params, ...params } })),

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
          if (!state.tasks.some((task) => task.id === id)) {
            return state
          }

          const selectedTaskIds = state.selectedTaskIds.includes(id)
            ? state.selectedTaskIds.filter((taskId) => taskId !== id)
            : [...state.selectedTaskIds, id]
          return { selectedTaskIds }
        }),
      clearSelectedTasks: () => set({ selectedTaskIds: [] }),

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
      galleryDisplayMode: 'standard',
      setGalleryDisplayMode: (galleryDisplayMode) => set({ galleryDisplayMode }),

      imageEditSession: null,
      setImageEditSession: (imageEditSession) => set({ imageEditSession }),
      detailTaskId: null,
      setDetailTaskId: (detailTaskId) => set({ detailTaskId }),
      lightboxImageId: null,
      lightboxImageList: [],
      setLightboxImageId: (lightboxImageId, list) =>
        set({
          lightboxImageId,
          lightboxImageList: list ?? (lightboxImageId ? [lightboxImageId] : []),
        }),
      showSettings: false,
      setShowSettings: (showSettings) =>
        set((state) => ({
          showSettings,
          showPromptLibrary: showSettings ? false : state.showPromptLibrary,
        })),
      showPromptLibrary: false,
      setShowPromptLibrary: (showPromptLibrary) =>
        set((state) => ({
          showPromptLibrary,
          showSettings: showPromptLibrary ? false : state.showSettings,
        })),

      toast: null,
      showToast: (message, type = 'info') => {
        set({ toast: { message, type } })
        setTimeout(() => {
          set((state) => (state.toast?.message === message ? { toast: null } : state))
        }, 3000)
      },

      confirmDialog: null,
      setConfirmDialog: (confirmDialog) => set({ confirmDialog }),
    }),
    {
      name: 'gpt-image-playground',
      partialize: (state) => buildPersistedAppStateSnapshot(state),
      merge: (persistedState, currentState) =>
        mergePersistedAppState(persistedState as Partial<AppState> | undefined, currentState),
    },
  ),
)
