import { useMemo } from 'react'
import {
  useStore,
  reuseConfig,
  editOutputs,
  retryTask,
  toggleTaskFavorite,
  removeTask,
  purgeTask,
  restoreTask,
} from '../../../../store'
import { useCloseOnEscape } from '../../../../hooks/useCloseOnEscape'
import {
  canEditTaskOutputs,
  isTaskInRecycleBin,
  resolveTaskAppliedImageParam,
  resolveTaskCategoryName,
  resolveTaskDisplayImageParam,
  resolveTaskImageProgress,
  resolveTaskProviderName,
  resolveTaskStatusLabel,
  resolveTaskTransportLabel,
  resolveTaskTransportMeta,
} from '../../../../types'
import DetailImagePanel from './DetailImagePanel'
import DetailInfoPanel from './DetailInfoPanel'
import { formatElapsedDuration, RECYCLE_BIN_RETENTION_MS } from './shared'
import { useDetailImageState } from './useDetailImageState'

export default function DetailModal() {
  const tasks = useStore((state) => state.tasks)
  const categories = useStore((state) => state.categories)
  const providers = useStore((state) => state.providers)
  const detailTaskId = useStore((state) => state.detailTaskId)
  const setDetailTaskId = useStore((state) => state.setDetailTaskId)
  const setLightboxImageId = useStore((state) => state.setLightboxImageId)
  const setConfirmDialog = useStore((state) => state.setConfirmDialog)
  const showToast = useStore((state) => state.showToast)

  const task = useMemo(
    () => tasks.find((item) => item.id === detailTaskId) ?? null,
    [tasks, detailTaskId],
  )

  useCloseOnEscape(Boolean(task), () => setDetailTaskId(null))

  const {
    imageIndex,
    setImageIndex,
    imageSrcs,
    imageLabelLeft,
    imagePanelRef,
    mainImageRef,
    currentOutputImageId,
    currentOutputImageSrc,
    currentImageRatio,
    currentImageSize,
    outputLen,
    hasGeneratedOutputs,
    updateImageLabelLeft,
  } = useDetailImageState(task, detailTaskId)

  if (!task) return null

  const progress = resolveTaskImageProgress(task)
  const statusLabel = resolveTaskStatusLabel(task)
  const canEditOutputs = canEditTaskOutputs(task)
  const providerName = resolveTaskProviderName(task, providers)
  const categoryName = resolveTaskCategoryName(task, categories)
  const inRecycleBin = isTaskInRecycleBin(task)
  const cleanupDueAt = inRecycleBin ? (task.deletedAt ?? 0) + RECYCLE_BIN_RETENTION_MS : null
  const isFavorite = Boolean(task.isFavorite)
  const displayQuality = resolveTaskDisplayImageParam(task, 'quality')
  const displayOutputFormat = resolveTaskDisplayImageParam(task, 'output_format')
  const appliedSize = resolveTaskAppliedImageParam(task, 'size')
  const appliedQuality = resolveTaskAppliedImageParam(task, 'quality')
  const appliedOutputFormat = resolveTaskAppliedImageParam(task, 'output_format')
  const appliedBackground = resolveTaskAppliedImageParam(task, 'background')
  const appliedAction = resolveTaskAppliedImageParam(task, 'action')
  const revisedPrompt = task.responseMeta?.revisedPrompt?.trim() || ''
  const transportLabel = resolveTaskTransportLabel(task)
  const transportMeta = resolveTaskTransportMeta(task)
  const statusChipClass =
    task.status === 'done'
      ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300'
      : task.status === 'error'
        ? 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-300'
        : 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300'
  const transportChipClass =
    transportMeta?.actual === 'stream'
      ? 'bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-300'
      : transportMeta?.fallbackFromStream
        ? 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300'
        : 'bg-gray-100 text-gray-500 dark:bg-white/[0.04] dark:text-gray-400'
  const durationLabel = formatElapsedDuration(task.elapsed)

  const closeModal = () => setDetailTaskId(null)

  const handleReuse = () => {
    reuseConfig(task)
    closeModal()
  }

  const handleEdit = () => {
    editOutputs(task, currentOutputImageId || task.outputImages?.[0])
    closeModal()
  }

  const handleRetry = () => {
    void retryTask(task)
  }

  const handleToggleFavorite = () => {
    void toggleTaskFavorite(task)
  }

  const handleDelete = () => {
    closeModal()
    setConfirmDialog({
      title: '移入回收站',
      message: '确定要将这条记录移入回收站吗？提示词、配置和图片会暂时保留，可在回收站恢复。',
      confirmText: '移入回收站',
      action: () => removeTask(task),
    })
  }

  const handleRestore = () => {
    closeModal()
    setConfirmDialog({
      title: '恢复记录',
      message: '确定要将这条记录恢复到画廊吗？',
      confirmText: '恢复',
      action: () => restoreTask(task),
    })
  }

  const handlePurge = () => {
    closeModal()
    setConfirmDialog({
      title: '彻底删除记录',
      message: '确定要彻底删除这条记录吗？删除后将无法恢复，并会清理未被其他任务引用的图片。',
      confirmText: '彻底删除',
      action: async () => {
        await purgeTask(task)
      },
    })
  }

  const handleCopyError = async () => {
    const errorPayload = {
      copiedAt: new Date().toISOString(),
      task: {
        id: task.id,
        providerId: task.providerId ?? null,
        providerName,
        categoryId: task.categoryId ?? null,
        categoryName,
        status: task.status,
        error: task.error || '生成失败',
        createdAt: task.createdAt,
        finishedAt: task.finishedAt,
        elapsed: task.elapsed,
        prompt: task.prompt,
        params: task.params,
        inputImageIds: task.inputImageIds,
        outputImages: task.outputImages,
        editMaskImageId: task.editMaskImageId ?? null,
        editSourceImageId: task.editSourceImageId ?? null,
        editSelection: task.editSelection ?? null,
        responseMeta: task.responseMeta ?? null,
      },
      localErrorLog: task.errorDebug ?? null,
      note: task.errorDebug
        ? null
        : '本地完整错误日志不存在，可能是旧任务，或该日志已超过 15 天被自动清理。',
    }

    try {
      await navigator.clipboard.writeText(JSON.stringify(errorPayload, null, 2))
      showToast(task.errorDebug ? '完整报错已复制' : '已复制可用报错信息', 'success')
    } catch {
      showToast('复制报错失败', 'error')
    }
  }

  const handleCopyPrompt = async () => {
    if (!task.prompt) return

    try {
      await navigator.clipboard.writeText(task.prompt)
      showToast('提示词已复制', 'success')
    } catch {
      showToast('复制提示词失败', 'error')
    }
  }

  const handleCopyInputImage = async () => {
    const imageId = task.inputImageIds?.[0]
    const src = imageId ? imageSrcs[imageId] : ''
    if (!src) return

    try {
      const response = await fetch(src)
      const blob = await response.blob()
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })])
      showToast('参考图已复制', 'success')
    } catch (error) {
      console.error(error)
      showToast('复制参考图失败', 'error')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={closeModal}>
      <div className="absolute inset-0 animate-overlay-in bg-black/20 backdrop-blur-md dark:bg-black/40" />
      <div
        className="relative z-10 flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-white/50 bg-white/90 shadow-[0_8px_40px_rgb(0,0,0,0.12)] ring-1 ring-black/5 backdrop-blur-xl animate-modal-in md:flex-row dark:border-white/[0.08] dark:bg-gray-900/90 dark:shadow-[0_8px_40px_rgb(0,0,0,0.4)] dark:ring-white/10"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex h-14 items-center justify-end px-4 md:hidden">
          <button
            type="button"
            onClick={closeModal}
            className="rounded-full p-1 text-gray-400 transition hover:bg-gray-100 dark:hover:bg-white/[0.06]"
            aria-label="关闭"
          >
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <DetailImagePanel
          task={task}
          imageIndex={imageIndex}
          outputLen={outputLen}
          hasGeneratedOutputs={hasGeneratedOutputs}
          currentOutputImageSrc={currentOutputImageSrc}
          currentImageRatio={currentImageRatio}
          currentImageSize={currentImageSize}
          imageLabelLeft={imageLabelLeft}
          imagePanelRef={imagePanelRef}
          mainImageRef={mainImageRef}
          durationLabel={durationLabel}
          statusLabel={statusLabel}
          onCopyError={handleCopyError}
          onMainImageLoad={updateImageLabelLeft}
          onOpenLightbox={() => setLightboxImageId(task.outputImages[imageIndex], task.outputImages)}
          onPrevImage={() => setImageIndex((imageIndex - 1 + outputLen) % outputLen)}
          onNextImage={() => setImageIndex((imageIndex + 1) % outputLen)}
        />

        <DetailInfoPanel
          task={task}
          imageSrcs={imageSrcs}
          inRecycleBin={inRecycleBin}
          cleanupDueAt={cleanupDueAt}
          isFavorite={isFavorite}
          statusLabel={statusLabel}
          statusChipClass={statusChipClass}
          progressCountLabel={progress.countLabel}
          transportLabel={transportLabel}
          transportRequested={transportMeta?.requested ?? null}
          transportChipClass={transportChipClass}
          currentImageSize={currentImageSize}
          providerName={providerName}
          categoryName={categoryName}
          displayQuality={displayQuality}
          displayOutputFormat={displayOutputFormat}
          appliedSize={appliedSize}
          appliedQuality={appliedQuality}
          appliedOutputFormat={appliedOutputFormat}
          appliedBackground={appliedBackground}
          appliedAction={appliedAction}
          revisedPrompt={revisedPrompt}
          canEditOutputs={canEditOutputs}
          onClose={closeModal}
          onToggleFavorite={handleToggleFavorite}
          onCopyPrompt={handleCopyPrompt}
          onCopyInputImage={() => {
            void handleCopyInputImage()
          }}
          onOpenInputImage={(imageId) => setLightboxImageId(imageId, task.inputImageIds)}
          onReuse={handleReuse}
          onEdit={handleEdit}
          onRetry={handleRetry}
          onDelete={handleDelete}
          onRestore={handleRestore}
          onPurge={handlePurge}
        />
      </div>
    </div>
  )
}
