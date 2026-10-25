import type { TaskView } from '@/types'
import Select from '@/shared/components/Select'
import { FILTER_STATUS_OPTIONS, type SearchFilterStatus } from './shared'

interface SearchFiltersProps {
  filterStatus: SearchFilterStatus
  searchQuery: string
  taskView: TaskView
  onFilterStatusChange: (value: SearchFilterStatus) => void
  onSearchQueryChange: (value: string) => void
}

export default function SearchFilters({
  filterStatus,
  searchQuery,
  taskView,
  onFilterStatusChange,
  onSearchQueryChange,
}: SearchFiltersProps) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <div className="relative z-20 w-full flex-shrink-0 sm:w-32">
        <Select
          value={filterStatus}
          onChange={(value) => onFilterStatusChange(value as SearchFilterStatus)}
          options={FILTER_STATUS_OPTIONS}
          className="h-9 rounded-xl border border-gray-200/90 bg-white px-3 text-[12px] text-gray-700 shadow-sm transition hover:bg-gray-50 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 dark:border-white/[0.08] dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-white/[0.06]"
        />
      </div>

      <div className="relative z-10 flex-1">
        <svg
          className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400 dark:text-gray-500"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>

        <input
          value={searchQuery}
          onChange={(event) => onSearchQueryChange(event.target.value)}
          type="text"
          placeholder={
            taskView === 'trash'
              ? '搜索回收站里的提示词、参数、供应商、分类...'
              : '搜索提示词、参数、供应商、分类...'
          }
          className="h-9 w-full rounded-xl border border-gray-200/90 bg-white pl-9 pr-9 text-[12px] text-gray-700 shadow-sm transition focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 dark:border-white/[0.08] dark:bg-gray-900 dark:text-gray-200"
        />

        {searchQuery && (
          <button
            type="button"
            onClick={() => onSearchQueryChange('')}
            className="absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-white/[0.06] dark:hover:text-gray-200"
            title="清空搜索"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}
