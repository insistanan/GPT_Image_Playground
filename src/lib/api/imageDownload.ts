import { DEV_PROXY_TARGET_HEADER, readClientDevProxyConfig, type DevProxyConfig } from '../devProxy'
import { abortAwareFetch, throwIfSignalAborted } from './abort'
import type { ApiError } from './types'

export type ImageDownloadProxyConfig = Pick<DevProxyConfig, 'enabled' | 'prefix'>

/**
 * 图片 URL 下载失败（生成本身已成功、已计费）。
 * 请求规划器据此直接终止任务，绝不触发重新生图，避免重复扣费。
 * sourceUrl 同时写入 error.details，供错误详情 UI 渲染可点击链接。
 */
export class ImageUrlDownloadError extends Error {
  readonly sourceUrl: string

  constructor(message: string, sourceUrl: string) {
    super(message)
    this.name = 'ImageUrlDownloadError'
    this.sourceUrl = sourceUrl
    ;(this as ApiError).details = { sourceUrl }
  }
}

export function isImageUrlDownloadError(error: unknown): error is ImageUrlDownloadError {
  return error instanceof Error && error.name === 'ImageUrlDownloadError'
}

export function buildProxiedImageUrl(proxyPrefix: string, imageUrl: string): string {
  const parsed = new URL(imageUrl)
  return `${proxyPrefix}${parsed.pathname}${parsed.search}`
}

function isAbortLikeError(error: unknown): boolean {
  return error instanceof Error && (error.name === 'AbortError' || error.name === 'TaskAbortError')
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function fetchImageBlob(
  requestUrl: string,
  requestInit: RequestInit,
  signal: AbortSignal,
): Promise<Blob> {
  const response = await abortAwareFetch(requestUrl, { cache: 'no-store', ...requestInit }, signal)
  if (!response.ok) {
    throw new Error(`图片 URL 下载失败：HTTP ${response.status}`)
  }
  return await response.blob()
}

export async function fetchRemoteImageBlob(
  imageUrl: string,
  signal: AbortSignal,
  proxyConfig: ImageDownloadProxyConfig | null = readClientDevProxyConfig(),
): Promise<Blob> {
  throwIfSignalAborted(signal)

  let directFetchError: unknown
  try {
    return await fetchImageBlob(imageUrl, {}, signal)
  } catch (error) {
    if (isAbortLikeError(error)) {
      throw error
    }
    directFetchError = error
  }

  if (proxyConfig?.enabled) {
    try {
      const proxiedUrl = buildProxiedImageUrl(proxyConfig.prefix, imageUrl)
      const blob = await fetchImageBlob(
        proxiedUrl,
        { headers: { [DEV_PROXY_TARGET_HEADER]: new URL(imageUrl).origin } },
        signal,
      )
      console.warn('[image-download] 直接抓取失败，已改用本地开发代理下载图片：', imageUrl)
      return blob
    } catch (proxyError) {
      if (isAbortLikeError(proxyError)) {
        throw proxyError
      }
      throw new ImageUrlDownloadError(
        `图片已生成，但下载失败：直接抓取被浏览器拦截（${describeError(directFetchError)}），` +
          `本地代理下载也未成功（${describeError(proxyError)}）。` +
          `请点击错误详情中的图片链接，在新标签页打开后手动另存。`,
        imageUrl,
      )
    }
  }

  throw new ImageUrlDownloadError(
    `图片已生成，但下载失败：图片服务器的跨域许可（CORS）被浏览器拦截（${describeError(directFetchError)}），` +
      `且当前环境没有可用的本地代理兜底。请点击错误详情中的图片链接，在新标签页打开后手动另存。` +
      `长期方案：让服务商返回 base64 图片数据，或为图片域名配置 CORS。`,
    imageUrl,
  )
}
