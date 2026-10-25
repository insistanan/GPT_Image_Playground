import type { SquareShareSummary } from '@/types'
import { resolveSquareAssetUrl, summarizeSquareShare } from '@/features/square/lib/squareApiClient'

interface SquareCardProps {
  item: SquareShareSummary
  onUsePrompt: (prompt: string) => void
  onCopyPrompt: (prompt: string) => void
  onOpenImage: (item: SquareShareSummary) => void
  onOpenDetail: (item: SquareShareSummary) => void
  onDelete?: (item: SquareShareSummary) => void
}

function formatTime(timestamp: number): string {
  if (!Number.isFinite(timestamp)) return ''

  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp))
}

function resolveKindLabel(kind: SquareShareSummary['kind']): string {
  if (kind === 'image') return '图片'
  if (kind === 'task') return '任务'
  return '提示词'
}

const CARD_SHAPE_CLASSES = [
  'rounded-[28px_22px_30px_20px]',
  'rounded-[22px_30px_20px_32px]',
  'rounded-[30px_20px_28px_24px]',
  'rounded-[24px_32px_22px_28px]',
]

function resolveCardShapeClass(id: string): string {
  const total = Array.from(id).reduce((sum, char) => sum + char.charCodeAt(0), 0)
  return CARD_SHAPE_CLASSES[total % CARD_SHAPE_CLASSES.length] ?? CARD_SHAPE_CLASSES[0]
}

export default function SquareCard({
  item,
  onUsePrompt,
  onCopyPrompt,
  onOpenImage,
  onOpenDetail,
  onDelete,
}: SquareCardProps) {
  const title = summarizeSquareShare(item)
  const coverUrl = item.coverAsset?.thumbUrl
    ? resolveSquareAssetUrl(item.coverAsset.thumbUrl)
    : item.coverAsset?.originalUrl
      ? resolveSquareAssetUrl(item.coverAsset.originalUrl)
      : ''
  const aspectRatio =
    item.coverAsset?.width && item.coverAsset?.height
      ? `${item.coverAsset.width} / ${item.coverAsset.height}`
      : item.kind === 'prompt'
        ? '4 / 3'
      : '1 / 1'
  const hasImage = Boolean(coverUrl)
  const shapeClass = hasImage ? resolveCardShapeClass(item.id) : 'rounded-[1.65rem]'

  return (
    <article className={`group mb-4 break-inside-avoid overflow-hidden border border-white/70 bg-white/[0.94] shadow-[0_20px_48px_-40px_rgba(15,23,42,0.82)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_26px_58px_-42px_rgba(37,99,235,0.38)] dark:border-white/[0.08] dark:bg-gray-900/[0.92] ${shapeClass}`}>
      {hasImage ? (
        <button
          type="button"
          onClick={() => onOpenImage(item)}
          className="group/image relative block w-full cursor-zoom-in overflow-hidden bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.96),rgba(241,245,249,0.58))] text-left focus:outline-none focus:ring-2 focus:ring-blue-500/40 dark:bg-[radial-gradient(circle_at_top,rgba(30,41,59,0.72),rgba(2,6,23,0.92))]"
          style={{ aspectRatio }}
          aria-label={`查看 ${title} 的大图`}
          title="查看大图"
        >
          <img
            src={coverUrl}
            alt={title}
            className="h-full w-full object-cover transition duration-300 group-hover/image:scale-[1.025]"
            loading="lazy"
          />
          <div className="absolute left-3 top-3 rounded-full bg-black/45 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur">
            {resolveKindLabel(item.kind)}
          </div>
          {item.coverAsset?.width && item.coverAsset?.height && (
            <div className="absolute right-3 top-3 rounded-full bg-black/35 px-2 py-0.5 text-[10px] font-medium text-white/90 backdrop-blur">
              {item.coverAsset.width}x{item.coverAsset.height}
            </div>
          )}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/45 via-black/10 to-transparent opacity-0 transition-opacity duration-200 group-hover/image:opacity-100" />
          <span className="absolute bottom-3 right-3 flex h-8 w-8 items-center justify-center rounded-full bg-black/45 text-white opacity-0 shadow-lg backdrop-blur transition group-hover/image:opacity-100 group-focus-visible/image:opacity-100">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m21 21-4.35-4.35M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15ZM10.5 7.5v6m3-3h-6" />
            </svg>
          </span>
        </button>
      ) : (
        <div className="flex items-center justify-center bg-gray-50 px-5 py-8 text-center dark:bg-white/[0.03]" style={{ aspectRatio }}>
          <p className="line-clamp-5 whitespace-pre-wrap text-sm leading-6 text-gray-600 dark:text-gray-300">
            {item.prompt}
          </p>
        </div>
      )}

      <div className="space-y-3 p-4">
        <div>
          <div className="flex items-start justify-between gap-2">
            <h3 className="line-clamp-2 text-[15px] font-semibold leading-6 text-gray-800 dark:text-gray-100">
              {title}
            </h3>
            <span className="flex-shrink-0 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-600 dark:bg-blue-500/10 dark:text-blue-300">
              {resolveKindLabel(item.kind)}
            </span>
          </div>
          <p className="mt-2 line-clamp-2 whitespace-pre-wrap break-words text-[13px] leading-5 text-gray-600 dark:text-gray-300">
            {item.prompt || '无提示词'}
          </p>
        </div>

        {item.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {item.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-500 dark:bg-white/[0.05] dark:text-gray-400"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-3 dark:border-white/[0.06]">
          <span className="text-[11px] text-gray-400 dark:text-gray-500">{formatTime(item.createdAt)}</span>
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            {item.kind === 'task' && (
              <button
                type="button"
                onClick={() => onOpenDetail(item)}
                className="inline-flex h-7 items-center rounded-full border border-blue-100 bg-blue-50 px-2.5 text-[11px] font-medium text-blue-600 transition hover:bg-blue-100 dark:border-blue-400/20 dark:bg-blue-500/10 dark:text-blue-300 dark:hover:bg-blue-500/20"
              >
                详情
              </button>
            )}
            <button
              type="button"
              onClick={() => onCopyPrompt(item.prompt)}
              className="inline-flex h-7 items-center rounded-full border border-gray-200/80 bg-white px-2.5 text-[11px] font-medium text-gray-600 transition hover:bg-gray-50 dark:border-white/[0.08] dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.06]"
            >
              复制
            </button>
            <button
              type="button"
              onClick={() => onUsePrompt(item.prompt)}
              className="inline-flex h-7 items-center rounded-full bg-blue-50 px-2.5 text-[11px] font-medium text-blue-600 transition hover:bg-blue-100 dark:bg-blue-500/10 dark:text-blue-300 dark:hover:bg-blue-500/20"
            >
              填入
            </button>
            {onDelete && (
              <button
                type="button"
                onClick={() => onDelete(item)}
                className="inline-flex h-7 items-center rounded-full bg-red-50 px-2.5 text-[11px] font-medium text-red-600 transition hover:bg-red-100 dark:bg-red-500/10 dark:text-red-300 dark:hover:bg-red-500/20"
              >
                取消分享
              </button>
            )}
          </div>
        </div>
      </div>
    </article>
  )
}
