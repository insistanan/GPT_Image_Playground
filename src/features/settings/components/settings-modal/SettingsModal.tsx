import { useCallback, useEffect, useRef, useState } from 'react'
import { normalizeBaseUrl, readClientDevProxyConfig } from '@/lib/devProxy'
import { useStore, exportData, importData, clearAllData } from '@/store'
import { DEFAULT_SETTINGS, type AppSettings } from '@/types'
import { useCloseOnEscape } from '@/hooks/useCloseOnEscape'
import ApiSettingsSection from './ApiSettingsSection'
import DataManagementSection from './DataManagementSection'

function normalizeRuntimeRequestMode(requestMode: AppSettings['requestMode']): AppSettings['requestMode'] {
  return import.meta.env.DEV && requestMode === 'local_proxy' ? 'local_proxy' : 'direct'
}

function normalizeSettingsDraft(settings: AppSettings): AppSettings {
  return {
    ...settings,
    requestMode: normalizeRuntimeRequestMode(settings.requestMode),
  }
}

export default function SettingsModal() {
  const showSettings = useStore((s) => s.showSettings)
  const setShowSettings = useStore((s) => s.setShowSettings)
  const settings = useStore((s) => s.settings)
  const providers = useStore((s) => s.providers)
  const activeProviderId = useStore((s) => s.activeProviderId)
  const setSettings = useStore((s) => s.setSettings)
  const setActiveProvider = useStore((s) => s.setActiveProvider)
  const createProvider = useStore((s) => s.createProvider)
  const updateProviderName = useStore((s) => s.updateProviderName)
  const removeProvider = useStore((s) => s.removeProvider)
  const setConfirmDialog = useStore((s) => s.setConfirmDialog)

  const importInputRef = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState<AppSettings>(() => normalizeSettingsDraft(settings))
  const [timeoutInput, setTimeoutInput] = useState(String(settings.timeout))
  const [showApiKey, setShowApiKey] = useState(false)
  const [providerNameInput, setProviderNameInput] = useState('')

  const proxyConfig = readClientDevProxyConfig()
  const activeProvider = providers.find((provider) => provider.id === activeProviderId) ?? null

  useEffect(() => {
    if (!showSettings) return
    setDraft(normalizeSettingsDraft(settings))
    setTimeoutInput(String(settings.timeout))
    setProviderNameInput(activeProvider?.name ?? '')
  }, [activeProvider, settings, showSettings])

  const commitSettings = useCallback(
    (nextDraft: AppSettings) => {
      const normalizedDraft = {
        ...nextDraft,
        baseUrl: normalizeBaseUrl(nextDraft.baseUrl.trim() || DEFAULT_SETTINGS.baseUrl),
        apiKey: nextDraft.apiKey,
        model: nextDraft.model.trim() || DEFAULT_SETTINGS.model,
        responsesImageModel:
          nextDraft.responsesImageModel.trim() || DEFAULT_SETTINGS.responsesImageModel,
        responsesTransport: nextDraft.responsesTransport || DEFAULT_SETTINGS.responsesTransport,
        responsesImageInputMode:
          nextDraft.responsesImageInputMode || DEFAULT_SETTINGS.responsesImageInputMode,
        responsesPromptRevisionMode:
          nextDraft.responsesPromptRevisionMode || DEFAULT_SETTINGS.responsesPromptRevisionMode,
        timeout: Number(nextDraft.timeout) || DEFAULT_SETTINGS.timeout,
        apiProtocol: nextDraft.apiProtocol || DEFAULT_SETTINGS.apiProtocol,
        requestMode: normalizeRuntimeRequestMode(nextDraft.requestMode || DEFAULT_SETTINGS.requestMode),
      }
      setDraft(normalizedDraft)
      setSettings(normalizedDraft)
    },
    [setSettings],
  )

  const handleClose = useCallback(() => {
    const nextTimeout = Number(timeoutInput)
    commitSettings({
      ...draft,
      timeout:
        timeoutInput.trim() === '' || Number.isNaN(nextTimeout)
          ? DEFAULT_SETTINGS.timeout
          : nextTimeout,
    })
    setShowSettings(false)
  }, [commitSettings, draft, setShowSettings, timeoutInput])

  const commitTimeout = useCallback(() => {
    const nextTimeout = Number(timeoutInput)
    const normalizedTimeout =
      timeoutInput.trim() === '' ? DEFAULT_SETTINGS.timeout : Number.isNaN(nextTimeout) ? draft.timeout : nextTimeout
    setTimeoutInput(String(normalizedTimeout))
    commitSettings({ ...draft, timeout: normalizedTimeout })
  }, [commitSettings, draft, timeoutInput])

  const commitProviderName = useCallback(() => {
    if (!activeProvider) return
    const nextName = providerNameInput.trim() || activeProvider.name
    setProviderNameInput(nextName)
    updateProviderName(activeProvider.id, nextName)
  }, [activeProvider, providerNameInput, updateProviderName])

  const flushDraft = useCallback(() => {
    const nextTimeout = Number(timeoutInput)
    const normalizedTimeout =
      timeoutInput.trim() === '' || Number.isNaN(nextTimeout) ? draft.timeout : nextTimeout
    commitSettings({ ...draft, timeout: normalizedTimeout })
    if (activeProvider) {
      const nextName = providerNameInput.trim() || activeProvider.name
      setProviderNameInput(nextName)
      updateProviderName(activeProvider.id, nextName)
    }
  }, [activeProvider, commitSettings, draft, providerNameInput, timeoutInput, updateProviderName])

  useCloseOnEscape(showSettings, handleClose)

  if (!showSettings) return null

  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) importData(file)
    event.target.value = ''
  }

  return (
    <div className="fixed inset-0 z-[70] flex justify-end">
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm transition-opacity duration-300"
        onClick={handleClose}
      />
      <div className="relative z-10 flex h-full w-full max-w-md flex-col overflow-hidden border-l border-white/50 bg-white/95 shadow-2xl ring-1 ring-black/5 animate-slide-in-right dark:border-white/[0.08] dark:bg-gray-900/95 dark:ring-white/10">
        <div className="sticky top-0 z-10 border-b border-gray-100/80 bg-white/95 px-5 py-5 backdrop-blur-sm dark:border-white/[0.08] dark:bg-gray-900/95">
          <div className="flex items-center justify-between gap-4">
            <h3 className="flex items-center gap-2 text-base font-semibold text-gray-800 dark:text-gray-100">
              <svg className="h-5 w-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              设置
            </h3>
            <div className="flex items-center gap-3">
              <span className="select-none font-mono text-xs text-gray-400 dark:text-gray-500">v{__APP_VERSION__}</span>
              <button
                onClick={handleClose}
                className="rounded-full p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-white/[0.06] dark:hover:text-gray-200"
                aria-label="关闭"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)] pt-5 custom-scrollbar">
          <div className="space-y-6">
            <ApiSettingsSection
              draft={draft}
              setDraft={setDraft}
              timeoutInput={timeoutInput}
              setTimeoutInput={setTimeoutInput}
              showApiKey={showApiKey}
              setShowApiKey={setShowApiKey}
              providerNameInput={providerNameInput}
              setProviderNameInput={setProviderNameInput}
              providers={providers}
              activeProviderId={activeProviderId}
              proxyConfig={proxyConfig}
              commitSettings={commitSettings}
              commitProviderName={commitProviderName}
              commitTimeout={commitTimeout}
              flushDraft={flushDraft}
              onActiveProviderChange={setActiveProvider}
              onCreateProvider={createProvider}
              onRequestRemoveProvider={() => {
                if (!activeProvider) return
                setConfirmDialog({
                  title: '删除供应商',
                  message: `确定删除供应商“${activeProvider.name}”吗？`,
                  action: () => removeProvider(activeProvider.id),
                })
              }}
            />

            <DataManagementSection
              importInputRef={importInputRef}
              onImportChange={handleImport}
              onExport={() => exportData()}
              onOpenImport={() => importInputRef.current?.click()}
              onClearAll={() =>
                setConfirmDialog({
                  title: '清空所有数据',
                  message: '确定要清空所有任务记录和图片数据吗？此操作不可恢复。',
                  action: () => clearAllData(),
                })
              }
            />
          </div>
        </div>
      </div>
    </div>
  )
}
