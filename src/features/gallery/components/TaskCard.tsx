import { memo, useEffect, useState, type MouseEvent as ReactMouseEvent } from 'react'
import {
  canEditTaskOutputs,
  resolveTaskImageProgress,
  resolveTaskAppliedImageParam,
  resolveTaskDisplayImageParam,
  resolveTaskStatusLabel,
  resolveTaskTransportLabel,
  resolveTaskTransportMeta,
  type TaskRecord,
} from '../../../types'
import { getCachedImage, ensureImageCached } from '../../../store'
import { formatImageRatio } from '../../../lib/size'

interface Props {
  task: TaskRecord
  categoryName: string
  providerName: string
  isInRecycleBin: boolean
  isFavorite: boolean
  selected: boolean
  onReuse: () => void
  onEditOutputs: () => void
  onRetry: () => void
  onAbort: () => void
  onToggleFavorite: () => void
  onMoveCategory: () => void
  onDelete: () => void
  onPurge: () => void
  onRestore: () => void
  onClick: () => void
  onToggleSelect: () => void
  onContextMenu: (event: ReactMouseEvent<HTMLDivElement>) => void
}

const imageMetaCache = new Map<string, { ratio: string; size: string }>()

function TaskCard({
  task,
  categoryName,
  providerName,
  isInRecycleBin,
  isFavorite,
  selected,
  onReuse,
  onEditOutputs,
  onRetry,
  onAbort,
  onToggleFavorite,
  onMoveCategory,
  onDelete,
  onPurge,
  onRestore,
  onClick,
  onToggleSelect,
  onContextMenu,
}: Props) {
  const [thumbSrc, setThumbSrc] = useState<string>('')
  const [coverRatio, setCoverRatio] = useState<string>('')
  const [coverSize, setCoverSize] = useState<string>('')
  const [now, setNow] = useState(Date.now())
  const progress = resolveTaskImageProgress(task)
  const statusLabel = resolveTaskStatusLabel(task)
  const transportLabel = resolveTaskTransportLabel(task)
  const transportMeta = resolveTaskTransportMeta(task)
  const canEditOutputs = canEditTaskOutputs(task)
  const isRunning = task.status === 'running'
  const hasGeneratedOutputs = Array.isArray(task.outputImages) && task.outputImages.length > 0
  const coverImageId =
    isRunning
      ? task.outputImages?.[task.outputImages.length - 1] || ''
      : task.outputImages?.[0] || ''

  // 定时更新运行中任务的计时
  useEffect(() => {
    if (task.status !== 'running') return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [task.status])

  // 加载缩略图
  useEffect(() => {
    setCoverRatio('')
    setCoverSize('')
    setThumbSrc('')

    if (coverImageId) {
      const cached = getCachedImage(coverImageId)
      if (cached) {
        setThumbSrc(cached)
      } else {
        ensureImageCached(coverImageId).then((url) => {
          if (url) setThumbSrc(url)
        })
      }
    }
  }, [coverImageId])

  useEffect(() => {
    if (!thumbSrc || !coverImageId) return

    const cachedMeta = imageMetaCache.get(coverImageId)
    if (cachedMeta) {
      setCoverRatio(cachedMeta.ratio)
      setCoverSize(cachedMeta.size)
      return
    }

    let cancelled = false
    const image = new Image()
    image.onload = () => {
      if (!cancelled && image.naturalWidth > 0 && image.naturalHeight > 0) {
        const nextMeta = {
          ratio: formatImageRatio(image.naturalWidth, image.naturalHeight),
          size: `${image.naturalWidth}×${image.naturalHeight}`,
        }
        imageMetaCache.set(coverImageId, nextMeta)
        setCoverRatio(nextMeta.ratio)
        setCoverSize(nextMeta.size)
      }
    }
    image.src = thumbSrc
    if (image.complete && image.naturalWidth > 0 && image.naturalHeight > 0) {
      const nextMeta = {
        ratio: formatImageRatio(image.naturalWidth, image.naturalHeight),
        size: `${image.naturalWidth}×${image.naturalHeight}`,
      }
      imageMetaCache.set(coverImageId, nextMeta)
      setCoverRatio(nextMeta.ratio)
      setCoverSize(nextMeta.size)
    }

    return () => {
      cancelled = true
    }
  }, [coverImageId, thumbSrc])

  const duration = (() => {
    let seconds: number
    if (task.status === 'running') {
      seconds = Math.floor((now - task.createdAt) / 1000)
    } else if (task.elapsed != null) {
      seconds = Math.floor(task.elapsed / 1000)
    } else {
      return '00:00'
    }
    const mm = String(Math.floor(seconds / 60)).padStart(2, '0')
    const ss = String(seconds % 60).padStart(2, '0')
    return `${mm}:${ss}`
  })()
  const displayQuality = resolveTaskDisplayImageParam(task, 'quality')
  const displayOutputFormat = resolveTaskDisplayImageParam(task, 'output_format')
  const appliedQuality = resolveTaskAppliedImageParam(task, 'quality')
  const appliedSize = resolveTaskAppliedImageParam(task, 'size')
  const appliedOutputFormat = resolveTaskAppliedImageParam(task, 'output_format')
  const sizeChipValue = coverSize || task.params.size
  const sizeTitleParts: string[] = []
  if (coverSize) {
    sizeTitleParts.push(`输出像素: ${coverSize}`)
  }
  if (task.params.size !== sizeChipValue || !coverSize) {
    sizeTitleParts.push(`请求: ${task.params.size}`)
  }
  if (appliedSize && appliedSize !== sizeChipValue && appliedSize !== task.params.size) {
    sizeTitleParts.push(`API 返回: ${appliedSize}`)
  }
  const sizeTitle = sizeTitleParts.length > 0 ? sizeTitleParts.join(' / ') : undefined
  const statusChipClass =
    task.status === 'done'
      ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300'
      : task.status === 'error'
        ? task.isAborted
          ? 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300'
          : 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-300'
        : 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300'
  const transportChipClass =
    transportMeta?.actual === 'stream'
      ? 'bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-300'
      : transportMeta?.fallbackFromStream
        ? 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300'
        : 'bg-gray-100 text-gray-500 dark:bg-white/[0.04] dark:text-gray-400'

  const runningStatusContentClass =
    'transition duration-150 group-hover/task-preview:opacity-0 group-hover/task-preview:scale-95'

  const runningAbortButton = (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation()
        onAbort()
      }}
      className="pointer-events-none absolute left-1/2 top-1/2 z-20 inline-flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-full border border-red-300/45 bg-red-500/92 px-3 py-2 text-xs font-medium text-white opacity-0 shadow-[0_16px_40px_rgba(239,68,68,0.32)] backdrop-blur transition duration-150 hover:bg-red-500 group-hover/task-preview:pointer-events-auto group-hover/task-preview:opacity-100"
      title="中止生成"
      aria-label="中止生成"
    >
      <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
        <path d="M7 7h10v10H7z" />
      </svg>
      <span>中止生成</span>
    </button>
  )

  return (
    <div
      data-task-card-root
      data-task-id={task.id}
      className={`bg-white dark:bg-gray-900 rounded-xl border overflow-hidden cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-lg ${
        selected
          ? 'border-blue-500 ring-2 ring-blue-100 dark:ring-blue-500/20'
          : task.status === 'running'
            ? 'border-blue-400 generating'
            : 'border-gray-200 dark:border-white/[0.08]'
      }`}
      onClick={onClick}
      onContextMenu={onContextMenu}
    >
      <div className="flex h-40">
        {/* 左侧图片区域 */}
        <div className={`group/task-preview w-40 min-w-[10rem] h-full bg-gray-100 dark:bg-black/20 relative flex items-center justify-center overflow-hidden flex-shrink-0 ${isRunning ? 'select-none' : ''}`}>
          {!isInRecycleBin && (
            <button
              type="button"
              className={`absolute top-1.5 right-9 z-10 flex h-6 w-6 items-center justify-center rounded-md border backdrop-blur-sm transition ${
                isFavorite
                  ? 'border-amber-300 bg-amber-400 text-black shadow-sm'
                  : 'border-white/60 bg-white/80 text-transparent hover:text-amber-500 dark:border-white/10 dark:bg-black/40 dark:hover:text-amber-300'
              }`}
              onClick={(e) => {
                e.stopPropagation()
                onToggleFavorite()
              }}
              title={isFavorite ? '取消收藏' : '加入收藏'}
              aria-label={isFavorite ? '取消收藏' : '加入收藏'}
            >
              <svg className="h-3.5 w-3.5" fill={isFavorite ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="m11.049 2.927 2.037 4.128 4.556.663-3.297 3.213.778 4.538L11.05 13.33 6.978 15.47l.778-4.538-3.297-3.213 4.556-.663 2.034-4.128Z" />
              </svg>
            </button>
          )}
          <button
            type="button"
            className={`absolute top-1.5 right-1.5 z-10 flex h-6 w-6 items-center justify-center rounded-md border backdrop-blur-sm transition ${
              selected
                ? 'border-blue-500 bg-blue-500 text-white shadow-sm'
                : 'border-white/60 bg-white/80 text-transparent hover:text-gray-400 dark:border-white/10 dark:bg-black/40 dark:hover:text-gray-200'
            }`}
            onClick={(e) => {
              e.stopPropagation()
              onToggleSelect()
            }}
            title={selected ? '取消选择' : '选择任务'}
            aria-label={selected ? '取消选择' : '选择任务'}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          </button>
          {isRunning && (
            thumbSrc ? (
              <>
                <img
                  src={thumbSrc}
                  className="w-full h-full object-cover"
                  loading="lazy"
                  alt=""
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-black/35" />
                <div className="absolute inset-0 bg-black/30 opacity-0 transition duration-150 group-hover/task-preview:opacity-100" />
                <div className={`absolute inset-x-0 bottom-2 flex flex-col items-center gap-1 px-2 text-white ${runningStatusContentClass}`}>
                  <span className="inline-flex items-center gap-1 rounded-full bg-black/45 px-2 py-0.5 text-xs font-medium backdrop-blur-sm">
                    <svg
                      className="h-3.5 w-3.5 animate-spin"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      />
                    </svg>
                    {statusLabel}
                  </span>
                  {progress.countLabel && (
                    <span className="rounded-full bg-white/18 px-2 py-0.5 text-[11px] font-medium backdrop-blur-sm">
                      {progress.countLabel}
                    </span>
                  )}
                </div>
                {runningAbortButton}
              </>
            ) : (
              <>
                <div className={`flex flex-col items-center gap-2 ${runningStatusContentClass}`}>
                  <svg
                    className="w-8 h-8 text-blue-400 animate-spin"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    {statusLabel}
                  </span>
                  {progress.countLabel && (
                    <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-600 dark:bg-blue-500/10 dark:text-blue-300">
                      {progress.countLabel}
                    </span>
                  )}
                </div>
                {runningAbortButton}
              </>
            )
          )}
          {task.status === 'error' && (
            hasGeneratedOutputs && thumbSrc ? (
              <>
                <img
                  src={thumbSrc}
                  className="w-full h-full object-cover"
                  loading="lazy"
                  alt=""
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-black/35" />
                <div className="absolute inset-x-0 bottom-2 flex flex-col items-center gap-1 px-2 text-white">
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium backdrop-blur-sm ${
                      task.isAborted ? 'bg-amber-500/75' : 'bg-red-500/75'
                    }`}
                  >
                    <svg
                      className="h-3.5 w-3.5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      {task.isAborted ? (
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 9h6v6H9zM21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      ) : (
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      )}
                    </svg>
                    {statusLabel}
                  </span>
                  {progress.countLabel && (
                    <span className="rounded-full bg-white/18 px-2 py-0.5 text-[11px] font-medium backdrop-blur-sm">
                      {progress.countLabel}
                    </span>
                  )}
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center gap-1 px-2">
                <svg
                  className={`w-7 h-7 ${task.isAborted ? 'text-amber-400' : 'text-red-400'}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  {task.isAborted ? (
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 9h6v6H9zM21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  ) : (
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  )}
                </svg>
                <span
                  className={`text-xs text-center leading-tight ${task.isAborted ? 'text-amber-400' : 'text-red-400'}`}
                >
                  {statusLabel}
                </span>
              </div>
            )
          )}
          {task.status === 'done' && thumbSrc && (
            <>
              <img
                src={thumbSrc}
                className="w-full h-full object-cover"
                loading="lazy"
                alt=""
              />
              {task.outputImages.length > 1 && (
                <span className="absolute bottom-1 right-1 bg-black/60 text-white text-xs px-1.5 py-0.5 rounded">
                  {task.outputImages.length}
                </span>
              )}
            </>
          )}
          {task.status === 'done' && !thumbSrc && (
            <svg
              className="w-8 h-8 text-gray-300"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          )}
          {/* 运行中显示耗时，完成后显示封面图比例与分辨率标签 */}
          <div className="absolute top-1.5 left-1.5 flex items-center gap-1">
            {task.status !== 'done' || !coverRatio || !coverSize ? (
              <span className="flex items-center gap-1 bg-black/50 text-white text-[10px] sm:text-xs px-1.5 py-0.5 rounded backdrop-blur-sm font-mono">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {duration}
              </span>
            ) : (
              <>
                <span className="bg-black/50 text-white text-[10px] sm:text-xs px-1.5 py-0.5 rounded backdrop-blur-sm font-mono">
                  {coverRatio}
                </span>
                <span className="bg-black/50 text-white/90 text-[10px] sm:text-xs px-1.5 py-0.5 rounded backdrop-blur-sm font-medium">
                  {coverSize}
                </span>
              </>
            )}
          </div>
        </div>

        {/* 右侧信息区域 */}
        <div className="flex-1 p-3 flex flex-col min-w-0">
          <div className="flex-1 min-h-0 mb-2">
            <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed line-clamp-3">
              {task.prompt || '(无提示词)'}
            </p>
          </div>
          <div className="mt-auto flex flex-col gap-1.5">
            {/* 参数：横向滚动 */}
            <div className="flex overflow-x-auto hide-scrollbar gap-1.5 whitespace-nowrap mask-edge-r min-w-0 pr-2">
              {isInRecycleBin && (
                <span className="text-xs px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300 flex-shrink-0">
                  回收站
                </span>
              )}
              {!isInRecycleBin && isFavorite && (
                <span className="text-xs px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300 flex-shrink-0">
                  收藏
                </span>
              )}
              <span
                className="max-w-[8rem] truncate text-xs px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300 flex-shrink-0"
                title={categoryName}
              >
                {categoryName}
              </span>
              <span
                className="max-w-[9rem] truncate text-xs px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300 flex-shrink-0"
                title={providerName}
              >
                {providerName}
              </span>
              <span className={`text-xs px-1.5 py-0.5 rounded flex-shrink-0 ${statusChipClass}`}>
                {statusLabel}
              </span>
              {progress.countLabel && (
                <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-white/[0.04] text-gray-500 dark:text-gray-400 flex-shrink-0">
                  {progress.countLabel}
                </span>
              )}
              {transportLabel && (
                <span className={`text-xs px-1.5 py-0.5 rounded flex-shrink-0 ${transportChipClass}`}>
                  {transportLabel}
                </span>
              )}
              <span
                className="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-white/[0.04] text-gray-500 dark:text-gray-400 flex-shrink-0"
                title={appliedQuality && appliedQuality !== task.params.quality ? `请求: ${task.params.quality} / 实际: ${displayQuality}` : undefined}
              >
                {displayQuality}
              </span>
              <span
                className="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-white/[0.04] text-gray-500 dark:text-gray-400 flex-shrink-0"
                title={sizeTitle}
              >
                {sizeChipValue}
              </span>
              <span
                className="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-white/[0.04] text-gray-500 dark:text-gray-400 flex-shrink-0"
                title={appliedOutputFormat && appliedOutputFormat !== task.params.output_format ? `请求: ${task.params.output_format} / 实际: ${displayOutputFormat}` : undefined}
              >
                {displayOutputFormat}
              </span>
            </div>
            {/* 操作按钮 */}
            <div
              className="flex gap-1 justify-end flex-shrink-0"
              onClick={(e) => e.stopPropagation()}
            >
              {isInRecycleBin ? (
                <>
                  <button
                    onClick={onRestore}
                    className="p-1.5 rounded-md hover:bg-blue-50 dark:hover:bg-blue-950/30 text-gray-400 hover:text-blue-500 transition"
                    title="恢复记录"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 12a8 8 0 018-8h5m0 0v5m0-5l-6 6m-7 2a8 8 0 008 8h5"
                      />
                    </svg>
                  </button>
                  <button
                    onClick={onPurge}
                    className="p-1.5 rounded-md hover:bg-red-50 dark:hover:bg-red-950/30 text-gray-400 hover:text-red-500 transition"
                    title="彻底删除"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={onReuse}
                    className="p-1.5 rounded-md hover:bg-blue-50 dark:hover:bg-blue-950/30 text-gray-400 hover:text-blue-500 transition"
                    title="复用配置"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
                      />
                    </svg>
                  </button>
                  <button
                    onClick={task.status === 'error' ? onRetry : onEditOutputs}
                    className={`p-1.5 rounded-md transition ${
                      task.status === 'error'
                        ? 'text-gray-400 hover:bg-amber-50 hover:text-amber-500 dark:hover:bg-amber-950/30'
                        : 'text-gray-400 hover:bg-green-50 hover:text-green-500 dark:hover:bg-green-950/30 disabled:opacity-30'
                    }`}
                    title={task.status === 'error' ? '重试' : '编辑输出'}
                    disabled={task.status !== 'error' && !canEditOutputs}
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      {task.status === 'error' ? (
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M4 4v5h.582m14.216 2A7.5 7.5 0 005.582 9m0 0H10m10 11v-5h-.581m0 0H14a7.5 7.5 0 01-13.418-2"
                        />
                      ) : (
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                        />
                      )}
                    </svg>
                  </button>
                  <button
                    onClick={onMoveCategory}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-gray-400 transition hover:bg-amber-50 hover:text-amber-600 dark:hover:bg-amber-950/30 dark:hover:text-amber-300"
                    title="移动分类"
                  >
                    <svg
                      className="h-3.5 w-3.5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13 5H6a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V9a2 2 0 00-2-2h-5l-2-2zM12 11v6m0 0l-3-3m3 3l3-3"
                      />
                    </svg>
                    <span>分类</span>
                  </button>
                  <button
                    onClick={onDelete}
                    className="p-1.5 rounded-md hover:bg-red-50 dark:hover:bg-red-950/30 text-gray-400 hover:text-red-500 transition"
                    title="移入回收站"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default memo(TaskCard, (prevProps, nextProps) => {
  return (
    prevProps.task === nextProps.task &&
    prevProps.categoryName === nextProps.categoryName &&
    prevProps.providerName === nextProps.providerName &&
    prevProps.isInRecycleBin === nextProps.isInRecycleBin &&
    prevProps.isFavorite === nextProps.isFavorite &&
    prevProps.selected === nextProps.selected
  )
})
