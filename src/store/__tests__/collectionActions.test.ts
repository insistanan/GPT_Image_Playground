import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_PARAMS } from '@/types'
import type { AppState } from '../contracts'
import { createCategory, deleteCategory, moveTasksToCategory, renameCategory } from '../collectionActions'

type CategoryTestState = Pick<AppState, 'categories' | 'activeCategoryFilter' | 'tasks' | 'setTasks' | 'showToast'>

const deps = vi.hoisted(() => {
  const state: CategoryTestState = {
    categories: [],
    activeCategoryFilter: '',
    tasks: [],
    setTasks: vi.fn(),
    showToast: vi.fn(),
  }
  return { state, putTasks: vi.fn() }
})
vi.mock('../state', () => ({
  useStore: {
    getState: () => deps.state,
    setState: (patch: Partial<CategoryTestState> | ((state: CategoryTestState) => Partial<CategoryTestState>)) => {
      Object.assign(deps.state, typeof patch === 'function' ? patch(deps.state) : patch)
    },
  },
}))
vi.mock('@/lib/db', () => ({ putTasks: deps.putTasks, putTask: vi.fn() }))
vi.mock('../taskReuse', () => ({ buildReusableInputImagesFromTask: vi.fn() }))
vi.mock('../taskPurgeApply', () => ({ applyTaskPurgePlan: vi.fn() }))

beforeEach(() => {
  vi.resetAllMocks()
  deps.putTasks.mockResolvedValue(undefined)
  deps.state = {
    categories: [{ id: 'category-1', name: '原分类', createdAt: 1 }],
    activeCategoryFilter: 'category-1',
    tasks: [{
      id: 'task-1', categoryId: 'category-1', categoryName: '原分类',
      prompt: '测试', params: { ...DEFAULT_PARAMS }, inputImageIds: [], outputImages: [],
      status: 'done', error: null, createdAt: 1, finishedAt: 2, elapsed: 1,
    }],
    setTasks: (tasks) => { deps.state.tasks = tasks },
    showToast: vi.fn(),
  }
})

describe('分类操作的队列边界', () => {
  it('删除完成后，排队的移动操作不能写回已删除的分类', async () => {
    let started!: () => void
    let release!: () => void
    const writing = new Promise<void>((resolve) => { started = resolve })
    const gate = new Promise<void>((resolve) => { release = resolve })
    deps.putTasks.mockImplementationOnce(async () => {
      started()
      await gate
    })

    const deletion = deleteCategory('category-1')
    await writing
    const move = moveTasksToCategory(deps.state.tasks, 'category-1')
    const failure = expect(move).rejects.toThrow('目标分类不存在')
    release()
    await deletion
    await failure

    expect(deps.state.categories).toEqual([])
    expect(deps.state.tasks[0]).toMatchObject({ categoryId: null, categoryName: null })
    expect(deps.putTasks).toHaveBeenCalledTimes(1)
  })

  it('重命名落库期间创建同名分类时，在执行时重新校验名称', async () => {
    let started!: () => void
    let release!: () => void
    const writing = new Promise<void>((resolve) => { started = resolve })
    const gate = new Promise<void>((resolve) => { release = resolve })
    deps.putTasks.mockImplementationOnce(async () => {
      started()
      await gate
    })

    const rename = renameCategory('category-1', '新分类')
    await writing
    const creation = createCategory('新分类')
    const failure = expect(creation).rejects.toThrow('分类名称已存在')
    release()
    await rename
    await failure

    expect(deps.state.categories).toHaveLength(1)
    expect(deps.state.categories[0].name).toBe('新分类')
    expect(deps.state.tasks[0].categoryName).toBe('新分类')
  })

  it('任务落库失败时保留原分类和任务关联', async () => {
    deps.putTasks.mockRejectedValueOnce(new Error('写入失败'))
    await expect(deleteCategory('category-1')).rejects.toThrow('写入失败')
    expect(deps.state.categories[0].name).toBe('原分类')
    expect(deps.state.tasks[0]).toMatchObject({ categoryId: 'category-1', categoryName: '原分类' })
  })
})
