import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useFloatingPanel } from '@/hooks/useFloatingPanel'

export const CHIP_BASE_CLASS = 'h-8 min-w-0 px-3 rounded-full text-xs transition-colors duration-200 focus:outline-none'
export const CHIP_IDLE_CLASS = 'bg-black/[0.04] text-gray-700 hover:bg-black/[0.07] dark:bg-white/[0.06] dark:text-gray-200 dark:hover:bg-white/[0.1]'
export const CHIP_ACTIVE_CLASS = 'bg-blue-500/[0.1] text-blue-600 hover:bg-blue-500/[0.14] dark:bg-blue-500/[0.16] dark:text-blue-400 dark:hover:bg-blue-500/[0.22]'
const PANEL_WIDTH = 272

interface ParamPopoverChipProps {
  label: string
  summary?: string
  active?: boolean
  className?: string
  children?: ReactNode
}

export default function ParamPopoverChip({
  label,
  summary,
  active = false,
  className = '',
  children,
}: ParamPopoverChipProps) {
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const hasPanel = Boolean(children)
  const { style: panelStyle } = useFloatingPanel({
    open: open && hasPanel,
    anchorRef: buttonRef,
    panelRef,
    width: PANEL_WIDTH,
  })

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
              className="overflow-y-auto overscroll-contain rounded-2xl border border-gray-200/80 bg-white/95 p-3.5 shadow-[0_20px_48px_-20px_rgba(15,23,42,0.45)] backdrop-blur-xl dark:border-white/[0.08] dark:bg-gray-900/95"
            >
              {children}
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
