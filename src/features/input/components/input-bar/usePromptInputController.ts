import { useCallback, useEffect, useRef, type KeyboardEventHandler } from 'react'
import { submitTask } from '@/store'
import type { PromptSectionViewModel } from './useInputBarState'

interface UsePromptInputControllerOptions {
  prompt: string
  normalizedPrompt: string
  promptHintText: string
  isMobile: boolean
  inputImageCount: number
  mobileDrawerOpen: boolean
  onPromptChange: (value: string) => void
}

export function usePromptInputController(
  options: UsePromptInputControllerOptions,
): PromptSectionViewModel {
  const {
    prompt,
    normalizedPrompt,
    promptHintText,
    isMobile,
    inputImageCount,
    mobileDrawerOpen,
    onPromptChange,
  } = options
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const previousHeightRef = useRef(42)

  const handlePromptKeyDown: KeyboardEventHandler<HTMLTextAreaElement> = (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault()
      submitTask()
    }
  }

  const adjustTextareaHeight = useCallback(() => {
    const element = textareaRef.current
    if (!element) return

    const containerHeight =
      (element.closest('[data-input-panel]') as HTMLElement | null)?.clientHeight ?? window.innerHeight
    const minHeight = isMobile ? 76 : 176
    const maxHeight = Math.max(containerHeight * (isMobile ? 0.22 : 0.4), minHeight)

    element.style.transition = 'none'
    element.style.height = '0'
    element.style.overflowY = 'hidden'
    const scrollHeight = element.scrollHeight
    const desiredHeight = Math.max(scrollHeight, minHeight)
    const targetHeight = desiredHeight > maxHeight ? maxHeight : desiredHeight

    element.style.height = `${previousHeightRef.current}px`
    void element.offsetHeight

    element.style.transition = 'height 150ms ease, border-color 200ms, box-shadow 200ms'
    element.style.height = `${targetHeight}px`
    element.style.overflowY = desiredHeight > maxHeight ? 'auto' : 'hidden'

    previousHeightRef.current = targetHeight
  }, [isMobile])

  useEffect(() => {
    adjustTextareaHeight()
  }, [adjustTextareaHeight, inputImageCount, prompt])

  useEffect(() => {
    window.addEventListener('resize', adjustTextareaHeight)
    return () => window.removeEventListener('resize', adjustTextareaHeight)
  }, [adjustTextareaHeight])

  useEffect(() => {
    if (!mobileDrawerOpen) return

    const frameId = window.requestAnimationFrame(() => {
      textareaRef.current?.focus()
    })
    return () => window.cancelAnimationFrame(frameId)
  }, [mobileDrawerOpen])

  return {
    prompt,
    normalizedPrompt,
    promptHintText,
    isMobile,
    textareaRef,
    onPromptChange,
    onKeyDown: handlePromptKeyDown,
  }
}
