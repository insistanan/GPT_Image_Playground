import type { TaskRecord } from '@/types'
import { isTaskRunExceptional, resolveTaskRunOutcome } from '@/store'

interface TaskCardPreviewStatusLayerProps {
  task: TaskRecord
  thumbSrc: string
  imageFit?: 'cover' | 'contain'
  progressCountLabel: string | null
  statusLabel: string
  onAbort: () => void
}

function RunningAbortButton({ onAbort }: { onAbort: () => void }) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation()
        onAbort()
      }}
      className="pointer-events-none absolute left-1/2 top-1/2 z-20 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white opacity-0 shadow-lg backdrop-blur-md transition-all duration-300 hover:border-red-400/50 hover:bg-red-500/80 hover:text-white hover:shadow-red-500/25 group-hover/task-preview:pointer-events-auto group-hover/task-preview:opacity-100"
      title="中止生成"
      aria-label="中止生成"
    >
      <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
        <path d="M7 7h10v10H7z" />
      </svg>
    </button>
  )
}

export default function TaskCardPreviewStatusLayer({
  task,
  thumbSrc,
  imageFit = 'cover',
  progressCountLabel,
  statusLabel,
  onAbort,
}: TaskCardPreviewStatusLayerProps) {
  const isRunning = task.status === 'running'
  const runOutcome = resolveTaskRunOutcome(task)
  const isExceptional = isTaskRunExceptional(task)
  const hasGeneratedOutputs = Array.isArray(task.outputImages) && task.outputImages.length > 0
  const runningStatusContentClass =
    'transition duration-150 group-hover/task-preview:scale-95 group-hover/task-preview:opacity-0'
  const imageFitClass = imageFit === 'contain' ? 'object-contain' : 'object-cover'

  if (isRunning) {
    return thumbSrc ? (
      <>
        <img src={thumbSrc} className={`h-full w-full ${imageFitClass}`} loading="lazy" alt="" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/[0.65] via-black/10 to-black/[0.35]" />
        <div className="absolute inset-0 bg-black/30 opacity-0 transition duration-150 group-hover/task-preview:opacity-100" />
        <div className={`absolute inset-x-0 bottom-2 flex flex-col items-center gap-1 px-2 text-white ${runningStatusContentClass}`}>
          <span className="inline-flex items-center gap-1 rounded-full bg-black/[0.45] px-2 py-0.5 text-xs font-medium backdrop-blur-sm">
            <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            {statusLabel}
          </span>
          {progressCountLabel && (
            <span className="rounded-full bg-white/[0.18] px-2 py-0.5 text-[11px] font-medium backdrop-blur-sm">
              {progressCountLabel}
            </span>
          )}
        </div>
        <RunningAbortButton onAbort={onAbort} />
      </>
    ) : (
      <>
        <div className={`flex flex-col items-center gap-2 ${runningStatusContentClass}`}>
          <svg className="h-8 w-8 animate-spin text-blue-400" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="text-xs text-gray-400 dark:text-gray-500">{statusLabel}</span>
          {progressCountLabel && (
            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-600 dark:bg-blue-500/10 dark:text-blue-300">
              {progressCountLabel}
            </span>
          )}
        </div>
        <RunningAbortButton onAbort={onAbort} />
      </>
    )
  }

  if (isExceptional) {
    return hasGeneratedOutputs && thumbSrc ? (
      <>
        <img src={thumbSrc} className={`h-full w-full ${imageFitClass}`} loading="lazy" alt="" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/[0.15] to-black/[0.35]" />
        <div className="absolute inset-x-0 bottom-2 flex flex-col items-center gap-1 px-2 text-white">
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium backdrop-blur-sm ${
              runOutcome === 'aborted' ? 'bg-amber-500/75' : runOutcome === 'partial_error' ? 'bg-orange-500/75' : 'bg-red-500/75'
            }`}
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {runOutcome === 'aborted' ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9h6v6H9zM21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              ) : runOutcome === 'partial_error' ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M4.93 19h14.14c1.54 0 2.5-1.67 1.73-3L13.73 3c-.77-1.33-2.69-1.33-3.46 0L3.2 16c-.77 1.33.19 3 1.73 3z" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              )}
            </svg>
            {statusLabel}
          </span>
          {progressCountLabel && (
            <span className="rounded-full bg-white/[0.18] px-2 py-0.5 text-[11px] font-medium backdrop-blur-sm">
              {progressCountLabel}
            </span>
          )}
        </div>
      </>
    ) : (
      <div className="flex flex-col items-center gap-1 px-2">
        <svg
          className={`h-7 w-7 ${runOutcome === 'aborted' ? 'text-amber-400' : runOutcome === 'partial_error' ? 'text-orange-400' : 'text-red-400'}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          {runOutcome === 'aborted' ? (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9h6v6H9zM21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          ) : runOutcome === 'partial_error' ? (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M4.93 19h14.14c1.54 0 2.5-1.67 1.73-3L13.73 3c-.77-1.33-2.69-1.33-3.46 0L3.2 16c-.77 1.33.19 3 1.73 3z" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          )}
        </svg>
        <span className={`text-center text-xs leading-tight ${runOutcome === 'aborted' ? 'text-amber-400' : runOutcome === 'partial_error' ? 'text-orange-400' : 'text-red-400'}`}>
          {statusLabel}
        </span>
      </div>
    )
  }

  if (task.status === 'done' && thumbSrc) {
    return (
      <>
        <img src={thumbSrc} className={`h-full w-full ${imageFitClass}`} loading="lazy" alt="" />
        {task.outputImages.length > 1 && (
          <span className="absolute bottom-2 right-2 rounded-full bg-black/[0.65] px-2 py-0.5 text-[11px] font-medium text-white">
            {task.outputImages.length}
          </span>
        )}
      </>
    )
  }

  return (
    <svg className="h-8 w-8 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
      />
    </svg>
  )
}
