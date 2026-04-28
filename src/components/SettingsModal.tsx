import { useEffect, useRef, useState, useCallback } from 'react'
import { normalizeBaseUrl } from '../lib/api'
import { readClientDevProxyConfig } from '../lib/devProxy'
import { useStore, exportData, importData, clearAllData } from '../store'
import {
  DEFAULT_SETTINGS,
  type AppSettings,
  type ApiProtocol,
  type RequestMode,
  type ResponsesImageInputMode,
  type ResponsesPromptRevisionMode,
  type ResponsesTransportMode,
} from '../types'
import { useCloseOnEscape } from '../hooks/useCloseOnEscape'
import Select from './Select'

const API_PROTOCOL_OPTIONS: Array<{ label: string; value: ApiProtocol }> = [
  { label: 'Images API', value: 'images' },
  { label: 'Responses API', value: 'responses' },
]

const REQUEST_MODE_OPTIONS: Array<{ label: string; value: RequestMode }> = [
  { label: '本地代理', value: 'local_proxy' },
  { label: '直连', value: 'direct' },
]

const RESPONSES_TRANSPORT_OPTIONS: Array<{ label: string; value: ResponsesTransportMode }> = [
  { label: '自动', value: 'auto' },
  { label: '优先流式', value: 'stream' },
  { label: '仅 JSON', value: 'json' },
]

const RESPONSES_IMAGE_INPUT_MODE_OPTIONS: Array<{ label: string; value: ResponsesImageInputMode }> = [
  { label: '自动', value: 'auto' },
  { label: '上传 file_id', value: 'file_id' },
]

const RESPONSES_PROMPT_REVISION_MODE_OPTIONS: Array<{ label: string; value: ResponsesPromptRevisionMode }> = [
  { label: '允许', value: 'allow' },
  { label: '禁止（软禁止）', value: 'compat' },
]

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
  const [draft, setDraft] = useState<AppSettings>(settings)
  const [timeoutInput, setTimeoutInput] = useState(String(settings.timeout))
  const [showApiKey, setShowApiKey] = useState(false)
  const [providerNameInput, setProviderNameInput] = useState('')
  const proxyConfig = readClientDevProxyConfig()
  const activeProvider = providers.find((provider) => provider.id === activeProviderId) ?? providers[0]

  useEffect(() => {
    if (showSettings) {
      setDraft(settings)
      setTimeoutInput(String(settings.timeout))
      setProviderNameInput(activeProvider?.name ?? '')
    }
  }, [showSettings, settings, activeProvider])

  const commitSettings = (nextDraft: AppSettings) => {
    const normalizedDraft = {
      ...nextDraft,
      baseUrl: normalizeBaseUrl(nextDraft.baseUrl.trim() || DEFAULT_SETTINGS.baseUrl),
      apiKey: nextDraft.apiKey,
      model: nextDraft.model.trim() || DEFAULT_SETTINGS.model,
      responsesImageModel: nextDraft.responsesImageModel.trim() || DEFAULT_SETTINGS.responsesImageModel,
      responsesTransport: nextDraft.responsesTransport || DEFAULT_SETTINGS.responsesTransport,
      responsesImageInputMode:
        nextDraft.responsesImageInputMode || DEFAULT_SETTINGS.responsesImageInputMode,
      responsesPromptRevisionMode:
        nextDraft.responsesPromptRevisionMode || DEFAULT_SETTINGS.responsesPromptRevisionMode,
      timeout: Number(nextDraft.timeout) || DEFAULT_SETTINGS.timeout,
      apiProtocol: nextDraft.apiProtocol || DEFAULT_SETTINGS.apiProtocol,
      requestMode: nextDraft.requestMode || DEFAULT_SETTINGS.requestMode,
    }
    setDraft(normalizedDraft)
    setSettings(normalizedDraft)
  }

  const handleClose = () => {
    const nextTimeout = Number(timeoutInput)
    commitSettings({
      ...draft,
      timeout:
        timeoutInput.trim() === '' || Number.isNaN(nextTimeout)
          ? DEFAULT_SETTINGS.timeout
          : nextTimeout,
    })
    setShowSettings(false)
  }

  const commitTimeout = useCallback(() => {
    const nextTimeout = Number(timeoutInput)
    const normalizedTimeout =
      timeoutInput.trim() === '' ? DEFAULT_SETTINGS.timeout : Number.isNaN(nextTimeout) ? draft.timeout : nextTimeout
    setTimeoutInput(String(normalizedTimeout))
    commitSettings({ ...draft, timeout: normalizedTimeout })
  }, [draft, timeoutInput])

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
  }, [activeProvider, draft, providerNameInput, timeoutInput, updateProviderName])

  useCloseOnEscape(showSettings, handleClose)

  if (!showSettings) return null

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) importData(file)
    e.target.value = ''
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm animate-overlay-in"
        onClick={handleClose}
      />
      <div
        className="relative z-10 w-full max-w-md rounded-3xl border border-white/50 bg-white/95 p-5 shadow-2xl ring-1 ring-black/5 animate-modal-in dark:border-white/[0.08] dark:bg-gray-900/95 dark:ring-white/10 overflow-y-auto max-h-[85vh] custom-scrollbar"
      >
        <div className="mb-5 flex items-center justify-between gap-4">
          <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100 flex items-center gap-2">
            <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            设置
          </h3>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400 dark:text-gray-500 font-mono select-none">v{__APP_VERSION__}</span>
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

        <div className="space-y-6">
          <section>
            <h4 className="mb-4 text-sm font-medium text-gray-800 dark:text-gray-200 flex items-center gap-1.5">
              <svg className="w-4 h-4 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
              API 配置
            </h4>
            <div className="space-y-4">
              <div className="grid grid-cols-[1fr_auto_auto] gap-2">
                <label className="block">
                  <span className="block text-xs text-gray-500 dark:text-gray-400 mb-1">供应商</span>
                  <Select
                    value={activeProviderId}
                    onChange={(value) => {
                      flushDraft()
                      setActiveProvider(String(value))
                    }}
                    options={providers.map((provider) => ({
                      label: provider.name,
                      value: provider.id,
                    }))}
                    className="w-full rounded-xl border border-gray-200/70 bg-white/60 px-3 py-2 text-sm text-gray-700 outline-none transition focus:border-blue-300 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-200 dark:focus:border-blue-500/50"
                  />
                </label>
                <div className="flex flex-col justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      flushDraft()
                      createProvider()
                    }}
                    className="rounded-xl bg-gray-100/80 px-3 py-2 text-sm text-gray-600 transition hover:bg-gray-200 dark:bg-white/[0.06] dark:text-gray-300 dark:hover:bg-white/[0.1]"
                  >
                    新建
                  </button>
                </div>
                <div className="flex flex-col justify-end">
                  <button
                    type="button"
                    disabled={providers.length <= 1}
                    onClick={() =>
                      activeProvider &&
                      setConfirmDialog({
                        title: '删除供应商',
                        message: `确定删除供应商“${activeProvider.name}”吗？`,
                        action: () => removeProvider(activeProvider.id),
                      })
                    }
                    className="rounded-xl border border-red-200/80 bg-red-50/50 px-3 py-2 text-sm text-red-500 transition hover:bg-red-100/80 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/20"
                  >
                    删除
                  </button>
                </div>
              </div>

              <label className="block">
                <span className="block text-xs text-gray-500 dark:text-gray-400 mb-1">供应商名称</span>
                <input
                  value={providerNameInput}
                  onChange={(e) => setProviderNameInput(e.target.value)}
                  onBlur={commitProviderName}
                  type="text"
                  placeholder="供应商名称"
                  className="w-full rounded-xl border border-gray-200/70 bg-white/60 px-3 py-2 text-sm text-gray-700 outline-none transition focus:border-blue-300 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-200 dark:focus:border-blue-500/50"
                />
                <div className="mt-1 text-[10px] text-gray-400 dark:text-gray-500">
                  不同供应商会分别保存 API URL、API Key、协议、模型和超时配置。
                </div>
              </label>

              <label className="block">
                <span className="block text-xs text-gray-500 dark:text-gray-400 mb-1">API URL</span>
                <input
                  value={draft.baseUrl}
                  onChange={(e) => setDraft((prev) => ({ ...prev, baseUrl: e.target.value }))}
                  onBlur={(e) => commitSettings({ ...draft, baseUrl: e.target.value })}
                  type="text"
                  placeholder={DEFAULT_SETTINGS.baseUrl}
                  className="w-full rounded-xl border border-gray-200/70 bg-white/60 px-3 py-2 text-sm text-gray-700 outline-none transition focus:border-blue-300 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-200 dark:focus:border-blue-500/50"
                />
                <div className="mt-1 text-[10px] text-gray-400 dark:text-gray-500">
                  支持通过查询参数覆盖：<code className="bg-gray-100 dark:bg-white/[0.06] px-1 py-0.5 rounded">?apiUrl=</code>
                </div>
              </label>

              <div className="block">
                <span className="block text-xs text-gray-500 dark:text-gray-400 mb-1">API Key</span>
                <div className="relative">
                  <input
                    value={draft.apiKey}
                    onChange={(e) => setDraft((prev) => ({ ...prev, apiKey: e.target.value }))}
                    onBlur={(e) => commitSettings({ ...draft, apiKey: e.target.value })}
                    type={showApiKey ? 'text' : 'password'}
                    placeholder="sk-..."
                    className="w-full rounded-xl border border-gray-200/70 bg-white/60 px-3 py-2 pr-10 text-sm text-gray-700 outline-none transition focus:border-blue-300 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-200 dark:focus:border-blue-500/50"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 transition-colors"
                    tabIndex={-1}
                  >
                    {showApiKey ? (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                        <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                        <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </svg>
                    )}
                  </button>
                </div>
                <div className="mt-1 text-[10px] text-gray-400 dark:text-gray-500">
                  支持通过查询参数覆盖：<code className="bg-gray-100 dark:bg-white/[0.06] px-1 py-0.5 rounded">?apiKey=</code>
                </div>
              </div>

              <label className="block">
                <span className="block text-xs text-gray-500 dark:text-gray-400 mb-1">API 协议</span>
                <Select
                  value={draft.apiProtocol}
                  onChange={(value) => commitSettings({ ...draft, apiProtocol: value as ApiProtocol })}
                  options={API_PROTOCOL_OPTIONS}
                  className="w-full rounded-xl border border-gray-200/70 bg-white/60 px-3 py-2 text-sm text-gray-700 outline-none transition focus:border-blue-300 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-200 dark:focus:border-blue-500/50"
                />
                <div className="mt-1 text-[10px] text-gray-400 dark:text-gray-500">
                  <div>Images API：直接请求 `/v1/images/generations` 或 `/v1/images/edits`。</div>
                  <div>Responses API：直接请求 `/v1/responses`，不再自动回退或切换。</div>
                  <div>
                    支持通过查询参数覆盖：
                    <code className="bg-gray-100 dark:bg-white/[0.06] px-1 py-0.5 rounded ml-1">?apiProtocol=images|responses</code>
                  </div>
                </div>
              </label>

              <label className="block">
                <span className="block text-xs text-gray-500 dark:text-gray-400 mb-1">请求模式</span>
                <Select
                  value={draft.requestMode}
                  onChange={(value) => commitSettings({ ...draft, requestMode: value as RequestMode })}
                  options={REQUEST_MODE_OPTIONS}
                  className="w-full rounded-xl border border-gray-200/70 bg-white/60 px-3 py-2 text-sm text-gray-700 outline-none transition focus:border-blue-300 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-200 dark:focus:border-blue-500/50"
                />
                <div className="mt-1 text-[10px] text-gray-400 dark:text-gray-500">
                  <div>直连：浏览器直接请求 API URL。</div>
                  <div>本地代理：先请求同源代理，再由本地 dev server 转发到 API URL，可绕过浏览器 CORS 预检。</div>
                  <div>
                    支持通过查询参数覆盖：
                    <code className="bg-gray-100 dark:bg-white/[0.06] px-1 py-0.5 rounded ml-1">?requestMode=direct|local_proxy</code>
                  </div>
                  {draft.requestMode === 'local_proxy' ? (
                    proxyConfig?.enabled ? (
                      <div>
                        已检测到本地代理前缀：
                        <code className="bg-gray-100 dark:bg-white/[0.06] px-1 py-0.5 rounded ml-1">{proxyConfig.prefix}</code>
                        ，仅 <code className="bg-gray-100 dark:bg-white/[0.06] px-1 py-0.5 rounded">npm run dev</code> 生效。
                      </div>
                    ) : (
                      <div className="text-amber-500 dark:text-amber-400">
                        未检测到可用代理配置。请确认 <code className="bg-gray-100 dark:bg-white/[0.06] px-1 py-0.5 rounded">dev-proxy.config.json</code> 存在，并重启 dev server。
                      </div>
                    )
                  ) : null}
                </div>
              </label>

              <label className="block">
                <span className="block text-xs text-gray-500 dark:text-gray-400 mb-1">模型 ID</span>
                <input
                  value={draft.model}
                  onChange={(e) => setDraft((prev) => ({ ...prev, model: e.target.value }))}
                  onBlur={(e) => commitSettings({ ...draft, model: e.target.value })}
                  type="text"
                  placeholder="gpt-image-2"
                  className="w-full rounded-xl border border-gray-200/70 bg-white/60 px-3 py-2 text-sm text-gray-700 outline-none transition focus:border-blue-300 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-200 dark:focus:border-blue-500/50"
                />
                <div className="mt-1 text-[10px] text-gray-400 dark:text-gray-500">
                  Images API 下这里是直接调用的图片模型；Responses API 下这里是顶层主模型，应该填可用的文本模型，例如 <code className="bg-gray-100 dark:bg-white/[0.06] px-1 py-0.5 rounded">gpt-5.5</code>，不要填 <code className="bg-gray-100 dark:bg-white/[0.06] px-1 py-0.5 rounded">gpt-image-*</code>。
                </div>
              </label>

              <label className="block">
                <span className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Responses 图像模型</span>
                <input
                  value={draft.responsesImageModel}
                  onChange={(e) => setDraft((prev) => ({ ...prev, responsesImageModel: e.target.value }))}
                  onBlur={(e) => commitSettings({ ...draft, responsesImageModel: e.target.value })}
                  type="text"
                  placeholder="gpt-image-2"
                  className="w-full rounded-xl border border-gray-200/70 bg-white/60 px-3 py-2 text-sm text-gray-700 outline-none transition focus:border-blue-300 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-200 dark:focus:border-blue-500/50"
                />
                <div className="mt-1 text-[10px] text-gray-400 dark:text-gray-500">
                  仅 Responses API 生效，会作为 <code className="bg-gray-100 dark:bg-white/[0.06] px-1 py-0.5 rounded">tools[].model</code> 传入，通常填 <code className="bg-gray-100 dark:bg-white/[0.06] px-1 py-0.5 rounded">gpt-image-2</code>。
                </div>
              </label>

              <label className="block">
                <span className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Responses 传输方式</span>
                <Select
                  value={draft.responsesTransport}
                  onChange={(value) =>
                    commitSettings({ ...draft, responsesTransport: value as ResponsesTransportMode })
                  }
                  options={RESPONSES_TRANSPORT_OPTIONS}
                  className="w-full rounded-xl border border-gray-200/70 bg-white/60 px-3 py-2 text-sm text-gray-700 outline-none transition focus:border-blue-300 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-200 dark:focus:border-blue-500/50"
                />
                <div className="mt-1 text-[10px] text-gray-400 dark:text-gray-500">
                  <div>自动：先尝试 <code className="bg-gray-100 dark:bg-white/[0.06] px-1 py-0.5 rounded">stream: true</code>，中转不兼容时再回退普通 JSON。</div>
                  <div>优先流式：更有机会绕过 Cloudflare 120 秒空闲超时，但前提是整条中转链路支持 SSE 透传。</div>
                </div>
              </label>

              <label className="block">
                <span className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Responses 参考图输入</span>
                <Select
                  value={draft.responsesImageInputMode}
                  onChange={(value) =>
                    commitSettings({
                      ...draft,
                      responsesImageInputMode: value as ResponsesImageInputMode,
                    })
                  }
                  options={RESPONSES_IMAGE_INPUT_MODE_OPTIONS}
                  className="w-full rounded-xl border border-gray-200/70 bg-white/60 px-3 py-2 text-sm text-gray-700 outline-none transition focus:border-blue-300 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-200 dark:focus:border-blue-500/50"
                />
                <div className="mt-1 text-[10px] text-gray-400 dark:text-gray-500">
                  <div>自动：公网图继续传 URL，本地图以内联 data URL 发送，兼容性最好。</div>
                  <div><code className="bg-gray-100 dark:bg-white/[0.06] px-1 py-0.5 rounded">file_id</code>：会先请求 <code className="bg-gray-100 dark:bg-white/[0.06] px-1 py-0.5 rounded">/v1/files</code>，只有中转站明确支持文件上传时再用。</div>
                </div>
              </label>

              <label className="block">
                <span className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Responses 提示词修订模式</span>
                <Select
                  value={draft.responsesPromptRevisionMode}
                  onChange={(value) =>
                    commitSettings({
                      ...draft,
                      responsesPromptRevisionMode: value as ResponsesPromptRevisionMode,
                    })
                  }
                  options={RESPONSES_PROMPT_REVISION_MODE_OPTIONS}
                  className="w-full rounded-xl border border-gray-200/70 bg-white/60 px-3 py-2 text-sm text-gray-700 outline-none transition focus:border-blue-300 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-200 dark:focus:border-blue-500/50"
                />
                <div className="mt-1 text-[10px] text-gray-400 dark:text-gray-500">
                  <div>仅 Responses API 生效。</div>
                  <div>允许：正常发送提示词，接受模型修订。</div>
                  <div>禁止（软禁止）：自动在原提示词前加入“不要改写原提示词”的前置约束，再发送给 Responses。</div>
                  <div>
                    支持通过查询参数覆盖：
                    <code className="bg-gray-100 dark:bg-white/[0.06] px-1 py-0.5 rounded ml-1">?responsesPromptRevisionMode=allow|compat</code>
                  </div>
                </div>
              </label>

              <label className="block">
                <span className="block text-xs text-gray-500 dark:text-gray-400 mb-1">请求超时 (秒)</span>
                <input
                  value={timeoutInput}
                  onChange={(e) => setTimeoutInput(e.target.value)}
                  onBlur={commitTimeout}
                  type="number"
                  min={10}
                  max={600}
                  className="w-full rounded-xl border border-gray-200/70 bg-white/60 px-3 py-2 text-sm text-gray-700 outline-none transition focus:border-blue-300 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-200 dark:focus:border-blue-500/50"
                />
              </label>
            </div>
          </section>

          <section className="pt-6 border-t border-gray-100 dark:border-white/[0.08]">
            <h4 className="mb-4 text-sm font-medium text-gray-800 dark:text-gray-200 flex items-center gap-1.5">
              <svg className="w-4 h-4 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
              </svg>
              数据管理
            </h4>
            <div className="space-y-3">
              <div className="flex gap-2">
                <button
                  onClick={() => exportData()}
                  className="flex-1 rounded-xl bg-gray-100/80 px-4 py-2.5 text-sm text-gray-600 transition hover:bg-gray-200 dark:bg-white/[0.06] dark:text-gray-300 dark:hover:bg-white/[0.1] flex items-center justify-center gap-1.5"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  导出
                </button>
                <button
                  onClick={() => importInputRef.current?.click()}
                  className="flex-1 rounded-xl bg-gray-100/80 px-4 py-2.5 text-sm text-gray-600 transition hover:bg-gray-200 dark:bg-white/[0.06] dark:text-gray-300 dark:hover:bg-white/[0.1] flex items-center justify-center gap-1.5"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  导入
                </button>
                <input
                  ref={importInputRef}
                  type="file"
                  accept=".zip"
                  className="hidden"
                  onChange={handleImport}
                />
              </div>
              <button
                onClick={() =>
                  setConfirmDialog({
                    title: '清空所有数据',
                    message: '确定要清空所有任务记录和图片数据吗？此操作不可恢复。',
                    action: () => clearAllData(),
                  })
                }
                className="w-full rounded-xl border border-red-200/80 bg-red-50/50 px-4 py-2.5 text-sm text-red-500 transition hover:bg-red-100/80 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/20"
              >
                清空所有数据
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
