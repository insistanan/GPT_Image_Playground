import type { GalleryDisplayMode, TaskView } from '@/types'
import { ACTION_BUTTON_CLASS, SEGMENTED_BUTTON_CLASS } from './shared'

interface ViewToggleBarProps {
  taskView: TaskView
  galleryDisplayMode: GalleryDisplayMode
  activeGalleryCount: number
  recycleBinCount: number
  onSetTaskView: (view: TaskView) => void
  onSetGalleryDisplayMode: (mode: GalleryDisplayMode) => void
}

export default function ViewToggleBar({
  taskView,
  galleryDisplayMode,
  activeGalleryCount,
  recycleBinCount,
  onSetTaskView,
  onSetGalleryDisplayMode,
}: ViewToggleBarProps) {
  const isGalleryActive = taskView === 'gallery'
  const galleryCountClassName = isGalleryActive
    ? 'bg-white/18 text-white'
    : 'bg-gray-100 px-1.5 py-0.5 text-[10px] leading-none text-gray-500 dark:bg-white/[0.05] dark:text-gray-400'
  const trashCountClassName = !isGalleryActive
    ? 'bg-white/18 text-white'
    : 'bg-gray-100 px-1.5 py-0.5 text-[10px] leading-none text-gray-500 dark:bg-white/[0.05] dark:text-gray-400'

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <div className="inline-flex items-center rounded-full border border-gray-200/80 bg-white/90 p-0.5 shadow-[0_14px_30px_-28px_rgba(15,23,42,0.58)] backdrop-blur-sm dark:border-white/[0.08] dark:bg-gray-900/80">
        <button
          type="button"
          onClick={() => onSetTaskView('gallery')}
          className={`${SEGMENTED_BUTTON_CLASS} ${
            isGalleryActive
              ? 'bg-blue-500 text-white shadow-[0_12px_24px_-16px_rgba(37,99,235,0.9)]'
              : 'text-gray-600 hover:bg-gray-100/80 dark:text-gray-300 dark:hover:bg-white/[0.06]'
          }`}
        >
          <span>画廊</span>
          <span className={`rounded-full px-1.5 py-0.5 text-[10px] leading-none ${galleryCountClassName}`}>
            {activeGalleryCount}
          </span>
        </button>

        <button
          type="button"
          onClick={() => onSetTaskView('trash')}
          className={`${SEGMENTED_BUTTON_CLASS} ${
            !isGalleryActive
              ? 'bg-blue-500 text-white shadow-[0_12px_24px_-16px_rgba(37,99,235,0.9)]'
              : 'text-gray-600 hover:bg-gray-100/80 dark:text-gray-300 dark:hover:bg-white/[0.06]'
          }`}
        >
          <span>回收站</span>
          <span className={`rounded-full px-1.5 py-0.5 text-[10px] leading-none ${trashCountClassName}`}>
            {recycleBinCount}
          </span>
        </button>
      </div>

      {taskView === 'gallery' && (
        <button
          type="button"
          onClick={() =>
            onSetGalleryDisplayMode(galleryDisplayMode === 'image' ? 'standard' : 'image')
          }
          className={`${ACTION_BUTTON_CLASS} ${
            galleryDisplayMode === 'image'
              ? 'border-blue-300/80 bg-blue-50 text-blue-600 shadow-[0_16px_32px_-24px_rgba(37,99,235,0.75)] dark:border-blue-400/30 dark:bg-blue-500/12 dark:text-blue-300'
              : 'border-gray-200/80 bg-white/88 text-gray-600 hover:-translate-y-px hover:bg-gray-100/88 dark:border-white/[0.08] dark:bg-gray-900/[0.76] dark:text-gray-300 dark:hover:bg-white/[0.06]'
          }`}
          title={galleryDisplayMode === 'image' ? '切换为普通模式' : '切换为图片模式'}
          aria-pressed={galleryDisplayMode === 'image'}
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <rect
              x="3.8"
              y="7.4"
              width="7.2"
              height="5.6"
              rx="1.4"
              transform="rotate(-7 3.8 7.4)"
              strokeWidth={1.7}
            />
            <rect
              x="10.9"
              y="3.5"
              width="8.4"
              height="6.4"
              rx="1.6"
              transform="rotate(5 10.9 3.5)"
              strokeWidth={1.7}
            />
            <rect x="7.2" y="11.1" width="10.2" height="8.4" rx="1.8" strokeWidth={1.7} />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.7}
              d="m9.4 16.8 2.45-2.9a.9.9 0 0 1 1.38-.02l1.78 2.03 1.12-1.18a.9.9 0 0 1 1.32.05l1.11 1.34"
            />
          </svg>
          <span className="hidden sm:inline">{galleryDisplayMode === 'image' ? '图片模式' : '纯图模式'}</span>
          {galleryDisplayMode === 'image' && (
            <span className="rounded-full bg-blue-500/12 px-1.5 py-0.5 text-[10px] leading-none text-blue-600 dark:bg-blue-400/12 dark:text-blue-300">
              开
            </span>
          )}
        </button>
      )}

      {taskView === 'trash' && (
        <span className="text-xs text-gray-400 dark:text-gray-500">
          回收站项目会每 10 分钟轮询一次，自动清理 15 天前的记录
        </span>
      )}
    </div>
  )
}
