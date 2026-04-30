import type {
  AppliedImageParams,
  AppliedTransportMeta,
  CategoryConfig,
  ImageEditSelection,
  ProviderConfig,
  TaskImageProgress,
  TaskKind,
  TaskParams,
  TaskRecord,
} from '../types'
import {
  UNCATEGORIZED_CATEGORY_NAME,
  UNKNOWN_TASK_PROVIDER_NAME,
} from './taskRecordConstants'
import { genId } from './constants'
import { DEFAULT_PARAMS } from './taskParams'

const LOCAL_IMAGE_TASK_PROVIDER_NAME = '本地导入'
type TaskRecordActionToastType = 'info' | 'error'
type DisplayTaskImageParamKey = keyof Pick<TaskParams, 'size' | 'quality' | 'output_format'>

export type TaskRetryPlan =
  | {
      action: 'blocked'
      message: string
      toastType: TaskRecordActionToastType
    }
  | {
      action: 'clone'
      task: TaskRecord
      message: string
    }
  | {
      action: 'restart'
      message: string
    }

export type TaskAbortPlan =
  | {
      action: 'blocked'
      message: string
      toastType: TaskRecordActionToastType
    }
  | {
      action: 'abort'
      message: string
    }

export type TaskRunOutcome = 'running' | 'done' | 'partial_error' | 'aborted' | 'error'

interface GenerationTaskRecordInput {
  providerId: string | null
  providerName: string
  categoryId: string | null
  categoryName: string | null
  parentTaskId: string | null
  parentImageId: string | null
  prompt: string
  params: TaskParams
  inputImageIds: string[]
  editMaskImageId: string | null
  editSourceImageId: string | null
  editSelection: ImageEditSelection | null
}

export function createGenerationTaskRecord(input: GenerationTaskRecordInput): TaskRecord {
  return {
    id: genId(),
    taskKind: 'generation',
    providerId: input.providerId,
    providerName: input.providerName,
    categoryId: input.categoryId,
    categoryName: input.categoryName,
    deletedAt: null,
    isFavorite: false,
    parentTaskId: input.parentTaskId,
    parentImageId: input.parentImageId,
    prompt: input.prompt,
    params: input.params,
    inputImageIds: input.inputImageIds,
    editMaskImageId: input.editMaskImageId,
    editSourceImageId: input.editSourceImageId,
    editSelection: input.editSelection,
    outputImages: [],
    responseMeta: null,
    errorDebug: null,
    isAborted: false,
    status: 'running',
    error: null,
    createdAt: Date.now(),
    finishedAt: null,
    elapsed: null,
  }
}

export function cloneTaskForRetry(task: TaskRecord): TaskRecord {
  return {
    ...task,
    id: genId(),
    taskKind: 'generation',
    deletedAt: null,
    isFavorite: false,
    parentTaskId: task.id,
    parentImageId: null,
    outputImages: [],
    responseMeta: null,
    errorDebug: null,
    isAborted: false,
    status: 'running',
    error: null,
    createdAt: Date.now(),
    finishedAt: null,
    elapsed: null,
  }
}

export function canRetryTask(task: TaskRecord): boolean {
  return (
    !isTaskInRecycleBin(task) &&
    task.status !== 'running' &&
    resolveTaskKind(task) !== 'image' &&
    (task.status === 'error' || task.status === 'partial_error')
  )
}

export function resolveTaskKind(task: Pick<TaskRecord, 'taskKind'>): TaskKind {
  return task.taskKind === 'image' ? 'image' : 'generation'
}

export function isTaskInRecycleBin(task: Pick<TaskRecord, 'deletedAt'>): boolean {
  return typeof task.deletedAt === 'number' && Number.isFinite(task.deletedAt)
}

export function resolveTaskStatusLabel(
  task: Pick<TaskRecord, 'status' | 'isAborted'>,
): '生成中' | '已完成' | '失败' | '已中止' | '异常' {
  if (task.status === 'done') return '已完成'
  if (task.isAborted) return '已中止'
  if (task.status === 'partial_error') return '异常'
  if (task.status === 'error') return '失败'
  return '生成中'
}

export function canEditTaskOutputs(
  task: Pick<TaskRecord, 'status' | 'outputImages'>,
): boolean {
  return (
    (task.status === 'done' || task.status === 'partial_error') &&
    Array.isArray(task.outputImages) &&
    task.outputImages.length > 0
  )
}

function normalizeOptionalText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

export function resolveTaskAppliedImageParam(
  task: Pick<TaskRecord, 'responseMeta'>,
  key: keyof AppliedImageParams,
): string | null {
  return normalizeOptionalText(task.responseMeta?.appliedImageParams?.[key])
}

export function resolveTaskDisplayImageParam(
  task: Pick<TaskRecord, 'params' | 'responseMeta'>,
  key: DisplayTaskImageParamKey,
): string {
  return resolveTaskAppliedImageParam(task, key) ?? task.params[key]
}

export function resolveTaskTransportMeta(
  task: Pick<TaskRecord, 'responseMeta'>,
): AppliedTransportMeta | null {
  const transport = task.responseMeta?.transport
  if (!transport) return null

  const requested =
    transport.requested === 'stream' || transport.requested === 'json' || transport.requested === 'auto'
      ? transport.requested
      : null
  const actual = transport.actual === 'stream' || transport.actual === 'json' ? transport.actual : null
  const fallbackFromStream =
    typeof transport.fallbackFromStream === 'boolean' ? transport.fallbackFromStream : null

  if (!requested && !actual && fallbackFromStream == null) {
    return null
  }

  return {
    requested,
    actual,
    fallbackFromStream,
  }
}

export function resolveTaskTransportLabel(
  task: Pick<TaskRecord, 'responseMeta'>,
): string | null {
  const transport = resolveTaskTransportMeta(task)
  if (!transport?.actual) return null

  if (transport.actual === 'stream') {
    return '流式'
  }

  return transport.fallbackFromStream ? 'JSON（降级）' : 'JSON'
}

export function resolveTaskProviderName(
  task: Pick<TaskRecord, 'providerId' | 'providerName'>,
  providers: ProviderConfig[],
): string {
  const snapshotName = task.providerName?.trim()
  if (snapshotName) return snapshotName

  if (task.providerId) {
    const provider = providers.find((item) => item.id === task.providerId)
    if (provider?.name?.trim()) {
      return provider.name.trim()
    }
  }

  return UNKNOWN_TASK_PROVIDER_NAME
}

export function resolveTaskCategoryName(
  task: Pick<TaskRecord, 'categoryId' | 'categoryName'>,
  categories: CategoryConfig[],
): string {
  if (task.categoryId) {
    const category = categories.find((item) => item.id === task.categoryId)
    if (category?.name?.trim()) {
      return category.name.trim()
    }
  }

  const snapshotName = task.categoryName?.trim()
  return snapshotName || UNCATEGORIZED_CATEGORY_NAME
}

export function resolveTaskImageProgress(
  task: Pick<TaskRecord, 'params' | 'outputImages'>,
): TaskImageProgress {
  const requestedTotal =
    typeof task.params?.n === 'number' && Number.isFinite(task.params.n)
      ? Math.max(1, Math.floor(task.params.n))
      : 1
  const completed = Array.isArray(task.outputImages) ? task.outputImages.length : 0
  const total = Math.max(requestedTotal, completed, 1)

  return {
    completed,
    total,
    countLabel: total > 1 ? `${completed}/${total}` : null,
  }
}

export function resolveTaskRunOutcome(
  task: Pick<TaskRecord, 'status' | 'isAborted'>,
): TaskRunOutcome {
  if (task.status === 'done') {
    return 'done'
  }
  if (task.isAborted) {
    return 'aborted'
  }
  if (task.status === 'partial_error') {
    return 'partial_error'
  }
  if (task.status === 'error') {
    return 'error'
  }
  return 'running'
}

export function isTaskRunExceptional(task: Pick<TaskRecord, 'status'>): boolean {
  return task.status === 'error' || task.status === 'partial_error'
}

export function resolveTaskRetryPlan(task: TaskRecord): TaskRetryPlan {
  if (isTaskInRecycleBin(task)) {
    return {
      action: 'blocked',
      message: '回收站中的任务无法重试',
      toastType: 'error',
    }
  }

  if (task.status === 'running') {
    return {
      action: 'blocked',
      message: '该任务正在进行中',
      toastType: 'info',
    }
  }

  if (resolveTaskKind(task) === 'image') {
    return {
      action: 'blocked',
      message: '单图任务不支持重试生成',
      toastType: 'info',
    }
  }

  if (task.status === 'partial_error') {
    return {
      action: 'clone',
      task: cloneTaskForRetry(task),
      message: '已新建重试任务',
    }
  }

  if (task.status === 'error') {
    return {
      action: 'restart',
      message: '已开始重试',
    }
  }

  return {
    action: 'blocked',
    message: '当前任务不支持重试',
    toastType: 'info',
  }
}

export function resolveTaskAbortPlan(task: TaskRecord): TaskAbortPlan {
  if (isTaskInRecycleBin(task)) {
    return {
      action: 'blocked',
      message: '回收站中的任务无法中止',
      toastType: 'error',
    }
  }

  if (task.status !== 'running') {
    return {
      action: 'blocked',
      message: '该任务当前不在生成中',
      toastType: 'info',
    }
  }

  return {
    action: 'abort',
    message: '正在中止任务...',
  }
}

export function createSingleImageTaskRecord(
  imageId: string,
  category: Pick<CategoryConfig, 'id' | 'name'> | null,
): TaskRecord {
  const now = Date.now()

  return {
    id: genId(),
    taskKind: 'image',
    providerId: null,
    providerName: LOCAL_IMAGE_TASK_PROVIDER_NAME,
    categoryId: category?.id ?? null,
    categoryName: category?.name ?? null,
    deletedAt: null,
    isFavorite: false,
    parentTaskId: null,
    parentImageId: null,
    prompt: '',
    params: { ...DEFAULT_PARAMS, n: 1 },
    inputImageIds: [],
    editMaskImageId: null,
    editSourceImageId: null,
    editSelection: null,
    outputImages: [imageId],
    responseMeta: null,
    errorDebug: null,
    isAborted: false,
    status: 'done',
    error: null,
    createdAt: now,
    finishedAt: now,
    elapsed: 0,
  }
}
