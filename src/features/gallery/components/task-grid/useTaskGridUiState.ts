import { useEffect, useRef, useState } from 'react'
import { ALL_CATEGORY_FILTER, UNCATEGORIZED_CATEGORY_FILTER, type CategoryConfig, type TaskRecord } from '@/types'
import type { TaskContextMenuState } from './shared'

interface UseTaskGridUiStateOptions {
  categories: CategoryConfig[]
  activeCategoryFilter: string
}

export function useTaskGridUiState(options: UseTaskGridUiStateOptions) {
  const {
    categories,
    activeCategoryFilter,
  } = options
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const gridRef = useRef<HTMLDivElement | null>(null)
  const [batchCategoryTarget, setBatchCategoryTarget] = useState(UNCATEGORIZED_CATEGORY_FILTER)
  const [movingTask, setMovingTask] = useState<TaskRecord | null>(null)
  const [moveCategoryTarget, setMoveCategoryTarget] = useState(UNCATEGORIZED_CATEGORY_FILTER)
  const [contextMenuState, setContextMenuState] = useState<TaskContextMenuState | null>(null)

  useEffect(() => {
    const nextTarget =
      activeCategoryFilter !== ALL_CATEGORY_FILTER &&
      activeCategoryFilter !== UNCATEGORIZED_CATEGORY_FILTER &&
      categories.some((category) => category.id === activeCategoryFilter)
        ? activeCategoryFilter
        : UNCATEGORIZED_CATEGORY_FILTER

    setBatchCategoryTarget(nextTarget)
  }, [activeCategoryFilter, categories])

  useEffect(() => {
    if (!movingTask) return
    if (moveCategoryTarget === UNCATEGORIZED_CATEGORY_FILTER) return
    if (categories.some((category) => category.id === moveCategoryTarget)) return
    setMoveCategoryTarget(UNCATEGORIZED_CATEGORY_FILTER)
  }, [categories, moveCategoryTarget, movingTask])

  return {
    wrapperRef,
    gridRef,
    batchCategoryTarget,
    setBatchCategoryTarget,
    movingTask,
    setMovingTask,
    moveCategoryTarget,
    setMoveCategoryTarget,
    contextMenuState,
    setContextMenuState,
  }
}
