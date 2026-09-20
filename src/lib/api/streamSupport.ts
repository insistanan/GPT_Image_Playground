import type { ApiProtocol, AppSettings } from '../../types'

/**
 * 会话级流式能力记忆。
 *
 * 背景：`auto` / `stream` 传输模式会优先发 `stream: true`，失败后再降级到 JSON。
 * 但有些模型是确定性地不支持流式（例如商汤 `sensenova-u1.5-lite` 会返回
 * `field Stream invalid, only false is allowed for this model`）。对这类目标，
 * 每次任务都先撞一次 400 再降级，纯属浪费一次往返。
 *
 * 这里只缓存“上游明确告知不支持流式”的目标，命中后同一会话内直接跳过 stream。
 * 缓存不落盘，刷新即失效；这不是能力猜测，而是基于上游确定性的拒绝。
 */

const unsupportedStreamKeys = new Set<string>()

export function buildStreamSupportKey(settings: AppSettings, protocol: ApiProtocol): string {
  const model =
    protocol === 'responses'
      ? settings.responsesImageModel?.trim() || settings.model
      : settings.model

  return `${protocol}::${settings.baseUrl.trim().toLowerCase()}::${model.trim().toLowerCase()}`
}

export function isStreamKnownUnsupported(key: string): boolean {
  return unsupportedStreamKeys.has(key)
}

export function markStreamUnsupported(key: string): void {
  unsupportedStreamKeys.add(key)
}

/** 仅用于测试：清空会话记忆。 */
export function resetStreamSupportCache(): void {
  unsupportedStreamKeys.clear()
}

const STREAM_UNSUPPORTED_PATTERNS = [
  /only false is allowed for this model/i,
  /field\s*stream\s*invalid/i,
  /stream(?:ing)?[^.]{0,40}(?:not (?:supported|allowed)|unsupported|disabled)/i,
  /(?:not|never|no|doesn'?t|does not|do not|can'?t|cannot)\s+support(?:s|ed|ing)?[^.]{0,20}stream(?:ing)?/i,
  /(?:not (?:supported|allowed)|unsupported)[^.]{0,20}stream(?:ing)?/i,
]

/**
 * 判断错误是否明确表示“该模型不支持流式传输”。
 *
 * 只匹配上游对 stream 参数的确定性拒绝，不匹配网络层、超时等通用流错误，
 * 避免把偶发失败误当成能力缺失而永久跳过流式。
 */
export function isStreamUnsupportedError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false
  }

  return STREAM_UNSUPPORTED_PATTERNS.some((pattern) => pattern.test(error.message))
}
