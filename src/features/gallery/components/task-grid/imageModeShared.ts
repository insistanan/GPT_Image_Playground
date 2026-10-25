import { parseRatio } from '@/lib/size'
import { getImageView, resolveTaskAppliedImageParam } from '@/store'
import type { TaskRecord } from '@/types'

export interface TaskMosaicDimensions {
  width: number
  height: number
}

export function resolveTaskCoverImageId(task: TaskRecord): string {
  if (!Array.isArray(task.outputImages) || task.outputImages.length === 0) {
    return ''
  }

  return task.status === 'running'
    ? task.outputImages[task.outputImages.length - 1] ?? ''
    : task.outputImages[0] ?? ''
}

export function resolveTaskMosaicDimensions(task: TaskRecord): TaskMosaicDimensions {
  const coverImageId = resolveTaskCoverImageId(task)
  const cachedMetadata = coverImageId ? getImageView(coverImageId).metadata : undefined
  if (cachedMetadata?.width && cachedMetadata?.height) {
    return {
      width: cachedMetadata.width,
      height: cachedMetadata.height,
    }
  }

  const parsedSize =
    parseRatio(resolveTaskAppliedImageParam(task, 'size') ?? task.params.size) ??
    parseRatio(task.params.size)

  if (parsedSize) {
    return {
      width: parsedSize.width,
      height: parsedSize.height,
    }
  }

  return { width: 1, height: 1 }
}

export function resolveTaskMosaicSeed(task: TaskRecord, index: number): number {
  const input = `${task.id}:${task.createdAt}:${task.outputImages.length}:${index}`
  let hash = 0

  for (let cursor = 0; cursor < input.length; cursor += 1) {
    hash = (hash * 33 + input.charCodeAt(cursor)) >>> 0
  }

  return hash
}
