import * as imageDb from '../lib/db'

export type CachedImageVariant = 'original' | 'thumbnail'

export interface CachedImageMetadata {
  width: number
  height: number
}

interface CachedImageEntry {
  src: string
  revoke?: () => void
}

interface StoredImageRecordCompat {
  id: string
  kind?: string | null
  dataUrl?: string | null
  url?: string | null
  remoteUrl?: string | null
  blob?: Blob | null
  thumbnailBlob?: Blob | null
  thumbnailDataUrl?: string | null
  thumbnailUrl?: string | null
  width?: number | null
  height?: number | null
  thumbnailWidth?: number | null
  thumbnailHeight?: number | null
}

interface ImageDbCompat {
  getImage: (id: string) => Promise<StoredImageRecordCompat | undefined>
  getImageRecord?: (id: string) => Promise<StoredImageRecordCompat | undefined>
  getImageDataUrl?: (id: string) => Promise<string | undefined>
  getImageIdsByKind?: (kind: string) => Promise<string[]>
  getAllImageRecords?: () => Promise<StoredImageRecordCompat[]>
  migrateLegacyImageRecord?: (id: string) => Promise<StoredImageRecordCompat | undefined>
}

interface CacheSnapshot {
  globalVersion: number
  entryVersion: number
}

const ORIGINAL_IMAGE_CACHE_LIMIT = 24
const THUMBNAIL_IMAGE_CACHE_LIMIT = 256

const dbCompat = imageDb as unknown as ImageDbCompat
const originalImageCache = new Map<string, CachedImageEntry>()
const thumbnailImageCache = new Map<string, CachedImageEntry>()
const imageLoadPromiseCache = new Map<string, Promise<string | undefined>>()
const imageRecordPromiseCache = new Map<string, Promise<StoredImageRecordCompat | undefined>>()
const imageMigrationPromiseCache = new Map<string, Promise<void>>()
const imageMetadataCache = new Map<string, CachedImageMetadata>()
const imageInvalidationVersions = new Map<string, number>()
let globalImageCacheVersion = 0
let legacyMigrationSweepStarted = false

function getVariantCache(variant: CachedImageVariant): Map<string, CachedImageEntry> {
  return variant === 'thumbnail' ? thumbnailImageCache : originalImageCache
}

function getVariantCacheLimit(variant: CachedImageVariant): number {
  return variant === 'thumbnail' ? THUMBNAIL_IMAGE_CACHE_LIMIT : ORIGINAL_IMAGE_CACHE_LIMIT
}

function getVariantCacheKey(id: string, variant: CachedImageVariant): string {
  return `${variant}:${id}`
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function getPositiveNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined
}

function createCacheSnapshot(id: string): CacheSnapshot {
  return {
    globalVersion: globalImageCacheVersion,
    entryVersion: imageInvalidationVersions.get(id) ?? 0,
  }
}

function isCacheSnapshotValid(id: string, snapshot: CacheSnapshot): boolean {
  return (
    snapshot.globalVersion === globalImageCacheVersion &&
    snapshot.entryVersion === (imageInvalidationVersions.get(id) ?? 0)
  )
}

function invalidateImageCache(id: string) {
  imageInvalidationVersions.set(id, (imageInvalidationVersions.get(id) ?? 0) + 1)
}

function revokeCacheEntry(entry: CachedImageEntry | undefined) {
  entry?.revoke?.()
}

function deleteCacheEntry(cache: Map<string, CachedImageEntry>, id: string) {
  const cached = cache.get(id)
  if (!cached) {
    return
  }

  cache.delete(id)
  revokeCacheEntry(cached)
}

function touchCacheEntry(cache: Map<string, CachedImageEntry>, id: string, entry: CachedImageEntry) {
  cache.delete(id)
  cache.set(id, entry)
}

function trimCache(cache: Map<string, CachedImageEntry>, variant: CachedImageVariant) {
  const limit = getVariantCacheLimit(variant)
  while (cache.size > limit) {
    const oldestKey = cache.keys().next().value
    if (typeof oldestKey !== 'string') {
      break
    }
    deleteCacheEntry(cache, oldestKey)
  }
}

function createObjectUrlEntry(blob: Blob): CachedImageEntry {
  const src = URL.createObjectURL(blob)
  return {
    src,
    revoke: () => URL.revokeObjectURL(src),
  }
}

function setCacheEntry(id: string, entry: CachedImageEntry, variant: CachedImageVariant): string {
  const cache = getVariantCache(variant)
  const previous = cache.get(id)
  if (previous?.src === entry.src) {
    touchCacheEntry(cache, id, previous)
    revokeCacheEntry(entry)
    return previous.src
  }

  if (previous) {
    revokeCacheEntry(previous)
  }

  touchCacheEntry(cache, id, entry)
  trimCache(cache, variant)
  return entry.src
}

function cacheRecordMetadata(id: string, record: StoredImageRecordCompat) {
  const width = getPositiveNumber(record.width)
  const height = getPositiveNumber(record.height)
  const thumbnailWidth = getPositiveNumber(record.thumbnailWidth)
  const thumbnailHeight = getPositiveNumber(record.thumbnailHeight)
  const resolvedWidth = width && height ? width : thumbnailWidth
  const resolvedHeight = width && height ? height : thumbnailHeight
  if (!resolvedWidth || !resolvedHeight) {
    return
  }

  imageMetadataCache.set(id, { width: resolvedWidth, height: resolvedHeight })
}

function cacheMigratedRecord(id: string, record: StoredImageRecordCompat, snapshot: CacheSnapshot) {
  if (!isCacheSnapshotValid(id, snapshot)) {
    return
  }

  imageRecordPromiseCache.delete(id)
  cacheRecordMetadata(id, record)

  if (record.blob instanceof Blob) {
    setCacheEntry(id, createObjectUrlEntry(record.blob), 'original')
  }

  if (record.thumbnailBlob instanceof Blob) {
    setCacheEntry(id, createObjectUrlEntry(record.thumbnailBlob), 'thumbnail')
  }
}

function scheduleLegacyImageMigration(id: string) {
  const migrateLegacyImageRecord = dbCompat.migrateLegacyImageRecord
  if (typeof migrateLegacyImageRecord !== 'function') {
    return
  }

  if (imageMigrationPromiseCache.has(id)) {
    return
  }

  const snapshot = createCacheSnapshot(id)
  const nextPromise = Promise.resolve()
    .then(async () => {
      const migratedRecord = await migrateLegacyImageRecord(id)
      if (!migratedRecord || migratedRecord.kind !== 'local_blob') {
        return
      }

      cacheMigratedRecord(id, migratedRecord, snapshot)
    })
    .catch((error) => {
      console.error(`后台迁移 legacy_data_url 图片失败：${id}`, error)
    })
    .finally(() => {
      if (imageMigrationPromiseCache.get(id) === nextPromise) {
        imageMigrationPromiseCache.delete(id)
      }
    })

  imageMigrationPromiseCache.set(id, nextPromise)
}

function scheduleIdleWork(callback: () => void) {
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(
      () => {
        callback()
      },
      { timeout: 1200 },
    )
    return
  }

  window.setTimeout(callback, 120)
}

function resolveOriginalSourceEntry(record: StoredImageRecordCompat): CachedImageEntry | undefined {
  if (record.blob instanceof Blob) {
    return createObjectUrlEntry(record.blob)
  }

  const src = [record.remoteUrl, record.dataUrl, record.url].find(isNonEmptyString)
  return src ? { src } : undefined
}

function resolveThumbnailSourceEntry(record: StoredImageRecordCompat): CachedImageEntry | undefined {
  if (record.thumbnailBlob instanceof Blob) {
    return createObjectUrlEntry(record.thumbnailBlob)
  }

  const src = [record.thumbnailDataUrl, record.thumbnailUrl].find(isNonEmptyString)
  return src ? { src } : undefined
}

function resolveSourceEntry(
  record: StoredImageRecordCompat,
  variant: CachedImageVariant,
): CachedImageEntry | undefined {
  if (variant === 'thumbnail') {
    const thumbnailEntry = resolveThumbnailSourceEntry(record)
    if (thumbnailEntry) {
      return thumbnailEntry
    }
  }

  return resolveOriginalSourceEntry(record)
}

async function loadImageRecord(id: string): Promise<StoredImageRecordCompat | undefined> {
  const getter = dbCompat.getImageRecord ?? dbCompat.getImage
  return getter(id)
}

async function loadLegacyImageIds(): Promise<string[]> {
  if (typeof dbCompat.getImageIdsByKind === 'function') {
    return dbCompat.getImageIdsByKind('legacy_data_url')
  }

  if (typeof dbCompat.getAllImageRecords === 'function') {
    const records = await dbCompat.getAllImageRecords()
    return records.filter((record) => record.kind === 'legacy_data_url').map((record) => record.id)
  }

  return []
}

function ensureImageRecordLoaded(id: string): Promise<StoredImageRecordCompat | undefined> {
  const pending = imageRecordPromiseCache.get(id)
  if (pending) {
    return pending
  }

  const snapshot = createCacheSnapshot(id)
  const nextPromise = loadImageRecord(id)
    .then((record) => {
      if (!record || !isCacheSnapshotValid(id, snapshot)) {
        return undefined
      }

      cacheRecordMetadata(id, record)
      if (record.kind === 'legacy_data_url') {
        scheduleLegacyImageMigration(id)
      }
      return record
    })
    .finally(() => {
      if (imageRecordPromiseCache.get(id) === nextPromise) {
        imageRecordPromiseCache.delete(id)
      }
    })

  imageRecordPromiseCache.set(id, nextPromise)
  return nextPromise
}

function setResolvedCacheEntry(
  id: string,
  entry: CachedImageEntry,
  variant: CachedImageVariant,
  snapshot: CacheSnapshot,
): string | undefined {
  if (!isCacheSnapshotValid(id, snapshot)) {
    revokeCacheEntry(entry)
    return undefined
  }

  const cached = getCachedImage(id, variant)
  if (cached) {
    revokeCacheEntry(entry)
    return cached
  }

  return setCacheEntry(id, entry, variant)
}

export function getCachedImage(
  id: string,
  variant: CachedImageVariant = 'original',
): string | undefined {
  const cache = getVariantCache(variant)
  const entry = cache.get(id)
  if (!entry) {
    return undefined
  }

  touchCacheEntry(cache, id, entry)
  return entry.src
}

export function getCachedImageMetadata(id: string): CachedImageMetadata | undefined {
  return imageMetadataCache.get(id)
}

export function setCachedImageMetadata(id: string, metadata: CachedImageMetadata) {
  imageMetadataCache.set(id, metadata)
}

export async function ensureCachedImageMetadata(id: string): Promise<CachedImageMetadata | undefined> {
  const cached = imageMetadataCache.get(id)
  if (cached) {
    return cached
  }

  const record = await ensureImageRecordLoaded(id)
  if (!record) {
    return undefined
  }

  return imageMetadataCache.get(id)
}

export async function ensureImageDataUrl(id: string): Promise<string | undefined> {
  const record = await ensureImageRecordLoaded(id)
  if (!record) {
    return undefined
  }

  const compatibleSrc = [record.remoteUrl, record.dataUrl, record.url].find(isNonEmptyString)
  if (compatibleSrc) {
    return compatibleSrc
  }

  if (typeof dbCompat.getImageDataUrl === 'function') {
    return await dbCompat.getImageDataUrl(id)
  }

  if (record.blob instanceof Blob) {
    throw new Error('DB 层缺少 getImageDataUrl(id) 实现，无法把 Blob 图片恢复为 data URL')
  }

  return undefined
}

export function setCachedImage(
  id: string,
  value: string | Blob,
  variant: CachedImageVariant = 'original',
) {
  if (typeof value === 'string') {
    setCacheEntry(id, { src: value }, variant)
    return
  }

  if (!(value instanceof Blob)) {
    throw new Error('setCachedImage 仅支持字符串地址或 Blob')
  }

  setCacheEntry(id, createObjectUrlEntry(value), variant)
}

export function deleteCachedImage(id: string) {
  invalidateImageCache(id)
  deleteCacheEntry(originalImageCache, id)
  deleteCacheEntry(thumbnailImageCache, id)
  imageLoadPromiseCache.delete(getVariantCacheKey(id, 'original'))
  imageLoadPromiseCache.delete(getVariantCacheKey(id, 'thumbnail'))
  imageRecordPromiseCache.delete(id)
  imageMetadataCache.delete(id)
}

export function clearImageCaches() {
  globalImageCacheVersion += 1
  for (const entry of originalImageCache.values()) {
    revokeCacheEntry(entry)
  }
  for (const entry of thumbnailImageCache.values()) {
    revokeCacheEntry(entry)
  }

  originalImageCache.clear()
  thumbnailImageCache.clear()
  imageLoadPromiseCache.clear()
  imageRecordPromiseCache.clear()
  imageMigrationPromiseCache.clear()
  imageMetadataCache.clear()
  imageInvalidationVersions.clear()
  legacyMigrationSweepStarted = false
}

export function startLegacyImageMigrationSweep() {
  if (legacyMigrationSweepStarted) {
    return
  }

  if (
    typeof dbCompat.getImageIdsByKind !== 'function' &&
    typeof dbCompat.getAllImageRecords !== 'function'
  ) {
    return
  }

  legacyMigrationSweepStarted = true
  void loadLegacyImageIds()
    .then((legacyImageIds) => {
      if (legacyImageIds.length === 0) {
        return
      }

      const pendingIds = [...legacyImageIds]
      const runNextBatch = () => {
        const batch = pendingIds.splice(0, 1)
        for (const id of batch) {
          scheduleLegacyImageMigration(id)
        }

        if (pendingIds.length > 0) {
          scheduleIdleWork(runNextBatch)
        }
      }

      scheduleIdleWork(runNextBatch)
    })
    .catch((error) => {
      legacyMigrationSweepStarted = false
      console.error('扫描 legacy_data_url 图片失败，后台迁移未启动。', error)
    })
}

export async function ensureImageCached(
  id: string,
  variant: CachedImageVariant = 'original',
): Promise<string | undefined> {
  const cached = getCachedImage(id, variant)
  if (cached) {
    return cached
  }

  const cacheKey = getVariantCacheKey(id, variant)
  const pending = imageLoadPromiseCache.get(cacheKey)
  if (pending) {
    return pending
  }

  const snapshot = createCacheSnapshot(id)
  const nextPromise = ensureImageRecordLoaded(id)
    .then((record) => {
      if (!record || !isCacheSnapshotValid(id, snapshot)) {
        return undefined
      }

      const entry = resolveSourceEntry(record, variant)
      if (!entry) {
        return undefined
      }

      return setResolvedCacheEntry(id, entry, variant, snapshot)
    })
    .finally(() => {
      if (imageLoadPromiseCache.get(cacheKey) === nextPromise) {
        imageLoadPromiseCache.delete(cacheKey)
      }
    })

  imageLoadPromiseCache.set(cacheKey, nextPromise)
  return nextPromise
}
