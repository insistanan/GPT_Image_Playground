import { putTask } from "@/lib/db"

import type { CategoryConfig, TaskRecord } from "@/types"

import { UNCATEGORIZED_CATEGORY_FILTER } from "@/types"

import {

  createCategoryConfig,

  ensureCategoryNameAvailable,

  findCategoryById,

  findProviderById,

  resolveActiveCategoryFilter,

} from "./domain"

import { useStore } from "./state"

import { isTaskInRecycleBin } from "./taskRecords"

import { buildReusableInputImagesFromTask } from "./taskReuse"

import { applyTaskPurgePlan } from "./taskPurgeApply"

import { planTaskPurge } from "./taskPurgePlanner"



// ============================================================

// 内部：批量更新工具

// ============================================================



interface BatchSelection {

  allTasks: TaskRecord[]

  matchedTasks: TaskRecord[]

  matchedTaskIds: Set<string>

}



function buildSelection(

  tasksToMatch: TaskRecord[],

  options?: { predicate?: (task: TaskRecord) => boolean },

): BatchSelection {

  const allTasks = useStore.getState().tasks

  const requestedTaskIds = new Set(tasksToMatch.map((t) => t.id))

  const matchedTasks = allTasks.filter(

    (t) => requestedTaskIds.has(t.id) && (options?.predicate ? options.predicate(t) : true),

  )

  return { allTasks, matchedTasks, matchedTaskIds: new Set(matchedTasks.map((t) => t.id)) }

}



function updateMatched(selection: BatchSelection, mutate: (task: TaskRecord) => TaskRecord): TaskRecord[] {

  if (!selection.matchedTaskIds.size) return selection.allTasks

  return selection.allTasks.map((t) => (selection.matchedTaskIds.has(t.id) ? mutate(t) : t))

}



async function persistChanges(

  updatedTasks: TaskRecord[],

  changedTaskIds: Set<string>,

  options?: { clearSelection?: boolean },

) {

  const changedTasks = updatedTasks.filter((t) => changedTaskIds.has(t.id))

  useStore.getState().setTasks(updatedTasks)

  if (options?.clearSelection && changedTasks.length > 0) {

    const { setSelectedTaskIds, setDetailTaskId, setImageEditSession } = useStore.getState()

    const deletedIds = new Set(changedTasks.map((t) => t.id))

    setSelectedTaskIds(useStore.getState().selectedTaskIds.filter((id) => !deletedIds.has(id)))

    const detailId = useStore.getState().detailTaskId

    if (detailId && deletedIds.has(detailId)) {

      setDetailTaskId(null)

    }

  }

  await Promise.all(changedTasks.map((t) => putTask(t)))

}



// ============================================================

// 内部：批量操作实现

// ============================================================



async function batchSetFavorite(tasks: TaskRecord[], isFavorite: boolean) {

  const selection = buildSelection(tasks)

  const changedIds = new Set(

    selection.matchedTasks.filter((t) => Boolean(t.isFavorite) !== isFavorite).map((t) => t.id),

  )

  if (!changedIds.size) return selection.matchedTasks

  const tasks2 = selection.allTasks.map((t) => (changedIds.has(t.id) ? { ...t, isFavorite } : t))

  await persistChanges(tasks2, changedIds)

  return selection.matchedTasks

}



async function batchMoveToTrash(tasks: TaskRecord[]) {

  const selection = buildSelection(tasks, { predicate: (t) => !isTaskInRecycleBin(t) })

  if (!selection.matchedTasks.length) return selection.matchedTasks

  const deletedAt = Date.now()

  const tasks2 = selection.allTasks.map((t) => (selection.matchedTaskIds.has(t.id) ? { ...t, deletedAt } : t))

  await persistChanges(tasks2, selection.matchedTaskIds, { clearSelection: true })

  return selection.matchedTasks

}



async function batchRestore(tasks: TaskRecord[]) {

  const selection = buildSelection(tasks, { predicate: (t) => isTaskInRecycleBin(t) })

  if (!selection.matchedTasks.length) return selection.matchedTasks

  const tasks2 = selection.allTasks.map((t) => (selection.matchedTaskIds.has(t.id) ? { ...t, deletedAt: null } : t))

  await persistChanges(tasks2, selection.matchedTaskIds, { clearSelection: true })

  return selection.matchedTasks

}



async function batchMoveToCategory(tasks: TaskRecord[], categoryId: string | null) {

  const { categories } = useStore.getState()

  const target = categoryId ? findCategoryById(categories, categoryId) : undefined

  if (categoryId && !target) throw new Error("目标分类不存在")

  const nextId = target?.id ?? null

  const nextName = target?.name ?? null

  const selection = buildSelection(tasks)

  const changedIds = new Set(

    selection.matchedTasks.filter((t) => (t.categoryId ?? null) !== nextId || (t.categoryName ?? null) !== nextName).map((t) => t.id),

  )

  if (!changedIds.size) return { matchedTasks: selection.matchedTasks, targetName: nextName }

  const tasks2 = selection.allTasks.map((t) => (changedIds.has(t.id) ? { ...t, categoryId: nextId, categoryName: nextName } : t))

  await persistChanges(tasks2, changedIds)

  return { matchedTasks: selection.matchedTasks, targetName: nextName }

}



async function batchUpdateCategoryName(categoryId: string, categoryName: string) {

  const selection = buildSelection(useStore.getState().tasks, { predicate: (t) => t.categoryId === categoryId })

  if (!selection.matchedTasks.length) return selection.matchedTasks

  const tasks2 = selection.allTasks.map((t) => (selection.matchedTaskIds.has(t.id) ? { ...t, categoryName } : t))

  await persistChanges(tasks2, selection.matchedTaskIds)

  return selection.matchedTasks

}



async function batchClearCategory(categoryId: string) {

  const selection = buildSelection(useStore.getState().tasks, { predicate: (t) => t.categoryId === categoryId })

  if (!selection.matchedTasks.length) return selection.matchedTasks

  const tasks2 = selection.allTasks.map((t) => (selection.matchedTaskIds.has(t.id) ? { ...t, categoryId: null, categoryName: null } : t))

  await persistChanges(tasks2, selection.matchedTaskIds)

  return selection.matchedTasks

}



async function batchPurgePermanently(tasks: TaskRecord[]) {

  const { tasks: allTasks, inputImages } = useStore.getState()

  const selection = buildSelection(tasks)

  if (!selection.matchedTasks.length) return selection.matchedTasks

  const purgePlan = planTaskPurge({

    allTasks,

    taskIdsToDelete: Array.from(selection.matchedTaskIds),

    inputImageIds: inputImages.map((img) => img.id),

  })

  await applyTaskPurgePlan(purgePlan)

  return selection.matchedTasks

}



// ============================================================

// 公开 API：分类管理

// ============================================================



export function createCategory(name: string): CategoryConfig {

  const { categories, showToast } = useStore.getState()

  const normalizedName = ensureCategoryNameAvailable(categories, name)

  const category = createCategoryConfig(normalizedName)

  useStore.setState({ categories: [...categories, category], activeCategoryFilter: category.id })

  showToast(`已创建分类「${category.name}」`, "success")

  return category

}



export async function renameCategory(id: string, name: string) {

  const { categories, showToast } = useStore.getState()

  const category = findCategoryById(categories, id)

  if (!category) throw new Error("分类不存在")

  const normalizedName = ensureCategoryNameAvailable(categories, name, id)

  if (normalizedName === category.name) { showToast("分类名称未变化", "info"); return }

  const nextCategories = categories.map((c) => (c.id === id ? { ...c, name: normalizedName } : c))

  useStore.setState({ categories: nextCategories })

  await batchUpdateCategoryName(id, normalizedName)

  showToast(`已重命名为「${normalizedName}」`, "success")

}



export async function deleteCategory(id: string) {

  const { categories, activeCategoryFilter, showToast } = useStore.getState()

  const category = findCategoryById(categories, id)

  if (!category) throw new Error("分类不存在")

  const nextCategories = categories.filter((c) => c.id !== id)

  const nextFilter = activeCategoryFilter === id ? UNCATEGORIZED_CATEGORY_FILTER : resolveActiveCategoryFilter(activeCategoryFilter, nextCategories)

  useStore.setState({ categories: nextCategories, activeCategoryFilter: nextFilter })

  const m = await batchClearCategory(id)

  showToast(m.length > 0 ? `已删除分类「${category.name}」，${m.length} 条记录移入未分类` : `已删除分类「${category.name}」`, "success")

}



// ============================================================

// 公开 API：任务操作（自带 toast）

// ============================================================



export async function removeTasks(tasks: TaskRecord[]) {

  if (!tasks.length) return

  const m = await batchMoveToTrash(tasks)

  if (m.length) useStore.getState().showToast(m.length === 1 ? "记录已移入回收站" : `已将 ${m.length} 条记录移入回收站`, "success")

}



export async function restoreTasks(tasks: TaskRecord[]) {

  if (!tasks.length) return

  const m = await batchRestore(tasks)

  if (m.length) useStore.getState().showToast(m.length === 1 ? "记录已恢复" : `已恢复 ${m.length} 条记录`, "success")

}



export async function moveTasksToCategory(tasks: TaskRecord[], categoryId: string | null) {

  if (!tasks.length) return 0

  const { matchedTasks, targetName } = await batchMoveToCategory(tasks, categoryId) as { matchedTasks: TaskRecord[], targetName: string | null }

  const changed = matchedTasks.filter((t) => (t.categoryId ?? null) !== categoryId || (t.categoryName ?? null) !== targetName)

  if (!changed.length) {

    useStore.getState().showToast(targetName ? `所选记录已在分类「${targetName}」下` : "所选记录已在未分类中", "info")

    return 0

  }

  useStore.getState().showToast(targetName ? `已将 ${changed.length} 条记录移到「${targetName}」` : `已将 ${changed.length} 条记录移到未分类`, "success")

  return changed.length

}



export async function setTasksFavorite(tasks: TaskRecord[], isFavorite: boolean) {

  if (!tasks.length) return 0

  const m = await batchSetFavorite(tasks, isFavorite)

  const changed = m.filter((t) => Boolean(t.isFavorite) !== isFavorite)

  if (!changed.length) { useStore.getState().showToast(isFavorite ? "所选记录已在收藏中" : "所选记录已取消收藏", "info"); return 0 }

  useStore.getState().showToast(isFavorite ? `已收藏 ${changed.length} 条记录` : `已取消收藏 ${changed.length} 条记录`, "success")

  return changed.length

}



export async function purgeTasks(tasks: TaskRecord[]) {

  if (!tasks.length) return 0

  const recycleBinTasks = tasks.filter((t) => isTaskInRecycleBin(t))

  if (!recycleBinTasks.length) return 0

  const m = await batchPurgePermanently(recycleBinTasks)

  if (m.length) useStore.getState().showToast(m.length === 1 ? "记录已彻底删除" : `已彻底删除 ${m.length} 条记录`, "success")

  return m.length

}



export async function reuseConfig(task: TaskRecord) {

  const { providers, setActiveProvider, setPrompt, setParams, setInputImages, showToast } = useStore.getState()

  const provider = findProviderById(providers, task.providerId)

  if (provider) setActiveProvider(provider.id)

  setPrompt(task.prompt)

  setParams(task.params)

  setInputImages(await buildReusableInputImagesFromTask(task))

  showToast("已复用配置到输入框", "success")

}



export async function toggleTaskFavorite(task: TaskRecord) {

  return setTasksFavorite([task], !task.isFavorite)

}



export async function moveTaskToCategory(task: TaskRecord, categoryId: string | null) {

  return moveTasksToCategory([task], categoryId)

}



export async function removeTask(task: TaskRecord) { await removeTasks([task]) }

export async function restoreTask(task: TaskRecord) { await restoreTasks([task]) }

export async function purgeTask(task: TaskRecord) { await purgeTasks([task]) }

