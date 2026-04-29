export const DEFAULT_PROVIDER_NAME = '供应商 1'
export const RECYCLE_BIN_RETENTION_MS = 15 * 24 * 60 * 60 * 1000
export const RECYCLE_BIN_POLL_INTERVAL_MS = 10 * 60 * 1000
export const ERROR_LOG_RETENTION_MS = 15 * 24 * 60 * 60 * 1000
export const ERROR_LOG_POLL_INTERVAL_MS = 12 * 60 * 60 * 1000

let uid = 0

export function genId(): string {
  return Date.now().toString(36) + (++uid).toString(36) + Math.random().toString(36).slice(2, 6)
}
