import type {
  AppSettings,
  ResponsesImageInputMode,
  ResponsesPromptRevisionMode,
  ResponsesTransportMode,
} from '../../../../types'
import Select from '../../../../shared/components/Select'
import {
  RESPONSES_IMAGE_INPUT_MODE_OPTIONS,
  RESPONSES_PROMPT_REVISION_MODE_OPTIONS,
  RESPONSES_TRANSPORT_OPTIONS,
} from './options'
import { fieldClassName } from './apiSettingsShared'

interface ApiResponsesSettingsProps {
  draft: AppSettings
  commitSettings: (nextDraft: AppSettings) => void
}

export default function ApiResponsesSettings({
  draft,
  commitSettings,
}: ApiResponsesSettingsProps) {
  return (
    <>
      <label className="block">
        <span className="mb-1 block text-xs text-gray-500 dark:text-gray-400">传输方式</span>
        <Select
          value={draft.responsesTransport}
          onChange={(value) =>
            commitSettings({ ...draft, responsesTransport: value as ResponsesTransportMode })
          }
          options={RESPONSES_TRANSPORT_OPTIONS}
          className={fieldClassName}
        />
        <div className="mt-1 text-[10px] text-gray-400 dark:text-gray-500">
          <div>同时影响 Images API 和 Responses API。</div>
          <div>自动：先尝试流式；中转不兼容时再回退普通 JSON。</div>
          <div>
            优先流式：Images API 会带 <code className="rounded bg-gray-100 px-1 py-0.5 dark:bg-white/[0.06]">stream: true</code> 与 <code className="rounded bg-gray-100 px-1 py-0.5 dark:bg-white/[0.06]">partial_images: 1</code>，Responses API 会走 SSE。
          </div>
        </div>
      </label>

      <label className="block">
        <span className="mb-1 block text-xs text-gray-500 dark:text-gray-400">Responses 参考图输入</span>
        <Select
          value={draft.responsesImageInputMode}
          onChange={(value) =>
            commitSettings({
              ...draft,
              responsesImageInputMode: value as ResponsesImageInputMode,
            })
          }
          options={RESPONSES_IMAGE_INPUT_MODE_OPTIONS}
          className={fieldClassName}
        />
        <div className="mt-1 text-[10px] text-gray-400 dark:text-gray-500">
          <div>自动：公网图继续传 URL，本地图以内联 data URL 发送，兼容性最好。</div>
          <div>
            <code className="rounded bg-gray-100 px-1 py-0.5 dark:bg-white/[0.06]">file_id</code>
            ：会先请求 <code className="rounded bg-gray-100 px-1 py-0.5 dark:bg-white/[0.06]">/v1/files</code>，只有中转站明确支持文件上传时再用。
          </div>
        </div>
      </label>

      <label className="block">
        <span className="mb-1 block text-xs text-gray-500 dark:text-gray-400">Responses 提示词修订模式</span>
        <Select
          value={draft.responsesPromptRevisionMode}
          onChange={(value) =>
            commitSettings({
              ...draft,
              responsesPromptRevisionMode: value as ResponsesPromptRevisionMode,
            })
          }
          options={RESPONSES_PROMPT_REVISION_MODE_OPTIONS}
          className={fieldClassName}
        />
        <div className="mt-1 text-[10px] text-gray-400 dark:text-gray-500">
          <div>仅 Responses API 生效。</div>
          <div>允许：正常发送提示词，接受模型修订。</div>
          <div>禁止（软禁止）：自动在原提示词前加入“不要改写原提示词”的前置约束，再发送给 Responses。</div>
        </div>
      </label>
    </>
  )
}
