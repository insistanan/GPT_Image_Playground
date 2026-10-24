import type { Dispatch, SetStateAction } from 'react'
import type { AppSettings } from '../../../../types'
import ModelCombobox, { type ModelOption } from '../../../../shared/components/ModelCombobox'
import { fieldClassName } from './apiSettingsShared'
import {
  CHAT_MODEL_OPTIONS,
  IMAGE_MODEL_OPTIONS,
  type CatalogModelOption,
} from '../../../../lib/capabilities'

interface ApiModelSettingsProps {
  draft: AppSettings
  setDraft: Dispatch<SetStateAction<AppSettings>>
  commitSettings: (nextDraft: AppSettings) => void
}

function toModelOptions(catalog: CatalogModelOption[]): ModelOption[] {
  return catalog.map((item) => ({
    value: item.value,
    label: item.label,
    hint: item.hint,
    deprecated: item.deprecated,
  }))
}

export default function ApiModelSettings({
  draft,
  setDraft,
  commitSettings,
}: ApiModelSettingsProps) {
  const isResponses = draft.apiProtocol === 'responses'
  const modelOptions = isResponses ? toModelOptions(CHAT_MODEL_OPTIONS) : toModelOptions(IMAGE_MODEL_OPTIONS)
  const modelLabel = isResponses ? 'Responses 主模型（对话）' : '图像模型'
  const modelPlaceholder = isResponses ? 'gpt-6.1-sol' : 'gpt-image-2.5-sunburst'

  return (
    <>
      <label className="block">
        <span className="mb-1 block text-xs text-gray-500 dark:text-gray-400">{modelLabel}</span>
        <ModelCombobox
          value={draft.model}
          onChange={(value) => setDraft((prev) => ({ ...prev, model: value }))}
          onCommit={(value) => commitSettings({ ...draft, model: value })}
          options={modelOptions}
          placeholder={modelPlaceholder}
          className={fieldClassName}
        />
        <div className="mt-1 text-[10px] text-gray-400 dark:text-gray-500">
          {isResponses ? (
            <>
              Responses API 顶层主模型，应填可用的文本/对话模型，例如{' '}
              <code className="rounded bg-gray-100 px-1 py-0.5 dark:bg-white/[0.06]">gpt-6.1-sol</code>
              ，不要填 <code className="rounded bg-gray-100 px-1 py-0.5 dark:bg-white/[0.06]">gpt-image-*</code>
              。切换到 Images 协议时会自动改为生图模型。
            </>
          ) : (
            <>
              Images API 直接调用的图片模型，例如{' '}
              <code className="rounded bg-gray-100 px-1 py-0.5 dark:bg-white/[0.06]">gpt-image-2.5-sunburst</code>
              。切换到 Responses 协议时会自动改为对话模型，并把当前生图模型回填到下方「Responses 图像模型」。
            </>
          )}
        </div>
      </label>

      {isResponses ? (
        <label className="block">
          <span className="mb-1 block text-xs text-gray-500 dark:text-gray-400">Responses 图像模型</span>
          <ModelCombobox
            value={draft.responsesImageModel}
            onChange={(value) => setDraft((prev) => ({ ...prev, responsesImageModel: value }))}
            onCommit={(value) => commitSettings({ ...draft, responsesImageModel: value })}
            options={toModelOptions(IMAGE_MODEL_OPTIONS)}
            placeholder="gpt-image-2.5-sunburst"
            className={fieldClassName}
          />
          <div className="mt-1 text-[10px] text-gray-400 dark:text-gray-500">
            仅 Responses API 生效，作为{' '}
            <code className="rounded bg-gray-100 px-1 py-0.5 dark:bg-white/[0.06]">tools[].model</code>{' '}
            传入，例如 <code className="rounded bg-gray-100 px-1 py-0.5 dark:bg-white/[0.06]">gpt-image-2.5-sunburst</code>
            。
          </div>
        </label>
      ) : null}
    </>
  )
}
