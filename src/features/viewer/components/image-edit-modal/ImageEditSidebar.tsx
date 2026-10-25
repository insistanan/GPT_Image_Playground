import Select from '@/shared/components/Select'
import type { ImageEditSelection, ImageEditSession } from '@/types'
import type { ImageNaturalSize } from './shared'

interface ProviderOption {
  label: string
  value: string
}

interface ImageEditSidebarProps {
  imageEditSession: ImageEditSession
  modeLabel: string
  naturalSize: ImageNaturalSize | null
  selectedProviderId: string
  providerOptions: ProviderOption[]
  promptDraft: string
  currentImageNumber: number
  displayImageCount: number
  selection: ImageEditSelection | null
  isSubmitting: boolean
  onClose: () => void
  onProviderChange: (value: string) => void
  onPromptChange: (value: string) => void
  onClearSelection: () => void
  onRestorePrompt: () => void
  onApplyToInput: () => void
  onSubmit: () => void
}

export default function ImageEditSidebar(props: ImageEditSidebarProps) {
  const {
    imageEditSession,
    modeLabel,
    naturalSize,
    selectedProviderId,
    providerOptions,
    promptDraft,
    currentImageNumber,
    displayImageCount,
    selection,
    isSubmitting,
    onClose,
    onProviderChange,
    onPromptChange,
    onClearSelection,
    onRestorePrompt,
    onApplyToInput,
    onSubmit,
  } = props
  const actionsDisabled = !naturalSize || isSubmitting

  return (
    <div className="w-full overflow-y-auto border-t border-white/8 bg-[#17171b] p-5 custom-scrollbar lg:w-[26rem] lg:border-l lg:border-t-0">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-white/35">局部编辑</p>
          <h3 className="mt-2 text-xl font-semibold text-white">编辑输出图</h3>
          <p className="mt-2 text-sm text-white/55">
            当前模式：{modeLabel}
            {naturalSize ? ` · 原图 ${naturalSize.width}×${naturalSize.height}` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full p-2 text-white/45 transition hover:bg-white/8 hover:text-white"
          aria-label="关闭"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="mt-5 space-y-4">
        <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
          <div className="mb-2 text-xs text-white/45">供应商</div>
          <Select
            value={selectedProviderId}
            onChange={(value) => onProviderChange(String(value))}
            options={providerOptions}
            className="rounded-2xl border border-white/8 bg-[#0f1013] px-4 py-3 text-sm text-white"
          />
        </div>

        <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
          <div className="mb-2 text-xs text-white/45">编辑提示词</div>
          <textarea
            value={promptDraft}
            onChange={(event) => onPromptChange(event.target.value)}
            rows={5}
            placeholder="描述你希望这个区域被改成什么样..."
            className="w-full resize-none rounded-2xl border border-white/8 bg-[#0f1013] px-4 py-3 text-sm leading-relaxed text-white outline-none transition focus:border-emerald-400/60"
          />
        </div>

        <div className="grid grid-cols-2 gap-3 text-xs text-white/55">
          <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3">
            <div className="text-white/35">来源任务</div>
            <div className="mt-1 break-all font-mono text-white/80">{imageEditSession.taskId}</div>
          </div>
          <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3">
            <div className="text-white/35">当前图片</div>
            <div className="mt-1 text-white/80">
              {currentImageNumber} / {displayImageCount}
            </div>
          </div>
          <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3">
            <div className="text-white/35">选区状态</div>
            <div className="mt-1 text-white/80">{selection ? '已选定局部区域' : '未选区，将整图编辑'}</div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onClearSelection}
            className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-white/70 transition hover:bg-white/8 hover:text-white"
          >
            清空选区
          </button>
          <button
            type="button"
            onClick={onRestorePrompt}
            className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-white/70 transition hover:bg-white/8 hover:text-white"
          >
            恢复原提示词
          </button>
        </div>
      </div>

      <div className="mt-6 flex gap-2">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 rounded-2xl bg-white/8 px-4 py-3 text-sm font-medium text-white/75 transition hover:bg-white/12 hover:text-white"
        >
          取消
        </button>
        <button
          type="button"
          onClick={onApplyToInput}
          disabled={actionsDisabled}
          className="flex-1 rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-medium text-black transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-45"
        >
          应用到输入区
        </button>
      </div>
      <button
        type="button"
        onClick={onSubmit}
        disabled={actionsDisabled}
        className="mt-2 w-full rounded-2xl border border-emerald-400/25 bg-emerald-400/12 px-4 py-3 text-sm font-medium text-emerald-300 transition hover:bg-emerald-400/18 disabled:cursor-not-allowed disabled:opacity-45"
      >
        立即提交编辑
      </button>
    </div>
  )
}
