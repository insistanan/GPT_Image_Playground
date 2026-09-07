import type { TaskRecord } from '../../../../types'

export const RECYCLE_BIN_RETENTION_MS = 15 * 24 * 60 * 60 * 1000

export function formatLocaleTime(timestamp: number | null): string {
  if (!timestamp) return ''
  return new Date(timestamp).toLocaleString('zh-CN')
}

export function formatElapsedDuration(elapsed: number | null): string | null {
  if (elapsed == null) return null

  const seconds = Math.floor(elapsed / 1000)
  const mm = String(Math.floor(seconds / 60)).padStart(2, '0')
  const ss = String(seconds % 60).padStart(2, '0')
  return `${mm}:${ss}`
}

function readSourceUrlFromDetails(details: unknown): string | null {
  if (!details || typeof details !== 'object') {
    return null
  }

  const sourceUrl = (details as Record<string, unknown>).sourceUrl
  return typeof sourceUrl === 'string' && /^https?:\/\//i.test(sourceUrl) ? sourceUrl : null
}

export function resolveTaskErrorSourceUrl(task: Pick<TaskRecord, 'errorDebug'>): string | null {
  const errorDebug = task.errorDebug
  if (!errorDebug) {
    return null
  }

  return (
    readSourceUrlFromDetails(errorDebug.details) ??
    readSourceUrlFromDetails(errorDebug.failure?.details)
  )
}

