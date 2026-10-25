import {
  useRef,
  useState,
  type ClipboardEvent,
  type ClipboardEventHandler,
  type DragEventHandler,
} from 'react'
import { createSingleImageTasksFromFiles } from '@/store'

function extractClipboardImageFiles(event: ClipboardEvent<HTMLDivElement>): File[] {
  const items = event.clipboardData?.items
  if (!items) {
    return []
  }

  const files: File[] = []
  for (const item of Array.from(items)) {
    if (!item.type.startsWith('image/')) {
      continue
    }

    const file = item.getAsFile()
    if (file) {
      files.push(file)
    }
  }

  return files
}

export function useGalleryImageTaskImport() {
  const dragCounter = useRef(0)
  const [isImporting, setIsImporting] = useState(false)

  const onPaste: ClipboardEventHandler<HTMLDivElement> = (event) => {
    const files = extractClipboardImageFiles(event)
    if (files.length === 0) {
      return
    }

    event.preventDefault()
    void createSingleImageTasksFromFiles(files)
  }

  const onDragEnter: DragEventHandler<HTMLDivElement> = (event) => {
    if (!event.dataTransfer?.types.includes('Files')) {
      return
    }

    event.preventDefault()
    dragCounter.current += 1
    setIsImporting(true)
  }

  const onDragOver: DragEventHandler<HTMLDivElement> = (event) => {
    if (!event.dataTransfer?.types.includes('Files')) {
      return
    }

    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
  }

  const onDragLeave: DragEventHandler<HTMLDivElement> = (event) => {
    if (!event.dataTransfer?.types.includes('Files')) {
      return
    }

    event.preventDefault()
    dragCounter.current = Math.max(0, dragCounter.current - 1)
    if (dragCounter.current === 0) {
      setIsImporting(false)
    }
  }

  const onDrop: DragEventHandler<HTMLDivElement> = (event) => {
    if (!event.dataTransfer?.types.includes('Files')) {
      return
    }

    event.preventDefault()
    dragCounter.current = 0
    setIsImporting(false)

    const files = event.dataTransfer.files
    if (files.length > 0) {
      void createSingleImageTasksFromFiles(files)
    }
  }

  return {
    isImporting,
    bind: {
      onPaste,
      onDragEnter,
      onDragOver,
      onDragLeave,
      onDrop,
    },
  }
}
