export const IMAGE_MIME_BY_EXTENSION: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
}

export function getImageMimeTypeFromExtension(
  extension: string | null | undefined,
  fallbackMimeType = 'image/png',
): string {
  const normalizedExtension = extension?.trim().replace(/^\./, '').toLowerCase() ?? ''
  return IMAGE_MIME_BY_EXTENSION[normalizedExtension] ?? fallbackMimeType
}

export function getImageExtensionFromMimeType(
  mimeType: string | null | undefined,
  fallbackExtension = 'png',
): string {
  if (!mimeType) {
    return fallbackExtension
  }

  const normalizedMimeType = mimeType.toLowerCase()
  const directMatch = Object.entries(IMAGE_MIME_BY_EXTENSION).find(([, value]) => value === normalizedMimeType)
  if (directMatch) {
    return directMatch[0]
  }

  const subtype = normalizedMimeType.split('/')[1]
  if (!subtype) {
    return fallbackExtension
  }

  return subtype === 'jpeg' ? 'jpg' : subtype
}

export function getImageMimeTypeFromPath(
  filePath: string,
  fallbackMimeType = 'image/png',
): string {
  const extension = filePath.split('.').pop()
  return getImageMimeTypeFromExtension(extension, fallbackMimeType)
}
