import type { ImageEditSelection } from '@/types'

export interface ImageDisplayRect {
  left: number
  top: number
  width: number
  height: number
}

export interface ImageNaturalSize {
  width: number
  height: number
}

export interface ImageSelectionPixelInfo {
  width: number
  height: number
}

export function createEmptyDisplayRect(): ImageDisplayRect {
  return {
    left: 0,
    top: 0,
    width: 0,
    height: 0,
  }
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function isPointInsideSelection(selection: ImageEditSelection, x: number, y: number) {
  return (
    x >= selection.x &&
    x <= selection.x + selection.width &&
    y >= selection.y &&
    y <= selection.y + selection.height
  )
}

export function createMaskFromSelection(
  width: number,
  height: number,
  selection: ImageEditSelection | null,
): string | undefined {
  if (!selection) return undefined

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('蒙版画布初始化失败')
  }

  const selectionLeft = clamp(Math.round(selection.x * width), 0, width)
  const selectionTop = clamp(Math.round(selection.y * height), 0, height)
  const selectionWidth = clamp(Math.round(selection.width * width), 1, width - selectionLeft)
  const selectionHeight = clamp(Math.round(selection.height * height), 1, height - selectionTop)

  // 编辑器本地状态只记录选区形状，提交前会在 provider 适配层统一规范成最终蒙版。
  // 这里保持透明底 + 选区实心，避免把整张黑底写回本地状态。
  context.clearRect(0, 0, width, height)
  context.fillStyle = '#ffffff'
  context.fillRect(selectionLeft, selectionTop, selectionWidth, selectionHeight)

  return canvas.toDataURL('image/png')
}
