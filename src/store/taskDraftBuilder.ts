import { normalizeImageSize } from '../lib/size'
import type {
  AppSettings,
  CategoryConfig,
  ImageEditSelection,
  ImageEditSession,
  InputImage,
  ProviderConfig,
  TaskParams,
  TaskRecord,
} from '../types'
import {
  ALL_CATEGORY_FILTER,
  FAVORITES_CATEGORY_FILTER,
  UNCATEGORIZED_CATEGORY_FILTER,
  UNKNOWN_TASK_PROVIDER_NAME,
} from '../types'
import { findCategoryById, findProviderById, getProviderSettings } from './domain'
import { resolveTaskParentFromInputImages } from './taskLineage'
import { resolveTaskParamSizeOrDefault } from './taskParams'
import { createGenerationTaskRecord } from './taskRecords'

export type PrepareTaskDraftFailureReason =
  | 'missing_api_key'
  | 'missing_prompt_or_inputs'
  | 'too_many_masked_inputs'

export interface TaskDraftStoreSnapshot {
  settings: AppSettings
  providers: ProviderConfig[]
  categories: CategoryConfig[]
  activeProviderId: string
  activeCategoryFilter: string
  prompt: string
  inputImages: InputImage[]
  params: TaskParams
}

export interface StagedTaskDraftAssets {
  inputImageIds: string[]
  maskedInput: InputImage | null
  editMaskImageId: string | null
}

export interface PreparedTaskDraft {
  task: TaskRecord
  requestSettings: AppSettings
  normalizedParamsPatch?: Partial<TaskParams>
}

export interface ImageEditDraftWriteInput {
  snapshot: Pick<
    TaskDraftStoreSnapshot,
    'providers' | 'activeProviderId'
  >
  session: ImageEditSession
  prompt: string
  providerId?: string | null
  maskDataUrl?: string | null
  selection?: ImageEditSelection | null
  sourceSize?: string
}

export interface ImageEditDraftWriteResult {
  nextProviderId: string | null
  nextPrompt: string
  nextParams: TaskParams
  nextInputImages: InputImage[]
}

export function validateTaskDraftSnapshot(
  snapshot: TaskDraftStoreSnapshot,
): PrepareTaskDraftFailureReason | null {
  if (!snapshot.settings.apiKey) {
    return 'missing_api_key'
  }

  if (!snapshot.prompt.trim() && !snapshot.inputImages.length) {
    return 'missing_prompt_or_inputs'
  }

  const maskedInputCount = snapshot.inputImages.filter((image) => Boolean(image.maskDataUrl)).length
  if (maskedInputCount > 1) {
    return 'too_many_masked_inputs'
  }

  return null
}

export function buildPreparedTaskDraft(
  snapshot: TaskDraftStoreSnapshot,
  stagedAssets: StagedTaskDraftAssets,
): PreparedTaskDraft {
  const normalizedSize = resolveTaskParamSizeOrDefault(snapshot.params.size)
  const normalizedParams = {
    ...snapshot.params,
    size: normalizedSize,
  }

  const selectedProvider = findProviderById(snapshot.providers, snapshot.activeProviderId)
  const selectedCategory =
    snapshot.activeCategoryFilter !== ALL_CATEGORY_FILTER &&
    snapshot.activeCategoryFilter !== FAVORITES_CATEGORY_FILTER &&
    snapshot.activeCategoryFilter !== UNCATEGORIZED_CATEGORY_FILTER
      ? findCategoryById(snapshot.categories, snapshot.activeCategoryFilter)
      : undefined
  const requestSettings = selectedProvider
    ? getProviderSettings(selectedProvider)
    : snapshot.settings
  const { parentTaskId, parentImageId } = resolveTaskParentFromInputImages(snapshot.inputImages)

  return {
    task: createGenerationTaskRecord({
      providerId: selectedProvider?.id ?? null,
      providerName: selectedProvider?.name?.trim() || UNKNOWN_TASK_PROVIDER_NAME,
      categoryId: selectedCategory?.id ?? null,
      categoryName: selectedCategory?.name ?? null,
      parentTaskId,
      parentImageId,
      prompt: snapshot.prompt.trim(),
      params: normalizedParams,
      inputImageIds: stagedAssets.inputImageIds,
      editMaskImageId: stagedAssets.editMaskImageId,
      editSourceImageId: stagedAssets.maskedInput?.sourceImageId ?? stagedAssets.maskedInput?.id ?? null,
      editSelection: stagedAssets.maskedInput?.editSelection ?? null,
    }),
    requestSettings,
    normalizedParamsPatch:
      normalizedSize !== snapshot.params.size
        ? {
            size: normalizedSize,
          }
        : undefined,
  }
}

export function writeImageEditDraft(input: ImageEditDraftWriteInput): ImageEditDraftWriteResult {
  const provider = findProviderById(
    input.snapshot.providers,
    input.providerId ?? input.session.providerId ?? input.snapshot.activeProviderId,
  )
  const nextProviderId = provider?.id ?? null
  const derivedSourceTaskId =
    input.session.lineageParentTaskId ??
    (input.session.taskId && input.session.taskId !== 'input-image' ? input.session.taskId : null)

  return {
    nextProviderId,
    nextPrompt: input.prompt.trim(),
    nextParams: {
      ...input.session.params,
      n: 1,
      size: input.sourceSize
        ? normalizeImageSize(input.sourceSize) || input.session.params.size
        : input.session.params.size,
    },
    nextInputImages: [
      {
        id: input.session.sourceImageId,
        dataUrl: input.session.sourceImageDataUrl,
        maskDataUrl: input.maskDataUrl ?? null,
        editSelection: input.selection ?? null,
        sourceTaskId: derivedSourceTaskId,
        sourceImageId: input.session.sourceImageId,
        lineageParentTaskId: input.session.lineageParentTaskId ?? null,
        lineageParentImageId: input.session.lineageParentImageId ?? input.session.sourceImageId,
      },
    ],
  }
}
