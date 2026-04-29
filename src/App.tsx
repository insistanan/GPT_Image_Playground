import { useEffect } from 'react'
import { initStore, startRecycleBinJanitor } from './store'
import { useStore } from './store'
import { normalizeBaseUrl } from './lib/api'
import type {
  ApiProtocol,
  RequestMode,
  ResponsesImageInputMode,
  ResponsesPromptRevisionMode,
  ResponsesTransportMode,
} from './types'
import { Header } from './app/components'
import { ImageContextMenu, TaskGrid } from './features/gallery'
import { InputBar, PromptLibraryDrawer, SearchBar } from './features/input'
import { SettingsModal } from './features/settings'
import { DetailModal, ImageEditModal, Lightbox } from './features/viewer'
import { ConfirmDialog, Toast } from './shared/components'

export default function App() {
  const setSettings = useStore((s) => s.setSettings)

  useEffect(() => {
    const isApiProtocol = (value: string): value is ApiProtocol =>
      value === 'images' || value === 'responses'
    const normalizeApiProtocolQueryValue = (value: string): ApiProtocol | null => {
      const normalized = value.trim()
      if (normalized === 'auto') return 'images'
      return isApiProtocol(normalized) ? normalized : null
    }
    const isRequestMode = (value: string): value is RequestMode =>
      value === 'direct' || value === 'local_proxy'
    const isResponsesTransportMode = (value: string): value is ResponsesTransportMode =>
      value === 'auto' || value === 'stream' || value === 'json'
    const isResponsesImageInputMode = (value: string): value is ResponsesImageInputMode =>
      value === 'auto' || value === 'file_id'
    const isResponsesPromptRevisionMode = (value: string): value is ResponsesPromptRevisionMode =>
      value === 'allow' || value === 'compat'
    const parseBooleanQueryValue = (value: string): boolean | null => {
      const normalized = value.trim().toLowerCase()
      if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
      if (['0', 'false', 'no', 'off'].includes(normalized)) return false
      return null
    }

    const searchParams = new URLSearchParams(window.location.search)
    const nextSettings: {
      baseUrl?: string
      apiKey?: string
      apiProtocol?: ApiProtocol
      requestMode?: RequestMode
      responsesTransport?: ResponsesTransportMode
      responsesImageInputMode?: ResponsesImageInputMode
      responsesPromptRevisionMode?: ResponsesPromptRevisionMode
    } = {}

    const apiUrlParam = searchParams.get('apiUrl')
    if (apiUrlParam !== null) {
      nextSettings.baseUrl = normalizeBaseUrl(apiUrlParam.trim())
    }

    const apiKeyParam = searchParams.get('apiKey')
    if (apiKeyParam !== null) {
      nextSettings.apiKey = apiKeyParam.trim()
    }

    const apiProtocolParam = searchParams.get('apiProtocol')
    if (apiProtocolParam !== null) {
      const normalizedApiProtocol = normalizeApiProtocolQueryValue(apiProtocolParam)
      if (normalizedApiProtocol) {
        nextSettings.apiProtocol = normalizedApiProtocol
      }
    }

    const requestModeParam = searchParams.get('requestMode')
    const normalizedRequestMode = requestModeParam?.trim()
    if (normalizedRequestMode && isRequestMode(normalizedRequestMode)) {
      nextSettings.requestMode = normalizedRequestMode
    }

    const responsesTransportParam = searchParams.get('responsesTransport')
    const normalizedResponsesTransport = responsesTransportParam?.trim()
    if (
      normalizedResponsesTransport &&
      isResponsesTransportMode(normalizedResponsesTransport)
    ) {
      nextSettings.responsesTransport = normalizedResponsesTransport
    }

    const responsesImageInputModeParam = searchParams.get('responsesImageInputMode')
    const normalizedResponsesImageInputMode = responsesImageInputModeParam?.trim()
    if (
      normalizedResponsesImageInputMode &&
      isResponsesImageInputMode(normalizedResponsesImageInputMode)
    ) {
      nextSettings.responsesImageInputMode = normalizedResponsesImageInputMode
    }

    const responsesPromptRevisionModeParam = searchParams.get('responsesPromptRevisionMode')
    const normalizedResponsesPromptRevisionMode = responsesPromptRevisionModeParam?.trim()
    if (
      normalizedResponsesPromptRevisionMode &&
      isResponsesPromptRevisionMode(normalizedResponsesPromptRevisionMode)
    ) {
      nextSettings.responsesPromptRevisionMode = normalizedResponsesPromptRevisionMode
    } else if (normalizedResponsesPromptRevisionMode === 'forbid') {
      nextSettings.responsesPromptRevisionMode = 'compat'
    }

    const allowResponsesPromptRevisionParam = searchParams.get('allowResponsesPromptRevision')
    if (allowResponsesPromptRevisionParam !== null && nextSettings.responsesPromptRevisionMode == null) {
      const parsed = parseBooleanQueryValue(allowResponsesPromptRevisionParam)
      if (parsed != null) {
        nextSettings.responsesPromptRevisionMode = parsed ? 'allow' : 'compat'
      }
    }

    if (Object.keys(nextSettings).length > 0) {
      setSettings(nextSettings)

      searchParams.delete('apiUrl')
      searchParams.delete('apiKey')
      searchParams.delete('apiProtocol')
      searchParams.delete('requestMode')
      searchParams.delete('responsesTransport')
      searchParams.delete('responsesImageInputMode')
      searchParams.delete('responsesPromptRevisionMode')
      searchParams.delete('allowResponsesPromptRevision')

      const nextSearch = searchParams.toString()
      const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash}`
      window.history.replaceState(null, '', nextUrl)
    }

    initStore()
    const stopRecycleBinJanitor = startRecycleBinJanitor()

    return () => {
      stopRecycleBinJanitor()
    }
  }, [setSettings])

  return (
    <div className="flex h-screen w-full overflow-hidden bg-gray-50 dark:bg-gray-950">
      <InputBar />

      {/* 中间：画廊区 */}
      <main className="relative flex min-w-0 flex-1 flex-col overflow-y-auto pb-28 md:pb-0">
        <Header />
        <div className="max-w-7xl mx-auto w-full px-4 pb-12">
          <SearchBar />
          <TaskGrid />
        </div>
      </main>

      {/* 右侧：预留面板/抽屉（暂时隐藏，因为设置已经改为抽屉） */}
      {/* <aside className="w-0 md:w-16 lg:w-64 flex-shrink-0 border-l border-gray-200 bg-white dark:border-white/[0.08] dark:bg-gray-900 transition-all duration-300 hidden md:flex flex-col z-20">
        <div className="p-4 text-center text-gray-400 text-sm mt-10">
          <span className="hidden lg:inline">工具面板 (预留)</span>
          <span className="lg:hidden">...</span>
        </div>
      </aside> */}

      <ImageEditModal />
      <DetailModal />
      <Lightbox />
      <PromptLibraryDrawer />
      <SettingsModal />
      <ConfirmDialog />
      <Toast />
      <ImageContextMenu />
    </div>
  )
}
