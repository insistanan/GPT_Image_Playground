import { useState, useRef, useEffect, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { useFloatingPanel } from '@/hooks/useFloatingPanel'
import { CHIP_ACTIVE_CLASS, CHIP_BASE_CLASS, CHIP_IDLE_CLASS } from './ParamPopoverChip'

interface Option {
  label: string
  value: string | number
  disabled?: boolean
}

interface SelectProps {
  value: string | number
  onChange: (value: any) => void
  options: Option[]
  disabled?: boolean
  className?: string
  /** field 为表单字段样式（默认）；chip 为参数芯片样式，点一次即展开列表 */
  variant?: 'field' | 'chip'
  /** chip 变体的前缀标签，例如"质量" */
  label?: string
  /** chip 变体是否高亮，表示已偏离默认值 */
  active?: boolean
}

const CHIP_MENU_MIN_WIDTH = 144

export default function Select({
  value,
  onChange,
  options,
  disabled,
  className,
  variant = 'field',
  label,
  active = false,
}: SelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const isChip = variant === 'chip'

  const { style: menuStyle, placement } = useFloatingPanel({
    open: isOpen,
    anchorRef: triggerRef,
    panelRef: menuRef,
    width: 'anchor',
    minWidth: isChip ? CHIP_MENU_MIN_WIDTH : 0,
  })

  const selectedOption = options.find((o) => o.value === value)

  useEffect(() => {
    if (!isOpen) return

    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Node
      if (!containerRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [isOpen])

  const close = () => setIsOpen(false)

  const handleTriggerKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      setIsOpen(true)
    }
  }

  const handleMenuKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      close()
      triggerRef.current?.focus()
    }
  }

  const containerClass = isChip ? 'relative inline-flex min-w-0 max-w-full' : 'relative w-full'
  const triggerClass = isChip
    ? `${CHIP_BASE_CLASS} ${active ? CHIP_ACTIVE_CLASS : CHIP_IDLE_CLASS} inline-flex max-w-full cursor-pointer select-none items-center gap-1 whitespace-nowrap focus-visible:ring-2 focus-visible:ring-blue-500/40`
    : 'flex w-full cursor-pointer select-none items-center justify-between gap-1 text-left'
  const disabledClass = disabled
    ? isChip
      ? '!opacity-50 !cursor-not-allowed'
      : '!opacity-50 !cursor-not-allowed !bg-gray-100/50 dark:!bg-white/[0.02]'
    : ''

  const menu = (
    <div
      ref={menuRef}
      role="listbox"
      style={menuStyle}
      onKeyDown={handleMenuKeyDown}
      onClick={(e) => e.stopPropagation()}
      className={`overflow-y-auto overscroll-contain rounded-xl border border-gray-200/70 bg-white/95 p-1 shadow-xl shadow-black/5 ring-1 ring-black/5 backdrop-blur-xl dark:border-white/[0.08] dark:bg-gray-900/95 dark:shadow-black/30 dark:ring-white/10 ${
        placement === 'top' ? 'animate-dropdown-up' : 'animate-dropdown-down'
      }`}
    >
      {options.map((option) => {
        const isSelected = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="option"
            aria-selected={isSelected}
            disabled={option.disabled}
            onClick={() => {
              onChange(option.value)
              close()
              triggerRef.current?.focus()
            }}
            className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors ${
              option.disabled
                ? 'cursor-not-allowed text-gray-300 dark:text-gray-600'
                : isSelected
                  ? 'cursor-pointer bg-blue-50 font-medium text-blue-600 dark:bg-blue-500/10 dark:text-blue-400'
                  : 'cursor-pointer text-gray-700 hover:bg-gray-100/80 dark:text-gray-300 dark:hover:bg-white/[0.06]'
            }`}
          >
            <span className="truncate">{option.label}</span>
            {isSelected && (
              <svg className="h-3.5 w-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            )}
          </button>
        )
      })}
    </div>
  )

  return (
    <div ref={containerRef} className={containerClass}>
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        disabled={disabled}
        onClick={(e) => {
          if (disabled) return
          e.stopPropagation()
          setIsOpen((open) => !open)
        }}
        onKeyDown={handleTriggerKeyDown}
        className={`${triggerClass} ${className ?? ''} ${disabledClass}`}
      >
        {isChip ? (
          <>
            {label && <span className="flex-shrink-0">{label}</span>}
            <span className={`min-w-0 truncate ${active ? 'opacity-90' : 'text-gray-500 dark:text-gray-400'}`}>
              {selectedOption?.label ?? value}
            </span>
          </>
        ) : (
          <span className="truncate">{selectedOption?.label ?? value}</span>
        )}
        <svg
          className={`flex-shrink-0 transition-transform duration-200 ${
            isChip ? 'h-3 w-3 opacity-60' : 'h-3.5 w-3.5 text-gray-400 dark:text-gray-500'
          } ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && createPortal(menu, document.body)}
    </div>
  )
}
