import { putTask } from '../lib/db'
import type { TaskRecord } from '../types'
import {
  ALL_CATEGORY_FILTER,
  FAVORITES_CATEGORY_FILTER,
  UNCATEGORIZED_CATEGORY_FILTER,
} from '../types'
import { findCategoryById } from './domain'
import { saveImageAssetBlob } from './imageAssets'
import { useStore } from './state'
import { createSingleImageTaskRecord } from './taskRecords'

const SUPPORTED_SINGLE_IMAGE_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
])
const SUPPORTED_SINGLE_IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp'])

function isSupportedSingleImageFile(file: File): boolean {
  const normalizedType = file.type.toLowerCase()
  if (SUPPORTED_SINGLE_IMAGE_TYPES.has(normalizedType)) {
    return true
  }

  const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
  return SUPPORTED_SINGLE_IMAGE_EXTENSIONS.has(extension)
}

export async function createSingleImageTasksFromFiles(files: File[] | FileList): Promise<number> {
  const selectedFiles = Array.from(files)
  const acceptedFiles = selectedFiles.filter(isSupportedSingleImageFile)
  const rejectedCount = selectedFiles.length - acceptedFiles.length
  const { activeCategoryFilter, categories } = useStore.getState()
  const selectedCategory =
    activeCategoryFilter !== ALL_CATEGORY_FILTER &&
    activeCategoryFilter !== FAVORITES_CATEGORY_FILTER &&
    activeCategoryFilter !== UNCATEGORIZED_CATEGORY_FILTER
      ? findCategoryById(categories, activeCategoryFilter) ?? null
      : null

  if (!acceptedFiles.length) {
    if (rejectedCount > 0) {
      useStore.getState().showToast('仅支持 PNG、JPG、JPEG、WebP 图片加入画廊', 'error')
    }
    return 0
  }

  const createdTasks: TaskRecord[] = []
  let failedCount = 0

  for (const file of acceptedFiles) {
    try {
      const imageId = await saveImageAssetBlob(file, {
        source: 'upload',
        mimeType: file.type || null,
        byteSize: file.size,
      })

      const task = createSingleImageTaskRecord(imageId, selectedCategory)
      await putTask(task)
      createdTasks.push(task)
    } catch (error) {
      failedCount += 1
      console.error('单图任务创建失败', error)
    }
  }

  if (createdTasks.length > 0) {
    const { tasks, setTasks, setDetailTaskId } = useStore.getState()
    setTasks([...createdTasks.reverse(), ...tasks])
    if (createdTasks.length === 1) {
      setDetailTaskId(createdTasks[0].id)
    }
  }

  if (createdTasks.length > 0) {
    useStore
      .getState()
      .showToast(
        createdTasks.length === 1 ? '已添加单图任务到画廊' : `已添加 ${createdTasks.length} 个单图任务`,
        'success',
      )
  }

  if (rejectedCount > 0) {
    useStore
      .getState()
      .showToast(`已跳过 ${rejectedCount} 个不支持的文件`, 'info')
  }

  if (failedCount > 0) {
    useStore
      .getState()
      .showToast(`有 ${failedCount} 张图片创建单图任务失败`, 'error')
  }

  return createdTasks.length
}
