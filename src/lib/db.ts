import type {
  StoredImage,
  StoredImageSource,
  StoredLegacyDataUrlImage,
  StoredLocalBlobImage,
  StoredRemoteUrlImage,
  TaskRecord,
} from '../types'
import { isRecord } from './guards'
import { buildImageThumbnail } from './imagePreview'
import { isRemoteImageUrl } from './imageUrl'

const DB_NAME = 'gpt-image-playground'
const DB_VERSION = 3
const STORE_TASKS = 'tasks'
const STORE_IMAGES = 'images'
const IMAGE_INDEX_KIND = 'kind'
const IMAGE_INDEX_CONTENT_HASH = 'contentHash'
const IMAGE_INDEX_CREATED_AT = 'createdAt'

export type LegacyCompatibleStoredImage =
  | StoredLegacyDataUrlImage
  | (StoredLocalBlobImage & { dataUrl: string })
  | (StoredRemoteUrlImage & { dataUrl: string })

export interface StoreImageRecordOptions {
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

export interface StoreImageBlobOptions extends StoreImageRecordOptions {
  thumbnailBlob?: Blob | null
  thumbnailMimeType?: string | null
  thumbnailWidth?: number | null
  thumbnailHeight?: number | null
  migratedFromLegacyAt?: number | null
}

interface LegacyCompatibleImageInput extends StoreImageRecordOptions {
  id: string
  dataUrl: string
}

interface NormalizedImageBase {
  id: string
  kind: StoredImage['kind']
  createdAt?: number
  source?: StoredImageSource
  contentHash?: string | null
  mimeType?: string | null
  byteSize?: number | null
  width?: number | null
  height?: number | null
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      const tx = req.transaction
      if (!tx) {
        throw new Error('IndexedDB 升级事务缺失')
      }

      if (!db.objectStoreNames.contains(STORE_TASKS)) {
        db.createObjectStore(STORE_TASKS, { keyPath: 'id' })
      }

      const imageStore = db.objectStoreNames.contains(STORE_IMAGES)
        ? tx.objectStore(STORE_IMAGES)
        : db.createObjectStore(STORE_IMAGES, { keyPath: 'id' })

      ensureImageIndexes(imageStore)
      backfillLegacyImageKinds(imageStore)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('打开 IndexedDB 失败'))
  })
}

function ensureImageIndexes(store: IDBObjectStore) {
  if (!store.indexNames.contains(IMAGE_INDEX_KIND)) {
    store.createIndex(IMAGE_INDEX_KIND, 'kind')
  }
  if (!store.indexNames.contains(IMAGE_INDEX_CONTENT_HASH)) {
    store.createIndex(IMAGE_INDEX_CONTENT_HASH, 'contentHash')
  }
  if (!store.indexNames.contains(IMAGE_INDEX_CREATED_AT)) {
    store.createIndex(IMAGE_INDEX_CREATED_AT, 'createdAt')
  }
}

function inferLegacyStoredImageKindFromValue(
  value: Record<string, unknown>,
): 'legacy_data_url' | 'remote_url' | null {
  if (typeof value.kind === 'string') {
    if (value.kind === 'legacy_data_url' || value.kind === 'remote_url') {
      return value.kind
    }
    return null
  }

  const rawDataUrl = typeof value.dataUrl === 'string' ? value.dataUrl.trim() : ''
  if (!rawDataUrl) {
    return null
  }

  if (/^https?:\/\//i.test(rawDataUrl)) {
    return 'remote_url'
  }

  if (/^data:[^,]+,.+/i.test(rawDataUrl)) {
    return 'legacy_data_url'
  }

  return null
}

function backfillLegacyImageKinds(store: IDBObjectStore) {
  const request = store.openCursor()
  request.onsuccess = () => {
    const cursor = request.result
    if (!cursor) {
      return
    }

    const value = cursor.value
    if (typeof value === 'object' && value !== null) {
      const record = value as Record<string, unknown>
      const inferredKind = inferLegacyStoredImageKindFromValue(record)
      if (inferredKind && typeof record.kind !== 'string') {
        cursor.update(
          inferredKind === 'remote_url'
            ? {
                ...record,
                kind: inferredKind,
                remoteUrl:
                  typeof record.remoteUrl === 'string' && record.remoteUrl.trim()
                    ? record.remoteUrl
                    : record.dataUrl,
              }
            : {
                ...record,
                kind: inferredKind,
              },
        )
      }
    }

    cursor.continue()
  }
}

function dbTransaction<T>(
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, mode)
        const store = tx.objectStore(storeName)
        const req = fn(store)

        const closeDB = () => {
          db.close()
        }

        req.onsuccess = () => resolve(req.result)
        req.onerror = () => {
          reject(req.error ?? new Error(`IndexedDB 请求失败：${storeName}`))
          closeDB()
        }
        tx.onabort = () => {
          reject(tx.error ?? new Error(`IndexedDB 事务已中止：${storeName}`))
          closeDB()
        }
        tx.oncomplete = closeDB
        tx.onerror = () => {
          reject(tx.error ?? new Error(`IndexedDB 事务失败：${storeName}`))
          closeDB()
        }
      }),
  )
}

// ===== Tasks =====

export function getAllTasks(): Promise<TaskRecord[]> {
  return dbTransaction(STORE_TASKS, 'readonly', (s) => s.getAll())
}

export function putTask(task: TaskRecord): Promise<IDBValidKey> {
  return dbTransaction(STORE_TASKS, 'readwrite', (s) => s.put(task))
}

export function deleteTask(id: string): Promise<undefined> {
  return dbTransaction(STORE_TASKS, 'readwrite', (s) => s.delete(id))
}

export function clearTasks(): Promise<undefined> {
  return dbTransaction(STORE_TASKS, 'readwrite', (s) => s.clear())
}

// ===== Images =====

export async function getImageRecord(id: string): Promise<StoredImage | undefined> {
  const raw = await dbTransaction<unknown | undefined>(STORE_IMAGES, 'readonly', (s) => s.get(id))
  if (raw == null) {
    return undefined
  }

  return normalizeStoredImageRecord(raw, `图片记录 ${id}`)
}

export async function getAllImageRecords(): Promise<StoredImage[]> {
  const rawRecords = await dbTransaction<unknown[]>(STORE_IMAGES, 'readonly', (s) => s.getAll())
  return rawRecords.map((raw, index) => normalizeStoredImageRecord(raw, `图片记录集合[${index}]`))
}

export async function getImageIdsByKind(kind: StoredImage['kind']): Promise<string[]> {
  const rawKeys = await dbTransaction<IDBValidKey[]>(STORE_IMAGES, 'readonly', (store) =>
    store.index(IMAGE_INDEX_KIND).getAllKeys(IDBKeyRange.only(kind)),
  )

  return rawKeys.map((rawKey, index) => {
    if (typeof rawKey === 'string' && rawKey.length > 0) {
      return rawKey
    }

    throw new Error(`kind=${kind} 命中的图片主键[${index}] 不是合法字符串`)
  })
}

export async function getImage(id: string): Promise<LegacyCompatibleStoredImage | undefined> {
  const record = await getImageRecord(id)
  if (!record) {
    return undefined
  }

  return toLegacyCompatibleStoredImage(record)
}

export async function getAllImages(): Promise<LegacyCompatibleStoredImage[]> {
  const records = await getAllImageRecords()
  return Promise.all(records.map((record) => toLegacyCompatibleStoredImage(record)))
}

export function putImageRecord(image: StoredImage): Promise<IDBValidKey> {
  const normalized = normalizeStoredImageRecord(image, `图片记录 ${image.id}`)
  return dbTransaction(STORE_IMAGES, 'readwrite', (s) => s.put(normalized))
}

export async function putImage(image: StoredImage | LegacyCompatibleImageInput): Promise<IDBValidKey> {
  if (isStoredImageRecord(image)) {
    return putImageRecord(image)
  }

  const record = await buildStoredImageFromStringInput(image.dataUrl, image, false)
  return putImageRecord(record)
}

export function deleteImage(id: string): Promise<undefined> {
  return dbTransaction(STORE_IMAGES, 'readwrite', (s) => s.delete(id))
}

export function clearImages(): Promise<undefined> {
  return dbTransaction(STORE_IMAGES, 'readwrite', (s) => s.clear())
}

// ===== Image hashing & dedup =====

export async function hashDataUrl(dataUrl: string): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    return hashDataUrlFallback(dataUrl)
  }

  const data = new TextEncoder().encode(dataUrl)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  return bufferToHex(hashBuffer)
}

export async function hashBlobContent(blob: Blob): Promise<string> {
  assertBlob(blob, 'blob')

  const bytes = new Uint8Array(await blob.arrayBuffer())
  if (!globalThis.crypto?.subtle) {
    return hashBytesFallback(bytes)
  }

  const hashBuffer = await crypto.subtle.digest('SHA-256', bytes)
  return bufferToHex(hashBuffer)
}

function hashDataUrlFallback(dataUrl: string): string {
  let h1 = 0x811c9dc5
  let h2 = 0x01000193

  for (let i = 0; i < dataUrl.length; i++) {
    const code = dataUrl.charCodeAt(i)
    h1 ^= code
    h1 = Math.imul(h1, 0x01000193)
    h2 ^= code
    h2 = Math.imul(h2, 0x27d4eb2d)
  }

  return `fallback-${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0).toString(16).padStart(8, '0')}`
}

function hashBytesFallback(bytes: Uint8Array): string {
  let h1 = 0x811c9dc5
  let h2 = 0x01000193

  for (const byte of bytes) {
    h1 ^= byte
    h1 = Math.imul(h1, 0x01000193)
    h2 ^= byte
    h2 = Math.imul(h2, 0x27d4eb2d)
  }

  return `fallback-${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0).toString(16).padStart(8, '0')}`
}

function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

// ===== Image storage =====

export async function storeImageBlob(blob: Blob, options: StoreImageBlobOptions = {}): Promise<string> {
  assertBlob(blob, 'blob')

  const contentHash = options.contentHash ?? await hashBlobContent(blob)
  const id = options.id ?? contentHash
  const existingById = await getImageRecord(id)
  if (existingById && !options.replaceExisting) {
    return id
  }

  if (!options.id) {
    const existingByContentHash = await findImageRecordByContentHash(contentHash)
    if (existingByContentHash && !options.replaceExisting) {
      return existingByContentHash.id
    }
  }

  const record = normalizeStoredImageRecord(
    {
      id,
      kind: 'local_blob',
      blob,
      createdAt: resolveWriteCreatedAt(options.createdAt, true),
      source: options.source,
      contentHash,
      mimeType: (options.mimeType ?? blob.type) || null,
      byteSize: options.byteSize ?? blob.size,
      width: options.width ?? null,
      height: options.height ?? null,
      thumbnailBlob: options.thumbnailBlob,
      thumbnailMimeType: (options.thumbnailMimeType ?? options.thumbnailBlob?.type) || null,
      thumbnailWidth: options.thumbnailWidth ?? null,
      thumbnailHeight: options.thumbnailHeight ?? null,
      migratedFromLegacyAt: options.migratedFromLegacyAt,
    },
    `图片记录 ${id}`,
  ) as StoredLocalBlobImage

  await putImageRecord(record)
  return id
}

export async function storeRemoteImage(url: string, options: StoreImageRecordOptions = {}): Promise<string> {
  const record = await buildRemoteUrlImage(url, options, true)
  const existing = await getImageRecord(record.id)
  if (existing && !options.replaceExisting) {
    return record.id
  }

  await putImageRecord(record)
  return record.id
}

export async function storeLegacyDataUrl(dataUrl: string, options: StoreImageRecordOptions = {}): Promise<string> {
  const record = await buildLegacyDataUrlImage(dataUrl, options, true)
  const existing = await getImageRecord(record.id)
  if (existing && !options.replaceExisting) {
    return record.id
  }

  await putImageRecord(record)
  return record.id
}

export async function getImageBlob(id: string): Promise<Blob | undefined> {
  const record = await getImageRecord(id)
  if (!record) {
    return undefined
  }

  if (record.kind === 'local_blob') {
    return record.blob
  }

  if (record.kind === 'legacy_data_url') {
    return dataUrlToBlob(record.dataUrl)
  }

  throw new Error(`图片 ${id} 为 remote_url，无法直接读取本地 Blob`)
}

export async function getImageDataUrl(id: string): Promise<string | undefined> {
  const record = await getImageRecord(id)
  if (!record) {
    return undefined
  }

  return resolveImageDataUrl(record)
}

export async function migrateLegacyImageRecord(id: string): Promise<StoredImage | undefined> {
  const record = await getImageRecord(id)
  if (!record) {
    return undefined
  }

  if (record.kind !== 'legacy_data_url') {
    return record
  }

  const blob = await dataUrlToBlob(record.dataUrl)
  const contentHash = await hashBlobContent(blob)
  let thumbnailBlob: Blob | null = null
  let thumbnailMimeType: string | null = null
  let thumbnailWidth: number | null = null
  let thumbnailHeight: number | null = null
  let width = record.width ?? null
  let height = record.height ?? null

  try {
    const thumbnail = await buildImageThumbnail(blob)
    thumbnailBlob = thumbnail.thumbnailBlob
    thumbnailMimeType = thumbnail.thumbnailMimeType
    thumbnailWidth = thumbnail.thumbnailWidth
    thumbnailHeight = thumbnail.thumbnailHeight
    width = width ?? thumbnail.width
    height = height ?? thumbnail.height
  } catch (error) {
    console.error(`legacy_data_url 图片迁移时生成缩略图失败：${id}`, error)
  }

  const migratedRecord = normalizeStoredImageRecord(
    {
      id: record.id,
      kind: 'local_blob',
      blob,
      createdAt: record.createdAt,
      source: record.source,
      contentHash,
      mimeType: (record.mimeType ?? blob.type) || null,
      byteSize: record.byteSize ?? blob.size,
      width,
      height,
      thumbnailBlob,
      thumbnailMimeType,
      thumbnailWidth,
      thumbnailHeight,
      migratedFromLegacyAt: Date.now(),
    },
    `图片记录 ${id}`,
  ) as StoredLocalBlobImage

  return finalizeMigratedLegacyImageRecord(id, record.dataUrl, migratedRecord)
}

/**
 * 兼容旧调用方：
 * - data URL -> legacy_data_url
 * - http(s) URL -> remote_url
 */
export async function storeImage(dataUrl: string, source: StoredImageSource = 'upload'): Promise<string> {
  if (isDataUrlString(dataUrl)) {
    return storeLegacyDataUrl(dataUrl, { source })
  }

  if (isRemoteImageUrl(dataUrl)) {
    return storeRemoteImage(dataUrl, { source })
  }

  throw new Error('storeImage 仅支持 data URL 或 http(s) 远程图片 URL')
}

// ===== Image normalization =====

function isStoredImageRecord(value: StoredImage | LegacyCompatibleImageInput): value is StoredImage {
  return isRecord(value) && typeof value.kind === 'string'
}

async function buildStoredImageFromStringInput(
  dataUrl: string,
  options: LegacyCompatibleImageInput,
  defaultCreatedAt: boolean,
): Promise<StoredImage> {
  if (isDataUrlString(dataUrl)) {
    return buildLegacyDataUrlImage(dataUrl, options, defaultCreatedAt)
  }

  if (isRemoteImageUrl(dataUrl)) {
    return buildRemoteUrlImage(dataUrl, options, defaultCreatedAt)
  }

  throw new Error('图片记录只支持 data URL 或 http(s) 远程图片 URL')
}

async function buildRemoteUrlImage(
  url: string,
  options: StoreImageRecordOptions,
  defaultCreatedAt: boolean,
): Promise<StoredRemoteUrlImage> {
  const remoteUrl = normalizeRemoteImageUrl(url)
  const id = options.id ?? await hashDataUrl(remoteUrl)
  return normalizeStoredImageRecord(
    {
      id,
      kind: 'remote_url',
      remoteUrl,
      createdAt: resolveWriteCreatedAt(options.createdAt, defaultCreatedAt),
      source: options.source,
      contentHash: options.contentHash ?? null,
      mimeType: options.mimeType ?? null,
      byteSize: options.byteSize ?? null,
      width: options.width ?? null,
      height: options.height ?? null,
    },
    `图片记录 ${id}`,
  ) as StoredRemoteUrlImage
}

async function buildLegacyDataUrlImage(
  rawDataUrl: string,
  options: StoreImageRecordOptions,
  defaultCreatedAt: boolean,
): Promise<StoredLegacyDataUrlImage> {
  const dataUrl = normalizeDataUrl(rawDataUrl)
  const id = options.id ?? await hashDataUrl(rawDataUrl)
  return normalizeStoredImageRecord(
    {
      id,
      kind: 'legacy_data_url',
      dataUrl,
      createdAt: resolveWriteCreatedAt(options.createdAt, defaultCreatedAt),
      source: options.source,
      contentHash: options.contentHash ?? null,
      mimeType: options.mimeType ?? extractDataUrlMimeType(dataUrl),
      byteSize: options.byteSize ?? getDataUrlByteSize(dataUrl),
      width: options.width ?? null,
      height: options.height ?? null,
    },
    `图片记录 ${id}`,
  ) as StoredLegacyDataUrlImage
}

async function toLegacyCompatibleStoredImage(record: StoredImage): Promise<LegacyCompatibleStoredImage> {
  if (record.kind === 'legacy_data_url') {
    return record
  }

  return {
    ...record,
    dataUrl: await resolveImageDataUrl(record),
  }
}

async function resolveImageDataUrl(record: StoredImage): Promise<string> {
  if (record.kind === 'legacy_data_url') {
    return record.dataUrl
  }

  if (record.kind === 'remote_url') {
    return record.remoteUrl
  }

  return blobToDataUrl(record.blob, (record.mimeType ?? record.blob.type) || null)
}

async function finalizeMigratedLegacyImageRecord(
  id: string,
  expectedDataUrl: string,
  migratedRecord: StoredLocalBlobImage,
): Promise<StoredImage | undefined> {
  const db = await openDB()

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_IMAGES, 'readwrite')
    const store = tx.objectStore(STORE_IMAGES)
    let resultRecord: StoredImage | undefined
    let settled = false

    const closeDB = () => {
      db.close()
    }

    const fail = (error: Error) => {
      if (!settled) {
        settled = true
        reject(error)
      }
      closeDB()
    }

    const getReq = store.get(id)
    getReq.onerror = () => {
      fail(getReq.error ?? new Error(`迁移 legacy_data_url 图片 ${id} 时读取当前记录失败`))
    }
    getReq.onsuccess = () => {
      const raw = getReq.result
      if (raw == null) {
        resultRecord = undefined
        return
      }

      try {
        const currentRecord = normalizeStoredImageRecord(raw, `迁移 legacy_data_url 图片 ${id} 时的当前记录`)
        if (
          currentRecord.kind !== 'legacy_data_url' ||
          currentRecord.dataUrl !== expectedDataUrl
        ) {
          resultRecord = currentRecord
          return
        }

        resultRecord = migratedRecord
        store.put(migratedRecord)
      } catch (error) {
        tx.abort()
        fail(error instanceof Error ? error : new Error(String(error)))
      }
    }

    tx.onabort = () => {
      fail(tx.error ?? new Error(`迁移 legacy_data_url 图片 ${id} 时事务已中止`))
    }
    tx.onerror = () => {
      fail(tx.error ?? new Error(`迁移 legacy_data_url 图片 ${id} 时事务失败`))
    }
    tx.oncomplete = () => {
      if (!settled) {
        settled = true
        resolve(resultRecord)
      }
      closeDB()
    }
  })
}

async function findImageRecordByContentHash(contentHash: string): Promise<StoredImage | undefined> {
  const normalizedHash = readNonEmptyString(contentHash, 'contentHash')
  const rawRecords = await dbTransaction<unknown[]>(STORE_IMAGES, 'readonly', (store) =>
    store.index(IMAGE_INDEX_CONTENT_HASH).getAll(IDBKeyRange.only(normalizedHash)),
  )

  const records = rawRecords.map((raw, index) =>
    normalizeStoredImageRecord(raw, `contentHash=${normalizedHash} 命中记录[${index}]`),
  )

  return (
    records.find((record) => record.kind === 'local_blob' && record.id === normalizedHash) ??
    records.find((record) => record.kind === 'local_blob') ??
    records[0]
  )
}

function normalizeStoredImageRecord(value: unknown, context: string): StoredImage {
  if (!isRecord(value)) {
    throw new Error(`${context} 不是对象，无法识别图片记录`)
  }

  if (typeof value.kind === 'string') {
    if (value.kind === 'local_blob') {
      return normalizeLocalBlobImage(value, context)
    }
    if (value.kind === 'remote_url') {
      return normalizeRemoteUrlImage(value, context)
    }
    if (value.kind === 'legacy_data_url') {
      return normalizeLegacyDataUrlImage(value, context)
    }
    throw new Error(`${context} 的 kind 不受支持：${value.kind}`)
  }

  if (typeof value.dataUrl === 'string') {
    return normalizeLegacyV1Image(value, context)
  }

  throw new Error(`${context} 缺少 kind/dataUrl，无法识别图片记录格式`)
}

function normalizeLocalBlobImage(record: Record<string, unknown>, context: string): StoredLocalBlobImage {
  const base = readImageBase(record, context, 'local_blob')
  const blob = readBlob(record.blob, `${context}.blob`)
  const thumbnailBlob = readOptionalBlob(record.thumbnailBlob, `${context}.thumbnailBlob`)
  const thumbnailMimeType = readOptionalNullableString(record.thumbnailMimeType, `${context}.thumbnailMimeType`)

  if (!base.contentHash) {
    throw new Error(`${context} 缺少 local_blob 必需的 contentHash`)
  }

  return {
    ...base,
    kind: 'local_blob',
    blob,
    contentHash: base.contentHash,
    mimeType: (base.mimeType ?? blob.type) || null,
    byteSize: base.byteSize ?? blob.size,
    thumbnailBlob,
    thumbnailMimeType: (thumbnailMimeType ?? thumbnailBlob?.type) || null,
    thumbnailWidth: readOptionalNullableNumber(record.thumbnailWidth, `${context}.thumbnailWidth`),
    thumbnailHeight: readOptionalNullableNumber(record.thumbnailHeight, `${context}.thumbnailHeight`),
    migratedFromLegacyAt: readOptionalNullableNumber(record.migratedFromLegacyAt, `${context}.migratedFromLegacyAt`),
  }
}

function normalizeRemoteUrlImage(record: Record<string, unknown>, context: string): StoredRemoteUrlImage {
  const base = readImageBase(record, context, 'remote_url')
  const remoteUrl = normalizeRemoteImageUrl(readNonEmptyString(record.remoteUrl, `${context}.remoteUrl`))
  return {
    ...base,
    kind: 'remote_url',
    remoteUrl,
  }
}

function normalizeLegacyDataUrlImage(record: Record<string, unknown>, context: string): StoredLegacyDataUrlImage {
  const base = readImageBase(record, context, 'legacy_data_url')
  const dataUrl = normalizeDataUrl(readNonEmptyString(record.dataUrl, `${context}.dataUrl`))
  return {
    ...base,
    kind: 'legacy_data_url',
    dataUrl,
    mimeType: base.mimeType ?? extractDataUrlMimeType(dataUrl),
    byteSize: base.byteSize ?? getDataUrlByteSize(dataUrl),
  }
}

function normalizeLegacyV1Image(record: Record<string, unknown>, context: string): StoredImage {
  const dataUrl = readNonEmptyString(record.dataUrl, `${context}.dataUrl`)
  const baseContext = `${context}（v1兼容记录）`

  if (isDataUrlString(dataUrl)) {
    return normalizeLegacyDataUrlImage(
      {
        ...record,
        kind: 'legacy_data_url',
      },
      baseContext,
    )
  }

  if (isRemoteImageUrl(dataUrl)) {
    return normalizeRemoteUrlImage(
      {
        ...record,
        kind: 'remote_url',
        remoteUrl: dataUrl,
      },
      baseContext,
    )
  }

  throw new Error(`${context} 的 dataUrl 既不是 data URL，也不是 http(s) 远程图片 URL`)
}

function readImageBase(
  record: Record<string, unknown>,
  context: string,
  kind: StoredImage['kind'],
): NormalizedImageBase {
  return {
    id: readNonEmptyString(record.id, `${context}.id`),
    kind,
    createdAt: readOptionalNumber(record.createdAt, `${context}.createdAt`),
    source: readOptionalImageSource(record.source, `${context}.source`),
    contentHash: readOptionalNullableString(record.contentHash, `${context}.contentHash`),
    mimeType: readOptionalNullableString(record.mimeType, `${context}.mimeType`),
    byteSize: readOptionalNullableNumber(record.byteSize, `${context}.byteSize`),
    width: readOptionalNullableNumber(record.width, `${context}.width`),
    height: readOptionalNullableNumber(record.height, `${context}.height`),
  }
}

function readOptionalImageSource(value: unknown, field: string): StoredImageSource | undefined {
  if (value === undefined) {
    return undefined
  }
  if (value === 'upload' || value === 'generated') {
    return value
  }
  throw new Error(`${field} 只允许 upload 或 generated`)
}

function readOptionalNumber(value: unknown, field: string): number | undefined {
  if (value === undefined) {
    return undefined
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  throw new Error(`${field} 必须是有限数字`)
}

function readOptionalNullableNumber(value: unknown, field: string): number | null | undefined {
  if (value === undefined || value === null) {
    return value
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  throw new Error(`${field} 必须是有限数字、null 或 undefined`)
}

function readOptionalNullableString(value: unknown, field: string): string | null | undefined {
  if (value === undefined || value === null) {
    return value
  }
  if (typeof value === 'string' && value.length > 0) {
    return value
  }
  throw new Error(`${field} 必须是非空字符串、null 或 undefined`)
}

function readNonEmptyString(value: unknown, field: string): string {
  if (typeof value === 'string' && value.length > 0) {
    return value
  }
  throw new Error(`${field} 必须是非空字符串`)
}

function readBlob(value: unknown, field: string): Blob {
  if (value instanceof Blob) {
    return value
  }
  throw new Error(`${field} 必须是 Blob`)
}

function readOptionalBlob(value: unknown, field: string): Blob | null | undefined {
  if (value === undefined || value === null) {
    return value
  }
  return readBlob(value, field)
}

function resolveWriteCreatedAt(createdAt: number | undefined, defaultNow: boolean): number | undefined {
  if (createdAt === undefined) {
    return defaultNow ? Date.now() : undefined
  }
  if (typeof createdAt === 'number' && Number.isFinite(createdAt)) {
    return createdAt
  }
  throw new Error('createdAt 必须是有限数字')
}

function assertBlob(value: unknown, field: string): asserts value is Blob {
  if (!(value instanceof Blob)) {
    throw new Error(`${field} 必须是 Blob`)
  }
}

function isDataUrlString(value: string): boolean {
  return /^data:[^,]+,.+/i.test(value.trim())
}

function normalizeDataUrl(value: string): string {
  const trimmed = value.trim()
  if (!isDataUrlString(trimmed)) {
    throw new Error('只支持合法的 data URL 图片内容')
  }
  return trimmed
}

function normalizeRemoteImageUrl(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) {
    throw new Error('远程图片 URL 不能为空')
  }

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    throw new Error('远程图片 URL 格式无效')
  }

  if (!/^https?:$/i.test(parsed.protocol)) {
    throw new Error('只支持 http 或 https 的远程图片 URL')
  }

  return parsed.toString()
}

function extractDataUrlMimeType(dataUrl: string): string | null {
  const normalized = normalizeDataUrl(dataUrl)
  const match = /^data:([^;,]+)[;,]/i.exec(normalized)
  return match?.[1] ?? null
}

function getDataUrlByteSize(dataUrl: string): number {
  const normalized = normalizeDataUrl(dataUrl)
  const parts = normalized.split(',', 2)
  if (parts.length !== 2) {
    throw new Error('data URL 缺少逗号分隔符')
  }
  if (!/;base64$/i.test(parts[0])) {
    throw new Error('仅支持 base64 data URL 图片内容')
  }

  const base64 = parts[1]
  const paddingLength = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0
  return Math.max(0, Math.floor((base64.length * 3) / 4) - paddingLength)
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const normalized = normalizeDataUrl(dataUrl)

  let response: Response
  try {
    response = await fetch(normalized)
  } catch (error) {
    throw new Error(`data URL 转 Blob 失败：${error instanceof Error ? error.message : String(error)}`)
  }

  if (!response.ok) {
    throw new Error(`data URL 转 Blob 失败：HTTP ${response.status}`)
  }

  return response.blob()
}

async function blobToDataUrl(blob: Blob, mimeType: string | null): Promise<string> {
  assertBlob(blob, 'blob')
  const blobToRead = mimeType && blob.type !== mimeType ? new Blob([blob], { type: mimeType }) : blob

  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('Blob 转 data URL 失败：读取结果不是字符串'))
        return
      }
      resolve(reader.result)
    }
    reader.onerror = () => reject(reader.error ?? new Error('Blob 转 data URL 失败'))
    reader.readAsDataURL(blobToRead)
  })
}
