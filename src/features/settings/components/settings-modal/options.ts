import type {
  ApiProtocol,
  RequestMode,
  ResponsesImageInputMode,
  ResponsesPromptRevisionMode,
  ResponsesTransportMode,
} from '@/types'

export const API_PROTOCOL_OPTIONS: Array<{ label: string; value: ApiProtocol }> = [
  { label: 'Images API', value: 'images' },
  { label: 'Responses API', value: 'responses' },
]

export const REQUEST_MODE_OPTIONS: Array<{ label: string; value: RequestMode }> = [
  { label: '直连', value: 'direct' },
  ...(import.meta.env.DEV ? [{ label: '本地代理' as const, value: 'local_proxy' as const }] : []),
]

export const RESPONSES_TRANSPORT_OPTIONS: Array<{
  label: string
  value: ResponsesTransportMode
}> = [
  { label: '自动', value: 'auto' },
  { label: '优先流式', value: 'stream' },
  { label: '仅 JSON', value: 'json' },
]

export const RESPONSES_IMAGE_INPUT_MODE_OPTIONS: Array<{
  label: string
  value: ResponsesImageInputMode
}> = [
  { label: '自动', value: 'auto' },
  { label: '上传 file_id', value: 'file_id' },
]

export const RESPONSES_PROMPT_REVISION_MODE_OPTIONS: Array<{
  label: string
  value: ResponsesPromptRevisionMode
}> = [
  { label: '允许', value: 'allow' },
  { label: '禁止（软禁止）', value: 'compat' },
]
