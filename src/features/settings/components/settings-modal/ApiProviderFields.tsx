import type { Dispatch, SetStateAction } from 'react'
import type { ProviderConfig } from '@/types'
import Select from '@/shared/components/Select'
import { fieldClassName } from './apiSettingsShared'

interface ApiProviderFieldsProps {
  providerNameInput: string
  setProviderNameInput: Dispatch<SetStateAction<string>>
  providers: ProviderConfig[]
  activeProviderId: string
  flushDraft: () => void
  onActiveProviderChange: (providerId: string) => void
  onCreateProvider: () => void
  onRequestRemoveProvider: () => void
  commitProviderName: () => void
}

export default function ApiProviderFields({
  providerNameInput,
  setProviderNameInput,
  providers,
  activeProviderId,
  flushDraft,
  onActiveProviderChange,
  onCreateProvider,
  onRequestRemoveProvider,
  commitProviderName,
}: ApiProviderFieldsProps) {
  return (
    <>
      <div className="grid grid-cols-[1fr_auto_auto] gap-2">
        <label className="block">
          <span className="mb-1 block text-xs text-gray-500 dark:text-gray-400">供应商</span>
          <Select
            value={activeProviderId}
            onChange={(value) => {
              flushDraft()
              onActiveProviderChange(String(value))
            }}
            options={providers.map((provider) => ({
              label: provider.name,
              value: provider.id,
            }))}
            className={fieldClassName}
          />
        </label>
        <div className="flex flex-col justify-end">
          <button
            type="button"
            onClick={() => {
              flushDraft()
              onCreateProvider()
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
            onClick={onRequestRemoveProvider}
            className="rounded-xl border border-red-200/80 bg-red-50/50 px-3 py-2 text-sm text-red-500 transition hover:bg-red-100/80 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/20"
          >
            删除
          </button>
        </div>
      </div>

      <label className="block">
        <span className="mb-1 block text-xs text-gray-500 dark:text-gray-400">供应商名称</span>
        <input
          value={providerNameInput}
          onChange={(event) => setProviderNameInput(event.target.value)}
          onBlur={commitProviderName}
          type="text"
          placeholder="供应商名称"
          className={fieldClassName}
        />
        <div className="mt-1 text-[10px] text-gray-400 dark:text-gray-500">
          不同供应商会分别保存 API URL、API Key、协议、模型和超时配置。
        </div>
      </label>
    </>
  )
}
