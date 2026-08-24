import { normalizeProxyTargetBaseUrl, readClientDevProxyConfig } from '../devProxy'
import type { AppSettings } from '../../types'
import { getApiProtocol, MIME_MAP } from './config'
import { attachLocalDebugToError } from './debug'
import { callImagesApi } from './images'
import { createApiError, normalizeEditMaskForProvider } from './imageTransforms'
import { callResponsesApi } from './responses'
import type {
  ApiDebugRequestLogEntry,
  CallApiOptions,
  CallApiResult,
  CallImageApiIntent,
  SharedRequestContext,
} from './types'

interface ApiCallTimeoutState {
  id: ReturnType<typeof setTimeout>
}

interface ApiCallRuntime {
  baseOpts: CallApiOptions
  normalizedOpts: CallApiOptions
  ctx: SharedRequestContext
  timeoutState: ApiCallTimeoutState
}

function resolveTimeoutMs(settings: AppSettings): number {
  const timeoutMs = settings.timeout * 1000
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw createApiError(
      `请求超时时间无效（当前为 ${settings.timeout} 秒），请在设置中配置为正数`,
    )
  }
  return timeoutMs
}

function resolveEditSourceImageIndex(intent: CallImageApiIntent): number | undefined {
  const sourceImageId = intent.editMask?.sourceImageId
  if (sourceImageId == null) {
    return undefined
  }

  const editSourceImageIndex = intent.inputImages.findIndex((image) => image.id === sourceImageId)
  return editSourceImageIndex >= 0 ? editSourceImageIndex : undefined
}

function buildCallApiOptions(intent: CallImageApiIntent): CallApiOptions {
  const settings = import.meta.env.DEV
    ? intent.settings
    : {
        ...intent.settings,
        requestMode: 'direct' as const,
      }

  return {
    settings,
    prompt: intent.prompt,
    params: intent.params,
    inputImageDataUrls: intent.inputImages.map((image) => image.dataUrl),
    editMaskDataUrl: intent.editMask?.dataUrl,
    editSelection: intent.editMask?.selection ?? null,
    editSourceImageIndex: resolveEditSourceImageIndex(intent),
    onFinalImages: intent.onFinalImages,
    registerAbort: intent.registerAbort,
  }
}

function createApiCallRuntime(intent: CallImageApiIntent): ApiCallRuntime {
  const baseOpts = buildCallApiOptions(intent)
  const mime = MIME_MAP[baseOpts.params.output_format] || 'image/png'
  const proxyConfig = readClientDevProxyConfig()
  const forceProxy = import.meta.env.DEV && baseOpts.settings.requestMode === 'local_proxy'
  const debugLog: ApiDebugRequestLogEntry[] = []
  const requestHeaders: Record<string, string> = {
    Authorization: `Bearer ${baseOpts.settings.apiKey}`,
  }
  const controller = new AbortController()
  const timeoutMs = resolveTimeoutMs(baseOpts.settings)
  // 超时计时器覆盖单个 RequestPlan 的完整生命周期（含响应读取），
  // 每次降级重试前通过 ctx.refreshTimeout() 重置，避免前面的重试吃掉后续 plan 的全部时间。
  const timeoutState: ApiCallTimeoutState = {
    id: setTimeout(() => controller.abort('timeout'), timeoutMs),
  }
  baseOpts.registerAbort?.(() => controller.abort('user'))

  return {
    baseOpts,
    normalizedOpts: baseOpts,
    timeoutState,
    ctx: {
      controller,
      refreshTimeout: () => {
        clearTimeout(timeoutState.id)
        timeoutState.id = setTimeout(() => controller.abort('timeout'), timeoutMs)
      },
      requestHeaders,
      proxyConfig,
      mime,
      forceProxy,
      debugLog,
    },
  }
}

async function prepareApiCallRuntime(runtime: ApiCallRuntime): Promise<void> {
  const { baseOpts, ctx } = runtime

  if (ctx.forceProxy && !ctx.proxyConfig?.enabled) {
    throw createApiError(
      '本地代理模式已启用，但未检测到可用的开发代理。请确认 dev-proxy.config.json 存在，并重启 npm run dev。',
    )
  }

  if (ctx.forceProxy) {
    const proxyTargetBaseUrl = normalizeProxyTargetBaseUrl(baseOpts.settings.baseUrl)
    if (!proxyTargetBaseUrl) {
      throw createApiError('API URL 无效，请检查设置中的 API URL')
    }

    ctx.requestHeaders['X-Dev-Proxy-Target'] = proxyTargetBaseUrl
  }

  if (baseOpts.editMaskDataUrl == null) {
    runtime.normalizedOpts = baseOpts
    return
  }

  runtime.normalizedOpts = {
    ...baseOpts,
    editMaskDataUrl: await normalizeEditMaskForProvider(
      baseOpts.editMaskDataUrl,
      baseOpts.editSelection,
      ctx.controller.signal,
    ),
  }
}

async function executeApiCallRuntime(runtime: ApiCallRuntime): Promise<CallApiResult> {
  if (getApiProtocol(runtime.normalizedOpts.settings) === 'responses') {
    return await callResponsesApi(runtime.normalizedOpts, runtime.ctx)
  }

  return await callImagesApi(runtime.normalizedOpts, runtime.ctx)
}

export async function callImageApi(intent: CallImageApiIntent): Promise<CallApiResult> {
  const runtime = createApiCallRuntime(intent)

  try {
    await prepareApiCallRuntime(runtime)
    return await executeApiCallRuntime(runtime)
  } catch (error) {
    throw attachLocalDebugToError(error, runtime.normalizedOpts, runtime.ctx.debugLog)
  } finally {
    clearTimeout(runtime.timeoutState.id)
  }
}
