import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export const CHIP_BASE_CLASS = 'h-8 min-w-0 px-3 rounded-full text-xs transition-colors duration-200 focus:outline-none'
export const CHIP_IDLE_CLASS = 'bg-black/[0.04] text-gray-700 hover:bg-black/[0.07] dark:bg-white/[0.06] dark:text-gray-200 dark:hover:bg-white/[0.1]'
export const CHIP_ACTIVE_CLASS = 'bg-blue-500/[0.1] text-blue-600 hover:bg-blue-500/[0.14] dark:bg-blue-500/[0.16] dark:text-blue-400 dark:hover:bg-blue-500/[0.22]'
const PANEL_WIDTH = 220
const VIEWPORT_PADDING = 8

interface ParamPopoverChipProps {
  label: string
  summary?: string
  active?: boolean
  className?: string
  children?: ReactNode
}

function getClipRect(element: HTMLElement | null) {
  const viewportRight = window.innerWidth - VIEWPORT_PADDING
  const viewportLeft = VIEWPORT_PADDING
  if (!element) {
    return { left: viewportLeft, right: viewportRight }
  }

  const sidebar = element.closest('aside') ?? element.closest('[data-input-panel]')
  if (sidebar) {
    const rect = sidebar.getBoundingClientRect()
    return {
      left: Math.max(viewportLeft, rect.left + VIEWPORT_PADDING),
      right: Math.min(viewportRight, rect.right - VIEWPORT_PADDING),
    }
  }

  return { left: viewportLeft, right: viewportRight }
}

export default function ParamPopoverChip({
  label,
  summary,
  active = false,
  className = '',
  children,
}: ParamPopoverChipProps) {
  const [open, setOpen] = useState(false)
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({})
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const hasPanel = Boolean(children)

  useLayoutEffect(() => {
    if (!open || !hasPanel) return

    const updatePosition = () => {
      const button = buttonRef.current
      if (!button) return
      const rect = button.getBoundingClientRect()
      const clip = getClipRect(button)
      const width = Math.min(PANEL_WIDTH, Math.max(160, clip.right - clip.left))
      const alignRight = rect.left + width > clip.right
      const left = alignRight
        ? Math.max(clip.left, rect.right - width)
        : Math.min(rect.left, clip.right - width)
      setPanelStyle({
        position: 'fixed',
        top: rect.bottom + 6,
        left,
        width,
        zIndex: 80,
      })
    }

    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [hasPanel, open])

  useEffect(() => {
    if (!open) return

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (!panelRef.current?.contains(target) && !buttonRef.current?.contains(target)) {
        setOpen(false)
      }
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  return (
    <div className={`relative min-w-0 ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => {
          if (!hasPanel) return
          setOpen((value) => !value)
        }}
        aria-expanded={hasPanel ? open : undefined}
        className={`flex w-full items-center gap-1 ${CHIP_BASE_CLASS} ${active ? CHIP_ACTIVE_CLASS : CHIP_IDLE_CLASS} ${open && !active ? '!bg-black/[0.07] dark:!bg-white/[0.1]' : ''}`}
      >
        <span className="flex-shrink-0">{label}</span>
        {summary ? (
          <span className={`min-w-0 flex-1 truncate text-left ${active ? 'opacity-90' : 'text-gray-500 dark:text-gray-400'}`}>
            {summary}
          </span>
        ) : null}
        {hasPanel ? (
          <svg className={`h-3 w-3 flex-shrink-0 opacity-60 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        ) : null}
      </button>
      {open && hasPanel
        ? createPortal(
            <div
              ref={panelRef}
              style={panelStyle}
              className="rounded-2xl border border-gray-200/80 bg-white/95 p-3 shadow-[0_16px_40px_-24px_rgba(15,23,42,0.45)] backdrop-blur-xl dark:border-white/[0.08] dark:bg-gray-900/95"
            >
              {children}
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
