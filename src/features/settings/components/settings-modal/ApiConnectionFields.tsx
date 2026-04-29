import type { Dispatch, SetStateAction } from 'react'
import type { AppSettings } from '../../../../types'
import { fieldClassName } from './apiSettingsShared'

interface ApiConnectionFieldsProps {
  draft: AppSettings
  setDraft: Dispatch<SetStateAction<AppSettings>>
  showApiKey: boolean
  setShowApiKey: Dispatch<SetStateAction<boolean>>
  commitSettings: (nextDraft: AppSettings) => void
}

export default function ApiConnectionFields({
  draft,
  setDraft,
  showApiKey,
  setShowApiKey,
  commitSettings,
}: ApiConnectionFieldsProps) {
  return (
    <>
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
    </>
  )
}
