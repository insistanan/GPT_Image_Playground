import { getAllTasks, putTask } from '../lib/db'
import type { TaskRecord } from '../types'
import {
  ERROR_LOG_POLL_INTERVAL_MS,
  ERROR_LOG_RETENTION_MS,
  RECYCLE_BIN_POLL_INTERVAL_MS,
  RECYCLE_BIN_RETENTION_MS,
} from './constants'
import {
  deleteImageAsset,
  listImageAssetRecords,
  startLegacyImageAssetMigrationSweep,
} from './imageAssets'
import { applyTaskPurgePlan } from './taskPurgeApply'
import { planOrphanImageCleanup, planTaskPurge } from './taskPurgePlanner'
import { useStore } from './state'
import { isTaskInRecycleBin } from './taskRecords'
import { repairCategoryStateFromTasks } from './taskStoreUtils'

let recycleBinJanitorId: number | null = null
let errorLogJanitorId: number | null = null

function resolveErrorDebugCreatedAt(
  task: Pick<TaskRecord, 'createdAt' | 'finishedAt' | 'errorDebug'>,
): number {
  if (typeof task.errorDebug?.createdAt === 'number' && Number.isFinite(task.errorDebug.createdAt)) {
    return task.errorDebug.createdAt
  }
  if (typeof task.finishedAt === 'number' && Number.isFinite(task.finishedAt)) {
    return task.finishedAt
  }
  return task.createdAt
}

async function cleanupExpiredErrorDebugLogs(tasks: TaskRecord[]): Promise<TaskRecord[]> {
  const cutoff = Date.now() - ERROR_LOG_RETENTION_MS
  const expiredTaskIds = new Set(
    tasks
      .filter((task) => task.errorDebug && resolveErrorDebugCreatedAt(task) < cutoff)
      .map((task) => task.id),
  )

  if (!expiredTaskIds.size) {
    return tasks
  }

  const updatedTasks = tasks.map((task) =>
    expiredTaskIds.has(task.id)
      ? {
          ...task,
          errorDebug: null,
        }
      : task,
  )

  await Promise.all(
    updatedTasks
      .filter((task) => expiredTaskIds.has(task.id))
      .map((task) => putTask(task)),
  )

  return updatedTasks
}

function ensureErrorLogJanitorStarted() {
  if (errorLogJanitorId != null) {
    return
  }

  errorLogJanitorId = window.setInterval(() => {
    void (async () => {
      const { tasks, setTasks } = useStore.getState()
      const updatedTasks = await cleanupExpiredErrorDebugLogs(tasks)
      if (updatedTasks !== tasks) {
        setTasks(updatedTasks)
      }
    })()
  }, ERROR_LOG_POLL_INTERVAL_MS)
}

async function cleanupOrphanImages(tasks: TaskRecord[]) {
  const { inputImages } = useStore.getState()
  const images = await listImageAssetRecords()
  const cleanupPlan = planOrphanImageCleanup({
    allTasks: tasks,
    allImageIds: images.map((image) => image.id),
    inputImageIds: inputImages.map((image) => image.id),
  })

  for (const imageId of cleanupPlan.imageIdsToDelete) {
    await deleteImageAsset(imageId)
  }
}

export async function initStore() {
  const tasks = await cleanupExpiredErrorDebugLogs(await getAllTasks())
  useStore.getState().setTasks(tasks)
  repairCategoryStateFromTasks(tasks)
  ensureErrorLogJanitorStarted()

  window.setTimeout(() => {
    void cleanupOrphanImages(tasks).finally(() => {
      startLegacyImageAssetMigrationSweep()
    })
  }, 1000)
}

export async function cleanupExpiredRecycleBinTasks() {
  const tasks = await getAllTasks()
  const cutoff = Date.now() - RECYCLE_BIN_RETENTION_MS
  const expiredTasks = tasks.filter(
    (task) => isTaskInRecycleBin(task) && (task.deletedAt ?? 0) <= cutoff,
  )

  if (!expiredTasks.length) {
    return 0
  }

  const { inputImages } = useStore.getState()
  const purgePlan = planTaskPurge({
    allTasks: tasks,
    taskIdsToDelete: expiredTasks.map((task) => task.id),
    inputImageIds: inputImages.map((image) => image.id),
  })

  if (!purgePlan.taskIdsToDelete.length) {
    return 0
  }

  await applyTaskPurgePlan(purgePlan)
  return purgePlan.taskIdsToDelete.length
}

export function startRecycleBinJanitor() {
  if (recycleBinJanitorId != null) {
    return () => {
      if (recycleBinJanitorId != null) {
        window.clearInterval(recycleBinJanitorId)
        recycleBinJanitorId = null
      }
    }
  }

  void cleanupExpiredRecycleBinTasks()
  recycleBinJanitorId = window.setInterval(() => {
    void cleanupExpiredRecycleBinTasks()
  }, RECYCLE_BIN_POLL_INTERVAL_MS)

  return () => {
    if (recycleBinJanitorId != null) {
      window.clearInterval(recycleBinJanitorId)
      recycleBinJanitorId = null
    }
  }
}
