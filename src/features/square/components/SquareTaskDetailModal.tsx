import { useEffect, useMemo, useState } from 'react'
import { useCloseOnEscape } from '../../../hooks/useCloseOnEscape'
import type { SquareShareAssetSummary, SquareShareDetail, TaskParams, TaskRecord } from '../../../types'
import { resolveSquareAssetUrl, summarizeSquareShare } from '../lib/squareApiClient'

interface SquareTaskNode {
  localTaskId: string
  taskKind?: 'generation' | 'image'
  status?: TaskRecord['status']
  isAborted?: boolean
  parentTaskId?: string | null
  parentImageId?: string | null
  prompt?: string
  params?: Partial<TaskParams>
  responseMeta?: TaskRecord['responseMeta']
  providerName?: string | null
  categoryName?: string | null
  createdAt?: number
  finishedAt?: number | null
  elapsed?: number | null
  inputAssetRefs?: string[]
  outputAssetRefs?: string[]
}

interface SquareTaskManifest {
  taskShare?: {
    entryTaskId?: string
    lineage?: unknown[]
  }
}

interface SquareTaskDetailModalProps {
  share: SquareShareDetail
  onClose: () => void
  onOpenImages: (images: Array<{ src: string; title: string }>, index: number) => void
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function normalizeTaskNode(value: unknown): SquareTaskNode | null {
  if (!isRecord(value) || typeof value.localTaskId !== 'string') return null

  return {
    localTaskId: value.localTaskId,
    taskKind: value.taskKind === 'image' ? 'image' : 'generation',
    status:
      value.status === 'running' || value.status === 'done' || value.status === 'error' || value.status === 'partial_error'
        ? value.status
        : 'done',
    isAborted: value.isAborted === true,
    parentTaskId: typeof value.parentTaskId === 'string' ? value.parentTaskId : null,
    parentImageId: typeof value.parentImageId === 'string' ? value.parentImageId : null,
    prompt: typeof value.prompt === 'string' ? value.prompt : '',
    params: isRecord(value.params) ? (value.params as Partial<TaskParams>) : {},
    responseMeta: isRecord(value.responseMeta) ? (value.responseMeta as TaskRecord['responseMeta']) : null,
    providerName: typeof value.providerName === 'string' ? value.providerName : null,
    categoryName: typeof value.categoryName === 'string' ? value.categoryName : null,
    createdAt: typeof value.createdAt === 'number' ? value.createdAt : undefined,
    finishedAt: typeof value.finishedAt === 'number' ? value.finishedAt : null,
    elapsed: typeof value.elapsed === 'number' ? value.elapsed : null,
    inputAssetRefs: Array.isArray(value.inputAssetRefs)
      ? value.inputAssetRefs.filter((item): item is string => typeof item === 'string')
      : [],
    outputAssetRefs: Array.isArray(value.outputAssetRefs)
      ? value.outputAssetRefs.filter((item): item is string => typeof item === 'string')
      : [],
  }
}

function readTaskNodes(manifest: unknown): SquareTaskNode[] {
  if (!isRecord(manifest)) return []
  const taskManifest = manifest as SquareTaskManifest
  const lineage = taskManifest.taskShare?.lineage
  if (!Array.isArray(lineage)) return []
  return lineage.map(normalizeTaskNode).filter((node): node is SquareTaskNode => Boolean(node))
}

function readEntryTaskId(manifest: unknown): string | null {
  if (!isRecord(manifest)) return null
  const value = (manifest as SquareTaskManifest).taskShare?.entryTaskId
  return typeof value === 'string' ? value : null
}

function formatTime(timestamp: number | undefined): string {
  if (!timestamp || !Number.isFinite(timestamp)) return '未知'
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp))
}

function formatElapsed(ms: number | null | undefined): string {
  if (!ms || !Number.isFinite(ms)) return '未知'
  const totalSeconds = Math.max(0, Math.round(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return minutes > 0 ? `${minutes}分${seconds}秒` : `${seconds}秒`
}

function resolveStatusLabel(node: SquareTaskNode): string {
  if (node.isAborted) return '已中止'
  if (node.status === 'done') return '已完成'
  if (node.status === 'partial_error') return '异常'
  if (node.status === 'error') return '失败'
  return '生成中'
}

function getAssetUrl(asset: SquareShareAssetSummary | undefined, variant: 'thumb' | 'original'): string {
  const url = variant === 'thumb'
    ? asset?.thumbUrl || asset?.originalUrl
    : asset?.originalUrl || asset?.thumbUrl
  return url ? resolveSquareAssetUrl(url) : ''
}

function renderInfoCard(label: string, value: string | number | null | undefined) {
  const normalized = value == null || value === '' ? '未知' : String(value)
  return (
    <div className="rounded-lg bg-gray-50 px-3 py-2 text-xs dark:bg-white/[0.03]">
      <span className="text-gray-400 dark:text-gray-500">{label}</span>
      <br />
      <span className="break-all font-medium text-gray-700 dark:text-gray-300">{normalized}</span>
    </div>
  )
}

export default function SquareTaskDetailModal({ share, onClose, onOpenImages }: SquareTaskDetailModalProps) {
  const title = summarizeSquareShare(share)
  const nodes = useMemo(() => readTaskNodes(share.manifest), [share.manifest])
  const entryTaskId = useMemo(() => readEntryTaskId(share.manifest), [share.manifest])
  const [activeTaskId, setActiveTaskId] = useState(entryTaskId ?? nodes[nodes.length - 1]?.localTaskId ?? '')
  const activeNode = nodes.find((node) => node.localTaskId === activeTaskId) ?? nodes[nodes.length - 1] ?? null
  const assetByClientId = useMemo(() => {
    const map = new Map<string, SquareShareAssetSummary>()
    for (const asset of share.assets ?? []) {
      if (asset.clientAssetId) {
        map.set(asset.clientAssetId, asset)
      }
    }
    return map
  }, [share.assets])

  useCloseOnEscape(true, onClose)

  useEffect(() => {
    setActiveTaskId(entryTaskId ?? nodes[nodes.length - 1]?.localTaskId ?? '')
  }, [entryTaskId, nodes])

  if (!activeNode) {
    return (
      <div className="fixed inset-0 z-[74] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/35 backdrop-blur-sm" onClick={onClose} />
        <div className="relative z-10 w-full max-w-lg rounded-3xl bg-white p-5 shadow-2xl dark:bg-gray-900">
          <button type="button" className="absolute right-4 top-4 text-gray-400" onClick={onClose}>关闭</button>
          <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100">{title}</h3>
          <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">这条分享缺少任务链详情，可能来自旧版本分享。</p>
        </div>
      </div>
    )
  }

  const outputAssets = (activeNode.outputAssetRefs ?? [])
    .map((clientAssetId) => assetByClientId.get(clientAssetId))
    .filter((asset): asset is SquareShareAssetSummary => Boolean(asset))
  const inputAssets = (activeNode.inputAssetRefs ?? [])
    .map((clientAssetId) => assetByClientId.get(clientAssetId))
    .filter((asset): asset is SquareShareAssetSummary => Boolean(asset))
  const mainAsset = outputAssets[0] ?? inputAssets[0]
  const mainImageUrl = getAssetUrl(mainAsset, 'original')
  const imageSize = mainAsset?.width && mainAsset?.height ? `${mainAsset.width}x${mainAsset.height}` : ''
  const revisedPrompt = activeNode.responseMeta?.revisedPrompt?.trim() ?? ''
  const applied = activeNode.responseMeta?.appliedImageParams ?? null
  const transport = activeNode.responseMeta?.transport ?? null
  const prompt = activeNode.prompt?.trim() ?? ''
  const params = activeNode.params ?? {}
  const allOutputImages = outputAssets.map((asset, index) => ({
    src: getAssetUrl(asset, 'original'),
    title: `${title} ${index + 1}`,
  })).filter((image) => Boolean(image.src))

  return (
    <div className="fixed inset-0 z-[74] flex items-center justify-center p-3 md:p-5">
      <div className="absolute inset-0 bg-black/35 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 flex max-h-[92vh] w-full max-w-6xl overflow-hidden rounded-3xl border border-white/60 bg-white/95 shadow-2xl ring-1 ring-black/5 dark:border-white/[0.08] dark:bg-gray-900/95 dark:ring-white/10">
        <div className="relative hidden min-h-[38rem] w-[42%] flex-shrink-0 items-center justify-center bg-gray-100 md:flex dark:bg-black/20">
          {mainImageUrl ? (
            <button
              type="button"
              onClick={() => onOpenImages(allOutputImages.length ? allOutputImages : [{ src: mainImageUrl, title }], 0)}
              className="h-full w-full cursor-zoom-in p-4"
              title="查看大图"
            >
              <img src={mainImageUrl} alt={title} className="mx-auto h-full max-h-[calc(92vh-2rem)] w-full object-contain" />
            </button>
          ) : (
            <div className="text-sm text-gray-400">无输出图</div>
          )}
          {imageSize && (
            <div className="absolute left-4 top-4 rounded bg-black/50 px-2 py-0.5 text-xs font-medium text-white backdrop-blur">
              {imageSize}
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1 overflow-y-auto p-5">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100">{title}</h3>
              <div className="mt-2 flex flex-wrap gap-2">
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300">
                  {resolveStatusLabel(activeNode)}
                </span>
                {transport?.actual && (
                  <span className="rounded-full bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-600 dark:bg-sky-500/10 dark:text-sky-300">
                    {transport.actual === 'stream' ? '流式' : 'JSON'}
                  </span>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-white/[0.06] dark:hover:text-gray-200"
              aria-label="关闭"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {mainImageUrl && (
            <button
              type="button"
              onClick={() => onOpenImages(allOutputImages.length ? allOutputImages : [{ src: mainImageUrl, title }], 0)}
              className="mb-4 block aspect-[4/3] w-full overflow-hidden rounded-2xl bg-gray-100 md:hidden dark:bg-black/20"
              title="查看大图"
            >
              <img src={mainImageUrl} alt={title} className="h-full w-full object-contain" />
            </button>
          )}

          <p className="mb-4 whitespace-pre-wrap text-sm leading-7 text-gray-700 dark:text-gray-300">
            {prompt || '(无提示词)'}
          </p>

          {revisedPrompt && revisedPrompt !== prompt && (
            <div className="mb-4 rounded-xl border border-blue-100 bg-blue-50/70 px-3 py-2 dark:border-blue-500/20 dark:bg-blue-500/10">
              <h4 className="mb-1 text-xs font-medium text-blue-500 dark:text-blue-300">模型修订提示词</h4>
              <p className="whitespace-pre-wrap break-words text-sm leading-6 text-blue-700 dark:text-blue-100">
                {revisedPrompt}
              </p>
            </div>
          )}

          {inputAssets.length > 0 && (
            <div className="mb-4">
              <h4 className="mb-2 text-xs font-medium text-gray-400 dark:text-gray-500">参考图</h4>
              <div className="flex flex-wrap gap-2">
                {inputAssets.map((asset, index) => {
                  const src = getAssetUrl(asset, 'thumb')
                  return src ? (
                    <button
                      key={asset.assetId}
                      type="button"
                      onClick={() => onOpenImages([{ src: getAssetUrl(asset, 'original'), title: `参考图 ${index + 1}` }], 0)}
                      className="h-16 w-16 overflow-hidden rounded-lg border border-gray-200 bg-gray-100 dark:border-white/[0.08] dark:bg-white/[0.03]"
                    >
                      <img src={src} alt="" className="h-full w-full object-cover" />
                    </button>
                  ) : null
                })}
              </div>
            </div>
          )}

          <h4 className="mb-2 text-xs font-medium text-gray-400 dark:text-gray-500">参数配置</h4>
          <div className="mb-4 grid grid-cols-2 gap-2">
            {renderInfoCard('分类', activeNode.categoryName || '未分类')}
            {renderInfoCard('供应商', activeNode.providerName || '未知')}
            {renderInfoCard('状态', resolveStatusLabel(activeNode))}
            {renderInfoCard('输出像素', imageSize || applied?.size || params.size)}
            {renderInfoCard('请求尺寸', params.size)}
            {renderInfoCard('质量', applied?.quality || params.quality)}
            {renderInfoCard('格式', applied?.output_format || params.output_format)}
            {renderInfoCard('传输', transport?.actual === 'stream' ? '流式' : transport?.actual)}
            {renderInfoCard('传输偏好', transport?.requested)}
            {renderInfoCard('背景', applied?.background || params.background)}
            {params.input_fidelity ? renderInfoCard('输入保真', params.input_fidelity) : null}
            {renderInfoCard('实际动作', applied?.action)}
            {renderInfoCard('审核', params.moderation)}
            {renderInfoCard('数量', params.n)}
            {renderInfoCard('耗时', formatElapsed(activeNode.elapsed))}
            {renderInfoCard('创建时间', formatTime(activeNode.createdAt))}
          </div>

          {nodes.length > 1 && (
            <div className="lg:hidden">
              <h4 className="mb-2 text-xs font-medium text-gray-400 dark:text-gray-500">来源任务链</h4>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {[...nodes].reverse().map((node, index) => {
                  const previewAsset = (node.outputAssetRefs ?? [])
                    .map((clientAssetId) => assetByClientId.get(clientAssetId))
                    .find(Boolean)
                  const previewUrl = getAssetUrl(previewAsset, 'thumb')
                  const isActive = node.localTaskId === activeNode.localTaskId
                  return (
                    <button
                      key={`${node.localTaskId}-mobile-${index}`}
                      type="button"
                      onClick={() => setActiveTaskId(node.localTaskId)}
                      className={`w-36 flex-shrink-0 overflow-hidden rounded-2xl border text-left ${
                        isActive
                          ? 'border-blue-300 bg-blue-50/80 dark:border-blue-400/40 dark:bg-blue-500/10'
                          : 'border-gray-200/80 bg-white dark:border-white/[0.08] dark:bg-white/[0.03]'
                      }`}
                    >
                      <div className="aspect-[4/3] bg-gray-100 dark:bg-black/20">
                        {previewUrl ? <img src={previewUrl} alt="" className="h-full w-full object-cover" /> : null}
                      </div>
                      <div className="p-2">
                        <p className="line-clamp-2 text-xs leading-5 text-gray-700 dark:text-gray-200">
                          {node.prompt?.trim() || '(无提示词)'}
                        </p>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        <aside className="hidden w-72 flex-shrink-0 border-l border-gray-200/70 bg-gray-50/70 p-4 lg:block dark:border-white/[0.08] dark:bg-black/10">
          <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-100">来源任务链</h4>
          <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">点击节点切换到对应任务快照。</p>
          <div className="mt-4 space-y-3 overflow-y-auto pr-1" style={{ maxHeight: 'calc(92vh - 7rem)' }}>
            {[...nodes].reverse().map((node, index) => {
              const previewAsset = (node.outputAssetRefs ?? [])
                .map((clientAssetId) => assetByClientId.get(clientAssetId))
                .find(Boolean)
              const previewUrl = getAssetUrl(previewAsset, 'thumb')
              const isActive = node.localTaskId === activeNode.localTaskId
              return (
                <button
                  key={`${node.localTaskId}-${index}`}
                  type="button"
                  onClick={() => setActiveTaskId(node.localTaskId)}
                  className={`w-full overflow-hidden rounded-2xl border text-left transition ${
                    isActive
                      ? 'border-blue-300 bg-blue-50/80 ring-1 ring-blue-200 dark:border-blue-400/40 dark:bg-blue-500/10 dark:ring-blue-400/20'
                      : 'border-gray-200/80 bg-white hover:border-blue-200 hover:bg-blue-50/40 dark:border-white/[0.08] dark:bg-white/[0.03]'
                  }`}
                >
                  <div className="relative aspect-[4/3] bg-gray-100 dark:bg-black/20">
                    {previewUrl ? <img src={previewUrl} alt="" className="h-full w-full object-cover" /> : null}
                    <span className="absolute left-2 top-2 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur">
                      {node.localTaskId === entryTaskId ? '入口任务' : `上游 ${nodes.length - index - 1}`}
                    </span>
                  </div>
                  <div className="space-y-2 p-3">
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300">
                      {resolveStatusLabel(node)}
                    </span>
                    <p className="line-clamp-2 text-sm leading-6 text-gray-700 dark:text-gray-200">
                      {node.prompt?.trim() || '(无提示词)'}
                    </p>
                    <p className="text-[11px] text-gray-400 dark:text-gray-500">
                      {formatTime(node.createdAt)}
                    </p>
                  </div>
                </button>
              )
            })}
          </div>
        </aside>
      </div>
    </div>
  )
}
