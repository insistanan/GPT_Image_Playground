import SizePickerModal from '@/features/input/components/size-picker/SizePickerModal'
import DragOverlay from './DragOverlay'
import InputPanelContent from './InputPanelContent'
import MobilePromptDrawer from './MobilePromptDrawer'
import MobilePromptLauncher from './MobilePromptLauncher'
import { useInputBarState } from './useInputBarState'

export default function InputBar() {
  const {
    normalizedPrompt,
    promptPreview,
    isDragging,
    atImageLimit,
    mobileDrawerOpen,
    showSizePicker,
    sizePickerValue,
    fileInputRef,
    inputContent,
    onOpenMobileDrawer,
    onCloseMobileDrawer,
    onFileUpload,
    onSelectSize,
    onCloseSizePicker,
  } = useInputBarState()

  return (
    <>
      <aside className="z-20 hidden w-80 flex-shrink-0 border-r border-gray-200 bg-white dark:border-white/[0.08] dark:bg-gray-900 md:flex md:flex-col">
        <div className="flex h-full flex-col">
          <InputPanelContent content={inputContent} />
        </div>
      </aside>

      <MobilePromptLauncher
        normalizedPrompt={normalizedPrompt}
        promptPreview={promptPreview}
        onOpen={onOpenMobileDrawer}
      />

      <MobilePromptDrawer open={mobileDrawerOpen} onClose={onCloseMobileDrawer}>
        <InputPanelContent content={inputContent} />
      </MobilePromptDrawer>

      <DragOverlay visible={isDragging} atImageLimit={atImageLimit} />

      {showSizePicker && (
        <SizePickerModal
          currentSize={sizePickerValue}
          onSelect={onSelectSize}
          onClose={onCloseSizePicker}
        />
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={onFileUpload}
      />
    </>
  )
}
