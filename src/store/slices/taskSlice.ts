import { ALL_CATEGORY_FILTER } from "@/types"
import { normalizeCategoryList, resolveActiveCategoryFilter } from "@/store/domain"

export function createTaskSlice(set: any) {
  return {
    tasks: [] as any[],
    setTasks(tasks: any[]) {
      set((state: any) => {
        const taskIds = new Set(tasks.map((t: any) => t.id))
        return {
          tasks,
          selectedTaskIds: state.selectedTaskIds.filter((id: string) => taskIds.has(id)),
          imageEditSession: state.imageEditSession && taskIds.has(state.imageEditSession.taskId) ? state.imageEditSession : null,
          detailTaskId: state.detailTaskId && taskIds.has(state.detailTaskId) ? state.detailTaskId : null,
        }
      })
    },
    selectedTaskIds: [] as any[],
    setSelectedTaskIds(ids: string[]) {
      set((state: any) => {
        const taskIds = new Set(state.tasks.map((t: any) => t.id))
        return { selectedTaskIds: Array.from(new Set(ids)).filter((id: string) => taskIds.has(id)) }
      })
    },
    toggleTaskSelection(id: string) {
      set((state: any) => {
        if (!state.tasks.some((t: any) => t.id === id)) return state
        const selectedTaskIds = state.selectedTaskIds.includes(id)
          ? state.selectedTaskIds.filter((taskId: string) => taskId !== id)
          : [...state.selectedTaskIds, id]
        return { selectedTaskIds }
      })
    },
    clearSelectedTasks() { set({ selectedTaskIds: [] }) },

    categories: [] as any[],
    activeCategoryFilter: ALL_CATEGORY_FILTER as any ,
    setActiveCategoryFilter(activeCategoryFilter: string) {
      set((state: any) => ({ activeCategoryFilter: resolveActiveCategoryFilter(activeCategoryFilter, state.categories) }))
    },
    replaceCategoryState(categories: any, activeCategoryFilter?: string) {
      set(() => {
        const normalizedCategories = normalizeCategoryList(categories)
        return { categories: normalizedCategories, activeCategoryFilter: resolveActiveCategoryFilter(activeCategoryFilter, normalizedCategories) }
      })
    },
    searchQuery: "",
    setSearchQuery(searchQuery: string) { set({ searchQuery }) },
    filterStatus: "all" as any ,
    setFilterStatus(filterStatus: string) { set({ filterStatus }) },
    taskView: "gallery" as any ,
    setTaskView(taskView: string) { set({ taskView, selectedTaskIds: [], imageEditSession: null, detailTaskId: null }) },
    galleryDisplayMode: "standard" as any ,
    setGalleryDisplayMode(galleryDisplayMode: string) { set({ galleryDisplayMode }) },
  }
}
