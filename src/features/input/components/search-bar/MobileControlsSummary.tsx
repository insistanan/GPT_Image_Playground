import type { TaskView } from '@/types'
import { resolveFilterStatusLabel, type SearchFilterStatus } from './shared'

interface MobileControlsSummaryProps {
  taskView: TaskView
  activeCategoryLabel: string
  currentViewCount: number
  filterStatus: SearchFilterStatus
  hasSearchQuery: boolean
  mobileControlsCollapsed: boolean
  onToggle: () => void
}

export default function MobileControlsSummary({
  taskView,
  activeCategoryLabel,
  currentViewCount,
  filterStatus,
  hasSearchQuery,
  mobileControlsCollapsed,
  onToggle,
}: MobileControlsSummaryProps) {
  return (
    <div className="md:hidden">
      <div className="flex items-center gap-2 rounded-2xl border border-gray-200/80 bg-white/[0.9] px-3 py-2.5 shadow-[0_14px_30px_-28px_rgba(15,23,42,0.7)] backdrop-blur-sm dark:border-white/[0.08] dark:bg-gray-900/[0.84]">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-gray-700 dark:text-gray-100">
            {taskView === 'trash' ? '回收站' : `画廊 · ${activeCategoryLabel}`}
          </p>
          <span className="mt-0.5 block truncate text-[11px] text-gray-400 dark:text-gray-500">
            {currentViewCount} 项
            {filterStatus !== 'all' ? ` · ${resolveFilterStatusLabel(filterStatus)}` : ''}
            {hasSearchQuery ? ' · 已搜索' : ''}
          </span>
        </div>

        <button
          type="button"
          onClick={onToggle}
          className="inline-flex h-9 flex-shrink-0 items-center gap-1 rounded-full border border-gray-200 bg-white px-3 text-[12px] font-medium text-gray-600 transition hover:bg-gray-50 dark:border-white/[0.08] dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.06]"
        >
          {mobileControlsCollapsed ? '展开' : '收起'}
          <svg
            className={`h-3.5 w-3.5 transition-transform duration-200 ${mobileControlsCollapsed ? '' : 'rotate-180'}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>
    </div>
  )
}
