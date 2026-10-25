import type { CategoryConfig } from '@/types'
import { ACTION_BUTTON_CLASS, type CategoryEditorMode } from './shared'

interface CategoryEditorActionsProps {
  generationTargetLabel: string
  editorMode: CategoryEditorMode
  categoryInput: string
  activeCategory: CategoryConfig | null
  onStartCreate: () => void
  onOpenUploadImagePicker: () => void
  onStartRename: () => void
  onDeleteCategory: () => void
  onCategoryInputChange: (value: string) => void
  onSubmitCategory: () => void
  onCancel: () => void
}

export default function CategoryEditorActions({
  generationTargetLabel,
  editorMode,
  categoryInput,
  activeCategory,
  onStartCreate,
  onOpenUploadImagePicker,
  onStartRename,
  onDeleteCategory,
  onCategoryInputChange,
  onSubmitCategory,
  onCancel,
}: CategoryEditorActionsProps) {
  return (
    <div className="mt-3 flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between">
      <div className="text-xs text-gray-400 dark:text-gray-500">
        当前新项目默认归入：
        <span className="ml-1.5 rounded-full bg-blue-50 px-2 py-0.5 text-[12px] font-medium text-blue-600 dark:bg-blue-500/10 dark:text-blue-300">
          {generationTargetLabel}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {editorMode === 'idle' ? (
          <>
            <button
              type="button"
              onClick={onStartCreate}
              className={`${ACTION_BUTTON_CLASS} border-gray-200 bg-white text-gray-600 hover:-translate-y-px hover:bg-gray-50 dark:border-white/[0.08] dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.06]`}
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              新建分类
            </button>

            <button
              type="button"
              onClick={onOpenUploadImagePicker}
              className={`${ACTION_BUTTON_CLASS} border-gray-200 bg-white text-gray-600 hover:-translate-y-px hover:bg-gray-50 dark:border-white/[0.08] dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.06]`}
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1M8 8l4-4m0 0 4 4m-4-4v12"
                />
              </svg>
              上传图片
            </button>

            {activeCategory && (
              <>
                <button
                  type="button"
                  onClick={onStartRename}
                  className={`${ACTION_BUTTON_CLASS} border-gray-200 bg-white text-gray-600 hover:-translate-y-px hover:bg-gray-50 dark:border-white/[0.08] dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.06]`}
                >
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                    />
                  </svg>
                  重命名
                </button>

                <button
                  type="button"
                  onClick={onDeleteCategory}
                  className={`${ACTION_BUTTON_CLASS} border-red-200/80 bg-red-50 text-red-500 hover:-translate-y-px hover:bg-red-100/80 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/20`}
                >
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  删除分类
                </button>
              </>
            )}
          </>
        ) : (
          <>
            <input
              value={categoryInput}
              onChange={(event) => onCategoryInputChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  onSubmitCategory()
                }
              }}
              type="text"
              placeholder={editorMode === 'create' ? '输入分类名称' : '输入新的分类名称'}
              className="h-8 min-w-[12rem] rounded-full border border-gray-200 bg-white px-3.5 text-[12px] text-gray-700 transition focus:outline-none focus:ring-2 focus:ring-blue-500/30 dark:border-white/[0.08] dark:bg-gray-900 dark:text-gray-200"
            />

            <button
              type="button"
              onClick={onSubmitCategory}
              className="inline-flex h-8 items-center rounded-full bg-blue-500 px-3.5 text-[12px] font-medium text-white transition hover:bg-blue-600"
            >
              保存
            </button>

            <button
              type="button"
              onClick={onCancel}
              className={`${ACTION_BUTTON_CLASS} border-gray-200 bg-white text-gray-600 hover:-translate-y-px hover:bg-gray-50 dark:border-white/[0.08] dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.06]`}
            >
              取消
            </button>
          </>
        )}
      </div>
    </div>
  )
}
