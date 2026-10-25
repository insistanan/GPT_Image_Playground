import {
  createInitialProviderState,
  createProviderConfig,
  getNextProviderName,
  getProviderSettings,
  normalizeProviderList,
} from "@/store/domain"

export function createProviderSlice(set: any) {
  return {
    ...createInitialProviderState(),

    setSettings(settings: any) {
      set((state: any) => {
        const nextSettings = { ...state.settings, ...settings }
        const providers = state.providers.map((provider: any) =>
          provider.id === state.activeProviderId ? { ...provider, ...settings } : provider
        )
        return { settings: nextSettings, providers }
      })
    },

    setActiveProvider(id: string) {
      set((state: any) => {
        const provider = state.providers.find((item: any) => item.id === id)
        if (!provider) return state
        return { activeProviderId: provider.id, settings: getProviderSettings(provider) }
      })
    },

    createProvider() {
      set((state: any) => {
        const provider = createProviderConfig(state.settings, getNextProviderName(state.providers))
        return { providers: [...state.providers, provider], activeProviderId: provider.id, settings: getProviderSettings(provider) }
      })
    },

    updateProviderName(id: string, name: string) {
      set((state: any) => ({
        providers: state.providers.map((provider: any) =>
          provider.id === id ? { ...provider, name: name.trim() || provider.name } : provider
        ),
      }))
    },

    removeProvider(id: string) {
      set((state: any) => {
        if (state.providers.length <= 1) return state
        const providers = state.providers.filter((provider: any) => provider.id !== id)
        if (providers.length === state.providers.length) return state
        const activeProvider = providers.find((p: any) => p.id === state.activeProviderId) ?? providers[0]
        return { providers, activeProviderId: activeProvider.id, settings: getProviderSettings(activeProvider) }
      })
    },

    replaceProviderState(providers: any, activeProviderId?: string) {
      set(() => {
        const normalizedProviders = normalizeProviderList(providers)
        const nextState = normalizedProviders.length > 0
          ? { providers: normalizedProviders, activeProviderId: normalizedProviders.find((p: any) => p.id === activeProviderId)?.id ?? normalizedProviders[0].id }
          : createInitialProviderState()
        const activeProvider = nextState.providers.find((p: any) => p.id === nextState.activeProviderId) ?? nextState.providers[0]
        return { providers: nextState.providers, activeProviderId: activeProvider.id, settings: getProviderSettings(activeProvider) }
      })
    },
  }
}
