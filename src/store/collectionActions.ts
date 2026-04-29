import { deleteImage, deleteTask as dbDeleteTask, putTask } from '../lib/db'
import type { CategoryConfig, InputImage, TaskRecord } from '../types'
import { UNCATEGORIZED_CATEGORY_FILTER, isTaskInRecycleBin } from '../types'
import { deleteCachedImage, ensureImageCached } from './cache'
import {
  createCategoryConfig,
  ensureCategoryNameAvailable,
  findCategoryById,
  findProviderById,
  getTaskReferencedImageIds,
  resolveActiveCategoryFilter,
} from './domain'
import { useStore } from './state'
import { clearTaskUiState, collectReferencedImageIds } from './taskStoreUtils'

async function buildInputImagesFromTask(task: TaskRecord): Promise<InputImage[]> {
  const maskDataUrl = task.editMaskImageId ? await ensureImageCached(task.editMaskImageId) : null
  const images: InputImage[] = []

  for (const imageId of task.inputImageIds) {
    const dataUrl = await ensureImageCached(imageId)
    if (!dataUrl) {
      continue
    }

    const isEditSourceImage =
      Boolean(maskDataUrl) &&
      (task.editSourceImageId ? task.editSourceImageId === imageId : task.inputImageIds[0] === imageId)
    images.push({
      id: imageId,
      dataUrl,
      maskDataUrl: isEditSourceImage ? maskDataUrl : null,
      editSelection: isEditSourceImage ? task.editSelection ?? null : null,
      sourceTaskId: isEditSourceImage ? task.id : null,
      sourceImageId: isEditSourceImage ? task.editSourceImageId ?? imageId : null,
    })
  }

  return images
}

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
  const { categories, tasks, setTasks, showToast } = useStore.getState()
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
  const updatedTasks = tasks.map((task) =>
    task.categoryId === id ? { ...task, categoryName: normalizedName } : task,
  )
  const affectedTasks = updatedTasks.filter((task) => task.categoryId === id)

  useStore.setState({ categories: nextCategories })
  setTasks(updatedTasks)
  await Promise.all(affectedTasks.map((task) => putTask(task)))
  showToast(`已重命名为「${normalizedName}」`, 'success')
}

export async function deleteCategory(id: string) {
  const { categories, activeCategoryFilter, tasks, setTasks, showToast } = useStore.getState()
  const category = findCategoryById(categories, id)
  if (!category) {
    throw new Error('分类不存在')
  }

  const nextCategories = categories.filter((item) => item.id !== id)
  const updatedTasks = tasks.map((task) =>
    task.categoryId === id ? { ...task, categoryId: null, categoryName: null } : task,
  )
  const nextFilter =
    activeCategoryFilter === id
      ? UNCATEGORIZED_CATEGORY_FILTER
      : resolveActiveCategoryFilter(activeCategoryFilter, nextCategories)

  useStore.setState({
    categories: nextCategories,
    activeCategoryFilter: nextFilter,
  })
  setTasks(updatedTasks)
  await Promise.all(
    tasks
      .filter((task) => task.categoryId === id)
      .map((task) =>
        putTask({
          ...task,
          categoryId: null,
          categoryName: null,
        }),
      ),
  )

  const movedCount = tasks.filter((task) => task.categoryId === id).length
  showToast(
    movedCount > 0
      ? `已删除分类「${category.name}」，${movedCount} 条记录移入未分类`
      : `已删除分类「${category.name}」`,
    'success',
  )
}

export async function moveTasksToCategory(tasksToMove: TaskRecord[], categoryId: string | null) {
  const { categories, tasks, setTasks, showToast } = useStore.getState()
  if (!tasksToMove.length) {
    return 0
  }

  const targetCategory = categoryId ? findCategoryById(categories, categoryId) : undefined
  if (categoryId && !targetCategory) {
    throw new Error('目标分类不存在')
  }

  const taskIds = new Set(tasksToMove.map((task) => task.id))
  const matchedTasks = tasks.filter((task) => taskIds.has(task.id))
  if (!matchedTasks.length) {
    return 0
  }

  const nextCategoryId = targetCategory?.id ?? null
  const nextCategoryName = targetCategory?.name ?? null
  const changedTasks = matchedTasks.filter(
    (task) =>
      (task.categoryId ?? null) !== nextCategoryId ||
      (task.categoryName ?? null) !== nextCategoryName,
  )

  if (!changedTasks.length) {
    showToast(
      targetCategory ? `所选记录已在分类「${targetCategory.name}」下` : '所选记录已在未分类中',
      'info',
    )
    return 0
  }

  const changedTaskIds = new Set(changedTasks.map((task) => task.id))
  const nextTasks = tasks.map((task) =>
    changedTaskIds.has(task.id)
      ? {
          ...task,
          categoryId: nextCategoryId,
          categoryName: nextCategoryName,
        }
      : task,
  )

  setTasks(nextTasks)
  await Promise.all(
    changedTasks.map((task) =>
      putTask({
        ...task,
        categoryId: nextCategoryId,
        categoryName: nextCategoryName,
      }),
    ),
  )

  showToast(
    nextCategoryName
      ? `已将 ${changedTasks.length} 条记录移到「${nextCategoryName}」`
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
    taskUniverse?: TaskRecord[]
  },
) {
  const { tasks, setTasks, inputImages, showToast } = useStore.getState()
  if (!tasksToRemove.length) {
    return 0
  }

  const taskIdsToRemove = new Set(tasksToRemove.map((task) => task.id))
  const taskUniverse = options?.taskUniverse ?? tasks
  const matchedTasks = taskUniverse.filter((task) => taskIdsToRemove.has(task.id))
  if (!matchedTasks.length) {
    return 0
  }

  const taskImageIds = new Set<string>()
  for (const task of matchedTasks) {
    for (const id of getTaskReferencedImageIds(task)) {
      taskImageIds.add(id)
    }
  }

  const remainingStoreTasks = tasks.filter((task) => !taskIdsToRemove.has(task.id))
  const remainingTasks = taskUniverse.filter((task) => !taskIdsToRemove.has(task.id))
  setTasks(remainingStoreTasks)
  clearTaskUiState(taskIdsToRemove)
  await Promise.all(matchedTasks.map((task) => dbDeleteTask(task.id)))

  const stillUsed = collectReferencedImageIds(remainingTasks, inputImages)
  for (const imageId of taskImageIds) {
    if (!stillUsed.has(imageId)) {
      await deleteImage(imageId)
      deleteCachedImage(imageId)
    }
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
  setInputImages(await buildInputImagesFromTask(task))
  showToast('已复用配置到输入框', 'success')
}

export async function setTasksFavorite(tasksToUpdate: TaskRecord[], isFavorite: boolean) {
  const { tasks, setTasks, showToast } = useStore.getState()
  if (!tasksToUpdate.length) {
    return 0
  }

  const taskIds = new Set(tasksToUpdate.map((task) => task.id))
  const matchedTasks = tasks.filter((task) => taskIds.has(task.id))
  const changedTasks = matchedTasks.filter((task) => Boolean(task.isFavorite) !== isFavorite)
  if (!changedTasks.length) {
    showToast(isFavorite ? '所选记录已在收藏中' : '所选记录已取消收藏', 'info')
    return 0
  }

  const changedTaskIds = new Set(changedTasks.map((task) => task.id))
  const nextTasks = tasks.map((task) =>
    changedTaskIds.has(task.id)
      ? {
          ...task,
          isFavorite,
        }
      : task,
  )

  setTasks(nextTasks)
  await Promise.all(
    changedTasks.map((task) =>
      putTask({
        ...task,
        isFavorite,
      }),
    ),
  )

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
  const { tasks, setTasks, showToast } = useStore.getState()
  if (!tasksToRemove.length) {
    return
  }

  const taskIdsToRemove = new Set(tasksToRemove.map((task) => task.id))
  const matchedTasks = tasks.filter(
    (task) => taskIdsToRemove.has(task.id) && !isTaskInRecycleBin(task),
  )
  if (!matchedTasks.length) {
    return
  }

  const deletedAt = Date.now()
  const updatedTasks = tasks.map((task) =>
    taskIdsToRemove.has(task.id) && !isTaskInRecycleBin(task) ? { ...task, deletedAt } : task,
  )
  setTasks(updatedTasks)
  clearTaskUiState(taskIdsToRemove)
  await Promise.all(
    matchedTasks.map((task) =>
      putTask({
        ...task,
        deletedAt,
      }),
    ),
  )

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
  const { tasks, setTasks, showToast } = useStore.getState()
  if (!tasksToRestore.length) {
    return
  }

  const taskIdsToRestore = new Set(tasksToRestore.map((task) => task.id))
  const matchedTasks = tasks.filter(
    (task) => taskIdsToRestore.has(task.id) && isTaskInRecycleBin(task),
  )
  if (!matchedTasks.length) {
    return
  }

  const updatedTasks = tasks.map((task) =>
    taskIdsToRestore.has(task.id) && isTaskInRecycleBin(task) ? { ...task, deletedAt: null } : task,
  )
  setTasks(updatedTasks)
  clearTaskUiState(taskIdsToRestore)
  await Promise.all(
    matchedTasks.map((task) =>
      putTask({
        ...task,
        deletedAt: null,
      }),
    ),
  )

  showToast(
    matchedTasks.length === 1 ? '记录已恢复' : `已恢复 ${matchedTasks.length} 条记录`,
    'success',
  )
}

export async function restoreTask(task: TaskRecord) {
  await restoreTasks([task])
}
