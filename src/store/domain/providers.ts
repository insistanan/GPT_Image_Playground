import type { ApiProtocol, AppSettings, ProviderConfig, ResponsesPromptRevisionMode } from '@/types'
import { DEFAULT_SETTINGS } from '@/types'
import { DEFAULT_PROVIDER_NAME } from '../constants'

function genProviderId(): string {
  return `provider-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function normalizeApiProtocol(value: unknown): ApiProtocol {
  return value === 'responses' ? 'responses' : 'images'
}

function normalizeRequestMode(value: unknown): AppSettings['requestMode'] {
  if (!import.meta.env.DEV) {
    return 'direct'
  }

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
    leftSettings.requestMode === rightSettings.requestMode &&
    leftSettings.safetyIdentifier === rightSettings.safetyIdentifier &&
    leftSettings.partialImages === rightSettings.partialImages
  )
}

export function mergeImportedProviders(
  currentProviders: ProviderConfig[],
  importedProviders: ProviderConfig[],
): {
  providers: ProviderConfig[]
  providerIdMap: Map<string, string>
  addedProviderCount: number
  skippedProviderCount: number
} {
  const mergedProviders = normalizeProviderList(currentProviders)
  const providerIdMap = new Map<string, string>()
  const baseCount = mergedProviders.length
  let skippedProviderCount = 0

  for (const importedProvider of normalizeProviderList(importedProviders)) {
    const providerWithSameId = mergedProviders.find((provider) => provider.id === importedProvider.id)
    if (providerWithSameId) {
      providerIdMap.set(importedProvider.id, providerWithSameId.id)
      skippedProviderCount += 1
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
    skippedProviderCount,
  }
}
