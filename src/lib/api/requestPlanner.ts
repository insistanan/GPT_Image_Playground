import type { AppliedTransportMeta, AppSettings, TaskResponseMeta } from '../../types'
import { getResponsesTransportMode } from './config'
import type {
  ActualTransportKind,
  ApiError,
  CallApiOptions,
  ImagesRequestPlan,
  ResponsesActionMode,
  ResponsesInputImage,
  ResponsesInputPayloadMode,
  ResponsesRequestPlan,
  ResponsesToolChoiceMode,
  ResponsesTransportKind,
} from './types'

/**
 * API 请求策略规划器。
 *
 * 职责：根据协议、传输模式、图片输入方式等条件，生成一组按优先级排序的
 * RequestPlan 列表。调用方（responses.ts / images.ts）按顺序尝试每个 Plan，
 * 失败时通过 failAndAdvance() 决定是否退避到下一个 Plan。
 *
 * 核心概念：
 * - Plan 列表由 build*RequestPlans() 生成，按优先级排列
 * - createPlannerSession() 封装 Plan 遍历、成功标记、失败推进
 * - shouldRetry*() 函数决定"当前 Plan 失败后是否尝试下一个"
 * - shouldBlockTransportFallback() 判断错误类型是否阻止降级
 *
 * 退避策略示例（Responses）：
 *   1. official-stream-message-list    (首选：流式)
 *   2. official-json-message-list       (降级：JSON)
 *   3. explicit-action-stream           (兼容：显式 action)
 *   4. forced-tool-stream-message-list  (兜底：强制工具调用)
 *   ...
 */

interface PlannerSession<TPlan extends { transport: ResponsesTransportKind }> {
  currentPlan: TPlan
  completeSuccess: (actualTransport: ActualTransportKind) => AppliedTransportMeta
  failAndAdvance: (error: unknown) => TPlan | null
}

/**
 * 判断错误是否为中止类错误（AbortError）。
 * 中止错误不应触发重试或降级。
 */
function isAbortLikeError(error: unknown): error is Error {
  return error instanceof Error && (error.name === 'AbortError' || /\babort(?:ed)?\b/i.test(error.message))
}

/**
 * 判断认证/配额类错误，此类错误不应触发传输降级。
 */
function isAuthLikeError(error: unknown): error is Error {
  return error instanceof Error && /(?:auth_not_found|no auth available|invalid api key|insufficient|quota)/i.test(error.message)
}

/**
 * 判断是否应阻止传输降级。
 * 中止、认证、配额类错误以及特定 HTTP 状态码不应触发降级重试。
 */
function shouldBlockTransportFallback(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return true
  }

  if (isAbortLikeError(error) || isAuthLikeError(error)) {
    return true
  }

  const status = (error as ApiError).status
  return status != null && [401, 403, 429, 524].includes(status)
}

function buildTransportMeta(
  requested: AppliedTransportMeta['requested'],
  actual: NonNullable<AppliedTransportMeta['actual']>,
  fallbackFromStream: boolean,
): AppliedTransportMeta {
  return {
    requested,
    actual,
    fallbackFromStream,
  }
}

export function mergeTaskResponseTransportMeta(
  baseMeta: TaskResponseMeta | undefined,
  transportMeta: AppliedTransportMeta,
): TaskResponseMeta {
  return {
    ...(baseMeta ?? {}),
    transport: transportMeta,
  }
}

/**
 * 获取首选传输序列（stream -> json 或仅 json）。
 */
function getPreferredTransportSequence(settings: AppSettings): ResponsesTransportKind[] {
  const mode = getResponsesTransportMode(settings)
  if (mode === 'json') {
    return ['json']
  }

  return ['stream', 'json']
}

/**
 * Responses stream->json 降级判断：当前 plan 是 stream、下一个是 json 且未被阻止。
 */
function shouldFallbackResponsesStreamToJson(
  error: unknown,
  currentPlan: { transport: ResponsesTransportKind },
  nextPlan?: { transport: ResponsesTransportKind },
): boolean {
  if (currentPlan.transport !== 'stream' || nextPlan?.transport !== 'json') {
    return false
  }

  return !shouldBlockTransportFallback(error)
}

/**
 * Responses 兼容性重试判断：错误是否表明可尝试不同参数组合。
 * 例如 404/405 可能表示端点不支持当前参数，可尝试兼容模式。
 */
export function shouldRetryResponsesWithCompatibility(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false
  }

  if (isResponsesRelayFailure(error)) {
    return false
  }

  const status = (error as ApiError).status
  if (status != null && [404, 405, 409, 415, 422, 500, 501].includes(status)) {
    return true
  }

  return /(?:HTTP 5\d{2}|tool(?:_choice)?|image_generation|response|internal|server error|input must be a list|input.*array|expected.*list|expected.*array|multipart|stream|sse|file_id|unknown parameter|invalid_request_error)/i.test(
    error.message,
  )
}

/**
 * Images 协议的重试判断：考虑传输降级（stream->json）和 body 格式降级（json->multipart）。
 */
export function shouldRetryImagesPlan(
  error: unknown,
  currentPlan: ImagesRequestPlan,
  nextPlan?: ImagesRequestPlan,
): boolean {
  if (!nextPlan || !(error instanceof Error)) {
    return false
  }

  if (currentPlan.transport === 'stream' && nextPlan.transport === 'json') {
    return !shouldBlockTransportFallback(error)
  }

  if (shouldBlockTransportFallback(error)) {
    return false
  }

  if (/\/backend-api\/files failed/i.test(error.message)) {
    return false
  }

  const status = (error as ApiError).status

  if (currentPlan.bodyMode === 'json' && nextPlan.bodyMode === 'multipart') {
    if (status != null && (status >= 500 || [400, 404, 405, 415, 422, 501].includes(status))) {
      return true
    }

    return /(?:接口未返回可用图片数据|no usable image|invalid_request|unsupported|not implemented|multipart|form|image\[\]|images\b)/i.test(
      error.message,
    )
  }

  if (currentPlan.transport !== 'json' || nextPlan.transport !== 'stream') {
    return false
  }

  if (status != null && (status >= 500 || [404, 405, 501].includes(status))) {
    return true
  }

  return /(?:接口未返回可用图片数据|no usable image|bad_response_body|unsupported|not implemented|stream|sse|server error|internal)/i.test(
    error.message,
  )
}

/**
 * 判断是否为上游代理/中继故障，此类错误不应触发参数兼容性重试。
 */
export function isResponsesRelayFailure(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false
  }

  const status = (error as ApiError).status
  if (status === 524) {
    return true
  }

  return /(?:do_request_failed|upstream error|cloudflare|timeout occurred|timed out|auth_not_found|no auth available)/i.test(
    error.message,
  )
}

/**
 * 构建 Responses 协议的 RequestPlan 列表。
 *
 * Plan 优先级（从高到低）：
 *   1. official-{transport}-message-list  — 标准官方调用
 *   2. explicit-action-{transport}         — 有参考图时显式 action
 *   3. message-list-{transport}            — 强制 message-list 格式
 *   4. forced-tool-{transport}-{mode}      — 强制 tool_choice 兜底
 *
 * 蒙版编辑场景下 transport 顺序反转（json -> stream），因为蒙版数据量较大。
 */
export function buildResponsesRequestPlans(
  opts: CallApiOptions,
  inputImages: ResponsesInputImage[],
): ResponsesRequestPlan[] {
  const hasReferenceImages = inputImages.length > 0
  const hasEditMask = Boolean(opts.editMaskDataUrl)
  const defaultInputPayloadMode: ResponsesInputPayloadMode = 'message-list'
  const transports = getPreferredTransportSequence(opts.settings)
  const primaryTransports: ResponsesTransportKind[] =
    hasEditMask && getResponsesTransportMode(opts.settings) === 'auto'
      ? ['json', 'stream']
      : transports
  const allowJsonCompatibilityFallback = getResponsesTransportMode(opts.settings) === 'auto'
  const compatibilityTransports: ResponsesTransportKind[] = allowJsonCompatibilityFallback ? ['json'] : transports
  const plans: ResponsesRequestPlan[] = []

  const pushPlan = (plan: ResponsesRequestPlan) => {
    if (!plans.some((item) => item.id === plan.id)) {
      plans.push(plan)
    }
  }

  for (const transport of primaryTransports) {
    pushPlan({
      id: `official-${transport}-${defaultInputPayloadMode}`,
      inputPayloadMode: defaultInputPayloadMode,
      transport,
      actionMode: hasEditMask ? 'explicit' : 'auto',
      toolChoiceMode: hasEditMask ? 'force' : 'omit',
    })
  }

  if (hasReferenceImages && !hasEditMask) {
    for (const transport of compatibilityTransports) {
      pushPlan({
        id: `explicit-action-${transport}`,
        inputPayloadMode: 'message-list',
        transport,
        actionMode: 'explicit',
        toolChoiceMode: 'omit',
      })
    }
  }

  if (!hasReferenceImages && defaultInputPayloadMode !== 'message-list') {
    for (const transport of compatibilityTransports) {
      pushPlan({
        id: `message-list-${transport}`,
        inputPayloadMode: 'message-list',
        transport,
        actionMode: 'auto',
        toolChoiceMode: 'omit',
      })
    }
  }

  if (!hasEditMask) {
    const forcedToolInputPayloadMode: ResponsesInputPayloadMode =
      !hasReferenceImages && defaultInputPayloadMode !== 'message-list'
        ? 'message-list'
        : defaultInputPayloadMode
    const forcedToolActionMode: ResponsesActionMode =
      hasReferenceImages || forcedToolInputPayloadMode === 'message-list' ? 'explicit' : 'auto'
    const forcedToolChoiceMode: ResponsesToolChoiceMode = 'force'

    for (const transport of compatibilityTransports) {
      pushPlan({
        id: `forced-tool-${transport}-${forcedToolInputPayloadMode}`,
        inputPayloadMode: forcedToolInputPayloadMode,
        transport,
        actionMode: forcedToolActionMode,
        toolChoiceMode: forcedToolChoiceMode,
      })
    }
  }

  return plans
}

/**
 * 构建 Images 协议的 RequestPlan 列表。
 * 编辑场景下生成 json+multipart 两组 plan，按 transport 顺序排列。
 */
export function buildImagesRequestPlans(settings: AppSettings, options?: { isEdit?: boolean }): ImagesRequestPlan[] {
  const mode = getResponsesTransportMode(settings)

  if (!options?.isEdit) {
    const transports = getPreferredTransportSequence(settings)
    return transports.map((transport) => ({
      id: transport,
      transport,
      bodyMode: 'json',
    }))
  }

  if (mode === 'json') {
    return [
      {
        id: 'json-body-json',
        transport: 'json',
        bodyMode: 'json',
      },
      {
        id: 'multipart-body-json',
        transport: 'json',
        bodyMode: 'multipart',
      },
    ]
  }

  return [
    {
      id: 'json-body-json',
      transport: 'json',
      bodyMode: 'json',
    },
    {
      id: 'multipart-body-json',
      transport: 'json',
      bodyMode: 'multipart',
    },
    {
      id: 'json-body-stream',
      transport: 'stream',
      bodyMode: 'json',
    },
    {
      id: 'multipart-body-stream',
      transport: 'stream',
      bodyMode: 'multipart',
    },
  ]
}

function createPlannerSession<TPlan extends { transport: ResponsesTransportKind }>(
  requested: AppliedTransportMeta['requested'],
  plans: TPlan[],
  shouldAdvance: (error: unknown, currentPlan: TPlan, nextPlan?: TPlan) => boolean,
): PlannerSession<TPlan> {
  let planIndex = 0
  let hasAttemptedStream = false

  return {
    get currentPlan() {
      return plans[planIndex]
    },
    completeSuccess(actualTransport: ActualTransportKind) {
      const fallbackFromStream = actualTransport === 'json' && hasAttemptedStream
      return buildTransportMeta(requested, actualTransport, fallbackFromStream)
    },
    failAndAdvance(error: unknown) {
      const currentPlan = plans[planIndex]
      const nextPlan = plans[planIndex + 1]
      if (currentPlan.transport === 'stream') {
        hasAttemptedStream = true
      }
      if (!shouldAdvance(error, currentPlan, nextPlan)) {
        return null
      }

      planIndex += 1
      return plans[planIndex] ?? null
    },
  }
}

export function createResponsesPlanner(
  opts: CallApiOptions,
  inputImages: ResponsesInputImage[],
): PlannerSession<ResponsesRequestPlan> {
  const requested = getResponsesTransportMode(opts.settings)
  return createPlannerSession(
    requested,
    buildResponsesRequestPlans(opts, inputImages),
    (error, currentPlan, nextPlan) =>
      shouldRetryResponsesWithCompatibility(error) ||
      shouldFallbackResponsesStreamToJson(error, currentPlan, nextPlan),
  )
}

export function createImagesPlanner(
  settings: AppSettings,
  options?: { isEdit?: boolean },
): PlannerSession<ImagesRequestPlan> {
  const requested = getResponsesTransportMode(settings)
  return createPlannerSession(requested, buildImagesRequestPlans(settings, options), shouldRetryImagesPlan)
}
