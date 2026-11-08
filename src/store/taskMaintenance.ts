import { getAllTasks, putTasks } from '@/lib/db'
import type { TaskRecord } from '@/types'
import {
  ERROR_LOG_POLL_INTERVAL_MS,
  ERROR_LOG_RETENTION_MS,
  RECYCLE_BIN_POLL_INTERVAL_MS,
  RECYCLE_BIN_RETENTION_MS,
} from './constants'
import { removeImage, listImages, startLegacyImageAssetMigrationSweep } from './imageAssets'
import { applyTaskPurgePlan } from './taskPurgeApply'
import { planOrphanImageCleanup, planTaskPurge } from './taskPurgePlanner'
import { useStore } from './state'
import { isTaskInRecycleBin, recoverInterruptedTask } from './taskRecords'
import { repairCategoryStateFromTasks } from './taskStoreUtils'
import { DataResetError, withDataMutation } from './dataMutation'

let recycleBinJanitorId: number | null = null
let errorLogJanitorId: number | null = null
let initialization: Promise<void> | null = null
let maintenanceVersion = 0
let migrationTimerId: number | null = null

function reportMaintenanceError(error: unknown) {
  if (error instanceof DataResetError) return
  const message = `本地数据维护失败：${error instanceof Error ? error.message : String(error)}`
  console.error(message, error)
  useStore.getState().showToast(message, 'error')
}

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

async function cleanupExpiredErrorDebugLogs(): Promise<void> {
  await withDataMutation(async () => {
    const { tasks } = useStore.getState()
    const cutoff = Date.now() - ERROR_LOG_RETENTION_MS
    const expiredTaskIds = new Set(
      tasks
        .filter((task) => task.errorDebug && resolveErrorDebugCreatedAt(task) < cutoff)
        .map((task) => task.id),
    )

    if (!expiredTaskIds.size) {
      return
    }

    const updatedTasks = tasks.map((task) =>
      expiredTaskIds.has(task.id)
        ? {
            ...task,
            errorDebug: null,
          }
        : task,
    )

    await putTasks(updatedTasks.filter((task) => expiredTaskIds.has(task.id)))
    const liveTasks = useStore.getState().tasks
    useStore.getState().setTasks(liveTasks.map((task) =>
      expiredTaskIds.has(task.id) && task.errorDebug && resolveErrorDebugCreatedAt(task) < cutoff
        ? { ...task, errorDebug: null }
        : task,
    ))
  })
}

function ensureErrorLogJanitorStarted() {
  if (errorLogJanitorId != null) {
    return
  }

  errorLogJanitorId = window.setInterval(() => {
    void cleanupExpiredErrorDebugLogs().catch(reportMaintenanceError)
  }, ERROR_LOG_POLL_INTERVAL_MS)
}

export async function cleanupOrphanImages() {
  await withDataMutation(async () => {
    const images = await listImages()
    const { tasks, inputImages } = useStore.getState()
    const cleanupPlan = planOrphanImageCleanup({
      allTasks: tasks,
      allImageIds: images.map((image) => image.id),
      inputImageIds: inputImages.map((image) => image.id),
    })

    for (const imageId of cleanupPlan.imageIdsToDelete) {
      await removeImage(imageId)
    }
  })
}

export function initStore(): Promise<void> {
  if (initialization) return initialization
  initialization = withDataMutation(async () => {
    const loadedTasks = await getAllTasks()
    const now = Date.now()
    const recoveredTasks = loadedTasks.map((task) => recoverInterruptedTask(task, now))
    await putTasks(recoveredTasks.filter((task, index) => task !== loadedTasks[index]))
    const liveTasks = useStore.getState().tasks
    const merged = new Map(recoveredTasks.map((task) => [task.id, task]))
    for (const task of liveTasks) merged.set(task.id, task)
    const tasks = [...merged.values()]
    useStore.getState().setTasks(tasks)
    repairCategoryStateFromTasks(tasks)
  }).catch((error) => {
    initialization = null
    throw error
  })
  return initialization
}

export async function cleanupExpiredRecycleBinTasks() {
  await initStore()
  return withDataMutation(async () => {
    const { tasks } = useStore.getState()
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
  })
}

export function startRecycleBinJanitor() {
  const version = ++maintenanceVersion
  const cleanup = () => {
    void cleanupExpiredRecycleBinTasks().catch(reportMaintenanceError)
  }
  if (recycleBinJanitorId != null) window.clearInterval(recycleBinJanitorId)
  recycleBinJanitorId = window.setInterval(cleanup, RECYCLE_BIN_POLL_INTERVAL_MS)
  void initStore().then(() => {
    if (version !== maintenanceVersion) return
    ensureErrorLogJanitorStarted()
    cleanup()
    void cleanupExpiredErrorDebugLogs().catch(reportMaintenanceError)
    migrationTimerId = window.setTimeout(() => {
      migrationTimerId = null
      void cleanupOrphanImages().then(() => {
        if (version === maintenanceVersion) startLegacyImageAssetMigrationSweep()
      }).catch(reportMaintenanceError)
    }, 1000)
  }).catch(reportMaintenanceError)

  return () => {
    if (version !== maintenanceVersion) return
    maintenanceVersion += 1
    if (recycleBinJanitorId != null) {
      window.clearInterval(recycleBinJanitorId)
      recycleBinJanitorId = null
    }
    if (errorLogJanitorId != null) {
      window.clearInterval(errorLogJanitorId)
      errorLogJanitorId = null
    }
    if (migrationTimerId != null) {
      window.clearTimeout(migrationTimerId)
      migrationTimerId = null
    }
  }
}
