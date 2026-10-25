import type { RefObject } from 'react'
import { API_MAX_IMAGES, SECTION_TITLE_CLASS } from './shared'
import ReferenceImageUrlPopover from './ReferenceImageUrlPopover'

interface ReferenceImagesToolbarProps {
  inputCount: number
  atImageLimit: boolean
  showImageUrlInput: boolean
  imageUrlInput: string
  imageUrlInputRef: RefObject<HTMLInputElement | null>
  imageUrlPopoverRef: RefObject<HTMLDivElement | null>
  onToggleImageUrlInput: () => void
  onImageUrlInputChange: (value: string) => void
  onCancelImageUrl: () => void
  onSubmitImageUrl: () => void
  onOpenFilePicker: () => void
}

export default function ReferenceImagesToolbar({
  inputCount,
  atImageLimit,
  showImageUrlInput,
  imageUrlInput,
  imageUrlInputRef,
  imageUrlPopoverRef,
  onToggleImageUrlInput,
  onImageUrlInputChange,
  onCancelImageUrl,
  onSubmitImageUrl,
  onOpenFilePicker,
}: ReferenceImagesToolbarProps) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-baseline gap-2">
        <span className={SECTION_TITLE_CLASS}>参考图</span>
        {inputCount > 0 && (
          <span className="font-mono text-[11px] tabular-nums text-gray-400 dark:text-gray-500">
            {inputCount}/{API_MAX_IMAGES}
          </span>
        )}
      </div>
      <div className="relative flex gap-1">
        <button
          type="button"
          onClick={onToggleImageUrlInput}
          className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-white/[0.06] dark:hover:text-gray-200"
          title="添加公网图片 URL"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 010 5.656l-1.414 1.414a4 4 0 01-5.657-5.656l1.414-1.414m3-3a4 4 0 015.657 0l1.414 1.414a4 4 0 01-5.657 5.656l-1.414-1.414" />
          </svg>
        </button>
        <button
          type="button"
          onClick={onOpenFilePicker}
          disabled={atImageLimit}
          className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-white/[0.06] dark:hover:text-gray-200"
          title={atImageLimit ? `已达上限 ${API_MAX_IMAGES} 张` : '添加本地图片'}
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>

        {showImageUrlInput && (
          <ReferenceImageUrlPopover
            imageUrlInput={imageUrlInput}
            imageUrlInputRef={imageUrlInputRef}
            imageUrlPopoverRef={imageUrlPopoverRef}
            onImageUrlInputChange={onImageUrlInputChange}
            onCancelImageUrl={onCancelImageUrl}
            onSubmitImageUrl={onSubmitImageUrl}
          />
        )}
      </div>
    </div>
  )
}
