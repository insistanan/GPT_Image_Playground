import { useState, useRef, useEffect, useCallback, useMemo } from 'react'

export interface ModelOption {
  value: string
  label?: string
  hint?: string
  deprecated?: boolean
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
  const [openUp, setOpenUp] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const triggerRef = useRef<HTMLDivElement>(null)

  const filteredOptions = useMemo(() => {
    const query = value.trim().toLowerCase()
    if (!query) return options
    return options.filter((option) => {
      const label = (option.label ?? option.value).toLowerCase()
      return label.includes(query) || option.value.toLowerCase().includes(query)
    })
  }, [options, value])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const openDropdown = useCallback(() => {
    if (isOpen || !triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const spaceAbove = rect.top
    const spaceBelow = window.innerHeight - rect.bottom
    const estimatedMenuHeight = Math.min(options.length * 36 + 8, 240)
    setOpenUp(spaceAbove > spaceBelow && spaceBelow < estimatedMenuHeight)
    setIsOpen(true)
  }, [isOpen, options.length])

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

      {isOpen && (
        <div
          className={`absolute z-50 w-full bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl border border-gray-200/60 dark:border-white/[0.08] rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.3)] overflow-hidden py-1 max-h-60 overflow-y-auto ring-1 ring-black/5 dark:ring-white/10 ${
            openUp ? 'bottom-full mb-1.5 animate-dropdown-up' : 'top-full mt-1.5 animate-dropdown-down'
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
                  onMouseDown={(e) => {
                    e.preventDefault()
                    selectOption(option)
                  }}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  className={`flex items-center justify-between gap-2 px-3 py-2 text-xs cursor-pointer transition-colors ${
                    isHighlighted
                      ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400'
                      : isSelected
                        ? 'bg-blue-50/60 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400 font-medium'
                        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/[0.06]'
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate font-mono">{option.label ?? option.value}</span>
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
        </div>
      )}
    </div>
  )
}
