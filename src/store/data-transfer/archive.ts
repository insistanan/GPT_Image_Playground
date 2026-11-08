import { zip, unzip, type AsyncZippable, type Unzipped } from 'fflate'
import type { ExportImageFileEntry, StoredImage } from '@/types'
import { hashBlobContent } from '@/lib/db'
import { getImageExtensionFromMimeType, getImageMimeTypeFromPath } from '@/lib/imageMime'
import { isRemoteImageUrl } from '@/lib/imageUrl'

export function toOwnedArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const ownedBytes = new Uint8Array(bytes.length)
  ownedBytes.set(bytes)
  return ownedBytes.buffer
}

export function zipArchive(files: AsyncZippable): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    zip(files, { level: 6 }, (error, bytes) => error ? reject(error) : resolve(bytes))
  })
}

export function unzipArchive(bytes: Uint8Array): Promise<Unzipped> {
  return new Promise((resolve, reject) => {
    unzip(bytes, (error, files) => error ? reject(error) : resolve(files))
  })
}
function dataUrlToBytes(dataUrl: string): { mimeType: string; bytes: Uint8Array } {
  const normalized = dataUrl.trim()
  const headerMatch = /^data:([^;,]+);base64,/i.exec(normalized)
  if (!headerMatch) {
    throw new Error('只支持 base64 data URL 图片导出')
  }

  const mimeType = headerMatch[1].toLowerCase()
  const base64 = normalized.slice(headerMatch[0].length)
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }

  return { mimeType, bytes }
}

async function blobToBytes(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer())
}

function resolveMimeTypeFromPath(filePath: string, fallbackMimeType?: string | null): string {
  return getImageMimeTypeFromPath(filePath, fallbackMimeType ?? 'image/png')
}

function createImageArchivePath(id: string, mimeType: string | null | undefined, suffix?: string): string {
  const ext = getImageExtensionFromMimeType(mimeType)
  return suffix ? `images/${id}.${suffix}.${ext}` : `images/${id}.${ext}`
}

function normalizeOptionalFiniteNumber(value: unknown): number | null | undefined {
  if (value === undefined || value === null) {
    return value
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('图片元数据必须是有限数字')
  return value
}

function normalizeOptionalSource(value: unknown): 'upload' | 'generated' | undefined {
  if (value === 'upload' || value === 'generated') {
    return value
  }
  if (value === undefined) return undefined
  throw new Error('图片 source 只允许 upload 或 generated')
}

function normalizeOptionalString(value: unknown): string | null | undefined {
  if (value === undefined || value === null) {
    return value
  }
  if (typeof value !== 'string' || !value.trim()) throw new Error('图片元数据必须是非空字符串')
  return value.trim()
}

export async function exportImageRecord(
  image: StoredImage,
  createdAt: number,
  zipFiles: Record<string, Uint8Array | [Uint8Array, { mtime: Date }]>,
): Promise<ExportImageFileEntry> {
  if (image.kind === 'remote_url') {
    return {
      kind: 'remote_url',
      url: image.remoteUrl,
      createdAt,
      source: image.source,
      mimeType: image.mimeType ?? null,
      width: image.width ?? null,
      height: image.height ?? null,
      byteSize: image.byteSize ?? null,
      contentHash: image.contentHash ?? null,
    }
  }

  if (image.kind === 'local_blob') {
    const mimeType = (image.mimeType ?? image.blob.type) || 'image/png'
    const path = createImageArchivePath(image.id, mimeType)
    zipFiles[path] = [await blobToBytes(image.blob), { mtime: new Date(createdAt) }]

    const thumbnailMimeType = image.thumbnailMimeType ?? image.thumbnailBlob?.type ?? null
    const thumbnailPath = image.thumbnailBlob
      ? createImageArchivePath(image.id, thumbnailMimeType, 'thumb')
      : undefined
    if (thumbnailPath && image.thumbnailBlob) {
      zipFiles[thumbnailPath] = [await blobToBytes(image.thumbnailBlob), { mtime: new Date(createdAt) }]
    }

    return {
      kind: 'local_blob',
      path,
      thumbnailPath,
      createdAt,
      source: image.source,
      mimeType,
      width: image.width ?? null,
      height: image.height ?? null,
      byteSize: image.byteSize ?? image.blob.size,
      contentHash: image.contentHash ?? null,
    }
  }

  const { mimeType, bytes } = dataUrlToBytes(image.dataUrl)
  const path = createImageArchivePath(image.id, image.mimeType ?? mimeType)
  zipFiles[path] = [bytes, { mtime: new Date(createdAt) }]

  return {
    kind: 'legacy_data_url',
    path,
    createdAt,
    source: image.source,
    mimeType: image.mimeType ?? mimeType,
    width: image.width ?? null,
    height: image.height ?? null,
    byteSize: image.byteSize ?? bytes.byteLength,
    contentHash: image.contentHash ?? null,
  }
}

/** 解码与哈希在开启写事务前完成，事务内只提交准备好的记录。 */
export async function prepareImportedImageRecord(
  id: string,
  info: ExportImageFileEntry,
  unzipped: Unzipped,
): Promise<StoredImage> {
  const base = {
    id,
    createdAt: normalizeOptionalFiniteNumber(info.createdAt) ?? Date.now(),
    source: normalizeOptionalSource(info.source),
    mimeType: normalizeOptionalString(info.mimeType),
    width: normalizeOptionalFiniteNumber(info.width),
    height: normalizeOptionalFiniteNumber(info.height),
  }
  const normalizedUrl = normalizeOptionalString(info.url)
  if (normalizedUrl) {
    if (!isRemoteImageUrl(normalizedUrl)) {
      throw new Error(`导入图片 ${id} 的 url 不是合法的 http(s) 地址`)
    }

    return {
      ...base,
      kind: 'remote_url',
      remoteUrl: normalizedUrl,
      byteSize: normalizeOptionalFiniteNumber(info.byteSize),
      contentHash: null,
    }
  }

  const normalizedPath = normalizeOptionalString(info.path)
  if (!normalizedPath) {
    throw new Error(`导入图片 ${id} 缺少 path/url，无法恢复`)
  }

  const originalBytes = unzipped[normalizedPath]
  if (!originalBytes) {
    throw new Error(`导入包缺少图片文件：${normalizedPath}`)
  }

  const originalMimeType = resolveMimeTypeFromPath(normalizedPath, base.mimeType)
  const originalBlob = new Blob([toOwnedArrayBuffer(originalBytes)], { type: originalMimeType })

  const normalizedThumbnailPath = normalizeOptionalString(info.thumbnailPath)
  let thumbnailBlob: Blob | null | undefined
  if (normalizedThumbnailPath) {
    const thumbnailBytes = unzipped[normalizedThumbnailPath]
    if (!thumbnailBytes) {
      throw new Error(`导入包缺少缩略图文件：${normalizedThumbnailPath}`)
    }

    thumbnailBlob = new Blob([toOwnedArrayBuffer(thumbnailBytes)], {
      type: resolveMimeTypeFromPath(normalizedThumbnailPath),
    })
  }

  return {
    ...base,
    kind: 'local_blob',
    blob: originalBlob,
    mimeType: base.mimeType || originalBlob.type,
    byteSize: originalBlob.size,
    contentHash: await hashBlobContent(originalBlob),
    thumbnailBlob,
    thumbnailMimeType: thumbnailBlob?.type || null,
  }
}

export async function assertImportedImageIdsCompatible(
  imported: StoredImage[], existing: StoredImage[],
): Promise<void> {
  const existingById = new Map(existing.map((image) => [image.id, image]))
  const identity = async (image: StoredImage) => {
    if (image.kind === 'remote_url') return `url:${new URL(image.remoteUrl).toString()}`
    const blob = image.kind === 'local_blob'
      ? image.blob
      : new Blob([toOwnedArrayBuffer(dataUrlToBytes(image.dataUrl).bytes)])
    return `blob:${await hashBlobContent(blob)}`
  }
  for (const image of imported) {
    const current = existingById.get(image.id)
    if (current && await identity(current) !== await identity(image)) {
      throw new Error(`图片 ID ${image.id} 与本地内容冲突，导入已停止，未覆盖本地图片`)
    }
  }
}
