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
import Header from './components/Header'
import SearchBar from './components/SearchBar'
import TaskGrid from './components/TaskGrid'
import InputBar from './components/InputBar'
import DetailModal from './components/DetailModal'
import ImageEditModal from './components/ImageEditModal'
import Lightbox from './components/Lightbox'
import SettingsModal from './components/SettingsModal'
import ConfirmDialog from './components/ConfirmDialog'
import Toast from './components/Toast'
import ImageContextMenu from './components/ImageContextMenu'

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
    if (requestModeParam !== null && isRequestMode(requestModeParam.trim())) {
      nextSettings.requestMode = requestModeParam.trim()
    }

    const responsesTransportParam = searchParams.get('responsesTransport')
    if (responsesTransportParam !== null && isResponsesTransportMode(responsesTransportParam.trim())) {
      nextSettings.responsesTransport = responsesTransportParam.trim()
    }

    const responsesImageInputModeParam = searchParams.get('responsesImageInputMode')
    if (
      responsesImageInputModeParam !== null &&
      isResponsesImageInputMode(responsesImageInputModeParam.trim())
    ) {
      nextSettings.responsesImageInputMode = responsesImageInputModeParam.trim()
    }

    const responsesPromptRevisionModeParam = searchParams.get('responsesPromptRevisionMode')
    if (
      responsesPromptRevisionModeParam !== null &&
      isResponsesPromptRevisionMode(responsesPromptRevisionModeParam.trim())
    ) {
      nextSettings.responsesPromptRevisionMode = responsesPromptRevisionModeParam.trim()
    } else if (responsesPromptRevisionModeParam?.trim() === 'forbid') {
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
    <>
      <Header />
      <main className="max-w-7xl mx-auto px-4 pb-48">
        <SearchBar />
        <TaskGrid />
      </main>
      <InputBar />
      <ImageEditModal />
      <DetailModal />
      <Lightbox />
      <SettingsModal />
      <ConfirmDialog />
      <Toast />
      <ImageContextMenu />
    </>
  )
}
