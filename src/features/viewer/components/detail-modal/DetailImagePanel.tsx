import type { RefObject } from 'react'
import type { TaskRecord } from '../../../../types'
import { isTaskRunExceptional, resolveTaskRunOutcome } from '../../../../store'
import ErrorSourceUrlLink from './ErrorSourceUrlLink'
import { resolveTaskErrorSourceUrl } from './shared'

interface DetailImagePanelProps {
  task: TaskRecord
  imageIndex: number
  outputLen: number
  hasGeneratedOutputs: boolean
  currentOutputImageSrc: string
  currentImageRatio: string
  currentImageSize: string
  imageLabelLeft: number
  imagePanelRef: RefObject<HTMLDivElement | null>
  mainImageRef: RefObject<HTMLImageElement | null>
  durationLabel: string | null
  statusLabel: string
  onCopyError: () => void
  onMainImageLoad: () => void
  onOpenLightbox: () => void
  onPrevImage: () => void
  onNextImage: () => void
}

export default function DetailImagePanel({
  task,
  imageIndex,
  outputLen,
  hasGeneratedOutputs,
  currentOutputImageSrc,
  currentImageRatio,
  currentImageSize,
  imageLabelLeft,
  imagePanelRef,
  mainImageRef,
  durationLabel,
  statusLabel,
  onCopyError,
  onMainImageLoad,
  onOpenLightbox,
  onPrevImage,
  onNextImage,
}: DetailImagePanelProps) {
  const runOutcome = resolveTaskRunOutcome(task)
  const isExceptional = isTaskRunExceptional(task)
  const errorSourceUrl = resolveTaskErrorSourceUrl(task)

  return (
    <div
      ref={imagePanelRef}
      className="relative flex h-64 min-h-[16rem] w-full flex-shrink-0 items-center justify-center bg-gray-100 md:h-auto md:w-[48%] dark:bg-black/20"
    >
      {hasGeneratedOutputs && (
        <>
          {currentOutputImageSrc ? (
            <img
              ref={mainImageRef}
              src={currentOutputImageSrc}
              className="max-h-[calc(100%-2rem)] max-w-[calc(100%-2rem)] cursor-pointer object-contain"
              onLoad={onMainImageLoad}
              onClick={onOpenLightbox}
              alt=""
            />
          ) : (
            <svg className="h-10 w-10 animate-spin text-blue-400" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          )}

          <div className="absolute top-[15px] flex items-center gap-1.5" style={{ left: imageLabelLeft }}>
            {currentImageRatio && currentImageSize ? (
              <>
                <span className="rounded bg-black/50 px-2 py-0.5 font-mono text-xs text-white backdrop-blur-sm">
                  {currentImageRatio}
                </span>
                <span className="rounded bg-black/50 px-2 py-0.5 text-xs font-medium text-white/90 backdrop-blur-sm">
                  {currentImageSize}
                </span>
              </>
            ) : (
              durationLabel && (
                <span className="flex items-center gap-1 rounded bg-black/50 px-2 py-0.5 font-mono text-xs text-white backdrop-blur-sm">
                  <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {durationLabel}
                </span>
              )
            )}
          </div>

          {task.status !== 'done' && (
            <div className="absolute right-3 top-3 flex flex-col items-end gap-2">
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium text-white backdrop-blur-sm ${
                  task.status === 'running'
                    ? 'bg-blue-500/80'
                    : runOutcome === 'aborted'
                      ? 'bg-amber-500/80'
                      : runOutcome === 'partial_error'
                        ? 'bg-orange-500/80'
                      : 'bg-red-500/80'
                }`}
              >
                {statusLabel}
              </span>
              {isExceptional && task.error && (
                <div className="max-w-[18rem] rounded-2xl bg-black/55 px-3 py-2 text-right text-xs leading-5 text-white/90 backdrop-blur-sm">
                  <p
                    style={{
                      display: '-webkit-box',
                      WebkitBoxOrient: 'vertical',
                      WebkitLineClamp: 4,
                      overflow: 'hidden',
                    }}
                  >
                    {task.error}
                  </p>
                  {errorSourceUrl && (
                    <ErrorSourceUrlLink url={errorSourceUrl} variant="overlay" />
                  )}
                  {!errorSourceUrl && (
                    <button
                      type="button"
                      onClick={onCopyError}
                      className="mt-2 inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-1 text-[11px] text-white/85 transition hover:bg-white/16"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                        <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
                        <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
                      </svg>
                      复制报错
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {outputLen > 1 && (
            <>
              <button
                type="button"
                onClick={onPrevImage}
                className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/30 p-1.5 text-white transition hover:bg-black/50"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <button
                type="button"
                onClick={onNextImage}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/30 p-1.5 text-white transition hover:bg-black/50"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
              <span className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-2 py-0.5 text-xs text-white">
                {imageIndex + 1} / {outputLen}
              </span>
            </>
          )}
        </>
      )}

      {!hasGeneratedOutputs && task.status === 'running' && (
        <svg className="h-10 w-10 animate-spin text-blue-400" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}

      {!hasGeneratedOutputs && isExceptional && (
        <div className="w-full max-w-md px-4 text-center">
          <svg
            className={`mx-auto mb-2 h-10 w-10 ${runOutcome === 'partial_error' ? 'text-orange-400' : 'text-red-400'}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            {runOutcome === 'partial_error' ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M4.93 19h14.14c1.54 0 2.5-1.67 1.73-3L13.73 3c-.77-1.33-2.69-1.33-3.46 0L3.2 16c-.77 1.33.19 3 1.73 3z" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            )}
          </svg>
          <p
            className={`overflow-hidden break-all text-sm leading-6 ${runOutcome === 'partial_error' ? 'text-orange-500' : 'text-red-500'}`}
            style={{
              display: '-webkit-box',
              WebkitBoxOrient: 'vertical',
              WebkitLineClamp: 4,
            }}
          >
            {task.error || '生成失败'}
          </p>
          {errorSourceUrl ? (
            <ErrorSourceUrlLink url={errorSourceUrl} variant="panel" />
          ) : (
            <button
              type="button"
              onClick={onCopyError}
              className="mt-3 inline-flex items-center justify-center rounded-full border border-red-200/80 bg-white/80 px-3 py-1.5 text-red-500 transition hover:bg-red-50 dark:border-red-400/20 dark:bg-white/[0.04] dark:hover:bg-red-500/10"
              aria-label="复制完整报错"
              title="复制完整报错"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
                <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
              </svg>
            </button>
          )}
        </div>
      )}
    </div>
  )
}
