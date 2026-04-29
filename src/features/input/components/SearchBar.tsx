import { useEffect, useMemo, useState } from 'react'
import {
  createCategory,
  deleteCategory,
  removeTasks,
  renameCategory,
  useStore,
} from '../../../store'
import {
  ALL_CATEGORY_FILTER,
  FAVORITES_CATEGORY_FILTER,
  UNCATEGORIZED_CATEGORY_FILTER,
  isTaskInRecycleBin,
  resolveCategoryFilterName,
} from '../../../types'
import Select from '../../../shared/components/Select'

type CategoryEditorMode = 'idle' | 'create' | 'rename'

export default function SearchBar() {
  const tasks = useStore((s) => s.tasks)
  const categories = useStore((s) => s.categories)
  const activeCategoryFilter = useStore((s) => s.activeCategoryFilter)
  const setActiveCategoryFilter = useStore((s) => s.setActiveCategoryFilter)
  const searchQuery = useStore((s) => s.searchQuery)
  const setSearchQuery = useStore((s) => s.setSearchQuery)
  const filterStatus = useStore((s) => s.filterStatus)
  const setFilterStatus = useStore((s) => s.setFilterStatus)
  const taskView = useStore((s) => s.taskView)
  const setTaskView = useStore((s) => s.setTaskView)
  const setConfirmDialog = useStore((s) => s.setConfirmDialog)
  const showToast = useStore((s) => s.showToast)

  const [editorMode, setEditorMode] = useState<CategoryEditorMode>('idle')
  const [categoryInput, setCategoryInput] = useState('')

  const recycleBinCount = tasks.filter((task) => isTaskInRecycleBin(task)).length
  const failedActiveTasks = tasks.filter(
    (task) => !isTaskInRecycleBin(task) && task.status === 'error',
  )

  const activeGalleryTasks = useMemo(
    () => tasks.filter((task) => !isTaskInRecycleBin(task)),
    [tasks],
  )
  const categoryIdSet = useMemo(() => new Set(categories.map((category) => category.id)), [categories])
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

  useEffect(() => {
    if (taskView !== 'gallery') {
      setEditorMode('idle')
      setCategoryInput('')
    }
  }, [taskView])

  useEffect(() => {
    if (editorMode === 'rename') {
      setCategoryInput(activeCategory?.name ?? '')
    }
  }, [activeCategory, editorMode])

  const resetEditor = () => {
    setEditorMode('idle')
    setCategoryInput('')
  }

  const handleSubmitCategory = async () => {
    try {
      if (editorMode === 'create') {
        createCategory(categoryInput)
      } else if (editorMode === 'rename' && activeCategory) {
        await renameCategory(activeCategory.id, categoryInput)
      }
      resetEditor()
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), 'error')
    }
  }

  const handleDeleteCategory = () => {
    if (!activeCategory) return
    setConfirmDialog({
      title: '删除分类',
      message: `确定删除分类「${activeCategory.name}」吗？该分类下的项目会移入未分类。`,
      confirmText: '删除分类',
      action: () => {
        void deleteCategory(activeCategory.id).catch((error) => {
          showToast(error instanceof Error ? error.message : String(error), 'error')
        })
      },
    })
  }

  const renderCategoryChip = (label: string, value: string, count: number) => {
    const isActive = activeCategoryFilter === value
    return (
      <button
        key={value}
        type="button"
        onClick={() => setActiveCategoryFilter(value)}
        className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-sm transition ${
          isActive
            ? 'border-blue-500 bg-blue-500 text-white shadow-sm'
            : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-white/[0.08] dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.06]'
        }`}
      >
        <span>{label}</span>
        <span className={`text-xs ${isActive ? 'text-white/80' : 'text-gray-400 dark:text-gray-500'}`}>
          {count}
        </span>
      </button>
    )
  }

  return (
    <div className="mt-6 mb-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setTaskView('gallery')}
          className={`px-3 py-1.5 rounded-xl text-sm transition ${
            taskView === 'gallery'
              ? 'bg-blue-500 text-white shadow-sm'
              : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-white/[0.08] dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.06]'
          }`}
        >
          画廊
        </button>
        <button
          type="button"
          onClick={() => setTaskView('trash')}
          className={`px-3 py-1.5 rounded-xl text-sm transition ${
            taskView === 'trash'
              ? 'bg-blue-500 text-white shadow-sm'
              : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-white/[0.08] dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.06]'
          }`}
        >
          回收站{recycleBinCount > 0 ? ` (${recycleBinCount})` : ''}
        </button>

        {taskView === 'gallery' && failedActiveTasks.length > 0 && (
          <button
            type="button"
            onClick={() =>
              setConfirmDialog({
                title: '清理失败项目',
                message: `确定将全部 ${failedActiveTasks.length} 条失败项目移入回收站吗？它们的提示词、配置和图片会暂时保留，可在回收站恢复。`,
                confirmText: '移入回收站',
                action: () => removeTasks(failedActiveTasks),
              })
            }
            className="px-3 py-1.5 rounded-xl border border-red-200/80 bg-red-50 text-sm text-red-500 transition hover:bg-red-100/80 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/20"
          >
            一键删除失败项目
          </button>
        )}

        {taskView === 'trash' && (
          <span className="text-xs text-gray-400 dark:text-gray-500">
            回收站项目会每 10 分钟轮询一次，自动清理 15 天前的记录
          </span>
        )}
      </div>

      {taskView === 'gallery' && (
        <div className="rounded-2xl border border-gray-200/80 bg-white/80 px-4 py-3 backdrop-blur-sm dark:border-white/[0.08] dark:bg-gray-900/70">
            <div className="flex flex-wrap gap-2">
              {renderCategoryChip('全部', ALL_CATEGORY_FILTER, activeGalleryTasks.length)}
              {renderCategoryChip('收藏', FAVORITES_CATEGORY_FILTER, favoriteCount)}
              {renderCategoryChip('未分类', UNCATEGORIZED_CATEGORY_FILTER, uncategorizedCount)}
              {categories.map((category) =>
              renderCategoryChip(
                category.name,
                category.id,
                categoryCounts.get(category.id) ?? 0,
              ),
            )}
          </div>

          <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="text-xs text-gray-400 dark:text-gray-500">
              当前新项目默认归入：
              <span className="ml-1 rounded-full bg-blue-50 px-2 py-0.5 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300">
                {generationTargetLabel}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {editorMode === 'idle' ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setEditorMode('create')
                      setCategoryInput('')
                    }}
                    className="px-3 py-1.5 rounded-xl border border-gray-200 bg-white text-sm text-gray-600 transition hover:bg-gray-50 dark:border-white/[0.08] dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.06]"
                  >
                    新建分类
                  </button>
                  {activeCategory && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setEditorMode('rename')
                          setCategoryInput(activeCategory.name)
                        }}
                        className="px-3 py-1.5 rounded-xl border border-gray-200 bg-white text-sm text-gray-600 transition hover:bg-gray-50 dark:border-white/[0.08] dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.06]"
                      >
                        重命名
                      </button>
                      <button
                        type="button"
                        onClick={handleDeleteCategory}
                        className="px-3 py-1.5 rounded-xl border border-red-200/80 bg-red-50 text-sm text-red-500 transition hover:bg-red-100/80 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/20"
                      >
                        删除分类
                      </button>
                    </>
                  )}
                </>
              ) : (
                <>
                  <input
                    value={categoryInput}
                    onChange={(e) => setCategoryInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        void handleSubmitCategory()
                      }
                    }}
                    type="text"
                    placeholder={editorMode === 'create' ? '输入分类名称' : '输入新的分类名称'}
                    className="min-w-[12rem] px-3 py-1.5 rounded-xl border border-gray-200 bg-white text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 dark:border-white/[0.08] dark:bg-gray-900 dark:text-gray-200"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      void handleSubmitCategory()
                    }}
                    className="px-3 py-1.5 rounded-xl bg-blue-500 text-sm text-white transition hover:bg-blue-600"
                  >
                    保存
                  </button>
                  <button
                    type="button"
                    onClick={resetEditor}
                    className="px-3 py-1.5 rounded-xl border border-gray-200 bg-white text-sm text-gray-600 transition hover:bg-gray-50 dark:border-white/[0.08] dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.06]"
                  >
                    取消
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-3">
        <div className="relative w-32 flex-shrink-0 z-20">
          <Select
            value={filterStatus}
            onChange={(val) => setFilterStatus(val as any)}
            options={[
              { label: '全部状态', value: 'all' },
              { label: '已完成', value: 'done' },
              { label: '生成中', value: 'running' },
              { label: '失败', value: 'error' },
            ]}
            className="px-4 py-2.5 rounded-xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-white/[0.06] text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition"
          />
        </div>
        <div className="relative flex-1 z-10">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            type="text"
            placeholder={
              taskView === 'trash'
                ? '搜索回收站里的提示词、参数、供应商、分类...'
                : '搜索提示词、参数、供应商、分类...'
            }
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition"
          />
        </div>
      </div>
    </div>
  )
}
