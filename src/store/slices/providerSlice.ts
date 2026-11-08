import {
  createInitialProviderState,
  createProviderConfig,
  getNextProviderName,
  getProviderSettings,
  normalizeProviderList,
} from "@/store/domain"
import type { AppState, StoreSetter } from '../contracts'
import type { AppSettings, ProviderConfig } from '@/types'

type ProviderSlice = Pick<AppState,
  | 'settings' | 'providers' | 'activeProviderId' | 'setSettings' | 'setActiveProvider' | 'createProvider'
  | 'updateProviderName' | 'removeProvider' | 'replaceProviderState'
>

export function createProviderSlice(set: StoreSetter): ProviderSlice {
  return {
    ...createInitialProviderState(),

    setSettings(settings: Partial<AppSettings>) {
      set((state) => {
        const nextSettings = { ...state.settings, ...settings }
        const providers = state.providers.map((provider) =>
          provider.id === state.activeProviderId ? { ...provider, ...settings } : provider
        )
        return { settings: nextSettings, providers }
      })
    },

    setActiveProvider(id: string) {
      set((state) => {
        const provider = state.providers.find((item) => item.id === id)
        if (!provider) return state
        return { activeProviderId: provider.id, settings: getProviderSettings(provider) }
      })
    },

    createProvider() {
      set((state) => {
        const provider = createProviderConfig(state.settings, getNextProviderName(state.providers))
        return { providers: [...state.providers, provider], activeProviderId: provider.id, settings: getProviderSettings(provider) }
      })
    },

    updateProviderName(id: string, name: string) {
      set((state) => ({
        providers: state.providers.map((provider) =>
          provider.id === id ? { ...provider, name: name.trim() || provider.name } : provider
        ),
      }))
    },

    removeProvider(id: string) {
      set((state) => {
        if (state.providers.length <= 1) return state
        const providers = state.providers.filter((provider) => provider.id !== id)
        if (providers.length === state.providers.length) return state
        const activeProvider = providers.find((p) => p.id === state.activeProviderId) ?? providers[0]
        return { providers, activeProviderId: activeProvider.id, settings: getProviderSettings(activeProvider) }
      })
    },

    replaceProviderState(providers: ProviderConfig[], activeProviderId?: string) {
      set(() => {
        const normalizedProviders = normalizeProviderList(providers)
        const nextState = normalizedProviders.length > 0
          ? { providers: normalizedProviders, activeProviderId: normalizedProviders.find((p) => p.id === activeProviderId)?.id ?? normalizedProviders[0].id }
          : createInitialProviderState()
        const activeProvider = nextState.providers.find((p) => p.id === nextState.activeProviderId) ?? nextState.providers[0]
        return { providers: nextState.providers, activeProviderId: activeProvider.id, settings: getProviderSettings(activeProvider) }
      })
    },
  }
}
