import { useMemo } from 'react'
import {
  isTaskInRecycleBin,
  resolveTaskCategoryName,
  resolveTaskProviderName,
} from '@/store'
import {
  ALL_CATEGORY_FILTER,
  FAVORITES_CATEGORY_FILTER,
  UNCATEGORIZED_CATEGORY_FILTER,
  type CategoryConfig,
  type ProviderConfig,
  type TaskRecord,
  type TaskStatus,
  resolveCategoryFilterName,
} from '@/types'
import type { CategoryOption } from './shared'

interface UseTaskGridDerivedStateOptions {
  tasks: TaskRecord[]
  categories: CategoryConfig[]
  providers: ProviderConfig[]
  activeCategoryFilter: string
  searchQuery: string
  filterStatus: TaskStatus | 'all'
  taskView: 'gallery' | 'trash'
  selectedTaskIds: string[]
}

export function useTaskGridDerivedState(options: UseTaskGridDerivedStateOptions) {
  const {
    tasks,
    categories,
    providers,
    activeCategoryFilter,
    searchQuery,
    filterStatus,
    taskView,
    selectedTaskIds,
  } = options

  const categoryIdSet = useMemo(
    () => new Set(categories.map((category) => category.id)),
    [categories],
  )
  const sourceTasks = useMemo(
    () =>
      tasks.filter((task) =>
        taskView === 'trash' ? isTaskInRecycleBin(task) : !isTaskInRecycleBin(task),
      ),
    [taskView, tasks],
  )

  const filteredTasks = useMemo(() => {
    const sortedTasks = [...sourceTasks].sort((taskA, taskB) => {
      const timeA = taskView === 'trash' ? taskA.deletedAt ?? taskA.createdAt : taskA.createdAt
      const timeB = taskView === 'trash' ? taskB.deletedAt ?? taskB.createdAt : taskB.createdAt
      return timeB - timeA
    })
    const normalizedQuery = searchQuery.trim().toLowerCase()

    return sortedTasks.filter((task) => {
      const matchCategory =
        taskView !== 'gallery'
          ? true
          : activeCategoryFilter === ALL_CATEGORY_FILTER
            ? true
            : activeCategoryFilter === FAVORITES_CATEGORY_FILTER
              ? Boolean(task.isFavorite)
              : activeCategoryFilter === UNCATEGORIZED_CATEGORY_FILTER
                ? !task.categoryId || !categoryIdSet.has(task.categoryId)
                : task.categoryId === activeCategoryFilter

      if (!matchCategory) return false

      const matchStatus = filterStatus === 'all' || task.status === filterStatus
      if (!matchStatus) return false
      if (!normalizedQuery) return true

      const prompt = (task.prompt || '').toLowerCase()
      const paramsString = JSON.stringify(task.params).toLowerCase()
      const providerName = resolveTaskProviderName(task, providers).toLowerCase()
      const categoryName = resolveTaskCategoryName(task, categories).toLowerCase()

      return (
        prompt.includes(normalizedQuery) ||
        paramsString.includes(normalizedQuery) ||
        providerName.includes(normalizedQuery) ||
        categoryName.includes(normalizedQuery)
      )
    })
  }, [
    activeCategoryFilter,
    categories,
    categoryIdSet,
    filterStatus,
    providers,
    searchQuery,
    sourceTasks,
    taskView,
  ])

  const selectedIdSet = useMemo(() => new Set(selectedTaskIds), [selectedTaskIds])
  const visibleTaskIds = useMemo(() => filteredTasks.map((task) => task.id), [filteredTasks])
  const visibleTaskIdSet = useMemo(() => new Set(visibleTaskIds), [visibleTaskIds])
  const selectedTasks = useMemo(
    () => sourceTasks.filter((task) => selectedIdSet.has(task.id)),
    [sourceTasks, selectedIdSet],
  )
  const visibleSelectedCount = useMemo(
    () => visibleTaskIds.filter((taskId) => selectedIdSet.has(taskId)).length,
    [visibleTaskIds, selectedIdSet],
  )
  const selectedCount = selectedIdSet.size
  const allSelectedFavorited =
    selectedTasks.length > 0 && selectedTasks.every((task) => Boolean(task.isFavorite))
  const hasVisibleTasks = visibleTaskIds.length > 0
  const allVisibleSelected = hasVisibleTasks && visibleSelectedCount === visibleTaskIds.length
  const categoryOptions = useMemo<CategoryOption[]>(
    () => [
      { label: '未分类', value: UNCATEGORIZED_CATEGORY_FILTER },
      ...categories.map((category) => ({
        label: category.name,
        value: category.id,
      })),
    ],
    [categories],
  )
  const activeCategoryLabel = resolveCategoryFilterName(activeCategoryFilter, categories)

  return {
    categoryIdSet,
    sourceTasks,
    filteredTasks,
    selectedIdSet,
    visibleTaskIds,
    visibleTaskIdSet,
    selectedTasks,
    visibleSelectedCount,
    selectedCount,
    allSelectedFavorited,
    hasVisibleTasks,
    allVisibleSelected,
    categoryOptions,
    activeCategoryLabel,
  }
}
