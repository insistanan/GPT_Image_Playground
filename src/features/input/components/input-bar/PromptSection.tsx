import type { KeyboardEventHandler, RefObject } from 'react'
import { SECTION_TITLE_CLASS } from './shared'

interface PromptSectionProps {
  prompt: string
  normalizedPrompt: string
  promptHintText: string
  isMobile: boolean
  textareaRef: RefObject<HTMLTextAreaElement | null>
  onPromptChange: (value: string) => void
  onKeyDown: KeyboardEventHandler<HTMLTextAreaElement>
}

export default function PromptSection({
  prompt,
  normalizedPrompt,
  promptHintText,
  isMobile,
  textareaRef,
  onPromptChange,
  onKeyDown,
}: PromptSectionProps) {
  return (
    <div className="flex flex-shrink-0 flex-col gap-2">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <span className={SECTION_TITLE_CLASS}>提示词</span>
          <p className="mt-0.5 truncate text-xs text-gray-400 dark:text-gray-500">{promptHintText}</p>
        </div>
        <span className="flex-shrink-0 font-mono text-[11px] tabular-nums text-gray-400 dark:text-gray-500">
          {normalizedPrompt ? `${normalizedPrompt.length} 字` : '未填写'}
        </span>
      </div>
      <textarea
        ref={textareaRef}
        value={prompt}
        onChange={(e) => onPromptChange(e.target.value)}
        onKeyDown={onKeyDown}
        rows={isMobile ? 3 : 12}
        placeholder="描述你想生成的图片..."
        className="min-h-[4.75rem] w-full resize-none rounded-2xl border border-gray-200 bg-gray-50/70 px-4 py-3 text-[15px] leading-6 text-gray-800 transition-[border-color,background-color,box-shadow] duration-200 placeholder:text-gray-400 hover:border-gray-300 focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-500/10 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-100 dark:placeholder:text-gray-500 dark:hover:border-white/[0.14] dark:focus:bg-white/[0.05] md:min-h-[11rem] md:leading-7"
      />
    </div>
  )
}
