export type AbortKind = 'user' | 'timeout'

export type AbortErrorWithKind = Error & {
  abortKind?: AbortKind
}

export function createAbortError(message = '任务已中止', kind?: AbortKind): AbortErrorWithKind {
  const error: AbortErrorWithKind = new Error(message)
  error.name = 'AbortError'
  if (kind) {
    error.abortKind = kind
  }
  return error
}

export function getAbortKindFromReason(reason: unknown): AbortKind {
  return reason === 'timeout' ? 'timeout' : 'user'
}

export function getAbortSignalMessage(signal: AbortSignal): string {
  const reason = signal.reason
  if (reason === 'timeout') {
    return '请求超时，已自动中止'
  }
  return '任务已中止'
}

export function createAbortErrorFromSignal(signal: AbortSignal): AbortErrorWithKind {
  return createAbortError(getAbortSignalMessage(signal), getAbortKindFromReason(signal.reason))
}

export function throwIfSignalAborted(signal: AbortSignal, message?: string): void {
  if (signal.aborted) {
    throw message
      ? createAbortError(message, getAbortKindFromReason(signal.reason))
      : createAbortErrorFromSignal(signal)
  }
}

export function isUserAbortLikeError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false
  }

  if (error.name === 'TaskAbortError') {
    return true
  }

  if (error.name !== 'AbortError') {
    return false
  }

  // 兼容未经 createAbortError 归一化的历史错误：无标记时视为用户中止，
  // 超时错误一定带 timeout 标记。
  return (error as AbortErrorWithKind).abortKind !== 'timeout'
}

// fetch 在 signal 中止时会抛出原生 DOMException（message 为英文且不带业务语义），
// 统一在这里归一化成带中文信息与 abortKind 的 AbortError。
export async function abortAwareFetch(
  url: string | URL,
  init: RequestInit,
  signal?: AbortSignal,
): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal })
  } catch (error) {
    // fetch 中止时抛出的是 DOMException；部分运行环境中它不满足 instanceof Error，需单独判断。
    const isAbortError =
      (typeof DOMException !== 'undefined' && error instanceof DOMException && error.name === 'AbortError') ||
      (error instanceof Error && error.name === 'AbortError')
    if (isAbortError) {
      // signal 缺失时理论上不会抛 AbortError；真发生了则保留原始错误，避免丢失信息。
      throw signal ? createAbortErrorFromSignal(signal) : error
    }
    throw error
  }
}
