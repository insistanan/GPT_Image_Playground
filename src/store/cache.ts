import { getImage } from '../lib/db'

const imageCache = new Map<string, string>()
const imageLoadPromiseCache = new Map<string, Promise<string | undefined>>()
const runningTaskAborters = new Map<string, () => void>()
const userAbortedTaskIds = new Set<string>()

export function getCachedImage(id: string): string | undefined {
  return imageCache.get(id)
}

export function setCachedImage(id: string, dataUrl: string) {
  imageCache.set(id, dataUrl)
}

export function deleteCachedImage(id: string) {
  imageCache.delete(id)
  imageLoadPromiseCache.delete(id)
}

export function clearImageCaches() {
  imageCache.clear()
  imageLoadPromiseCache.clear()
}

export async function ensureImageCached(id: string): Promise<string | undefined> {
  if (imageCache.has(id)) {
    return imageCache.get(id)
  }

  const pending = imageLoadPromiseCache.get(id)
  if (pending) {
    return pending
  }

  const nextPromise = getImage(id)
    .then((record) => {
      if (!record) {
        return undefined
      }

      imageCache.set(id, record.dataUrl)
      return record.dataUrl
    })
    .finally(() => {
      imageLoadPromiseCache.delete(id)
    })

  imageLoadPromiseCache.set(id, nextPromise)
  return nextPromise
}

export function registerTaskAborter(taskId: string, abort: () => void) {
  runningTaskAborters.set(taskId, abort)
}

export function getTaskAborter(taskId: string): (() => void) | undefined {
  return runningTaskAborters.get(taskId)
}

export function requestTaskAbort(taskId: string) {
  userAbortedTaskIds.add(taskId)
}

export function isTaskAbortRequested(taskId: string): boolean {
  return userAbortedTaskIds.has(taskId)
}

export function clearTaskAbortState(taskId: string) {
  runningTaskAborters.delete(taskId)
  userAbortedTaskIds.delete(taskId)
}
