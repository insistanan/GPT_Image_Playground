import { useState } from 'react'
import type { SquareShareAssetSummary, SquareShareDetail, SquareShareSummary } from '@/types'
import { useStore } from '@/store'
import { useSquareFeed, type SquareFeedKind } from '@/features/square/hooks/useSquareFeed'
import { resolveSquareAssetUrl, squareApiClient, summarizeSquareShare } from '@/features/square/lib/squareApiClient'
import SquareCard from './SquareCard'
import SquareImageLightbox, { type SquareLightboxImage } from './SquareImageLightbox'
import SquareTaskDetailModal from './SquareTaskDetailModal'

const SQUARE_TABS: Array<{ label: string; value: SquareFeedKind }> = [
  { label: '任务', value: 'task' },
  { label: '提示词', value: 'prompt' },
  { label: '我分享的', value: 'mine' },
]

function resolveTabDescription(tab: SquareFeedKind): string {
  if (tab === 'task') return '包含参数与任务链的图任务'
  if (tab === 'mine') return '管理自己发布过的任务和提示词'
  return '可复制和复用的文本提示词'
}

function resolveFeedModeLabel(tab: SquareFeedKind): string {
  if (tab === 'prompt') return '提示词流'
  if (tab === 'mine') return '我的分享流'
  return '任务瀑布流'
}

function resolveAssetPreviewImage(
  asset: SquareShareAssetSummary | null | undefined,
  title: string,
): SquareLightboxImage | null {
  const url = asset?.originalUrl || asset?.thumbUrl
  if (!url) return null

  return {
    src: resolveSquareAssetUrl(url),
    title,
  }
}

export default function SquarePage() {
  const setPrompt = useStore((state) => state.setPrompt)
  const setAppView = useStore((state) => state.setAppView)
  const showToast = useStore((state) => state.showToast)
  const [activeTab, setActiveTab] = useState<SquareFeedKind>('task')
  const [query, setQuery] = useState('')
  const [previewImages, setPreviewImages] = useState<SquareLightboxImage[]>([])
  const [previewIndex, setPreviewIndex] = useState(0)
  const [detailShare, setDetailShare] = useState<SquareShareDetail | null>(null)
  const feed = useSquareFeed({ kind: activeTab, query })

  const handleCopyPrompt = async (prompt: string) => {
    if (!prompt.trim()) return

    try {
      await navigator.clipboard.writeText(prompt)
      showToast('提示词已复制', 'success')
    } catch {
      showToast('复制提示词失败', 'error')
    }
  }

  const handleUsePrompt = (prompt: string) => {
    if (!prompt.trim()) return
    setPrompt(prompt)
    setAppView('local')
    showToast('已填入输入框', 'success')
  }

  const handleOpenImagePreview = async (item: SquareShareSummary) => {
    const title = summarizeSquareShare(item)
    const fallbackImage = resolveAssetPreviewImage(item.coverAsset, title)
    if (!fallbackImage) return

    setPreviewImages([fallbackImage])
    setPreviewIndex(0)

    try {
      const detail = await squareApiClient.getShare(item.id)
      const detailImages = (detail.assets ?? [])
        .map((asset, index) => resolveAssetPreviewImage(asset, `${title} ${index + 1}`))
        .filter((image): image is SquareLightboxImage => Boolean(image))
      if (detailImages.length > 0) {
        setPreviewImages(detailImages)
        const coverIndex = detailImages.findIndex((image) => image.src === fallbackImage.src)
        setPreviewIndex(coverIndex >= 0 ? coverIndex : 0)
      }
    } catch (error) {
      console.warn('加载广场分享详情失败，已使用封面图预览', error)
    }
  }

  const handleOpenShareDetail = async (item: SquareShareSummary) => {
    if (item.kind !== 'task') return
    try {
      setDetailShare(await squareApiClient.getShare(item.id))
    } catch (error) {
      showToast(error instanceof Error ? error.message : '加载任务详情失败', 'error')
    }
  }

  const handleDeleteMineShare = async (item: SquareShareSummary) => {
    if (!window.confirm(`确定取消分享「${summarizeSquareShare(item)}」吗？`)) return

    try {
      await squareApiClient.deleteShare(item.id)
      showToast('已取消分享', 'success')
      await feed.reload()
    } catch (error) {
      showToast(error instanceof Error ? error.message : '取消分享失败', 'error')
    }
  }

  return (
    <section className="space-y-4 pb-12 pt-3">
      <div className="rounded-3xl border border-gray-200/80 bg-white/[0.88] px-4 py-4 shadow-[0_18px_44px_-38px_rgba(15,23,42,0.66)] backdrop-blur dark:border-white/[0.08] dark:bg-gray-900/[0.76]">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100">创作分享广场</h2>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {resolveTabDescription(activeTab)}
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="inline-flex rounded-full border border-gray-200/80 bg-white/90 p-0.5 dark:border-white/[0.08] dark:bg-gray-900/80">
              {SQUARE_TABS.map((tab) => (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => setActiveTab(tab.value)}
                  className={`h-8 rounded-full px-3 text-xs font-medium transition ${
                    activeTab === tab.value
                      ? 'bg-blue-500 text-white shadow-[0_12px_24px_-16px_rgba(37,99,235,0.9)]'
                      : 'text-gray-600 hover:bg-gray-100/80 dark:text-gray-300 dark:hover:bg-white/[0.06]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="relative min-w-0 sm:w-64">
              <svg
                className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z" />
              </svg>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索标题、提示词、标签"
                className="h-9 w-full rounded-full border border-gray-200/90 bg-white pl-9 pr-9 text-xs text-gray-700 shadow-sm transition focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 dark:border-white/[0.08] dark:bg-gray-900 dark:text-gray-200"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-white/[0.06] dark:hover:text-gray-200"
                  title="清空搜索"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18 18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>

        {!feed.configured && (
          <div className="mt-4 rounded-2xl border border-amber-200/80 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-400/20 dark:bg-amber-500/10 dark:text-amber-200">
            广场 API 尚未配置。设置 `VITE_SQUARE_API_URL` 后，前端会通过 `/api/v1` 协议读取和发布广场内容。
          </div>
        )}

        {feed.error && (
          <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-red-200/80 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-400/20 dark:bg-red-500/10 dark:text-red-200">
            <span>{feed.error}</span>
            <button
              type="button"
              onClick={() => {
                void feed.reload()
              }}
              className="flex-shrink-0 rounded-full border border-red-200 bg-white px-3 py-1 text-xs font-medium text-red-600 transition hover:bg-red-100 dark:border-red-400/20 dark:bg-transparent dark:hover:bg-red-500/10"
            >
              重试
            </button>
          </div>
        )}
      </div>

      {feed.isLoading ? (
        <div className="relative overflow-hidden rounded-[2rem] bg-[linear-gradient(180deg,rgba(255,255,255,0.76),rgba(248,250,252,0.44))] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.55)] dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.34),rgba(2,6,23,0.16))] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(circle_at_top_left,rgba(191,219,254,0.24),transparent_24%),radial-gradient(circle_at_78%_18%,rgba(253,224,71,0.10),transparent_18%),linear-gradient(135deg,rgba(255,255,255,0.12)_0%,rgba(255,255,255,0)_38%,rgba(219,234,254,0.10)_100%)] dark:bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.08),transparent_24%),radial-gradient(circle_at_78%_18%,rgba(250,204,21,0.05),transparent_18%)]"
          />
          <div className="relative z-10 columns-1 gap-4 sm:columns-2 lg:columns-3 2xl:columns-4">
            {Array.from({ length: 6 }, (_, index) => (
              <div
                key={index}
                className={`mb-4 break-inside-avoid animate-pulse rounded-[1.65rem] border border-gray-200/70 bg-white/70 dark:border-white/[0.08] dark:bg-white/[0.03] ${
                  index % 3 === 0 ? 'h-80' : index % 3 === 1 ? 'h-64' : 'h-96'
                }`}
              />
            ))}
          </div>
        </div>
      ) : feed.items.length === 0 ? (
        <div className="flex min-h-[18rem] items-center justify-center rounded-3xl border border-dashed border-gray-200/90 bg-white/[0.55] px-4 text-center text-sm text-gray-400 dark:border-white/[0.08] dark:bg-white/[0.02] dark:text-gray-500">
          {feed.configured ? '暂时没有匹配的广场内容' : '等待连接广场 API'}
        </div>
      ) : (
        <>
          <div className="space-y-3">
            <div className="flex items-center justify-between px-1 text-xs text-gray-400 dark:text-gray-500">
              <span>{resolveFeedModeLabel(activeTab)} · {feed.items.length} 条</span>
              {feed.nextCursor && <span>可继续加载</span>}
            </div>

            <div className="relative overflow-hidden rounded-[2rem] bg-[linear-gradient(180deg,rgba(255,255,255,0.76),rgba(248,250,252,0.44))] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.55)] dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.34),rgba(2,6,23,0.16))] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(circle_at_top_left,rgba(191,219,254,0.24),transparent_24%),radial-gradient(circle_at_78%_18%,rgba(253,224,71,0.10),transparent_18%),linear-gradient(135deg,rgba(255,255,255,0.12)_0%,rgba(255,255,255,0)_38%,rgba(219,234,254,0.10)_100%)] dark:bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.08),transparent_24%),radial-gradient(circle_at_78%_18%,rgba(250,204,21,0.05),transparent_18%)]"
              />
              <div className="relative z-10 columns-1 gap-4 sm:columns-2 lg:columns-3 2xl:columns-4">
                {feed.items.map((item) => (
                  <SquareCard
                    key={item.id}
                    item={item}
                    onUsePrompt={handleUsePrompt}
                    onCopyPrompt={(prompt) => {
                      void handleCopyPrompt(prompt)
                    }}
                    onOpenImage={(targetItem) => {
                      void handleOpenImagePreview(targetItem)
                    }}
                    onOpenDetail={(targetItem) => {
                      void handleOpenShareDetail(targetItem)
                    }}
                    onDelete={activeTab === 'mine'
                      ? (targetItem) => {
                          void handleDeleteMineShare(targetItem)
                        }
                      : undefined}
                  />
                ))}
              </div>
            </div>
          </div>

          {feed.nextCursor && (
            <div className="flex justify-center pt-2">
              <button
                type="button"
                onClick={() => {
                  void feed.loadMore()
                }}
                disabled={feed.isLoadingMore}
                className="rounded-full border border-gray-200/80 bg-white px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/[0.08] dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.06]"
              >
                {feed.isLoadingMore ? '加载中...' : '加载更多'}
              </button>
            </div>
          )}
        </>
      )}

      {previewImages.length > 0 && (
        <SquareImageLightbox
          images={previewImages}
          activeIndex={previewIndex}
          onActiveIndexChange={setPreviewIndex}
          onClose={() => {
            setPreviewImages([])
            setPreviewIndex(0)
          }}
        />
      )}

      {detailShare?.kind === 'task' && (
        <SquareTaskDetailModal
          share={detailShare}
          onClose={() => setDetailShare(null)}
          onOpenImages={(images, index) => {
            setPreviewImages(images)
            setPreviewIndex(index)
          }}
        />
      )}
    </section>
  )
}
