import { stageTaskDraftAssets } from './taskDraftAssets'
import {
  buildPreparedTaskDraft,
  type ImageEditDraftWriteInput,
  type ImageEditDraftWriteResult,
  type PreparedTaskDraft,
  type PrepareTaskDraftFailureReason,
  type TaskDraftStoreSnapshot,
  validateTaskDraftSnapshot,
  writeImageEditDraft,
} from './taskDraftBuilder'

export type PrepareTaskDraftResult =
  | {
      ok: true
      draft: PreparedTaskDraft
    }
  | {
      ok: false
      reason: PrepareTaskDraftFailureReason
    }

export async function prepareCurrentTaskDraft(
  snapshot: TaskDraftStoreSnapshot,
): Promise<PrepareTaskDraftResult> {
  const reason = validateTaskDraftSnapshot(snapshot)
  if (reason) {
    return {
      ok: false,
      reason,
    }
  }

  const stagedAssets = await stageTaskDraftAssets(snapshot.inputImages)
  return {
    ok: true,
    draft: buildPreparedTaskDraft(snapshot, stagedAssets),
  }
}

export { writeImageEditDraft }
export type {
  ImageEditDraftWriteInput,
  ImageEditDraftWriteResult,
  PreparedTaskDraft,
  PrepareTaskDraftFailureReason,
  TaskDraftStoreSnapshot,
}
