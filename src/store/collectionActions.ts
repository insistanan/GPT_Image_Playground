import type { CategoryConfig, TaskRecord } from '../types'
import { UNCATEGORIZED_CATEGORY_FILTER } from '../types'
import {
  createCategoryConfig,
  ensureCategoryNameAvailable,
  findCategoryById,
  findProviderById,
  resolveActiveCategoryFilter,
} from './domain'
import {
  assignGalleryTasksFavorite,
  clearGalleryCategoryFromTasks,
  moveGalleryTasksToCategory,
  moveGalleryTasksToRecycleBin,
  purgeGalleryTasksPermanently,
  renameGalleryCategoryTasks,
  restoreGalleryTasksFromRecycleBin,
} from './galleryMutations'
import { useStore } from './state'
import { isTaskInRecycleBin } from './taskRecords'
import { buildReusableInputImagesFromTask } from './taskReuse'

export function createCategory(name: string): CategoryConfig {
  const { categories, showToast } = useStore.getState()
  const normalizedName = ensureCategoryNameAvailable(categories, name)
  const category = createCategoryConfig(normalizedName)

  useStore.setState({
    categories: [...categories, category],
    activeCategoryFilter: category.id,
  })

  showToast(`已创建分类「${category.name}」`, 'success')
  return category
}

export async function renameCategory(id: string, name: string) {
  const { categories, showToast } = useStore.getState()
  const category = findCategoryById(categories, id)
  if (!category) {
    throw new Error('分类不存在')
  }

  const normalizedName = ensureCategoryNameAvailable(categories, name, id)
  if (normalizedName === category.name) {
    showToast('分类名称未变化', 'info')
    return
  }

  const nextCategories = categories.map((item) =>
    item.id === id ? { ...item, name: normalizedName } : item,
  )

  useStore.setState({ categories: nextCategories })
  await renameGalleryCategoryTasks(id, normalizedName)
  showToast(`已重命名为「${normalizedName}」`, 'success')
}

export async function deleteCategory(id: string) {
  const { categories, activeCategoryFilter, showToast } = useStore.getState()
  const category = findCategoryById(categories, id)
  if (!category) {
    throw new Error('分类不存在')
  }

  const nextCategories = categories.filter((item) => item.id !== id)
  const nextFilter =
    activeCategoryFilter === id
      ? UNCATEGORIZED_CATEGORY_FILTER
      : resolveActiveCategoryFilter(activeCategoryFilter, nextCategories)

  useStore.setState({
    categories: nextCategories,
    activeCategoryFilter: nextFilter,
  })
  const { changedTasks } = await clearGalleryCategoryFromTasks(id)

  const movedCount = changedTasks.length
  showToast(
    movedCount > 0
      ? `已删除分类「${category.name}」，${movedCount} 条记录移入未分类`
      : `已删除分类「${category.name}」`,
    'success',
  )
}

export async function moveTasksToCategory(tasksToMove: TaskRecord[], categoryId: string | null) {
  const { showToast } = useStore.getState()
  if (!tasksToMove.length) {
    return 0
  }

  const { matchedTasks, changedTasks, targetCategoryName } = await moveGalleryTasksToCategory(
    tasksToMove,
    categoryId,
  )
  if (matchedTasks.length > 0 && !changedTasks.length) {
    showToast(targetCategoryName ? `所选记录已在分类「${targetCategoryName}」下` : '所选记录已在未分类中', 'info')
    return 0
  }

  if (!changedTasks.length) {
    return 0
  }

  showToast(
    targetCategoryName
      ? `已将 ${changedTasks.length} 条记录移到「${targetCategoryName}」`
      : `已将 ${changedTasks.length} 条记录移到未分类`,
    'success',
  )
  return changedTasks.length
}

export async function moveTaskToCategory(task: TaskRecord, categoryId: string | null) {
  return moveTasksToCategory([task], categoryId)
}

export async function purgeTasksPermanently(
  tasksToRemove: TaskRecord[],
  options?: {
    silent?: boolean
    successMessage?: string
  },
) {
  const { showToast } = useStore.getState()
  if (!tasksToRemove.length) {
    return 0
  }

  const { matchedTasks } = await purgeGalleryTasksPermanently(tasksToRemove)
  if (!matchedTasks.length) {
    return 0
  }

  if (!options?.silent) {
    showToast(
      options?.successMessage ??
        (matchedTasks.length === 1 ? '记录已彻底删除' : `已彻底删除 ${matchedTasks.length} 条记录`),
      'success',
    )
  }

  return matchedTasks.length
}

export async function reuseConfig(task: TaskRecord) {
  const { providers, setActiveProvider, setPrompt, setParams, setInputImages, showToast } =
    useStore.getState()
  const provider = findProviderById(providers, task.providerId)
  if (provider) {
    setActiveProvider(provider.id)
  }

  setPrompt(task.prompt)
  setParams(task.params)
  setInputImages(await buildReusableInputImagesFromTask(task))
  showToast('已复用配置到输入框', 'success')
}

export async function setTasksFavorite(tasksToUpdate: TaskRecord[], isFavorite: boolean) {
  const { showToast } = useStore.getState()
  if (!tasksToUpdate.length) {
    return 0
  }

  const { changedTasks } = await assignGalleryTasksFavorite(tasksToUpdate, isFavorite)
  if (!changedTasks.length) {
    showToast(isFavorite ? '所选记录已在收藏中' : '所选记录已取消收藏', 'info')
    return 0
  }

  showToast(
    isFavorite ? `已收藏 ${changedTasks.length} 条记录` : `已取消收藏 ${changedTasks.length} 条记录`,
    'success',
  )
  return changedTasks.length
}

export async function toggleTaskFavorite(task: TaskRecord) {
  return setTasksFavorite([task], !task.isFavorite)
}

export async function removeTasks(tasksToRemove: TaskRecord[]) {
  const { showToast } = useStore.getState()
  if (!tasksToRemove.length) {
    return
  }

  const { matchedTasks } = await moveGalleryTasksToRecycleBin(tasksToRemove)
  if (!matchedTasks.length) {
    return
  }

  showToast(
    matchedTasks.length === 1 ? '记录已移入回收站' : `已将 ${matchedTasks.length} 条记录移入回收站`,
    'success',
  )
}

export async function removeTask(task: TaskRecord) {
  await removeTasks([task])
}

export async function purgeTasks(tasksToPurge: TaskRecord[]) {
  const recycleBinTasks = tasksToPurge.filter((task) => isTaskInRecycleBin(task))
  if (!recycleBinTasks.length) {
    return 0
  }

  return purgeTasksPermanently(recycleBinTasks)
}

export async function purgeTask(task: TaskRecord) {
  return purgeTasks([task])
}

export async function restoreTasks(tasksToRestore: TaskRecord[]) {
  const { showToast } = useStore.getState()
  if (!tasksToRestore.length) {
    return
  }

  const { matchedTasks } = await restoreGalleryTasksFromRecycleBin(tasksToRestore)
  if (!matchedTasks.length) {
    return
  }

  showToast(
    matchedTasks.length === 1 ? '记录已恢复' : `已恢复 ${matchedTasks.length} 条记录`,
    'success',
  )
}

export async function restoreTask(task: TaskRecord) {
  await restoreTasks([task])
}
