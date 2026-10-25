import { type ChangeEventHandler, useEffect, useMemo, useRef, useState } from 'react'
import {
  confirmGalleryDeleteCategory,
  confirmGalleryClearFailedTasks,
  createSingleImageTasksFromFiles,
  isTaskInRecycleBin,
  runGalleryCreateCategory,
  runGalleryRenameCategory,
  useStore,
} from '@/store'
import {
  ALL_CATEGORY_FILTER,
  FAVORITES_CATEGORY_FILTER,
  UNCATEGORIZED_CATEGORY_FILTER,
  resolveCategoryFilterName,
} from '@/types'
import { type CategoryChipItem, type CategoryEditorMode } from './shared'
import { useCategoryLooping } from './useCategoryLooping'

type ScrollContainer = Window | HTMLElement

function isWindowScrollContainer(container: ScrollContainer): container is Window {
  return container === window
}

function isScrollableOverflow(value: string): boolean {
  return /(auto|scroll|overlay)/.test(value)
}

function resolveScrollContainer(element: HTMLElement | null): ScrollContainer {
  let current = element?.parentElement ?? null

  while (current) {
    const style = window.getComputedStyle(current)
    if (isScrollableOverflow(style.overflowY) || isScrollableOverflow(style.overflow)) {
      return current
    }
    current = current.parentElement
  }

  return window
}

function readScrollTop(container: ScrollContainer): number {
  return isWindowScrollContainer(container) ? window.scrollY : container.scrollTop
}

function readViewportHeight(container: ScrollContainer): number {
  return isWindowScrollContainer(container) ? window.innerHeight : container.clientHeight
}

export function useSearchBarState() {
  const tasks = useStore((state) => state.tasks)
  const categories = useStore((state) => state.categories)
  const activeCategoryFilter = useStore((state) => state.activeCategoryFilter)
  const setActiveCategoryFilter = useStore((state) => state.setActiveCategoryFilter)
  const searchQuery = useStore((state) => state.searchQuery)
  const setSearchQuery = useStore((state) => state.setSearchQuery)
  const filterStatus = useStore((state) => state.filterStatus)
  const setFilterStatus = useStore((state) => state.setFilterStatus)
  const taskView = useStore((state) => state.taskView)
  const setTaskView = useStore((state) => state.setTaskView)
  const galleryDisplayMode = useStore((state) => state.galleryDisplayMode)
  const setGalleryDisplayMode = useStore((state) => state.setGalleryDisplayMode)

  const [editorMode, setEditorMode] = useState<CategoryEditorMode>('idle')
  const [categoryInput, setCategoryInput] = useState('')
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768)
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false)
  const [showScrollTopButton, setShowScrollTopButton] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const scrollContainerRef = useRef<ScrollContainer>(window)
  const uploadImageInputRef = useRef<HTMLInputElement | null>(null)

  const activeGalleryTasks = useMemo(
    () => tasks.filter((task) => !isTaskInRecycleBin(task)),
    [tasks],
  )
  const recycleBinCount = useMemo(
    () => tasks.filter((task) => isTaskInRecycleBin(task)).length,
    [tasks],
  )
  const failedActiveTasks = useMemo(
    () => tasks.filter((task) => !isTaskInRecycleBin(task) && task.status === 'error'),
    [tasks],
  )
  const categoryIdSet = useMemo(
    () => new Set(categories.map((category) => category.id)),
    [categories],
  )
  const favoriteCount = useMemo(
    () => activeGalleryTasks.filter((task) => Boolean(task.isFavorite)).length,
    [activeGalleryTasks],
  )
  const uncategorizedCount = useMemo(
    () =>
      activeGalleryTasks.filter(
        (task) => !task.categoryId || !categoryIdSet.has(task.categoryId),
      ).length,
    [activeGalleryTasks, categoryIdSet],
  )
  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>()

    for (const category of categories) {
      counts.set(category.id, 0)
    }

    for (const task of activeGalleryTasks) {
      if (task.categoryId && counts.has(task.categoryId)) {
        counts.set(task.categoryId, (counts.get(task.categoryId) ?? 0) + 1)
      }
    }

    return counts
  }, [activeGalleryTasks, categories])

  const activeCategory = categories.find((category) => category.id === activeCategoryFilter) ?? null
  const activeCategoryLabel = resolveCategoryFilterName(activeCategoryFilter, categories)
  const generationTargetLabel =
    activeCategoryFilter === ALL_CATEGORY_FILTER ||
    activeCategoryFilter === FAVORITES_CATEGORY_FILTER
      ? '未分类'
      : activeCategoryLabel
  const currentViewCount = taskView === 'trash' ? recycleBinCount : activeGalleryTasks.length

  const categoryChipItems = useMemo<CategoryChipItem[]>(
    () => [
      { label: '全部', value: ALL_CATEGORY_FILTER, count: activeGalleryTasks.length },
      { label: '未分类', value: UNCATEGORIZED_CATEGORY_FILTER, count: uncategorizedCount },
      ...categories.map((category) => ({
        label: category.name,
        value: category.id,
        count: categoryCounts.get(category.id) ?? 0,
      })),
    ],
    [activeGalleryTasks.length, categories, categoryCounts, uncategorizedCount],
  )
  const categoryChipLayoutSignature = useMemo(
    () => categoryChipItems.map((item) => `${item.value}:${item.label}:${item.count}`).join('|'),
    [categoryChipItems],
  )

  const {
    categoryViewportRef,
    categorySegmentRef,
    categoryLoopEnabled,
    handleCategoryTrackScroll,
  } = useCategoryLooping({
    isMobile,
    taskView,
    categoryChipItems,
    categoryChipLayoutSignature,
  })

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768)
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    if (taskView !== 'gallery') {
      setEditorMode('idle')
      setCategoryInput('')
    }
  }, [taskView])

  useEffect(() => {
    const scrollContainer = resolveScrollContainer(rootRef.current)
    scrollContainerRef.current = scrollContainer

    const handleWindowScroll = () => {
      setShowScrollTopButton(
        readScrollTop(scrollContainer) > readViewportHeight(scrollContainer),
      )
    }

    handleWindowScroll()
    scrollContainer.addEventListener('scroll', handleWindowScroll, { passive: true })
    window.addEventListener('resize', handleWindowScroll)

    return () => {
      scrollContainer.removeEventListener('scroll', handleWindowScroll)
      window.removeEventListener('resize', handleWindowScroll)
    }
  }, [])

  useEffect(() => {
    if (editorMode === 'rename') {
      setCategoryInput(activeCategory?.name ?? '')
    }
  }, [activeCategory, editorMode])

  useEffect(() => {
    if (taskView !== 'gallery' && activeCategoryFilter === FAVORITES_CATEGORY_FILTER) {
      setActiveCategoryFilter(ALL_CATEGORY_FILTER)
    }
  }, [activeCategoryFilter, setActiveCategoryFilter, taskView])

  const resetEditor = () => {
    setEditorMode('idle')
    setCategoryInput('')
  }

  const handleSubmitCategory = async () => {
    if (editorMode === 'create') {
      if (!runGalleryCreateCategory(categoryInput)) {
        return
      }
      resetEditor()
      return
    }

    if (editorMode === 'rename' && activeCategory) {
      if (!(await runGalleryRenameCategory(activeCategory.id, categoryInput))) {
        return
      }

      resetEditor()
    }
  }

  const handleDeleteCategory = () => {
    if (!activeCategory) return

    confirmGalleryDeleteCategory(activeCategory.id)
  }

  const handleClearFailedTasks = () => {
    confirmGalleryClearFailedTasks(failedActiveTasks)
  }

  const handleUploadSingleImageTasks: ChangeEventHandler<HTMLInputElement> = (event) => {
    const { files } = event.currentTarget
    if (files?.length) {
      void createSingleImageTasksFromFiles(files)
    }
    event.currentTarget.value = ''
  }

  const activePanelFilterCount = [
    filterStatus !== 'all',
    Boolean(searchQuery.trim()),
    taskView === 'gallery' &&
      activeCategoryFilter !== ALL_CATEGORY_FILTER &&
      activeCategoryFilter !== FAVORITES_CATEGORY_FILTER,
  ].filter(Boolean).length

  return {
    isMobile,
    taskView,
    galleryDisplayMode,
    activeCategoryFilter,
    activeCategory,
    activeCategoryLabel,
    currentViewCount,
    filterStatus,
    searchQuery,
    editorMode,
    categoryInput,
    generationTargetLabel,
    activeGalleryCount: activeGalleryTasks.length,
    recycleBinCount,
    favoriteCount,
    failedActiveCount: failedActiveTasks.length,
    hasSearchQuery: Boolean(searchQuery.trim()),
    isFavoriteFilterActive:
      taskView === 'gallery' && activeCategoryFilter === FAVORITES_CATEGORY_FILTER,
    isFilterPanelOpen,
    activePanelFilterCount,
    showScrollTopButton,
    categoryChipItems,
    categoryViewportRef,
    categorySegmentRef,
    categoryLoopEnabled,
    rootRef,
    uploadImageInputRef,
    handleCategoryTrackScroll,
    setTaskView,
    setGalleryDisplayMode,
    setActiveCategoryFilter,
    setFilterStatus,
    setSearchQuery,
    setCategoryInput,
    setIsFilterPanelOpen,
    handleStartCreate: () => {
      setEditorMode('create')
      setIsFilterPanelOpen(true)
      setCategoryInput('')
    },
    handleStartRename: () => {
      if (!activeCategory) return
      setIsFilterPanelOpen(true)
      setEditorMode('rename')
      setCategoryInput(activeCategory.name)
    },
    handleDeleteCategory,
    handleSubmitCategory,
    handleClearFailedTasks,
    handleToggleFavoriteFilter: () => {
      if (taskView !== 'gallery') {
        setTaskView('gallery')
      }
      setActiveCategoryFilter(
        activeCategoryFilter === FAVORITES_CATEGORY_FILTER
          ? ALL_CATEGORY_FILTER
          : FAVORITES_CATEGORY_FILTER,
      )
    },
    handleScrollToTop: () => {
      const scrollContainer = scrollContainerRef.current
      if (isWindowScrollContainer(scrollContainer)) {
        window.scrollTo({ top: 0, behavior: 'smooth' })
        return
      }
      scrollContainer.scrollTo({ top: 0, behavior: 'smooth' })
    },
    handleOpenUploadImagePicker: () => uploadImageInputRef.current?.click(),
    handleUploadSingleImageTasks,
    resetEditor,
  }
}
