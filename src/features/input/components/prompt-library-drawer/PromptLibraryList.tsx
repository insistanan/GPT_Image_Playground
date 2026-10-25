import type { PromptLibraryItem } from '@/types'
import { formatPromptTimestamp } from './shared'

interface PromptLibraryListProps {
  items: PromptLibraryItem[]
  onApply: (item: PromptLibraryItem) => void
  onCopy: (content: string) => void
  onShare: (item: PromptLibraryItem) => void
  onDelete: (item: PromptLibraryItem) => void
}

export default function PromptLibraryList({
  items,
  onApply,
  onCopy,
  onShare,
  onDelete,
}: PromptLibraryListProps) {
  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h4 className="text-sm font-medium text-gray-800 dark:text-gray-100">已保存提示词</h4>
        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-600 dark:bg-blue-500/10 dark:text-blue-300">
          {items.length} 条
        </span>
      </div>

      {items.length === 0 ? (
        <div className="flex min-h-[11rem] flex-1 items-center justify-center rounded-2xl border border-dashed border-gray-200/80 px-4 py-8 text-center text-sm text-gray-400 dark:border-white/[0.08] dark:text-gray-500">
          还没有保存过提示词
        </div>
      ) : (
        <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto pr-1">
          {items.map((item) => (
            <article
              key={item.id}
              className="rounded-xl border border-gray-200/80 bg-white/[0.84] p-3 shadow-sm dark:border-white/[0.08] dark:bg-white/[0.03]"
            >
              <div className="flex items-start justify-between gap-2.5">
                <div className="min-w-0">
                  <h5 className="truncate text-sm font-semibold text-gray-800 dark:text-gray-100">{item.title}</h5>
                  <p className="mt-1 text-[11px] text-gray-400 dark:text-gray-500">
                    更新于 {formatPromptTimestamp(item.updatedAt)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onDelete(item)}
                  className="rounded-full p-1.5 text-gray-400 transition hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/10 dark:hover:text-red-300"
                  title="删除提示词"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0 1 16.138 21H7.862a2 2 0 0 1-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v3M4 7h16"
                    />
                  </svg>
                </button>
              </div>

              <p
                className="mt-2 line-clamp-2 whitespace-pre-wrap break-words text-[13px] leading-5 text-gray-600 dark:text-gray-300"
                title={item.content}
              >
                {item.content}
              </p>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => onApply(item)}
                  className="inline-flex items-center rounded-full bg-blue-50 px-3 py-1.5 text-[13px] font-medium text-blue-600 transition hover:bg-blue-100 dark:bg-blue-500/10 dark:text-blue-300 dark:hover:bg-blue-500/20"
                >
                  填入输入框
                </button>
                <button
                  type="button"
                  onClick={() => onCopy(item.content)}
                  className="inline-flex items-center rounded-full border border-gray-200/80 bg-white px-3 py-1.5 text-[13px] font-medium text-gray-600 transition hover:bg-gray-50 dark:border-white/[0.08] dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.06]"
                >
                  复制
                </button>
                <button
                  type="button"
                  onClick={() => onShare(item)}
                  className="inline-flex items-center rounded-full border border-blue-200/80 bg-white px-3 py-1.5 text-[13px] font-medium text-blue-600 transition hover:bg-blue-50 dark:border-blue-400/20 dark:bg-gray-900 dark:text-blue-300 dark:hover:bg-blue-500/10"
                >
                  分享
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
