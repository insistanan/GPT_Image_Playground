import { useStore } from './state'

function normalizeImageIdList(imageId: string, imageIds?: string[]): string[] {
  const merged = [
    imageId,
    ...(imageIds ?? []),
  ]

  const deduped = Array.from(
    new Set(
      merged.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())),
    ),
  )

  return deduped
}

export function openLightbox(imageId: string, imageIds?: string[]) {
  const normalizedList = normalizeImageIdList(imageId, imageIds)
  const normalizedId = normalizedList.find((item) => item === imageId) ?? normalizedList[0] ?? null

  useStore.getState().setLightboxImageId(normalizedId, normalizedList)
}

export function closeLightbox() {
  useStore.getState().setLightboxImageId(null)
}
