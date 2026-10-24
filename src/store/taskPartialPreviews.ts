const previews = new Map<string, Blob>()
const listeners = new Set<(taskId: string, url: string | null) => void>()
const objectUrls = new Map<string, string>()

function revokePreviewUrl(taskId: string) {
  const url = objectUrls.get(taskId)
  if (!url) {
    return
  }
  URL.revokeObjectURL(url)
  objectUrls.delete(taskId)
}

function notify(taskId: string, url: string | null) {
  for (const listener of listeners) {
    listener(taskId, url)
  }
}

export function setTaskPartialPreview(taskId: string, blob: Blob) {
  previews.set(taskId, blob)
  revokePreviewUrl(taskId)
  const url = URL.createObjectURL(blob)
  objectUrls.set(taskId, url)
  notify(taskId, url)
}

export function getTaskPartialPreviewUrl(taskId: string): string | null {
  return objectUrls.get(taskId) ?? null
}

export function clearTaskPartialPreview(taskId: string) {
  previews.delete(taskId)
  revokePreviewUrl(taskId)
  notify(taskId, null)
}

export function subscribeTaskPartialPreviews(
  listener: (taskId: string, url: string | null) => void,
): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
