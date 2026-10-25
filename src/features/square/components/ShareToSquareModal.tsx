import { useEffect, useMemo, useState, type ClipboardEvent, type KeyboardEvent } from 'react'
import { useCloseOnEscape } from '@/hooks/useCloseOnEscape'
import { useStore } from '@/store'
import { buildPromptShareInput, buildTaskShareInput } from '@/features/square/lib/buildShareManifest'
import { isSquareApiConfigured, squareApiClient } from '@/features/square/lib/squareApiClient'

const MAX_TAG_COUNT = 8
const MAX_TAG_LENGTH = 24

function splitTagParts(value: string): string[] {
  return value
    .split(/[，,\n;]/)
    .map((tag) => tag.trim().slice(0, MAX_TAG_LENGTH))
    .filter(Boolean)
}

function normalizeTags(values: string[]): string[] {
  return Array.from(new Set(values.map((tag) => tag.trim().slice(0, MAX_TAG_LENGTH)).filter(Boolean)))
    .slice(0, MAX_TAG_COUNT)
}

function appendTags(current: string[], value: string): string[] {
  return normalizeTags([...current, ...splitTagParts(value)])
}

function resolveTaskTitle(prompt: string): string {
  return prompt.trim().slice(0, 36) || '图任务分享'
}

export default function ShareToSquareModal() {
  const target = useStore((state) => state.shareToSquareTarget)
  const setTarget = useStore((state) => state.setShareToSquareTarget)
  const tasks = useStore((state) => state.tasks)
  const promptLibrary = useStore((state) => state.promptLibrary)
  const showToast = useStore((state) => state.showToast)
  const [title, setTitle] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [tagDraft, setTagDraft] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const task = useMemo(
    () => target?.kind === 'task' ? tasks.find((item) => item.id === target.taskId) ?? null : null,
    [target, tasks],
  )
  const promptItem = useMemo(
    () =>
      target?.kind === 'prompt' && target.title
        ? promptLibrary.find((item) => item.title === target.title && item.content === target.content) ?? null
        : null,
    [promptLibrary, target],
  )

  useEffect(() => {
    if (!target) return

    setError(null)
    setTags([])
    setTagDraft('')
    if (target.kind === 'task') {
      const nextTask = tasks.find((item) => item.id === target.taskId)
      setTitle(resolveTaskTitle(nextTask?.prompt ?? ''))
      return
    }

    setTitle((target.title ?? target.content.slice(0, 36)).trim())
  }, [target, tasks])

  const close = () => {
    if (isSubmitting) return
    setTarget(null)
  }

  useCloseOnEscape(Boolean(target) && !isSubmitting, close)

  if (!target) return null

  const isConfigured = isSquareApiConfigured()
  const isTaskTarget = target.kind === 'task'
  const bodyText = isTaskTarget
    ? task?.prompt.trim() || '该任务没有提示词'
    : target.content.trim()

  const commitTagDraft = () => {
    const nextDraft = tagDraft.trim()
    if (!nextDraft) return
    setTags((current) => appendTags(current, nextDraft))
    setTagDraft('')
  }

  const removeTag = (tag: string) => {
    setTags((current) => current.filter((item) => item !== tag))
  }

  const handleTagKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return

    if (event.key === 'Enter' || event.key === ',' || event.key === '，') {
      event.preventDefault()
      commitTagDraft()
      return
    }

    if (event.key === 'Backspace' && !tagDraft) {
      setTags((current) => current.slice(0, -1))
    }
  }

  const handleTagPaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const text = event.clipboardData.getData('text')
    if (!/[，,\n;]/.test(text)) return

    event.preventDefault()
    setTags((current) => appendTags(current, `${tagDraft},${text}`))
    setTagDraft('')
  }

  const submit = async () => {
    if (!isConfigured) {
      setError('尚未配置广场 API 地址，请先设置 VITE_SQUARE_API_URL')
      return
    }

    setIsSubmitting(true)
    setError(null)
    try {
      const submitTags = normalizeTags([...tags, ...splitTagParts(tagDraft)])
      const shareInput = target.kind === 'task'
        ? (() => {
            if (!task) throw new Error('找不到要分享的任务')
            return buildTaskShareInput({
              task,
              tasks,
              kind: 'task',
              title,
              tags: submitTags,
            })
          })()
        : Promise.resolve(
            buildPromptShareInput({
              item: promptItem ?? undefined,
              title,
              content: target.content,
              tags: submitTags,
            }),
          )

      await squareApiClient.createShare(await shareInput)
      showToast(target.kind === 'task' ? '图任务已分享到广场' : '提示词已分享到广场', 'success')
      setTarget(null)
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : String(submitError))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[74] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        onClick={close}
      />
      <div className="relative z-10 flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-white/60 bg-white/95 shadow-2xl ring-1 ring-black/5 dark:border-white/[0.08] dark:bg-gray-900/95 dark:ring-white/10">
        <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-5 py-4 dark:border-white/[0.08]">
          <div>
            <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100">
              {isTaskTarget ? '分享到广场' : '分享提示词'}
            </h3>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {isTaskTarget ? '仅成功图任务会被发布，任务链和缩略图会一起上传' : '提示词每天最多可分享 99 条'}
            </p>
          </div>
          <button
            type="button"
            onClick={close}
            disabled={isSubmitting}
            className="rounded-full p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-white/[0.06] dark:hover:text-gray-200"
            aria-label="关闭"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {!isConfigured && (
            <div className="rounded-2xl border border-amber-200/80 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-400/20 dark:bg-amber-500/10 dark:text-amber-200">
              当前没有配置广场 API，无法提交分享。
            </div>
          )}

          <label className="block">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-300">标题</span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={80}
              className="mt-1.5 h-10 w-full rounded-xl border border-gray-200/90 bg-white px-3 text-sm text-gray-700 shadow-sm transition focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 dark:border-white/[0.08] dark:bg-gray-950 dark:text-gray-200"
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-300">标签</span>
            <div className="mt-1.5 flex min-h-10 w-full flex-wrap items-center gap-1.5 rounded-xl border border-gray-200/90 bg-white px-2.5 py-1.5 text-sm text-gray-700 shadow-sm transition focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-500/30 dark:border-white/[0.08] dark:bg-gray-950 dark:text-gray-200">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex h-7 max-w-full items-center gap-1 rounded-full bg-blue-50 px-2.5 text-xs font-medium text-blue-600 ring-1 ring-blue-100 dark:bg-blue-500/10 dark:text-blue-200 dark:ring-blue-400/20"
                >
                  <span className="max-w-32 truncate">{tag}</span>
                  <button
                    type="button"
                    onClick={() => removeTag(tag)}
                    className="-mr-1 flex h-5 w-5 items-center justify-center rounded-full text-blue-400 transition hover:bg-blue-100 hover:text-blue-700 dark:hover:bg-blue-400/20 dark:hover:text-blue-100"
                    aria-label={`移除标签 ${tag}`}
                  >
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18 18 6M6 6l12 12" />
                    </svg>
                  </button>
                </span>
              ))}
              <input
                value={tagDraft}
                onChange={(event) => setTagDraft(event.target.value)}
                onKeyDown={handleTagKeyDown}
                onPaste={handleTagPaste}
                onBlur={commitTagDraft}
                placeholder={tags.length ? '继续输入标签' : '角色、夜景、构图'}
                className="h-7 min-w-24 flex-1 border-0 bg-transparent px-1 text-sm text-gray-700 outline-none placeholder:text-gray-400 dark:text-gray-200"
              />
            </div>
            <p className="mt-1.5 text-[11px] leading-4 text-gray-400 dark:text-gray-500">
              按 Enter 创建标签，支持逗号或换行批量输入
            </p>
          </label>

          <div>
            <p className="text-xs font-medium text-gray-600 dark:text-gray-300">内容预览</p>
            <div className="mt-1.5 max-h-40 overflow-y-auto rounded-2xl border border-gray-200/80 bg-gray-50/80 p-3 text-sm leading-6 text-gray-700 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-200">
              <p className="whitespace-pre-wrap break-words">{bodyText}</p>
            </div>
          </div>

          {isTaskTarget && (
            <div className="rounded-2xl border border-gray-200/80 bg-white/70 px-4 py-3 text-xs leading-5 text-gray-500 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-400">
              将上传该任务的生成输出图、缩略图、必要参数和编辑任务链。用户上传的单图任务不会被允许发布。
            </div>
          )}

          {error && (
            <div className="rounded-2xl border border-red-200/80 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-400/20 dark:bg-red-500/10 dark:text-red-200">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-gray-100 px-5 py-4 dark:border-white/[0.08]">
          <button
            type="button"
            onClick={close}
            disabled={isSubmitting}
            className="rounded-full border border-gray-200/80 bg-white px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/[0.08] dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.06]"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => {
              void submit()
            }}
            disabled={isSubmitting || !isConfigured}
            className="rounded-full bg-blue-500 px-4 py-2 text-sm font-medium text-white shadow-[0_14px_28px_-18px_rgba(37,99,235,0.9)] transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:shadow-none dark:disabled:bg-gray-700"
          >
            {isSubmitting ? '发布中...' : '发布'}
          </button>
        </div>
      </div>
    </div>
  )
}
