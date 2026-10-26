import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useFloatingPanel } from '@/hooks/useFloatingPanel'

export interface ModelOption {
  value: string
  label?: string
  hint?: string
  deprecated?: boolean
  custom?: boolean
}

interface ModelComboboxProps {
  value: string
  onChange: (value: string) => void
  onCommit: (value: string) => void
  options: ModelOption[]
  placeholder?: string
  className?: string
}

export default function ModelCombobox({
  value,
  onChange,
  onCommit,
  options,
  placeholder,
  className,
}: ModelComboboxProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const triggerRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const { style: menuStyle, placement } = useFloatingPanel({
    open: isOpen,
    anchorRef: triggerRef,
    panelRef: menuRef,
    width: 'anchor',
  })

  const filteredOptions = useMemo(() => {
    const query = value.trim().toLowerCase()
    const matches = !query
      ? options
      : options.filter((option) => {
          const label = (option.label ?? option.value).toLowerCase()
          return label.includes(query) || option.value.toLowerCase().includes(query)
        })

    const hasExactOption = options.some((option) => option.value.toLowerCase() === query)
    if (!query || hasExactOption) return matches

    return [
      {
        value: value.trim(),
        label: `使用自定义模型 “${value.trim()}”`,
        hint: 'Enter 保存',
        custom: true,
      },
      ...matches,
    ]
  }, [options, value])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node
      if (!containerRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const openDropdown = useCallback(() => {
    if (isOpen) return
    setIsOpen(true)
  }, [isOpen])

  const handleFocus = useCallback(() => {
    openDropdown()
    setHighlightedIndex(0)
  }, [openDropdown])

  const commitValue = useCallback(
    (next: string) => {
      onCommit(next)
      setIsOpen(false)
    },
    [onCommit],
  )

  const selectOption = useCallback(
    (option: ModelOption) => {
      onChange(option.value)
      commitValue(option.value)
    },
    [onChange, commitValue],
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        openDropdown()
        setHighlightedIndex((idx) => Math.min(idx + 1, filteredOptions.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        openDropdown()
        setHighlightedIndex((idx) => Math.max(idx - 1, 0))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (isOpen && filteredOptions[highlightedIndex]) {
          selectOption(filteredOptions[highlightedIndex])
        } else {
          commitValue(value)
        }
      } else if (e.key === 'Escape') {
        setIsOpen(false)
      }
    },
    [commitValue, filteredOptions, highlightedIndex, isOpen, openDropdown, selectOption, value],
  )

  return (
    <div ref={containerRef} className="relative w-full">
      <div ref={triggerRef}>
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => {
            onChange(e.target.value)
            if (!isOpen) openDropdown()
            setHighlightedIndex(0)
          }}
          onFocus={handleFocus}
          onBlur={(e) => commitValue(e.target.value)}
          onKeyDown={handleKeyDown}
          type="text"
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
          className={className}
        />
      </div>

      {isOpen && createPortal(
        <div
          ref={menuRef}
          role="listbox"
          style={menuStyle}
          onClick={(e) => e.stopPropagation()}
          className={`overflow-y-auto overscroll-contain rounded-xl border border-gray-200/60 bg-white/95 py-1 shadow-[0_8px_30px_rgb(0,0,0,0.12)] ring-1 ring-black/5 backdrop-blur-xl dark:border-white/[0.08] dark:bg-gray-900/95 dark:shadow-[0_8px_30px_rgb(0,0,0,0.3)] dark:ring-white/10 ${
            placement === 'top' ? 'animate-dropdown-up' : 'animate-dropdown-down'
          }`}
        >
          {filteredOptions.length === 0 ? (
            <div className="px-3 py-2 text-[11px] text-gray-400 dark:text-gray-500">
              无匹配模型，可按 Enter 使用当前输入
            </div>
          ) : (
            filteredOptions.map((option, index) => {
              const isSelected = option.value === value
              const isHighlighted = index === highlightedIndex
              return (
                <div
                  key={option.value}
                  role="option"
                  aria-selected={isSelected}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    selectOption(option)
                  }}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  className={`mx-1 flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-xs cursor-pointer transition-colors ${
                    isHighlighted
                      ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400'
                      : isSelected
                        ? 'bg-blue-50/60 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400 font-medium'
                        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/[0.06]'
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className={`truncate ${option.custom ? 'font-sans' : 'font-mono'}`}>
                      {option.label ?? option.value}
                    </span>
                    {option.deprecated ? (
                      <span className="flex-shrink-0 rounded bg-amber-100 px-1 py-0.5 text-[9px] text-amber-600 dark:bg-amber-500/15 dark:text-amber-400">
                        即将下线
                      </span>
                    ) : null}
                  </span>
                  {option.hint ? (
                    <span className="flex-shrink-0 text-[10px] text-gray-400 dark:text-gray-500">
                      {option.hint}
                    </span>
                  ) : null}
                </div>
              )
            })
          )}
        </div>,
        document.body,
      )}
    </div>
  )
}
