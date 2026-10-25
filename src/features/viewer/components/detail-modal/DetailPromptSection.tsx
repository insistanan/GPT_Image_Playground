import type { TaskKind } from '@/types'

interface DetailPromptSectionProps {
  taskKind: TaskKind
  prompt: string
  revisedPrompt: string
}

export default function DetailPromptSection({
  taskKind,
  prompt,
  revisedPrompt,
}: DetailPromptSectionProps) {
  const normalizedPrompt = prompt.trim()
  const shouldHidePromptBlock = taskKind === 'image' && !normalizedPrompt

  return (
    <>
      {!shouldHidePromptBlock && (
        <p className="mb-4 whitespace-pre-wrap text-sm leading-relaxed text-gray-700 dark:text-gray-300">
          {normalizedPrompt || '(无提示词)'}
        </p>
      )}

      {revisedPrompt && revisedPrompt !== normalizedPrompt && (
        <div className="mb-4 rounded-xl border border-blue-100 bg-blue-50/70 px-3 py-2 dark:border-blue-500/20 dark:bg-blue-500/10">
          <h3 className="mb-1 text-xs font-medium uppercase tracking-wider text-blue-500 dark:text-blue-300">
            模型修订提示词
          </h3>
          <p className="whitespace-pre-wrap break-words text-sm text-blue-700 dark:text-blue-100">
            {revisedPrompt}
          </p>
        </div>
      )}
    </>
  )
}
