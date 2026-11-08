import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TaskRecord } from '@/types'
import { DEFAULT_PARAMS, DEFAULT_SETTINGS } from '@/types'
import type { TaskApiRequestHandlers } from '../taskApiRequest'
import { executeTask } from '../taskExecutor'
import { resetLocalData } from '../dataMutation'
import { clearAllData } from '../dataTransfer'
import { retryTask } from '../taskRunner'

const deps = vi.hoisted(() => ({
  tasks: [] as TaskRecord[], callApi: vi.fn(), saveImage: vi.fn(), putTask: vi.fn(), showToast: vi.fn(),
  putTasks: vi.fn(), writeDbBatch: vi.fn(), clearCaches: vi.fn(),
}))
vi.mock('../state', () => ({
  useStore: { getState: () => ({
    tasks: deps.tasks,
    setTasks: (tasks: TaskRecord[]) => { deps.tasks = tasks },
    setDetailTaskId: vi.fn(), showToast: deps.showToast,
  }) },
}))
vi.mock('../taskApiRequest', () => ({ callTaskImageApi: deps.callApi }))
vi.mock('../imageAssets', () => ({
  storeImage: deps.saveImage, evictImage: vi.fn(), clearImageAssetCaches: deps.clearCaches,
}))
vi.mock('@/lib/db', () => ({ putTask: deps.putTask, putTasks: deps.putTasks }))
vi.mock('@/lib/db/schema', () => ({
  STORE_TASKS: 'tasks', STORE_IMAGES: 'images', writeDbBatch: deps.writeDbBatch,
}))
vi.mock('../taskMaintenance', () => ({ initStore: vi.fn() }))

beforeEach(() => {
  vi.clearAllMocks()
  deps.saveImage.mockResolvedValue('image-1')
  deps.putTask.mockResolvedValue('task-1')
  deps.putTasks.mockReset().mockResolvedValue(undefined)
  deps.writeDbBatch.mockReset()
  deps.tasks = [{
    id: 'task-1', prompt: '测试', params: { ...DEFAULT_PARAMS, n: 2 },
    inputImageIds: [], outputImages: [], status: 'running', error: null,
    createdAt: 1, finishedAt: null, elapsed: null,
  }]
})

describe('任务输出与清空数据', () => {
  it('后续请求失败时保留已落库图片并标记部分失败', async () => {
    deps.callApi.mockImplementationOnce(async (_task, _settings, handlers: TaskApiRequestHandlers) => {
      await handlers.onFinalImages?.([{ blob: new Blob(['image']), mimeType: 'image/png' }])
      expect(deps.tasks[0].outputImages).toEqual(['image-1'])
      throw new Error('第二张失败')
    })
    await executeTask('task-1', DEFAULT_SETTINGS)
    expect(deps.tasks[0]).toMatchObject({ status: 'partial_error', outputImages: ['image-1'], error: '第二张失败' })
  })

  it('普通成功响应少于请求数量时仍标记部分失败', async () => {
    deps.callApi.mockResolvedValueOnce({ images: [{ blob: new Blob(['image']), mimeType: 'image/png' }] })
    await executeTask('task-1', DEFAULT_SETTINGS)
    expect(deps.tasks[0]).toMatchObject({ status: 'partial_error', outputImages: ['image-1'] })
    expect(deps.tasks[0].error).toContain('仅收到 1 张')
  })

  it('清空之后才返回的网络结果不能重新创建图片或任务', async () => {
    let started!: () => void
    let complete!: () => void
    const requestStarted = new Promise<void>((resolve) => { started = resolve })
    const gate = new Promise<void>((resolve) => { complete = resolve })
    deps.callApi.mockImplementationOnce(async () => {
      started()
      await gate
      return { images: [{ blob: new Blob(['image']), mimeType: 'image/png' }] }
    })
    const pending = executeTask('task-1', DEFAULT_SETTINGS)
    await requestStarted
    await resetLocalData(async () => { deps.tasks = [] })
    complete()
    await pending
    expect(deps.tasks).toEqual([])
    expect(deps.saveImage).not.toHaveBeenCalled()
    expect(deps.putTask).not.toHaveBeenCalled()
  })

  it('清空失败时结束任务并保留输出，迟到的请求不能覆盖恢复状态', async () => {
    let started!: () => void
    let complete!: () => void
    const requestStarted = new Promise<void>((resolve) => { started = resolve })
    const gate = new Promise<void>((resolve) => { complete = resolve })
    deps.tasks[0].outputImages = ['saved-image']
    deps.writeDbBatch.mockRejectedValueOnce(new Error('清空事务失败'))
    deps.callApi.mockImplementationOnce(async () => {
      started()
      await gate
      return { images: [{ blob: new Blob(['late']), mimeType: 'image/png' }] }
    })
    const pending = executeTask('task-1', DEFAULT_SETTINGS)
    await requestStarted

    await expect(clearAllData()).rejects.toThrow('清空事务失败')
    expect(deps.tasks[0]).toMatchObject({
      status: 'partial_error', isAborted: true, outputImages: ['saved-image'],
    })
    expect(deps.putTasks).toHaveBeenCalledWith(deps.tasks)
    expect(deps.clearCaches).not.toHaveBeenCalled()
    complete()
    await pending

    expect(deps.tasks[0].status).toBe('partial_error')
    expect(deps.saveImage).not.toHaveBeenCalled()
    expect(deps.putTask).not.toHaveBeenCalled()
  })

  it('清空和中断状态落库都失败时仍结束界面任务，并保留两个错误', async () => {
    deps.writeDbBatch.mockRejectedValueOnce(new Error('清空事务失败'))
    deps.putTasks.mockRejectedValueOnce(new Error('状态写入失败'))

    await expect(clearAllData()).rejects.toThrow('清空事务失败；中断任务状态保存失败：状态写入失败')
    expect(deps.tasks[0]).toMatchObject({ status: 'error', isAborted: true })
    expect(deps.clearCaches).not.toHaveBeenCalled()
  })

  it('清空失败后原执行尚未退出时，重试不能把任务重新留在运行中', async () => {
    let started!: () => void
    let complete!: () => void
    const requestStarted = new Promise<void>((resolve) => { started = resolve })
    const gate = new Promise<void>((resolve) => { complete = resolve })
    deps.writeDbBatch.mockRejectedValueOnce(new Error('清空事务失败'))
    deps.callApi.mockImplementationOnce(async () => {
      started()
      await gate
      return { images: [] }
    })
    const pending = executeTask('task-1', DEFAULT_SETTINGS)
    await requestStarted
    await expect(clearAllData()).rejects.toThrow('清空事务失败')
    await retryTask(deps.tasks[0])

    expect(deps.tasks[0].status).toBe('error')
    expect(deps.showToast).toHaveBeenCalledWith('原请求正在结束，请稍后重试', 'error')
    expect(deps.callApi).toHaveBeenCalledTimes(1)
    complete()
    await pending
  })
})
