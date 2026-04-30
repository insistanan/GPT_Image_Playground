import {
  clearImages,
  deleteImage,
  getAllImageRecords,
  hashDataUrl,
  storeImageBlob,
  storeLegacyDataUrl,
  storeRemoteImage,
} from '../lib/db'
import { buildImageThumbnail } from '../lib/imagePreview'
import { isRemoteImageUrl } from '../lib/imageUrl'
import type { StoredImage, StoredImageSource } from '../types'
import {
  clearImageCaches,
  deleteCachedImage,
  ensureCachedImageMetadata,
  ensureImageCached,
  ensureImageDataUrl,
  getCachedImage,
  getCachedImageMetadata,
  setCachedImage,
  setCachedImageMetadata,
  startLegacyImageMigrationSweep,
  type CachedImageMetadata,
  type CachedImageVariant,
} from './cache'

export type ImageAssetVariant = CachedImageVariant
export type ImageAssetMetadata = CachedImageMetadata

export interface ImageAssetView {
  url: string
  metadata: ImageAssetMetadata | null
}

export interface ImageAssetViewOptions {
  variant?: ImageAssetVariant
  includeMetadata?: boolean
  inferMetadataFromUrl?: boolean
}

export interface SaveImageAssetOptions {
  id?: string
  source?: StoredImageSource
  createdAt?: number
  contentHash?: string | null
  mimeType?: string | null
  byteSize?: number | null
  width?: number | null
  height?: number | null
  replaceExisting?: boolean
}

export interface SaveBlobImageAssetOptions extends SaveImageAssetOptions {
  thumbnailBlob?: Blob | null
  thumbnailMimeType?: string | null
  thumbnailWidth?: number | null
  thumbnailHeight?: number | null
}

const inferredImageAssetMetadataCache = new Map<string, ImageAssetMetadata>()

function getInferredMetadataKey(imageId: string, variant: ImageAssetVariant) {
  return `${imageId}:${variant}`
}

function clearInferredImageAssetMetadata(imageId: string) {
  const keyPrefix = `${imageId}:`
  for (const key of inferredImageAssetMetadataCache.keys()) {
    if (key.startsWith(keyPrefix)) {
      inferredImageAssetMetadataCache.delete(key)
    }
  }
}

async function buildThumbnailForBlob(blob: Blob) {
  try {
    return await buildImageThumbnail(blob)
  } catch (error) {
    console.error('图片资产缩略图生成失败，将仅保存原图。', error)
    return null
  }
}

function measureImageUrl(url: string): Promise<ImageAssetMetadata | null> {
  return new Promise((resolve) => {
    const image = new Image()

    image.onload = () => {
      if (image.naturalWidth > 0 && image.naturalHeight > 0) {
        resolve({ width: image.naturalWidth, height: image.naturalHeight })
        return
      }

      resolve(null)
    }

    image.onerror = () => resolve(null)
    image.src = url

    if (image.complete && image.naturalWidth > 0 && image.naturalHeight > 0) {
      resolve({ width: image.naturalWidth, height: image.naturalHeight })
    }
  })
}

async function resolveImageAssetViewMetadata(
  imageId: string,
  url: string,
  variant: ImageAssetVariant,
  options: ImageAssetViewOptions,
): Promise<ImageAssetMetadata | null> {
  if (!options.includeMetadata && !options.inferMetadataFromUrl) {
    return null
  }

  const cachedMetadata = getCachedImageMetadata(imageId)
  const persistedMetadata = cachedMetadata ?? await ensureCachedImageMetadata(imageId)
  if (persistedMetadata) {
    return persistedMetadata
  }

  if (!options.inferMetadataFromUrl) {
    return null
  }

  const inferredKey = getInferredMetadataKey(imageId, variant)
  const inferredMetadata = inferredImageAssetMetadataCache.get(inferredKey)
  if (inferredMetadata) {
    return inferredMetadata
  }

  const measuredMetadata = await measureImageUrl(url)
  if (!measuredMetadata) {
    return null
  }

  inferredImageAssetMetadataCache.set(inferredKey, measuredMetadata)
  if (variant === 'original') {
    setCachedImageMetadata(imageId, measuredMetadata)
  }

  return measuredMetadata
}

export async function saveImageAssetBlob(
  blob: Blob,
  options: SaveBlobImageAssetOptions = {},
): Promise<string> {
  let width = options.width ?? null
  let height = options.height ?? null
  let thumbnailBlob = options.thumbnailBlob ?? null
  let thumbnailMimeType = options.thumbnailMimeType ?? null
  let thumbnailWidth = options.thumbnailWidth ?? null
  let thumbnailHeight = options.thumbnailHeight ?? null

  if (!thumbnailBlob || !width || !height) {
    const generatedThumbnail = await buildThumbnailForBlob(blob)
    if (generatedThumbnail) {
      thumbnailBlob ??= generatedThumbnail.thumbnailBlob
      thumbnailMimeType ??= generatedThumbnail.thumbnailMimeType
      width ??= generatedThumbnail.width
      height ??= generatedThumbnail.height
      thumbnailWidth ??= generatedThumbnail.thumbnailWidth
      thumbnailHeight ??= generatedThumbnail.thumbnailHeight
    }
  }

  const imageId = await storeImageBlob(blob, {
    id: options.id,
    source: options.source,
    createdAt: options.createdAt,
    contentHash: options.contentHash,
    mimeType: options.mimeType,
    byteSize: options.byteSize,
    width,
    height,
    replaceExisting: options.replaceExisting,
    thumbnailBlob,
    thumbnailMimeType: thumbnailMimeType || thumbnailBlob?.type || null,
    thumbnailWidth,
    thumbnailHeight,
  })

  setCachedImage(imageId, blob, 'original')
  if (thumbnailBlob) {
    setCachedImage(imageId, thumbnailBlob, 'thumbnail')
  }
  if (width && height) {
    setCachedImageMetadata(imageId, { width, height })
  }

  return imageId
}

export async function saveImageAssetReference(
  referenceUrl: string,
  options: Pick<SaveImageAssetOptions, 'id' | 'source'> = {},
): Promise<string> {
  const imageId = isRemoteImageUrl(referenceUrl)
    ? await storeRemoteImage(referenceUrl, {
        id: options.id,
        source: options.source ?? 'upload',
      })
    : await storeLegacyDataUrl(referenceUrl, {
        id: options.id,
        source: options.source ?? 'upload',
      })
  setCachedImage(imageId, referenceUrl, 'original')
  return imageId
}

export async function saveRemoteImageAsset(
  remoteUrl: string,
  options: SaveImageAssetOptions = {},
): Promise<string> {
  const imageId = await storeRemoteImage(remoteUrl, options)
  setCachedImage(imageId, remoteUrl, 'original')
  if (options.width && options.height) {
    setCachedImageMetadata(imageId, { width: options.width, height: options.height })
  }
  return imageId
}

export async function stageImageAssetReference(referenceUrl: string): Promise<string> {
  const imageId = await hashDataUrl(referenceUrl)
  setCachedImage(imageId, referenceUrl, 'original')
  return imageId
}

export function getCachedImageAssetUrl(
  imageId: string,
  variant: ImageAssetVariant = 'original',
): string | undefined {
  return getCachedImage(imageId, variant)
}

export async function ensureImageAssetUrl(
  imageId: string,
  variant: ImageAssetVariant = 'original',
): Promise<string | undefined> {
  return ensureImageCached(imageId, variant)
}

export async function ensureImageAssetDataUrl(imageId: string): Promise<string | undefined> {
  return ensureImageDataUrl(imageId)
}

export function getCachedImageAssetMetadata(imageId: string): ImageAssetMetadata | undefined {
  return getCachedImageMetadata(imageId)
}

export function getCachedImageAssetView(
  imageId: string,
  options: ImageAssetViewOptions = {},
): ImageAssetView | null {
  const variant = options.variant ?? 'original'
  const url = getCachedImage(imageId, variant)
  if (!url) {
    return null
  }

  const metadata = options.includeMetadata || options.inferMetadataFromUrl
    ? getCachedImageMetadata(imageId)
      ?? inferredImageAssetMetadataCache.get(getInferredMetadataKey(imageId, variant))
      ?? null
    : null

  return { url, metadata }
}

export async function ensureImageAssetView(
  imageId: string,
  options: ImageAssetViewOptions = {},
): Promise<ImageAssetView | null> {
  const variant = options.variant ?? 'original'
  const url = getCachedImage(imageId, variant) ?? await ensureImageCached(imageId, variant)
  if (!url) {
    return null
  }

  const metadata = await resolveImageAssetViewMetadata(imageId, url, variant, options)
  return { url, metadata }
}

export async function ensureImageAssetMetadata(
  imageId: string,
): Promise<ImageAssetMetadata | undefined> {
  return ensureCachedImageMetadata(imageId)
}

export function evictImageAsset(imageId: string) {
  deleteCachedImage(imageId)
  clearInferredImageAssetMetadata(imageId)
}

function clearImageAssetCaches() {
  clearImageCaches()
  inferredImageAssetMetadataCache.clear()
}

export function startLegacyImageAssetMigrationSweep() {
  startLegacyImageMigrationSweep()
}

export async function deleteImageAsset(imageId: string): Promise<void> {
  await deleteImage(imageId)
  evictImageAsset(imageId)
}

export async function clearImageAssets(): Promise<void> {
  await clearImages()
  clearImageAssetCaches()
}

export async function listImageAssetRecords(): Promise<StoredImage[]> {
  return getAllImageRecords()
}
