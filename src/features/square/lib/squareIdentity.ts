import type { SquareIdentity } from '@/types'

const SQUARE_IDENTITY_STORAGE_KEY = 'gpt-image-playground.square.identity.v1'

function isSquareIdentity(value: unknown): value is SquareIdentity {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }

  const record = value as Record<string, unknown>
  return typeof record.publisherId === 'string' && typeof record.token === 'string'
}

export function readSquareIdentity(): SquareIdentity | null {
  try {
    const raw = window.localStorage.getItem(SQUARE_IDENTITY_STORAGE_KEY)
    if (!raw) return null

    const parsed = JSON.parse(raw) as unknown
    return isSquareIdentity(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function saveSquareIdentity(identity: SquareIdentity): void {
  window.localStorage.setItem(SQUARE_IDENTITY_STORAGE_KEY, JSON.stringify(identity))
}

export function clearSquareIdentity(): void {
  window.localStorage.removeItem(SQUARE_IDENTITY_STORAGE_KEY)
}
