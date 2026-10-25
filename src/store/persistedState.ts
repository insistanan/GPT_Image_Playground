import { normalizeParamsForSettings } from '@/lib/capabilities'
import type { AppView, GalleryDisplayMode } from '@/types'
import type { AppState, PersistedAppStateSnapshot } from './contracts'
import { DEFAULT_PARAMS } from './taskParams'
import {
  createInitialProviderState,
  getProviderSettings,
  normalizeCategoryList,
  normalizePromptLibraryItems,
  normalizeProviderList,
  resolveActiveCategoryFilter,
} from './domain'

export function buildPersistedAppStateSnapshot(state: AppState): PersistedAppStateSnapshot {
  return {
    settings: state.settings,
    providers: state.providers,
    activeProviderId: state.activeProviderId,
    categories: state.categories,
    activeCategoryFilter: state.activeCategoryFilter,
    params: state.params,
    promptLibrary: state.promptLibrary,
    galleryDisplayMode: state.galleryDisplayMode,
    appView: state.appView,
  }
}

function resolveGalleryDisplayMode(value: unknown): GalleryDisplayMode {
  return value === 'image' ? 'image' : 'standard'
}

function resolveAppView(value: unknown): AppView {
  return value === 'square' ? 'square' : 'local'
}

export function readPersistedAppStateSnapshot(input: unknown): PersistedAppStateSnapshot | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return null
  }

  return input as PersistedAppStateSnapshot
}

export function mergePersistedAppState(
  persistedState: Partial<AppState> | undefined,
  currentState: AppState,
): AppState {
  const normalizedProviders = normalizeProviderList(persistedState?.providers)
  const normalizedCategories = normalizeCategoryList(persistedState?.categories)
  const normalizedPromptLibrary = normalizePromptLibraryItems(persistedState?.promptLibrary)
  const providerState =
    normalizedProviders.length > 0
      ? (() => {
          const activeProvider =
            normalizedProviders.find((provider) => provider.id === persistedState?.activeProviderId) ??
            normalizedProviders[0]

          return {
            providers: normalizedProviders,
            activeProviderId: activeProvider.id,
            settings: getProviderSettings(activeProvider),
          }
        })()
      : createInitialProviderState({
          ...currentState.settings,
          ...persistedState?.settings,
        })

  return {
    ...currentState,
    ...persistedState,
    settings: providerState.settings,
    providers: providerState.providers,
    activeProviderId: providerState.activeProviderId,
    categories: normalizedCategories,
    activeCategoryFilter: resolveActiveCategoryFilter(
      persistedState?.activeCategoryFilter,
      normalizedCategories,
    ),
    params: normalizeParamsForSettings({
      ...DEFAULT_PARAMS,
      ...currentState.params,
      ...persistedState?.params,
      background: persistedState?.params?.background ?? currentState.params.background ?? DEFAULT_PARAMS.background,
    }, {
      ...currentState.settings,
      ...persistedState?.settings,
      ...providerState.settings,
    }),
    promptLibrary: normalizedPromptLibrary,
    galleryDisplayMode: resolveGalleryDisplayMode(persistedState?.galleryDisplayMode),
    appView: resolveAppView(persistedState?.appView),
  }
}
