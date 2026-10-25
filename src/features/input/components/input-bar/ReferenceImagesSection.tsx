import type { RefObject } from 'react'
import type { InputImage } from '@/types'
import ReferenceImageThumbGrid from './ReferenceImageThumbGrid'
import ReferenceImagesToolbar from './ReferenceImagesToolbar'
import ReferenceMaskNotice from './ReferenceMaskNotice'

interface ReferenceImagesSectionProps {
  isMobile: boolean
  inputImages: InputImage[]
  maskedInputCount: number
  primaryMaskedInput: InputImage | null
  atImageLimit: boolean
  showImageUrlInput: boolean
  imageUrlInput: string
  imageUrlInputRef: RefObject<HTMLInputElement | null>
  imageUrlPopoverRef: RefObject<HTMLDivElement | null>
  onToggleImageUrlInput: () => void
  onImageUrlInputChange: (value: string) => void
  onCancelImageUrlInput: () => void
  onSubmitImageUrl: () => void
  onOpenFilePicker: () => void
  onPreviewImage: (imageId: string) => void
  onRemoveInputImage: (index: number) => void
  onRequestClearAllImages: () => void
  onReopenMaskedEdit: () => void
  onClearMaskedEdit: () => void
}

export default function ReferenceImagesSection({
  isMobile,
  inputImages,
  maskedInputCount,
  primaryMaskedInput,
  atImageLimit,
  showImageUrlInput,
  imageUrlInput,
  imageUrlInputRef,
  imageUrlPopoverRef,
  onToggleImageUrlInput,
  onImageUrlInputChange,
  onCancelImageUrlInput,
  onSubmitImageUrl,
  onOpenFilePicker,
  onPreviewImage,
  onRemoveInputImage,
  onRequestClearAllImages,
  onReopenMaskedEdit,
  onClearMaskedEdit,
}: ReferenceImagesSectionProps) {
  return (
    <div className="flex flex-col gap-2">
      <ReferenceImagesToolbar
        inputCount={inputImages.length}
        atImageLimit={atImageLimit}
        showImageUrlInput={showImageUrlInput}
        imageUrlInput={imageUrlInput}
        imageUrlInputRef={imageUrlInputRef}
        imageUrlPopoverRef={imageUrlPopoverRef}
        onToggleImageUrlInput={onToggleImageUrlInput}
        onImageUrlInputChange={onImageUrlInputChange}
        onCancelImageUrl={onCancelImageUrlInput}
        onSubmitImageUrl={onSubmitImageUrl}
        onOpenFilePicker={onOpenFilePicker}
      />

      {inputImages.length > 0 ? (
        <div
          className={`rounded-xl border border-gray-100 bg-gray-50 dark:border-white/[0.04] dark:bg-white/[0.02] ${
            isMobile ? 'p-2.5' : 'p-3'
          }`}
        >
          <ReferenceImageThumbGrid
            inputImages={inputImages}
            onPreviewImage={onPreviewImage}
            onRemoveInputImage={onRemoveInputImage}
            onRequestClearAllImages={onRequestClearAllImages}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={onOpenFilePicker}
          disabled={atImageLimit}
          className={`group flex w-full flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed border-gray-300/80 bg-gray-50/60 text-gray-400 transition-colors hover:border-blue-300 hover:bg-blue-50/40 hover:text-blue-500 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-gray-300/80 disabled:hover:bg-gray-50/60 dark:border-white/[0.08] dark:bg-white/[0.02] dark:text-gray-500 dark:hover:border-blue-400/30 dark:hover:bg-blue-500/[0.06] dark:hover:text-blue-300 ${
            isMobile ? 'py-3' : 'py-5'
          }`}
        >
          <svg className="h-6 w-6 transition-transform duration-200 group-hover:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span className="text-xs">点击添加，或直接拖入图片</span>
        </button>
      )}

      <ReferenceMaskNotice
        maskedInputCount={maskedInputCount}
        canEditMask={Boolean(primaryMaskedInput)}
        onReopenMaskedEdit={onReopenMaskedEdit}
        onClearMaskedEdit={onClearMaskedEdit}
      />
    </div>
  )
}
