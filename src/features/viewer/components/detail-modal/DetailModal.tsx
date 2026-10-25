import { useEffect, useMemo, useRef, useState } from 'react'
import {
  applyGalleryTaskDetailAction,
  canEditTaskOutputs,
  confirmGalleryPurgeTask,
  confirmGalleryRemoveTask,
  confirmGalleryRestoreTask,
  isTaskInRecycleBin,
  openGalleryTaskDetail,
  openLightbox,
  resolveTaskAppliedImageParam,
  resolveTaskCategoryName,
  resolveTaskDisplayImageParam,
  resolveTaskImageProgress,
  resolveTaskProviderName,
  resolveTaskRunOutcome,
  resolveTaskStatusLabel,
  resolveTaskTransportLabel,
  resolveTaskTransportMeta,
  runGalleryEditOutputs,
  useStore,
} from '@/store'
import { useCloseOnEscape } from '@/hooks/useCloseOnEscape'
import { copyImageToClipboard } from '@/lib/clipboardImage'
import { buildTaskLineage } from '@/store/taskLineage'
import DetailImagePanel from './DetailImagePanel'
import DetailInfoPanel from './DetailInfoPanel'
import DetailTaskLineageRail, { type DetailTaskLineageRailItem } from './DetailTaskLineageRail'
import { formatElapsedDuration, RECYCLE_BIN_RETENTION_MS } from './shared'
import { useDetailImageState } from './useDetailImageState'

export default function DetailModal() {
  const tasks = useStore((state) => state.tasks)
  const categories = useStore((state) => state.categories)
  const providers = useStore((state) => state.providers)
  const detailTaskId = useStore((state) => state.detailTaskId)
  const setDetailTaskId = useStore((state) => state.setDetailTaskId)
  const setShareToSquareTarget = useStore((state) => state.setShareToSquareTarget)
  const showToast = useStore((state) => state.showToast)
  const [lineageRootTaskId, setLineageRootTaskId] = useState<string | null>(null)
  const previousDetailTaskIdRef = useRef<string | null>(null)

  const task = useMemo(
    () => tasks.find((item) => item.id === detailTaskId) ?? null,
    [tasks, detailTaskId],
  )
  const lineageRootTask = useMemo(
    () => tasks.find((item) => item.id === lineageRootTaskId) ?? null,
    [tasks, lineageRootTaskId],
  )
  const lineage = useMemo(
    () => (lineageRootTask ? buildTaskLineage(lineageRootTask, tasks) : []),
    [lineageRootTask, tasks],
  )

  useEffect(() => {
    const previousDetailTaskId = previousDetailTaskIdRef.current

    if (!detailTaskId) {
      previousDetailTaskIdRef.current = null
      setLineageRootTaskId(null)
      return
    }

    if (!previousDetailTaskId) {
      setLineageRootTaskId(detailTaskId)
    }

    previousDetailTaskIdRef.current = detailTaskId
  }, [detailTaskId])

  useEffect(() => {
    if (lineageRootTaskId && !lineageRootTask) {
      setLineageRootTaskId(null)
    }
  }, [lineageRootTask, lineageRootTaskId])

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
  const railItems = useMemo<DetailTaskLineageRailItem[]>(() => {
    if (!task || !lineageRootTask || !lineage.length) {
      return []
    }

    return [
      {
        task: lineageRootTask,
        taskId: lineageRootTask.id,
        relationImageId: lineageRootTask.parentImageId ?? lineageRootTask.outputImages[0] ?? null,
        depth: 0,
        isEntry: true,
        isMissing: false,
        isLoop: false,
      },
      ...lineage.map((item) => ({
        ...item,
        isEntry: false,
      })),
    ]
  }, [lineage, lineageRootTask, task])

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
  const runOutcome = resolveTaskRunOutcome(task)
  const statusChipClass =
    runOutcome === 'done'
      ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300'
      : runOutcome === 'partial_error'
        ? 'bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-300'
      : runOutcome === 'error' || runOutcome === 'aborted'
        ? runOutcome === 'aborted'
          ? 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300'
          : 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-300'
        : 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300'
  const transportChipClass =
    transportMeta?.actual === 'stream'
      ? 'bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-300'
      : transportMeta?.fallbackFromStream
        ? 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300'
        : 'bg-gray-100 text-gray-500 dark:bg-white/[0.04] dark:text-gray-400'
  const durationLabel = formatElapsedDuration(task.elapsed)
  const hasLineage = railItems.length > 0

  const closeModal = () => setDetailTaskId(null)

  const handleReuse = () => {
    applyGalleryTaskDetailAction('reuse', task)
    closeModal()
  }

  const handleEdit = () => {
    runGalleryEditOutputs(task, currentOutputImageId || task.outputImages?.[0])
    closeModal()
  }

  const handleRetry = () => {
    applyGalleryTaskDetailAction('retry', task)
  }

  const handleShare = () => {
    setShareToSquareTarget({ kind: 'task', taskId: task.id })
  }

  const handleToggleFavorite = () => {
    applyGalleryTaskDetailAction('favorite', task)
  }

  const handleDelete = () => {
    closeModal()
    confirmGalleryRemoveTask(task)
  }

  const handleRestore = () => {
    closeModal()
    confirmGalleryRestoreTask(task)
  }

  const handlePurge = () => {
    closeModal()
    confirmGalleryPurgeTask(task)
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
        parentTaskId: task.parentTaskId ?? null,
        parentImageId: task.parentImageId ?? null,
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
      await copyImageToClipboard(src)
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
        className={`relative z-10 flex max-h-[90vh] w-full flex-col overflow-hidden rounded-3xl border border-white/50 bg-white/90 shadow-[0_8px_40px_rgb(0,0,0,0.12)] ring-1 ring-black/5 backdrop-blur-xl animate-modal-in md:flex-row dark:border-white/[0.08] dark:bg-gray-900/90 dark:shadow-[0_8px_40px_rgb(0,0,0,0.4)] dark:ring-white/10 ${
          hasLineage ? 'max-w-7xl' : 'max-w-5xl'
        }`}
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

        <div className="flex min-w-0 flex-1 flex-col md:flex-row">
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
            onOpenLightbox={() => openLightbox(task.outputImages[imageIndex], task.outputImages)}
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
            onOpenInputImage={(imageId) => openLightbox(imageId, task.inputImageIds)}
            onReuse={handleReuse}
            onEdit={handleEdit}
            onRetry={handleRetry}
            onShare={handleShare}
            onDelete={handleDelete}
            onRestore={handleRestore}
            onPurge={handlePurge}
          />
        </div>

        {hasLineage ? (
          <DetailTaskLineageRail
            activeTaskId={task.id}
            items={railItems}
            onOpenTask={openGalleryTaskDetail}
          />
        ) : null}
      </div>
    </div>
  )
}
