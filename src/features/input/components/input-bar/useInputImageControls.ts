import {
  useEffect,
  useRef,
  useState,
  type ChangeEventHandler,
  type ClipboardEventHandler,
  type DragEventHandler,
  type RefObject,
} from 'react'
import {
  addImageFromFile,
  addImageFromUrl,
  clearInputImageEdit,
  reopenImageEditorFromInputImage,
  useStore,
} from '@/store'
import type { InputImage } from '@/types'
import { API_MAX_IMAGES } from './shared'
import type { InputPanelBindings, ReferenceImagesSectionViewModel } from './useInputBarState'

interface UseInputImageControlsOptions {
  isMobile: boolean
  inputImages: InputImage[]
  maskedInputCount: number
  primaryMaskedInput: InputImage | null
  primaryMaskedInputIndex: number
  atImageLimit: boolean
  mobileDrawerOpen: boolean
  onPreviewImage: (imageId: string) => void
  onRemoveInputImage: (index: number) => void
  onRequestClearAllImages: () => void
}

interface UseInputImageControlsResult {
  fileInputRef: RefObject<HTMLInputElement | null>
  isDragging: boolean
  onFileUpload: ChangeEventHandler<HTMLInputElement>
  panelBindings: InputPanelBindings
  referenceImagesSectionProps: ReferenceImagesSectionViewModel
}

export function useInputImageControls(
  options: UseInputImageControlsOptions,
): UseInputImageControlsResult {
  const {
    isMobile,
    inputImages,
    maskedInputCount,
    primaryMaskedInput,
    primaryMaskedInputIndex,
    atImageLimit,
    mobileDrawerOpen,
    onPreviewImage,
    onRemoveInputImage,
    onRequestClearAllImages,
  } = options
  const fileInputRef = useRef<HTMLInputElement>(null)
  const imageUrlInputRef = useRef<HTMLInputElement>(null)
  const imageUrlPopoverRef = useRef<HTMLDivElement>(null)
  const dragCounter = useRef(0)

  const [isDragging, setIsDragging] = useState(false)
  const [showImageUrlInput, setShowImageUrlInput] = useState(false)
  const [imageUrlInput, setImageUrlInput] = useState('')

  const handleFiles = async (files: FileList | File[]) => {
    try {
      const currentCount = useStore.getState().inputImages.length
      if (currentCount >= API_MAX_IMAGES) {
        useStore.getState().showToast(
          `参考图数量已达上限（${API_MAX_IMAGES} 张），无法继续添加`,
          'error',
        )
        return
      }

      const remaining = API_MAX_IMAGES - currentCount
      const accepted = Array.from(files).filter((file) => file.type.startsWith('image/'))
      const imagesToAdd = accepted.slice(0, remaining)
      const discardedCount = accepted.length - imagesToAdd.length

      for (const file of imagesToAdd) {
        await addImageFromFile(file)
      }

      if (discardedCount > 0) {
        useStore
          .getState()
          .showToast(`已达上限 ${API_MAX_IMAGES} 张，${discardedCount} 张图片被丢弃`, 'error')
      }
    } catch (error) {
      useStore
        .getState()
        .showToast(`图片添加失败：${error instanceof Error ? error.message : String(error)}`, 'error')
    }
  }

  const handleFilesRef = useRef(handleFiles)
  handleFilesRef.current = handleFiles

  const handleFileUpload: ChangeEventHandler<HTMLInputElement> = async (event) => {
    await handleFilesRef.current(event.target.files || [])
    event.target.value = ''
  }

  const handleAddImageUrl = async () => {
    try {
      const currentCount = useStore.getState().inputImages.length
      if (currentCount >= API_MAX_IMAGES) {
        useStore.getState().showToast(
          `参考图数量已达上限（${API_MAX_IMAGES} 张），无法继续添加`,
          'error',
        )
        return
      }

      await addImageFromUrl(imageUrlInput.trim())
      setImageUrlInput('')
      setShowImageUrlInput(false)
    } catch (error) {
      useStore.getState().showToast(
        `图片 URL 添加失败：${error instanceof Error ? error.message : String(error)}`,
        'error',
      )
    }
  }

  useEffect(() => {
    if (!showImageUrlInput) return

    const handlePointerDown = (event: MouseEvent) => {
      if (!imageUrlPopoverRef.current?.contains(event.target as Node)) {
        setShowImageUrlInput(false)
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowImageUrlInput(false)
      }
    }

    const frameId = window.requestAnimationFrame(() => {
      imageUrlInputRef.current?.focus()
    })

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleEscape)
    return () => {
      window.cancelAnimationFrame(frameId)
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [showImageUrlInput])

  useEffect(() => {
    if (mobileDrawerOpen) return
    setShowImageUrlInput(false)
  }, [mobileDrawerOpen])

  return {
    fileInputRef,
    isDragging,
    onFileUpload: handleFileUpload,
    panelBindings: {
      onPaste: ((event) => {
        const items = event.clipboardData?.items
        if (!items) return

        const imageFiles: File[] = []
        for (const item of Array.from(items)) {
          if (item.type.startsWith('image/')) {
            const file = item.getAsFile()
            if (file) {
              imageFiles.push(file)
            }
          }
        }

        if (imageFiles.length > 0) {
          event.preventDefault()
          void handleFilesRef.current(imageFiles)
        }
      }) as ClipboardEventHandler<HTMLDivElement>,
      onDragEnter: ((event) => {
        if (!event.dataTransfer?.types.includes('Files')) {
          return
        }

        event.preventDefault()
        dragCounter.current += 1
        setIsDragging(true)
      }) as DragEventHandler<HTMLDivElement>,
      onDragOver: ((event) => {
        if (!event.dataTransfer?.types.includes('Files')) {
          return
        }

        event.preventDefault()
      }) as DragEventHandler<HTMLDivElement>,
      onDragLeave: ((event) => {
        if (!event.dataTransfer?.types.includes('Files')) {
          return
        }

        event.preventDefault()
        dragCounter.current = Math.max(0, dragCounter.current - 1)
        if (dragCounter.current === 0) {
          setIsDragging(false)
        }
      }) as DragEventHandler<HTMLDivElement>,
      onDrop: ((event) => {
        if (!event.dataTransfer?.types.includes('Files')) {
          return
        }

        event.preventDefault()
        dragCounter.current = 0
        setIsDragging(false)

        const files = event.dataTransfer?.files
        if (files && files.length > 0) {
          void handleFilesRef.current(files)
        }
      }) as DragEventHandler<HTMLDivElement>,
    },
    referenceImagesSectionProps: {
      isMobile,
      inputImages,
      maskedInputCount,
      primaryMaskedInput,
      atImageLimit,
      showImageUrlInput,
      imageUrlInput,
      imageUrlInputRef,
      imageUrlPopoverRef,
      onToggleImageUrlInput: () => setShowImageUrlInput((visible) => !visible),
      onImageUrlInputChange: setImageUrlInput,
      onCancelImageUrlInput: () => {
        setShowImageUrlInput(false)
        setImageUrlInput('')
      },
      onSubmitImageUrl: () => {
        void handleAddImageUrl()
      },
      onOpenFilePicker: () => {
        if (!atImageLimit) {
          fileInputRef.current?.click()
        }
      },
      onPreviewImage,
      onRemoveInputImage,
      onRequestClearAllImages,
      onReopenMaskedEdit: () => {
        if (primaryMaskedInput) {
          reopenImageEditorFromInputImage(primaryMaskedInput)
        }
      },
      onClearMaskedEdit: () => {
        if (primaryMaskedInputIndex >= 0) {
          clearInputImageEdit(primaryMaskedInputIndex)
        }
      },
    },
  }
}
