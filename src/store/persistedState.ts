import type { AppState, PersistedAppStateSnapshot } from './contracts'
import {
  createInitialProviderState,
  getProviderSettings,
  normalizeCategoryList,
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
  }
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
    params: {
      ...currentState.params,
      ...persistedState?.params,
    },
  }
}
