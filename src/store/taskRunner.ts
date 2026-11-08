import type { TaskRecord } from "@/types"
import { prepareCurrentTaskDraft } from "./taskDraftBuilder"
import { findProviderById, getProviderSettings } from "./domain"
import { useStore } from "./state"
import { executeTask, isTaskExecutionActive } from "./taskExecutor"
import { enqueueTaskRun, requestAbortTaskRun, retryTaskRun } from "./taskRun"
import { assertDataVersion, getDataVersion, withDataMutation } from './dataMutation'
import { initStore } from './taskMaintenance'

function handlePrepareFailure(
  snapshot: ReturnType<typeof useStore.getState>,
  reason: "missing_api_key" | "missing_prompt_or_inputs" | "too_many_masked_inputs",
) {
  if (reason === "missing_api_key") {
    snapshot.showToast("请先在设置中配置 API Key", "error")
    snapshot.setShowSettings(true)
    return
  }
  if (reason === "missing_prompt_or_inputs") {
    snapshot.showToast("请输入提示词或添加参考图", "error")
    return
  }
  snapshot.showToast("当前仅支持 1 张带蒙版的局部编辑参考图，请先清理多余蒙版后再提交", "error")
}

function resolveTaskRequestSettings(task: TaskRecord) {
  const snapshot = useStore.getState()
  const provider = findProviderById(snapshot.providers, task.providerId)
  if (!provider) throw new Error('原供应商已不存在，请复用配置并选择供应商后创建新任务')
  if (!provider.apiKey.trim()) throw new Error('原供应商缺少 API Key，请先补全设置后重试')
  return getProviderSettings(provider)
}

/** 提交当前输入区内容为一个新任务 */
export async function submitTask() {
  const version = getDataVersion()
  try {
    await initStore()
    const submitted = await withDataMutation(async () => {
      const snapshot = useStore.getState()
      const prepared = await prepareCurrentTaskDraft({
        settings: snapshot.settings,
        providers: snapshot.providers,
        categories: snapshot.categories,
        activeProviderId: snapshot.activeProviderId,
        activeCategoryFilter: snapshot.activeCategoryFilter,
        prompt: snapshot.prompt,
        inputImages: snapshot.inputImages,
        params: snapshot.params,
      })
      if (!prepared.ok) {
        handlePrepareFailure(snapshot, prepared.reason)
        return
      }

      const { task, requestSettings, normalizedParamsPatch } = prepared.draft
      assertDataVersion(version)
      if (normalizedParamsPatch) snapshot.setParams(normalizedParamsPatch)
      await enqueueTaskRun(task)
      return { task, requestSettings }
    }, version)
    if (submitted) void executeTask(submitted.task.id, submitted.requestSettings, version)
  } catch (error) {
    useStore.getState().showToast(error instanceof Error ? error.message : String(error), 'error')
  }
}

/** 重试一个失败或被中止的任务 */
export async function retryTask(task: TaskRecord) {
  const version = getDataVersion()
  try {
    await initStore()
    const started = await withDataMutation(async () => {
      const currentTask = useStore.getState().tasks.find((item) => item.id === task.id)
      if (!currentTask) throw new Error('任务已不存在，无法重试')
      if (isTaskExecutionActive(currentTask.id)) throw new Error('原请求正在结束，请稍后重试')
      const requestSettings = resolveTaskRequestSettings(currentTask)
      const retryResult = await retryTaskRun(currentTask)

      if (!retryResult.ok) {
        useStore.getState().showToast(retryResult.message, retryResult.toastType)
        return
      }

      useStore.getState().showToast(retryResult.message, "info")
      return { task: retryResult.task, requestSettings }
    }, version)
    if (started) void executeTask(started.task.id, started.requestSettings, version)
  } catch (error) {
    useStore.getState().showToast(error instanceof Error ? error.message : String(error), 'error')
  }
}

/** 中止一个正在运行的任务 */
export async function abortTask(task: TaskRecord) {
  const currentTask = useStore.getState().tasks.find((item) => item.id === task.id) ?? task
  const abortResult = requestAbortTaskRun(currentTask)
  if (!abortResult.ok) {
    useStore.getState().showToast(abortResult.message, abortResult.toastType)
    return
  }

  useStore.getState().showToast(abortResult.message, "info")
}
