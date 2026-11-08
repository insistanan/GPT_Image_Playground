import type { StoredImage, TaskRecord } from '@/types'
import { normalizeStoredImageRecord } from './images'
import { STORE_IMAGES, STORE_TASKS, writeDbBatch } from './schema'

/** 图片和它们的任务引用要么全部提交，要么全部回滚。 */
export async function commitImportedRecords(tasks: TaskRecord[], images: StoredImage[]): Promise<void> {
  const records = images.map((image) => normalizeStoredImageRecord(image, `导入图片 ${image.id}`))
  await writeDbBatch([STORE_TASKS, STORE_IMAGES], (transaction) => {
    const imageStore = transaction.objectStore(STORE_IMAGES)
    const taskStore = transaction.objectStore(STORE_TASKS)
    for (const record of records) imageStore.add(record)
    for (const task of tasks) taskStore.add(task)
  })
}
