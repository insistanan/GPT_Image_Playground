import { ALL_CATEGORY_FILTER } from "@/types"
import { normalizeCategoryList, resolveActiveCategoryFilter } from "@/store/domain"
import type { AppState, StoreSetter } from '../contracts'
import type { CategoryConfig, TaskRecord } from '@/types'

type TaskSlice = Pick<AppState,
  | 'tasks' | 'setTasks' | 'selectedTaskIds' | 'setSelectedTaskIds' | 'toggleTaskSelection'
  | 'clearSelectedTasks' | 'categories' | 'activeCategoryFilter' | 'setActiveCategoryFilter'
  | 'replaceCategoryState' | 'searchQuery' | 'setSearchQuery' | 'filterStatus' | 'setFilterStatus'
  | 'taskView' | 'setTaskView' | 'galleryDisplayMode' | 'setGalleryDisplayMode'
>

export function createTaskSlice(set: StoreSetter): TaskSlice {
  return {
    tasks: [],
    setTasks(tasks: TaskRecord[]) {
      set((state) => {
        const taskIds = new Set(tasks.map((t) => t.id))
        return {
          tasks,
          selectedTaskIds: state.selectedTaskIds.filter((id: string) => taskIds.has(id)),
          imageEditSession: state.imageEditSession && (state.imageEditSession.taskId === 'input-image' || taskIds.has(state.imageEditSession.taskId)) ? state.imageEditSession : null,
          detailTaskId: state.detailTaskId && taskIds.has(state.detailTaskId) ? state.detailTaskId : null,
        }
      })
    },
    selectedTaskIds: [],
    setSelectedTaskIds(ids: string[]) {
      set((state) => {
        const taskIds = new Set(state.tasks.map((t) => t.id))
        return { selectedTaskIds: Array.from(new Set(ids)).filter((id: string) => taskIds.has(id)) }
      })
    },
    toggleTaskSelection(id: string) {
      set((state) => {
        if (!state.tasks.some((t) => t.id === id)) return state
        const selectedTaskIds = state.selectedTaskIds.includes(id)
          ? state.selectedTaskIds.filter((taskId: string) => taskId !== id)
          : [...state.selectedTaskIds, id]
        return { selectedTaskIds }
      })
    },
    clearSelectedTasks() { set({ selectedTaskIds: [] }) },

    categories: [],
    activeCategoryFilter: ALL_CATEGORY_FILTER,
    setActiveCategoryFilter(activeCategoryFilter: string) {
      set((state) => ({ activeCategoryFilter: resolveActiveCategoryFilter(activeCategoryFilter, state.categories) }))
    },
    replaceCategoryState(categories: CategoryConfig[], activeCategoryFilter?: string) {
      set(() => {
        const normalizedCategories = normalizeCategoryList(categories)
        return { categories: normalizedCategories, activeCategoryFilter: resolveActiveCategoryFilter(activeCategoryFilter, normalizedCategories) }
      })
    },
    searchQuery: "",
    setSearchQuery(searchQuery: string) { set({ searchQuery }) },
    filterStatus: "all",
    setFilterStatus(filterStatus) { set({ filterStatus }) },
    taskView: "gallery",
    setTaskView(taskView) { set({ taskView, selectedTaskIds: [], imageEditSession: null, detailTaskId: null }) },
    galleryDisplayMode: "standard",
    setGalleryDisplayMode(galleryDisplayMode) { set({ galleryDisplayMode }) },
  }
}
