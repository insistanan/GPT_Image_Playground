import { useLayoutEffect, useState, type CSSProperties, type RefObject } from 'react'

const VIEWPORT_MARGIN = 8
const PANEL_GAP = 6
const FLOATING_Z_INDEX = 95

export type FloatingPlacement = 'top' | 'bottom'

interface FloatingPanelOptions {
  open: boolean
  anchorRef: RefObject<HTMLElement | null>
  panelRef: RefObject<HTMLElement | null>
  /** 固定宽度（px），或与锚点同宽（不小于 minWidth） */
  width: number | 'anchor'
  minWidth?: number
}

/**
 * 计算 fixed 定位浮层的位置：默认在锚点下方展开，下方空间不足且上方更宽裕时翻到上方，
 * 高度超出可用空间时限制 maxHeight（由面板自身滚动），水平方向夹在视口内。
 */
export function useFloatingPanel({ open, anchorRef, panelRef, width, minWidth = 0 }: FloatingPanelOptions) {
  const [layout, setLayout] = useState<{ style: CSSProperties; placement: FloatingPlacement }>({
    style: {},
    placement: 'bottom',
  })

  useLayoutEffect(() => {
    if (!open) return

    const update = () => {
      const anchor = anchorRef.current
      const panel = panelRef.current
      if (!anchor || !panel) return

      const rect = anchor.getBoundingClientRect()
      const viewportWidth = window.innerWidth
      const viewportHeight = window.innerHeight
      const maxPanelWidth = viewportWidth - VIEWPORT_MARGIN * 2
      const panelWidth = Math.min(
        maxPanelWidth,
        width === 'anchor' ? Math.max(rect.width, minWidth) : width,
      )
      const left = Math.min(
        Math.max(rect.left, VIEWPORT_MARGIN),
        viewportWidth - VIEWPORT_MARGIN - panelWidth,
      )

      const spaceBelow = viewportHeight - rect.bottom - PANEL_GAP - VIEWPORT_MARGIN
      const spaceAbove = rect.top - PANEL_GAP - VIEWPORT_MARGIN
      // scrollHeight 反映内容完整高度，即使已被 maxHeight 限制也能用来判断是否放得下
      const placement: FloatingPlacement =
        spaceBelow < panel.scrollHeight && spaceAbove > spaceBelow ? 'top' : 'bottom'
      const maxHeight = Math.max(placement === 'top' ? spaceAbove : spaceBelow, 0)

      setLayout({
        placement,
        style: {
          position: 'fixed',
          left,
          width: panelWidth,
          maxHeight,
          zIndex: FLOATING_Z_INDEX,
          ...(placement === 'top'
            ? { bottom: viewportHeight - rect.top + PANEL_GAP }
            : { top: rect.bottom + PANEL_GAP }),
        },
      })
    }

    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [open, anchorRef, panelRef, width, minWidth])

  return layout
}
