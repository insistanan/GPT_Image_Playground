import type { ApiProtocol, AppSettings } from '../../types'

export const DEFAULT_IMAGE_MODEL = 'gpt-image-2.5-sunburst'
export const DEFAULT_CHAT_MODEL = 'gpt-6.1-sol'

export interface CatalogModelOption {
  value: string
  label?: string
  hint?: string
  deprecated?: boolean
}

/**
 * 生图模型目录（Images API 的 model 与 Responses image_generation 工具的 model 共用）。
 * 列表仅为常用建议，用户仍可手动输入任意模型 ID。
 */
export const IMAGE_MODEL_OPTIONS: CatalogModelOption[] = [
  { value: 'gpt-image-2.5-sunburst', hint: '最新 · 默认 · 编辑精度' },
  { value: 'gpt-image-2.5-flare', hint: '最新 · 速度优先' },
  { value: 'gpt-image-2', hint: '稳定' },
  { value: 'gpt-image-1.5', hint: '下线 2026-12-01', deprecated: true },
  { value: 'gpt-image-1-mini', hint: '下线 2026-12-01', deprecated: true },
  { value: 'gpt-image-1', hint: '已下线 2026-10-23', deprecated: true },
  { value: 'chatgpt-image-latest', hint: '下线 2026-12-01', deprecated: true },
]

/**
 * 对话模型目录（Responses API 顶层主模型）。仅常用建议，可手动输入任意 ID。
 */
export const CHAT_MODEL_OPTIONS: CatalogModelOption[] = [
  { value: 'gpt-6.1-sol', hint: '旗舰 · 默认' },
]

/** 判断给定 ID 是否为生图模型（gpt-image-* / chatgpt-image-*）。 */
export function isImageModelId(id: string | null | undefined): boolean {
  const value = (id ?? '').trim().toLowerCase()
  if (!value) return false
  return value.startsWith('gpt-image') || value.startsWith('chatgpt-image')
}

export function isGptImage25Model(model: string | null | undefined): boolean {
  return (model ?? '').trim().toLowerCase().includes('gpt-image-2.5')
}

/** 当前协议实际用来生图的模型：Images 用顶层 model，Responses 用 tools[].model。 */
export function getImageGenerationModel(settings: Pick<AppSettings, 'apiProtocol' | 'model' | 'responsesImageModel'>): string {
  if (settings.apiProtocol === 'responses') {
    return settings.responsesImageModel?.trim() || DEFAULT_IMAGE_MODEL
  }
  return settings.model?.trim() || DEFAULT_IMAGE_MODEL
}

/**
 * 在 Images / Responses 协议之间切换时，自动把 model 字段对齐到当前协议所需类型：
 * - 切到 Images：model 必须是生图模型；若当前是对话模型，则取 responsesImageModel 兜底。
 * - 切到 Responses：model 必须是对话模型；若当前是生图模型，则把该生图模型回填到
 *   responsesImageModel，model 改为默认对话模型，避免把 gpt-image-* 误当作顶层主模型。
 */
export function adjustSettingsForProtocolChange(
  draft: AppSettings,
  nextProtocol: ApiProtocol,
): AppSettings {
  if (nextProtocol === draft.apiProtocol) return draft

  if (nextProtocol === 'images') {
    if (isImageModelId(draft.model)) {
      return { ...draft, apiProtocol: nextProtocol }
    }
    const imageModel = draft.responsesImageModel?.trim() || DEFAULT_IMAGE_MODEL
    return { ...draft, apiProtocol: nextProtocol, model: imageModel }
  }

  if (isImageModelId(draft.model)) {
    return {
      ...draft,
      apiProtocol: nextProtocol,
      model: DEFAULT_CHAT_MODEL,
      responsesImageModel: draft.model.trim() || draft.responsesImageModel?.trim() || DEFAULT_IMAGE_MODEL,
    }
  }
  return { ...draft, apiProtocol: nextProtocol }
}
