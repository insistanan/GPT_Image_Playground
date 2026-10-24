import type { Dispatch, SetStateAction } from 'react'
import type {
  AppSettings,
  ProviderConfig,
} from '../../../../types'
import type { DevProxyConfig } from '../../../../lib/devProxy'
import ApiModelSettings from './ApiModelSettings'
import ApiProviderFields from './ApiProviderFields'
import ApiRequestSettings from './ApiRequestSettings'
import ApiResponsesSettings from './ApiResponsesSettings'
import { fieldClassName } from './apiSettingsShared'

interface ApiSettingsSectionProps {
  draft: AppSettings
  setDraft: Dispatch<SetStateAction<AppSettings>>
  timeoutInput: string
  setTimeoutInput: Dispatch<SetStateAction<string>>
  showApiKey: boolean
  setShowApiKey: Dispatch<SetStateAction<boolean>>
  providerNameInput: string
  setProviderNameInput: Dispatch<SetStateAction<string>>
  providers: ProviderConfig[]
  activeProviderId: string
  proxyConfig: DevProxyConfig | null
  commitSettings: (nextDraft: AppSettings) => void
  commitProviderName: () => void
  commitTimeout: () => void
  flushDraft: () => void
  onActiveProviderChange: (providerId: string) => void
  onCreateProvider: () => void
  onRequestRemoveProvider: () => void
}

export default function ApiSettingsSection({
  draft,
  setDraft,
  timeoutInput,
  setTimeoutInput,
  showApiKey,
  setShowApiKey,
  providerNameInput,
  setProviderNameInput,
  providers,
  activeProviderId,
  proxyConfig,
  commitSettings,
  commitProviderName,
  commitTimeout,
  flushDraft,
  onActiveProviderChange,
  onCreateProvider,
  onRequestRemoveProvider,
}: ApiSettingsSectionProps) {
  return (
    <section>
      <h4 className="mb-4 flex items-center gap-1.5 text-sm font-medium text-gray-800 dark:text-gray-200">
        <svg className="h-4 w-4 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
        </svg>
        API 配置
      </h4>

      <div className="space-y-4">
        <ApiProviderFields
          providerNameInput={providerNameInput}
          setProviderNameInput={setProviderNameInput}
          providers={providers}
          activeProviderId={activeProviderId}
          flushDraft={flushDraft}
          onActiveProviderChange={onActiveProviderChange}
          onCreateProvider={onCreateProvider}
          onRequestRemoveProvider={onRequestRemoveProvider}
          commitProviderName={commitProviderName}
        />

        <label className="block">
          <span className="mb-1 block text-xs text-gray-500 dark:text-gray-400">API URL</span>
          <input
            value={draft.baseUrl}
            onChange={(event) => setDraft((prev) => ({ ...prev, baseUrl: event.target.value }))}
            onBlur={(event) => commitSettings({ ...draft, baseUrl: event.target.value })}
            type="text"
            placeholder="https://api.openai.com/v1"
            className={fieldClassName}
          />
        </label>

        <div className="block">
          <span className="mb-1 block text-xs text-gray-500 dark:text-gray-400">API Key</span>
          <div className="relative">
            <input
              value={draft.apiKey}
              onChange={(event) => setDraft((prev) => ({ ...prev, apiKey: event.target.value }))}
              onBlur={(event) => commitSettings({ ...draft, apiKey: event.target.value })}
              type={showApiKey ? 'text' : 'password'}
              placeholder="sk-..."
              className={`${fieldClassName} pr-10`}
            />
            <button
              type="button"
              onClick={() => setShowApiKey((value) => !value)}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 transition-colors hover:text-gray-600"
              tabIndex={-1}
            >
              {showApiKey ? (
                <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} viewBox="0 0 24 24">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              ) : (
                <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} viewBox="0 0 24 24">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                  <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                  <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
              )}
            </button>
          </div>
        </div>

        <ApiRequestSettings
          draft={draft}
          proxyConfig={proxyConfig}
          commitSettings={commitSettings}
        />

        <ApiModelSettings
          draft={draft}
          setDraft={setDraft}
          commitSettings={commitSettings}
        />

        <ApiResponsesSettings
          draft={draft}
          commitSettings={commitSettings}
        />

        <label className="block">
          <span className="mb-1 block text-xs text-gray-500 dark:text-gray-400">请求超时 (秒)</span>
          <input
            value={timeoutInput}
            onChange={(event) => setTimeoutInput(event.target.value)}
            onBlur={commitTimeout}
            type="number"
            min={10}
            max={900}
            className={fieldClassName}
          />
        </label>
      </div>
    </section>
  )
}
