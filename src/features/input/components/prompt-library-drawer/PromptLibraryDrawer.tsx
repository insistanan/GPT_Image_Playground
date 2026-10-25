import { useEffect, useState } from 'react'
import { useCloseOnEscape } from '@/hooks/useCloseOnEscape'
import { useStore } from '@/store'
import PromptLibraryHeader from './PromptLibraryHeader'
import PromptLibraryList from './PromptLibraryList'
import PromptLibrarySaveForm from './PromptLibrarySaveForm'

export default function PromptLibraryDrawer() {
  const showPromptLibrary = useStore((state) => state.showPromptLibrary)
  const setShowPromptLibrary = useStore((state) => state.setShowPromptLibrary)
  const prompt = useStore((state) => state.prompt)
  const setPrompt = useStore((state) => state.setPrompt)
  const promptLibrary = useStore((state) => state.promptLibrary)
  const savePromptLibraryItem = useStore((state) => state.savePromptLibraryItem)
  const removePromptLibraryItem = useStore((state) => state.removePromptLibraryItem)
  const setShareToSquareTarget = useStore((state) => state.setShareToSquareTarget)
  const showToast = useStore((state) => state.showToast)
  const [draftTitle, setDraftTitle] = useState('')
  const [draftContent, setDraftContent] = useState('')
  const hasCurrentPrompt = prompt.trim().length > 0

  useEffect(() => {
    if (!showPromptLibrary) return
    setDraftTitle('')
    setDraftContent(prompt.trim())
  }, [prompt, showPromptLibrary])

  const handleClose = () => {
    setShowPromptLibrary(false)
  }

  useCloseOnEscape(showPromptLibrary, handleClose)

  if (!showPromptLibrary) return null

  const handleSave = () => {
    try {
      const nextItem = savePromptLibraryItem({
        title: draftTitle,
        content: draftContent,
      })
      setDraftTitle('')
      setDraftContent(prompt.trim())
      showToast(`已保存提示词「${nextItem.title}」`, 'success')
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), 'error')
    }
  }

  const handleCopy = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content)
      showToast('提示词已复制', 'success')
    } catch (error) {
      showToast(`复制失败：${error instanceof Error ? error.message : String(error)}`, 'error')
    }
  }

  return (
    <div className="fixed inset-0 z-[72] flex justify-end">
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm transition-opacity duration-300"
        onClick={handleClose}
      />
      <div className="relative z-10 flex h-full w-full max-w-md animate-slide-in-right flex-col border-l border-white/50 bg-white/95 p-5 shadow-2xl ring-1 ring-black/5 dark:border-white/[0.08] dark:bg-gray-900/95 dark:ring-white/10">
        <PromptLibraryHeader onClose={handleClose} />

        <div className="flex min-h-0 flex-1 flex-col gap-5">
          <PromptLibrarySaveForm
            draftTitle={draftTitle}
            draftContent={draftContent}
            hasCurrentPrompt={hasCurrentPrompt}
            onTitleChange={setDraftTitle}
            onContentChange={setDraftContent}
            onFillFromCurrent={() => setDraftContent(prompt.trim())}
            onSave={handleSave}
            onShare={() => {
              setShareToSquareTarget({
                kind: 'prompt',
                title: draftTitle.trim() || undefined,
                content: draftContent,
              })
            }}
          />

          <PromptLibraryList
            items={promptLibrary}
            onApply={(item) => {
              setPrompt(item.content)
              showToast(`已填入「${item.title}」`, 'success')
            }}
            onCopy={(content) => {
              void handleCopy(content)
            }}
            onShare={(item) => {
              setShareToSquareTarget({
                kind: 'prompt',
                title: item.title,
                content: item.content,
              })
            }}
            onDelete={(item) => {
              removePromptLibraryItem(item.id)
              showToast(`已删除「${item.title}」`, 'success')
            }}
          />
        </div>
      </div>
    </div>
  )
}
