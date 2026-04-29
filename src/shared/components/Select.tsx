import { useState, useRef, useEffect, useCallback } from 'react'

interface Option {
  label: string
  value: string | number
}

interface SelectProps {
  value: string | number
  onChange: (value: any) => void
  options: Option[]
  disabled?: boolean
  className?: string
}

export default function Select({ value, onChange, options, disabled, className }: SelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [openUp, setOpenUp] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLDivElement>(null)

  const selectedOption = options.find((o) => o.value === value)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleToggle = useCallback((e: React.MouseEvent) => {
    if (disabled) return
    e.stopPropagation()

    if (!isOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect()
      const spaceAbove = rect.top
      const spaceBelow = window.innerHeight - rect.bottom
      const estimatedMenuHeight = Math.min(options.length * 36 + 8, 240)
      setOpenUp(spaceAbove > spaceBelow)
    }

    setIsOpen(!isOpen)
  }, [disabled, isOpen, options.length])

  return (
    <div ref={containerRef} className="relative w-full">
      <div
        ref={triggerRef}
        onClick={handleToggle}
        className={`flex items-center justify-between gap-1 w-full cursor-pointer select-none ${className ?? ''} ${
          disabled ? '!opacity-50 !cursor-not-allowed !bg-gray-100/50 dark:!bg-white/[0.02]' : ''
        }`}
      >
        <span className="truncate">{selectedOption?.label ?? value}</span>
        <svg
          className={`w-3.5 h-3.5 flex-shrink-0 text-gray-400 dark:text-gray-500 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {isOpen && (
        <div
          className={`absolute z-50 w-full bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl border border-gray-200/60 dark:border-white/[0.08] rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.3)] overflow-hidden py-1 max-h-60 overflow-y-auto ring-1 ring-black/5 dark:ring-white/10 ${
            openUp ? 'bottom-full mb-1.5 animate-dropdown-up' : 'top-full mt-1.5 animate-dropdown-down'
          }`}
        >
          {options.map((option) => (
            <div
              key={option.value}
              onClick={() => {
                onChange(option.value)
                setIsOpen(false)
              }}
              className={`px-3 py-2 text-xs cursor-pointer transition-colors ${
                option.value === value
                  ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 font-medium'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/[0.06]'
              }`}
            >
              {option.label}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
