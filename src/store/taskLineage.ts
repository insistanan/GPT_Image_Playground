import type { InputImage, TaskRecord } from '../types'

export interface TaskLineageItem {
  task: TaskRecord | null
  taskId: string
  relationImageId: string | null
  depth: number
  isMissing: boolean
  isLoop: boolean
}

function normalizeOptionalId(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function resolveInputImageParentRef(image: InputImage): {
  parentTaskId: string | null
  parentImageId: string | null
} {
  return {
    parentTaskId:
      normalizeOptionalId(image.lineageParentTaskId) ?? normalizeOptionalId(image.sourceTaskId),
    parentImageId:
      normalizeOptionalId(image.lineageParentImageId) ?? normalizeOptionalId(image.sourceImageId),
  }
}

export function resolveTaskParentFromInputImages(inputImages: InputImage[]): {
  parentTaskId: string | null
  parentImageId: string | null
} {
  const relatedImages = inputImages
    .map((image) => ({
      image,
      parent: resolveInputImageParentRef(image),
    }))
    .filter((item) => item.parent.parentTaskId)
  if (!relatedImages.length) {
    return {
      parentTaskId: null,
      parentImageId: null,
    }
  }

  const uniqueParentTaskIds = Array.from(
    new Set(
      relatedImages
        .map((item) => item.parent.parentTaskId)
        .filter((taskId): taskId is string => Boolean(taskId)),
    ),
  )

  if (uniqueParentTaskIds.length !== 1) {
    return {
      parentTaskId: null,
      parentImageId: null,
    }
  }

  const parentTaskId = uniqueParentTaskIds[0]
  const preferredImage =
    relatedImages.find(
      (item) => item.parent.parentTaskId === parentTaskId && item.parent.parentImageId,
    ) ?? relatedImages[0]

  return {
    parentTaskId,
    parentImageId: preferredImage.parent.parentImageId ?? preferredImage.image.id,
  }
}

export function buildTaskLineage(task: TaskRecord, tasks: TaskRecord[], maxDepth = 20): TaskLineageItem[] {
  const taskMap = new Map(tasks.map((item) => [item.id, item]))
  const visited = new Set<string>([task.id])
  const lineage: TaskLineageItem[] = []

  let currentTask: TaskRecord | null = task
  let depth = 1

  while (currentTask && depth <= maxDepth) {
    const parentTaskId = normalizeOptionalId(currentTask.parentTaskId)
    if (!parentTaskId) {
      break
    }

    if (visited.has(parentTaskId)) {
      lineage.push({
        task: null,
        taskId: parentTaskId,
        relationImageId: normalizeOptionalId(currentTask.parentImageId),
        depth,
        isMissing: false,
        isLoop: true,
      })
      break
    }

    visited.add(parentTaskId)
    const parentTask = taskMap.get(parentTaskId) ?? null
    lineage.push({
      task: parentTask,
      taskId: parentTaskId,
      relationImageId: normalizeOptionalId(currentTask.parentImageId),
      depth,
      isMissing: parentTask == null,
      isLoop: false,
    })

    if (!parentTask) {
      break
    }

    currentTask = parentTask
    depth += 1
  }

  return lineage
}
