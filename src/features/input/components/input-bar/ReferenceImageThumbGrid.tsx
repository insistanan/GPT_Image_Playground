import type { InputImage } from '@/types'
import { isRemotePreviewUrl } from './shared'

interface ReferenceImageThumbGridProps {
  inputImages: InputImage[]
  onPreviewImage: (imageId: string) => void
  onRemoveInputImage: (index: number) => void
  onRequestClearAllImages: () => void
}

export default function ReferenceImageThumbGrid({
  inputImages,
  onPreviewImage,
  onRemoveInputImage,
  onRequestClearAllImages,
}: ReferenceImageThumbGridProps) {
  return (
    <div className="mb-3 grid grid-cols-[repeat(auto-fill,52px)] justify-between gap-x-2 gap-y-3">
      {inputImages.map((image, index) => (
        <div key={image.id} className="group relative inline-block">
          <div className="relative h-[52px] w-[52px] cursor-pointer overflow-hidden rounded-xl border border-gray-200 shadow-sm dark:border-white/[0.08]">
            <img
              src={image.dataUrl}
              className="h-full w-full object-cover transition-opacity hover:opacity-90"
              onClick={() => onPreviewImage(image.id)}
              alt=""
            />
            <span
              className={`absolute left-1 top-1 rounded px-1 py-0.5 text-[9px] leading-none text-white shadow-sm ${
                isRemotePreviewUrl(image.dataUrl) ? 'bg-emerald-500/90' : 'bg-amber-500/90'
              }`}
            >
              {isRemotePreviewUrl(image.dataUrl) ? 'URL' : '本地'}
            </span>
            {image.maskDataUrl && (
              <span className="absolute bottom-1 right-1 rounded bg-emerald-500/90 px-1 py-0.5 text-[9px] leading-none text-white shadow-sm">
                蒙版
              </span>
            )}
          </div>
          <span
            className="absolute -right-2 -top-2 flex h-[22px] w-[22px] cursor-pointer items-center justify-center rounded-full bg-red-500 text-white opacity-0 shadow-md transition-opacity hover:bg-red-600 group-hover:opacity-100"
            onClick={() => onRemoveInputImage(index)}
          >
            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </span>
        </div>
      ))}

      <button
        type="button"
        onClick={onRequestClearAllImages}
        className="flex h-[52px] w-[52px] flex-shrink-0 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-xl border border-dashed border-gray-300 text-gray-400 transition-all hover:border-red-300 hover:bg-red-50/50 hover:text-red-500 dark:border-white/[0.08] dark:text-gray-500 dark:hover:bg-red-950/30"
        title="清空全部参考图"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
        <span className="text-[9px] leading-none">清空</span>
      </button>
    </div>
  )
}
