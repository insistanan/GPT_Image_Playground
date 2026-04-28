import { useEffect, useState, useMemo, useRef } from 'react'
import {
  useStore,
  getCachedImage,
  ensureImageCached,
  reuseConfig,
  editOutputs,
  toggleTaskFavorite,
  removeTask,
  restoreTask,
} from '../store'
import { useCloseOnEscape } from '../hooks/useCloseOnEscape'
import { formatImageRatio } from '../lib/size'
import {
  isTaskInRecycleBin,
  resolveTaskAppliedImageParam,
  resolveTaskCategoryName,
  resolveTaskDisplayImageParam,
  resolveTaskProviderName,
} from '../types'

const RECYCLE_BIN_RETENTION_MS = 7 * 24 * 60 * 60 * 1000

export default function DetailModal() {
  const tasks = useStore((s) => s.tasks)
  const categories = useStore((s) => s.categories)
  const providers = useStore((s) => s.providers)
  const detailTaskId = useStore((s) => s.detailTaskId)
  const setDetailTaskId = useStore((s) => s.setDetailTaskId)
  const setLightboxImageId = useStore((s) => s.setLightboxImageId)
  const setConfirmDialog = useStore((s) => s.setConfirmDialog)
  const showToast = useStore((s) => s.showToast)

  const [imageIndex, setImageIndex] = useState(0)
  const [imageSrcs, setImageSrcs] = useState<Record<string, string>>({})
  const [imageRatios, setImageRatios] = useState<Record<string, string>>({})
  const [imageSizes, setImageSizes] = useState<Record<string, string>>({})
  const imagePanelRef = useRef<HTMLDivElement>(null)
  const mainImageRef = useRef<HTMLImageElement>(null)
  const [imageLabelLeft, setImageLabelLeft] = useState(8)

  const task = useMemo(
    () => tasks.find((t) => t.id === detailTaskId) ?? null,
    [tasks, detailTaskId],
  )

  useCloseOnEscape(Boolean(task), () => setDetailTaskId(null))

  // Reset index when task changes
  useEffect(() => {
    setImageIndex(0)
  }, [detailTaskId])

  // 加载所有相关图片
  useEffect(() => {
    if (!task) return
    const ids = [...(task.outputImages || []), ...(task.inputImageIds || [])]
    for (const id of ids) {
      const cached = getCachedImage(id)
      if (cached) {
        setImageSrcs((prev) => ({ ...prev, [id]: cached }))
      } else {
        ensureImageCached(id).then((url) => {
          if (url) setImageSrcs((prev) => ({ ...prev, [id]: url }))
        })
      }
    }
  }, [task])

  const currentOutputImageId = task?.outputImages?.[imageIndex] || ''
  const currentOutputImageSrc = currentOutputImageId ? imageSrcs[currentOutputImageId] || '' : ''

  useEffect(() => {
    if (!currentOutputImageId || !currentOutputImageSrc) return

    let cancelled = false
    const image = new Image()
    image.onload = () => {
      if (!cancelled && image.naturalWidth > 0 && image.naturalHeight > 0) {
        setImageRatios((prev) => ({
          ...prev,
          [currentOutputImageId]: formatImageRatio(image.naturalWidth, image.naturalHeight),
        }))
        setImageSizes((prev) => ({
          ...prev,
          [currentOutputImageId]: `${image.naturalWidth}×${image.naturalHeight}`,
        }))
      }
    }
    image.src = currentOutputImageSrc
    if (image.complete && image.naturalWidth > 0 && image.naturalHeight > 0) {
      setImageRatios((prev) => ({
        ...prev,
        [currentOutputImageId]: formatImageRatio(image.naturalWidth, image.naturalHeight),
      }))
      setImageSizes((prev) => ({
        ...prev,
        [currentOutputImageId]: `${image.naturalWidth}×${image.naturalHeight}`,
      }))
    }

    return () => {
      cancelled = true
    }
  }, [currentOutputImageId, currentOutputImageSrc])

  useEffect(() => {
    const updateImageLabelLeft = () => {
      const panel = imagePanelRef.current
      const image = mainImageRef.current
      if (!panel || !image) return

      const panelRect = panel.getBoundingClientRect()
      const imageRect = image.getBoundingClientRect()
      setImageLabelLeft(Math.max(8, imageRect.left - panelRect.left))
    }

    updateImageLabelLeft()
    window.addEventListener('resize', updateImageLabelLeft)
    return () => window.removeEventListener('resize', updateImageLabelLeft)
  }, [currentOutputImageSrc])

  if (!task) return null

  const outputLen = task.outputImages?.length || 0
  const currentImageRatio = currentOutputImageId ? imageRatios[currentOutputImageId] : ''
  const currentImageSize = currentOutputImageId ? imageSizes[currentOutputImageId] : ''
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
  const taskApiProtocol =
    task.requestSettingsSnapshot?.apiProtocol ?? task.errorDebug?.apiProtocol ?? null
  const taskModel =
    task.requestSettingsSnapshot?.model?.trim() || task.errorDebug?.model?.trim() || ''
  const taskResponsesImageModel =
    task.requestSettingsSnapshot?.responsesImageModel?.trim() ||
    task.errorDebug?.responsesImageModel?.trim() ||
    ''

  const formatTime = (ts: number | null) => {
    if (!ts) return ''
    return new Date(ts).toLocaleString('zh-CN')
  }

  const formatDuration = () => {
    if (task.elapsed == null) return null
    const seconds = Math.floor(task.elapsed / 1000)
    const mm = String(Math.floor(seconds / 60)).padStart(2, '0')
    const ss = String(seconds % 60).padStart(2, '0')
    return `${mm}:${ss}`
  }

  const renderRequestedParamCard = (
    label: string,
    requestedValue: string,
    displayValue: string,
    appliedValue: string | null,
  ) => {
    const showRequestedValue = Boolean(appliedValue && appliedValue !== requestedValue)

    return (
      <div className="bg-gray-50 dark:bg-white/[0.03] rounded-lg px-3 py-2">
        <span className="text-gray-400 dark:text-gray-500">{label}</span>
        <br />
        <span className="text-gray-700 dark:text-gray-300 font-medium break-all">{displayValue}</span>
        {showRequestedValue && (
          <>
            <br />
            <span className="text-[11px] text-gray-400 dark:text-gray-500 break-all">
              请求: {requestedValue}
            </span>
          </>
        )}
      </div>
    )
  }

  const renderValueCard = (label: string, value: string) => (
    <div className="bg-gray-50 dark:bg-white/[0.03] rounded-lg px-3 py-2">
      <span className="text-gray-400 dark:text-gray-500">{label}</span>
      <br />
      <span className="text-gray-700 dark:text-gray-300 font-medium break-all">{value}</span>
    </div>
  )

  const handleReuse = () => {
    reuseConfig(task)
    setDetailTaskId(null)
  }

  const handleEdit = () => {
    editOutputs(task, currentOutputImageId || task.outputImages?.[0])
    setDetailTaskId(null)
  }

  const handleToggleFavorite = () => {
    void toggleTaskFavorite(task)
  }

  const handleDelete = () => {
    setDetailTaskId(null)
    setConfirmDialog({
      title: '移入回收站',
      message: '确定要将这条记录移入回收站吗？提示词、配置和图片会暂时保留，可在回收站恢复。',
      confirmText: '移入回收站',
      action: () => removeTask(task),
    })
  }

  const handleRestore = () => {
    setDetailTaskId(null)
    setConfirmDialog({
      title: '恢复记录',
      message: '确定要将这条记录恢复到画廊吗？',
      confirmText: '恢复',
      action: () => restoreTask(task),
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
        requestSettingsSnapshot: task.requestSettingsSnapshot ?? null,
        responseMeta: task.responseMeta ?? null,
      },
      localErrorLog: task.errorDebug ?? null,
      note: task.errorDebug
        ? null
        : '本地完整错误日志不存在，可能是旧任务，或该日志已超过 7 天被自动清理。',
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
    const imgId = task.inputImageIds?.[0]
    const src = imgId ? imageSrcs[imgId] : ''
    if (!src) return
    try {
      const res = await fetch(src)
      const blob = await res.blob()
      await navigator.clipboard.write([
        new ClipboardItem({ [blob.type]: blob }),
      ])
      showToast('参考图已复制', 'success')
    } catch (err) {
      console.error(err)
      showToast('复制参考图失败', 'error')
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={() => setDetailTaskId(null)}
    >
      <div className="absolute inset-0 bg-black/20 dark:bg-black/40 backdrop-blur-md animate-overlay-in" />
      <div
        className="relative bg-white/90 dark:bg-gray-900/90 backdrop-blur-xl border border-white/50 dark:border-white/[0.08] rounded-3xl shadow-[0_8px_40px_rgb(0,0,0,0.12)] dark:shadow-[0_8px_40px_rgb(0,0,0,0.4)] max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col md:flex-row z-10 ring-1 ring-black/5 dark:ring-white/10 animate-modal-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex h-14 items-center justify-end px-4 md:hidden">
          <button
            onClick={() => setDetailTaskId(null)}
            className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-white/[0.06] transition text-gray-400"
            aria-label="关闭"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 左侧：图片 */}
        <div ref={imagePanelRef} className="md:w-1/2 w-full h-64 md:h-auto bg-gray-100 dark:bg-black/20 relative flex items-center justify-center flex-shrink-0 min-h-[16rem]">
          {task.status === 'done' && outputLen > 0 && (
            <>
              {currentOutputImageSrc ? (
                <img
                  ref={mainImageRef}
                  src={currentOutputImageSrc}
                  className="max-w-[calc(100%-2rem)] max-h-[calc(100%-2rem)] object-contain cursor-pointer"
                  onLoad={() => {
                    const panel = imagePanelRef.current
                    const image = mainImageRef.current
                    if (!panel || !image) return

                    const panelRect = panel.getBoundingClientRect()
                    const imageRect = image.getBoundingClientRect()
                    setImageLabelLeft(Math.max(8, imageRect.left - panelRect.left))
                  }}
                  onClick={() =>
                    setLightboxImageId(task.outputImages[imageIndex], task.outputImages)
                  }
                  alt=""
                />
              ) : (
                <svg className="w-10 h-10 text-blue-400 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              )}
              <div className="absolute top-[15px] flex items-center gap-1.5" style={{ left: imageLabelLeft }}>
                {currentImageRatio && currentImageSize ? (
                  <>
                    <span className="bg-black/50 text-white text-xs px-2 py-0.5 rounded backdrop-blur-sm font-mono">
                      {currentImageRatio}
                    </span>
                    <span className="bg-black/50 text-white/90 text-xs px-2 py-0.5 rounded backdrop-blur-sm font-medium">
                      {currentImageSize}
                    </span>
                  </>
                ) : (
                  formatDuration() && (
                    <span className="flex items-center gap-1 bg-black/50 text-white text-xs px-2 py-0.5 rounded backdrop-blur-sm font-mono">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      {formatDuration()}
                    </span>
                  )
                )}
              </div>
              {outputLen > 1 && (
                <>
                  <button
                    onClick={() =>
                      setImageIndex(
                        (imageIndex - 1 + outputLen) % outputLen,
                      )
                    }
                    className="absolute left-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-black/30 text-white hover:bg-black/50 transition"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <button
                    onClick={() =>
                      setImageIndex((imageIndex + 1) % outputLen)
                    }
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-black/30 text-white hover:bg-black/50 transition"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                  <span className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/50 text-white text-xs px-2 py-0.5 rounded-full">
                    {imageIndex + 1} / {outputLen}
                  </span>
                </>
              )}
            </>
          )}
          {task.status === 'running' && (
            <svg className="w-10 h-10 text-blue-400 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          )}
          {task.status === 'error' && (
            <div className="w-full max-w-md px-4 text-center">
              <svg className="w-10 h-10 text-red-400 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p
                className="overflow-hidden text-sm leading-6 text-red-500 break-all"
                style={{
                  display: '-webkit-box',
                  WebkitBoxOrient: 'vertical',
                  WebkitLineClamp: 4,
                }}
              >
                {task.error || '生成失败'}
              </p>
              <button
                type="button"
                onClick={handleCopyError}
                className="mt-3 inline-flex items-center justify-center rounded-full border border-red-200/80 bg-white/80 px-3 py-1.5 text-red-500 transition hover:bg-red-50 dark:border-red-400/20 dark:bg-white/[0.04] dark:hover:bg-red-500/10"
                aria-label="复制完整报错"
                title="复制完整报错"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                  <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
                  <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
                </svg>
              </button>
            </div>
          )}
        </div>

        {/* 右侧：信息 */}
        <div className="md:w-1/2 w-full p-5 overflow-y-auto flex flex-col">
          <button
            onClick={() => setDetailTaskId(null)}
            className="absolute top-3 right-3 hidden p-1 rounded-full hover:bg-gray-100 dark:hover:bg-white/[0.06] transition text-gray-400 z-10 md:block"
            aria-label="关闭"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          <div className="flex-1">
            <div className="flex items-center gap-1.5 mb-2">
              <h3 className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                输入内容
              </h3>
              {!inRecycleBin && (
                <button
                  onClick={handleToggleFavorite}
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] transition ${
                    isFavorite
                      ? 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300'
                      : 'bg-gray-100 text-gray-500 hover:bg-amber-50 hover:text-amber-600 dark:bg-white/[0.04] dark:text-gray-400 dark:hover:bg-amber-500/10 dark:hover:text-amber-300'
                  }`}
                  title={isFavorite ? '取消收藏' : '加入收藏'}
                >
                  <svg className="h-3.5 w-3.5" fill={isFavorite ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="m11.049 2.927 2.037 4.128 4.556.663-3.297 3.213.778 4.538L11.05 13.33 6.978 15.47l.778-4.538-3.297-3.213 4.556-.663 2.034-4.128Z" />
                  </svg>
                  {isFavorite ? '已收藏' : '收藏'}
                </button>
              )}
              {task.prompt && (
                <button
                  onClick={handleCopyPrompt}
                  className="p-1 rounded text-gray-400 hover:bg-gray-100 dark:text-gray-500 dark:hover:bg-white/[0.06] transition"
                  title="复制提示词"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </button>
              )}
            </div>
            <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap mb-4">
              {task.prompt || '(无提示词)'}
            </p>

            {revisedPrompt && revisedPrompt !== task.prompt && (
              <div className="mb-4 rounded-xl border border-blue-100 bg-blue-50/70 px-3 py-2 dark:border-blue-500/20 dark:bg-blue-500/10">
                <h3 className="text-xs font-medium text-blue-500 dark:text-blue-300 uppercase tracking-wider mb-1">
                  模型修订提示词
                </h3>
                <p className="text-sm text-blue-700 dark:text-blue-100 whitespace-pre-wrap break-words">
                  {revisedPrompt}
                </p>
              </div>
            )}

            {/* 参考图 */}
            {task.inputImageIds?.length > 0 && (
              <div className="mb-4">
                <div className="flex items-center gap-1.5 mb-2">
                  <h3 className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                    参考图
                  </h3>
                  <button
                    onClick={handleCopyInputImage}
                    className="p-1 rounded text-gray-400 hover:bg-gray-100 dark:text-gray-500 dark:hover:bg-white/[0.06] transition"
                    title="复制参考图"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </button>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {task.inputImageIds.map((imgId) => {
                    const src = imageSrcs[imgId]
                    if (!src) return null

                    return (
                      <img
                        key={imgId}
                        src={src}
                        className="w-16 h-16 rounded-lg object-cover border border-gray-200 dark:border-white/[0.08] cursor-pointer hover:opacity-80 transition"
                        onClick={() => setLightboxImageId(imgId, task.inputImageIds)}
                        alt=""
                      />
                    )
                  })}
                </div>
              </div>
            )}

            {/* 参数 */}
            <h3 className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">
              参数配置
            </h3>
            <div className="grid grid-cols-2 gap-2 text-xs mb-4">
              <div className="bg-gray-50 dark:bg-white/[0.03] rounded-lg px-3 py-2">
                <span className="text-gray-400 dark:text-gray-500">分类</span>
                <br />
                <span className="text-gray-700 dark:text-gray-300 font-medium break-all">{categoryName}</span>
              </div>
              <div className="bg-gray-50 dark:bg-white/[0.03] rounded-lg px-3 py-2">
                <span className="text-gray-400 dark:text-gray-500">收藏</span>
                <br />
                <span className="text-gray-700 dark:text-gray-300 font-medium">{isFavorite ? '已收藏' : '未收藏'}</span>
              </div>
              <div className="bg-gray-50 dark:bg-white/[0.03] rounded-lg px-3 py-2">
                <span className="text-gray-400 dark:text-gray-500">供应商</span>
                <br />
                <span className="text-gray-700 dark:text-gray-300 font-medium break-all">{providerName}</span>
              </div>
              {taskApiProtocol ? renderValueCard('协议', taskApiProtocol) : null}
              {taskModel ? renderValueCard('主模型', taskModel) : null}
              {taskApiProtocol === 'responses' && taskResponsesImageModel
                ? renderValueCard('图像模型', taskResponsesImageModel)
                : null}
              {task.status === 'done' && currentImageSize
                ? renderValueCard('输出像素', currentImageSize)
                : renderValueCard('请求尺寸', task.params.size)}
              {appliedSize && appliedSize !== currentImageSize && appliedSize !== task.params.size
                ? renderValueCard('API 返回尺寸', appliedSize)
                : null}
              {task.status === 'done' && currentImageSize
                ? renderValueCard('请求尺寸', task.params.size)
                : null}
              {renderRequestedParamCard('质量', task.params.quality, displayQuality, appliedQuality)}
              {renderRequestedParamCard('格式', task.params.output_format, displayOutputFormat, appliedOutputFormat)}
              {appliedBackground && (
                <div className="bg-gray-50 dark:bg-white/[0.03] rounded-lg px-3 py-2">
                  <span className="text-gray-400 dark:text-gray-500">实际背景</span>
                  <br />
                  <span className="text-gray-700 dark:text-gray-300 font-medium break-all">{appliedBackground}</span>
                </div>
              )}
              {appliedAction && (
                <div className="bg-gray-50 dark:bg-white/[0.03] rounded-lg px-3 py-2">
                  <span className="text-gray-400 dark:text-gray-500">实际动作</span>
                  <br />
                  <span className="text-gray-700 dark:text-gray-300 font-medium break-all">{appliedAction}</span>
                </div>
              )}
              <div className="bg-gray-50 dark:bg-white/[0.03] rounded-lg px-3 py-2">
                <span className="text-gray-400 dark:text-gray-500">审核</span>
                <br />
                <span className="text-gray-700 dark:text-gray-300 font-medium">{task.params.moderation}</span>
              </div>
              <div className="bg-gray-50 dark:bg-white/[0.03] rounded-lg px-3 py-2">
                <span className="text-gray-400 dark:text-gray-500">数量</span>
                <br />
                <span className="text-gray-700 dark:text-gray-300 font-medium">{task.params.n}</span>
              </div>
              {task.params.output_compression != null && (
                <div className="bg-gray-50 dark:bg-white/[0.03] rounded-lg px-3 py-2">
                  <span className="text-gray-400 dark:text-gray-500">压缩率</span>
                  <br />
                  <span className="text-gray-700 dark:text-gray-300 font-medium">
                    {task.params.output_compression}
                  </span>
                </div>
              )}
            </div>

            {/* 时间 */}
            <div className="text-xs text-gray-400 dark:text-gray-500 mb-4">
              <span>创建于 {formatTime(task.createdAt)}</span>
              {formatDuration() && <span> · 耗时 {formatDuration()}</span>}
              {inRecycleBin && task.deletedAt ? (
                <>
                  <br />
                  <span>移入回收站于 {formatTime(task.deletedAt)}</span>
                  {cleanupDueAt ? <span> · 预计清理于 {formatTime(cleanupDueAt)}</span> : null}
                </>
              ) : null}
            </div>
          </div>

          {/* 操作按钮 */}
          <div className="flex gap-2 pt-3 border-t border-gray-100 dark:border-white/[0.08]">
            {inRecycleBin ? (
              <button
                onClick={handleRestore}
                className="flex-1 flex items-center justify-center gap-1.5 px-2 sm:px-3 py-2 rounded-lg bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-500/20 transition text-xs sm:text-sm font-medium whitespace-nowrap"
              >
                <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 12a8 8 0 018-8h5m0 0v5m0-5l-6 6m-7 2a8 8 0 008 8h5" />
                </svg>
                恢复记录
              </button>
            ) : (
              <>
                <button
                  onClick={handleReuse}
                  className="flex-1 flex items-center justify-center gap-1.5 px-2 sm:px-3 py-2 rounded-lg bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-500/20 transition text-xs sm:text-sm font-medium whitespace-nowrap"
                >
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                  </svg>
                  复用配置
                </button>
                <button
                  onClick={handleEdit}
                  disabled={!outputLen}
                  className="flex-1 flex items-center justify-center gap-1.5 px-2 sm:px-3 py-2 rounded-lg bg-green-50 dark:bg-green-500/10 text-green-600 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition text-xs sm:text-sm font-medium whitespace-nowrap"
                >
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  编辑输出
                </button>
                <button
                  onClick={handleDelete}
                  className="flex-1 flex items-center justify-center gap-1.5 px-2 sm:px-3 py-2 rounded-lg bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-500/20 transition text-xs sm:text-sm font-medium whitespace-nowrap"
                >
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  移入回收站
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
