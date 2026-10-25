import { useState } from 'react'
import ButtonTooltip from './ButtonTooltip'

interface SubmitSectionProps {
  generationTargetLabel: string
  hasApiKey: boolean
  canSubmit: boolean
  isMobile: boolean
  onSubmit: () => void
  onOpenSettings: () => void
}

export default function SubmitSection({
  generationTargetLabel,
  hasApiKey,
  canSubmit,
  isMobile,
  onSubmit,
  onOpenSettings,
}: SubmitSectionProps) {
  const [submitHover, setSubmitHover] = useState(false)

  return (
    <div className="mt-auto pt-4">
      <div className="mb-2.5 flex flex-wrap items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500">
        <span>保存至</span>
        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300">
          {generationTargetLabel}
        </span>
      </div>

      <div
        className="relative w-full"
        onMouseEnter={() => setSubmitHover(true)}
        onMouseLeave={() => setSubmitHover(false)}
      >
        <ButtonTooltip visible={!hasApiKey && submitHover} text="尚未完成 API 配置，请在右上角设置中进行" />
        <button
          type="button"
          onClick={() => {
            if (hasApiKey) {
              onSubmit()
            } else {
              onOpenSettings()
            }
          }}
          disabled={hasApiKey ? !canSubmit : false}
          className={`group flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition-all duration-200 active:scale-[0.99] ${
            hasApiKey
              ? 'bg-blue-500 text-white shadow-[0_14px_26px_-16px_rgba(37,99,235,0.95)] hover:bg-blue-600 hover:shadow-[0_16px_30px_-16px_rgba(37,99,235,0.95)] disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400 disabled:shadow-none dark:disabled:bg-white/[0.05] dark:disabled:text-gray-500'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-white/[0.06] dark:text-gray-300 dark:hover:bg-white/[0.1]'
          }`}
        >
          <svg
            className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
          <span>{hasApiKey ? '生成图像' : '请先配置 API'}</span>
          {hasApiKey && !isMobile && (
            <kbd className="ml-1 rounded-md bg-white/20 px-1.5 py-0.5 font-mono text-[10px] font-normal leading-none">
              Ctrl+Enter
            </kbd>
          )}
        </button>
      </div>
    </div>
  )
}
