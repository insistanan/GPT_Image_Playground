export const API_MAX_IMAGES = 16

/** 左侧面板各分区标题（提示词 / 参考图 / 参数）统一样式 */
export const SECTION_TITLE_CLASS = 'text-[13px] font-semibold text-gray-800 dark:text-gray-100'

export function isRemotePreviewUrl(value: string): boolean {
  return /^https?:\/\//i.test(value)
}
