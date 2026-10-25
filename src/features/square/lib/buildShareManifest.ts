import { getImageRecord } from '@/lib/db'
import { buildImageThumbnail } from '@/lib/imagePreview'
import type { PromptLibraryItem, StoredImage, TaskParams, TaskRecord } from '@/types'
import { isTaskInRecycleBin, resolveTaskKind } from '@/store/taskRecords'
import { buildTaskLineage } from '@/store/taskLineage'
import type { SquareCreateShareAssetInput, SquareCreateShareInput } from './squareApiClient'
import {
  SQUARE_ALLOWED_IMAGE_TYPES,
  SQUARE_MAX_ASSET_COUNT,
  SQUARE_MAX_IMAGE_BYTES,
  SQUARE_MAX_PROMPT_LENGTH,
  SQUARE_MAX_TASK_LINEAGE_ITEMS,
  SQUARE_MAX_THUMB_BYTES,
  SQUARE_MAX_TITLE_LENGTH,
} from './squareLimits'

type SquareAssetRole = 'output' | 'origin_input'

interface BuildTaskShareOptions {
  task: TaskRecord
  tasks: TaskRecord[]
  kind: 'task'
  title: string
  tags: string[]
}

interface BuildPromptShareOptions {
  item?: PromptLibraryItem
  title: string
  content: string
  tags: string[]
}

interface ManifestTaskNode {
  localTaskId: string
  taskKind: 'generation' | 'image'
  status: TaskRecord['status']
  isAborted: boolean
  parentTaskId: string | null
  parentImageId: string | null
  prompt: string
  params: TaskParams
  responseMeta: TaskRecord['responseMeta']
  providerName: string | null
  categoryName: string | null
  createdAt: number
  finishedAt: number | null
  elapsed: number | null
  inputAssetRefs: string[]
  outputAssetRefs: string[]
}

interface ManifestAsset {
  clientAssetId: string
  role: SquareAssetRole
  localImageId: string
  mimeType: string
  width: number | null
  height: number | null
  byteSize: number
  standaloneShareAllowed: boolean
}

function normalizeTitle(value: string, fallback: string): string {
  const normalized = value.trim() || fallback.trim() || '未命名分享'
  return normalized.slice(0, SQUARE_MAX_TITLE_LENGTH)
}

function normalizeTags(tags: string[]): string[] {
  return Array.from(
    new Set(
      tags
        .map((tag) => tag.trim())
        .filter(Boolean)
        .map((tag) => tag.slice(0, 24)),
    ),
  ).slice(0, 8)
}

function createClientRequestId(prefix: string): string {
  const randomPart = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)
  return `${prefix}_${Date.now().toString(36)}_${randomPart}`
}

function sanitizeAssetKey(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24) || 'asset'
}

function createClientAssetId(localImageId: string, role: SquareAssetRole, index: number): string {
  return `asset_${role}_${index}_${sanitizeAssetKey(localImageId)}`
}

function ensureTaskCanBeShared(task: TaskRecord) {
  if (isTaskInRecycleBin(task)) {
    throw new Error('回收站中的任务不能分享到广场')
  }

  if (task.status !== 'done') {
    throw new Error('只有成功完成的图任务可以分享到广场')
  }

  if (resolveTaskKind(task) === 'image') {
    throw new Error('用户自己上传的单图任务不能分享到广场')
  }

  if (!task.outputImages.length) {
    throw new Error('任务没有可分享的生成输出图')
  }
}

function resolveLineageTasks(entryTask: TaskRecord, tasks: TaskRecord[]): TaskRecord[] {
  const lineage = buildTaskLineage(entryTask, tasks, SQUARE_MAX_TASK_LINEAGE_ITEMS)
  const invalidItem = lineage.find((item) => item.isMissing || item.isLoop || !item.task)
  if (invalidItem) {
    throw new Error('任务链不完整，无法分享到广场')
  }

  const ordered = [entryTask, ...lineage.map((item) => item.task as TaskRecord)].reverse()
  if (ordered.length > SQUARE_MAX_TASK_LINEAGE_ITEMS) {
    throw new Error(`任务链超过 ${SQUARE_MAX_TASK_LINEAGE_ITEMS} 个节点，暂不支持分享`)
  }

  return ordered
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl)
  if (!response.ok) {
    throw new Error(`读取 data URL 图片失败：HTTP ${response.status}`)
  }
  return response.blob()
}

async function fetchRemoteImage(url: string): Promise<Blob> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`读取远程图片失败：HTTP ${response.status}`)
  }
  return response.blob()
}

async function readImageBlobForShare(record: StoredImage): Promise<Blob> {
  if (record.kind === 'local_blob') {
    return record.blob
  }

  if (record.kind === 'legacy_data_url') {
    return dataUrlToBlob(record.dataUrl)
  }

  return fetchRemoteImage(record.remoteUrl)
}

function assertImageBlobAllowed(blob: Blob, role: SquareAssetRole, mimeType: string | null | undefined) {
  if (!SQUARE_ALLOWED_IMAGE_TYPES.has((mimeType || blob.type).toLowerCase())) {
    throw new Error('广场暂只支持 PNG、JPG、JPEG、WebP 图片')
  }

  if (blob.size > SQUARE_MAX_IMAGE_BYTES) {
    throw new Error(`单张图片不能超过 ${Math.round(SQUARE_MAX_IMAGE_BYTES / 1024 / 1024)} MB`)
  }

  if (role === 'output' && blob.size <= 0) {
    throw new Error('输出图片内容为空，无法分享到广场')
  }
}

async function buildUploadAsset(
  localImageId: string,
  role: SquareAssetRole,
  index: number,
): Promise<{
  manifestAsset: ManifestAsset
  uploadAsset: SquareCreateShareAssetInput
}> {
  const record = await getImageRecord(localImageId)
  if (!record) {
    throw new Error(`找不到图片资产：${localImageId}`)
  }

  if (role === 'output' && record.source !== 'generated') {
    throw new Error('只能分享大模型生成的输出图，用户上传图片不能作为广场图发布')
  }

  const original = await readImageBlobForShare(record)
  assertImageBlobAllowed(original, role, record.mimeType)
  const originalWithType =
    record.mimeType && original.type !== record.mimeType
      ? new Blob([original], { type: record.mimeType })
      : original
  const thumbnail = await buildImageThumbnail(original, {
    maxEdge: 512,
    preferredMimeType: 'image/webp',
    quality: 0.76,
  })

  if (thumbnail.thumbnailBlob.size > SQUARE_MAX_THUMB_BYTES) {
    throw new Error(`缩略图不能超过 ${Math.round(SQUARE_MAX_THUMB_BYTES / 1024)} KB`)
  }

  const clientAssetId = createClientAssetId(localImageId, role, index)
  return {
    manifestAsset: {
      clientAssetId,
      role,
      localImageId,
      mimeType: original.type || record.mimeType || 'image/png',
      width: record.width ?? thumbnail.width ?? null,
      height: record.height ?? thumbnail.height ?? null,
      byteSize: original.size,
      standaloneShareAllowed: role === 'output',
    },
    uploadAsset: {
      clientAssetId,
      original: originalWithType,
      thumbnail: thumbnail.thumbnailBlob,
    },
  }
}

function collectOutputImageIds(entryTask: TaskRecord, lineageTasks: TaskRecord[]): string[] {
  return Array.from(
    new Set(
      [
        ...(entryTask.outputImages ?? []),
        ...lineageTasks.flatMap((task) => task.outputImages ?? []),
      ],
    ),
  )
}

function collectOriginInputImageIds(entryTask: TaskRecord, lineageTasks: TaskRecord[], outputImageIds: string[]): string[] {
  const originIds = new Set<string>()
  const outputIds = new Set(outputImageIds)

  for (const task of [entryTask, ...lineageTasks]) {
    for (const imageId of task.inputImageIds ?? []) {
      if (!outputIds.has(imageId)) {
        originIds.add(imageId)
      }
    }

    if (task.editSourceImageId && !outputIds.has(task.editSourceImageId)) {
      originIds.add(task.editSourceImageId)
    }
  }

  return Array.from(originIds)
}

export async function buildTaskShareInput(options: BuildTaskShareOptions): Promise<SquareCreateShareInput> {
  ensureTaskCanBeShared(options.task)

  const lineageTasks = resolveLineageTasks(options.task, options.tasks)
  const outputImageIds = collectOutputImageIds(options.task, lineageTasks)
  const originInputImageIds = collectOriginInputImageIds(options.task, lineageTasks, outputImageIds)
  const allAssetRefs = [...outputImageIds, ...originInputImageIds]
  if (!outputImageIds.length) {
    throw new Error('任务没有可分享的生成输出图')
  }
  if (allAssetRefs.length > SQUARE_MAX_ASSET_COUNT) {
    throw new Error(`单次分享最多包含 ${SQUARE_MAX_ASSET_COUNT} 个图片资产，请减少任务链输出图数量后再分享`)
  }

  const manifestAssets: ManifestAsset[] = []
  const uploadAssets: SquareCreateShareAssetInput[] = []
  const localImageIdToClientAssetId = new Map<string, string>()
  let assetIndex = 0

  for (const imageId of outputImageIds) {
    const asset = await buildUploadAsset(imageId, 'output', assetIndex)
    assetIndex += 1
    manifestAssets.push(asset.manifestAsset)
    uploadAssets.push(asset.uploadAsset)
    localImageIdToClientAssetId.set(imageId, asset.manifestAsset.clientAssetId)
  }

  for (const imageId of originInputImageIds) {
    const asset = await buildUploadAsset(imageId, 'origin_input', assetIndex)
    assetIndex += 1
    manifestAssets.push(asset.manifestAsset)
    uploadAssets.push(asset.uploadAsset)
    localImageIdToClientAssetId.set(imageId, asset.manifestAsset.clientAssetId)
  }

  const nodes: ManifestTaskNode[] = lineageTasks.map((task) => ({
    localTaskId: task.id,
    taskKind: resolveTaskKind(task),
    status: task.status,
    isAborted: Boolean(task.isAborted),
    parentTaskId: task.parentTaskId ?? null,
    parentImageId: task.parentImageId ?? null,
    prompt: task.prompt,
    params: task.params,
    responseMeta: task.responseMeta ?? null,
    providerName: task.providerName ?? null,
    categoryName: task.categoryName ?? null,
    createdAt: task.createdAt,
    finishedAt: task.finishedAt ?? null,
    elapsed: task.elapsed ?? null,
    inputAssetRefs: task.inputImageIds
      .map((imageId) => localImageIdToClientAssetId.get(imageId))
      .filter((assetId): assetId is string => Boolean(assetId)),
    outputAssetRefs: task.outputImages
      .map((imageId) => localImageIdToClientAssetId.get(imageId))
      .filter((assetId): assetId is string => Boolean(assetId)),
  }))

  const fallbackTitle = options.task.prompt.trim().slice(0, SQUARE_MAX_TITLE_LENGTH)
  return {
    manifest: {
      kind: options.kind,
      clientRequestId: createClientRequestId(options.kind),
      title: normalizeTitle(options.title, fallbackTitle),
      prompt: options.task.prompt.trim(),
      tags: normalizeTags(options.tags),
      source: {
        app: 'gpt-image-playground',
        schemaVersion: 1,
      },
      taskShare: {
        entryTaskId: options.task.id,
        entryOutputImageIds: options.task.outputImages
          .map((imageId) => localImageIdToClientAssetId.get(imageId))
          .filter((assetId): assetId is string => Boolean(assetId)),
        lineage: nodes,
        originAssets: manifestAssets
          .filter((asset) => asset.role === 'origin_input')
          .map((asset) => ({
            clientAssetId: asset.clientAssetId,
            role: asset.role,
            standaloneShareAllowed: false,
          })),
      },
      assets: manifestAssets,
    },
    assets: uploadAssets,
  }
}

export function buildPromptShareInput(options: BuildPromptShareOptions): SquareCreateShareInput {
  const content = options.content.trim()
  if (!content) {
    throw new Error('提示词内容不能为空')
  }
  if (content.length > SQUARE_MAX_PROMPT_LENGTH) {
    throw new Error(`提示词不能超过 ${SQUARE_MAX_PROMPT_LENGTH} 字符`)
  }

  return {
    manifest: {
      kind: 'prompt',
      clientRequestId: createClientRequestId('prompt'),
      title: normalizeTitle(options.title, options.item?.title ?? content.slice(0, SQUARE_MAX_TITLE_LENGTH)),
      prompt: content,
      tags: normalizeTags(options.tags),
      source: {
        app: 'gpt-image-playground',
        schemaVersion: 1,
      },
      promptShare: {
        localPromptId: options.item?.id ?? null,
        createdAt: options.item?.createdAt ?? Date.now(),
        updatedAt: options.item?.updatedAt ?? Date.now(),
      },
      assets: [],
    },
    assets: [],
  }
}
