import { useRef, type KeyboardEvent } from 'react'

export interface SegmentedOption<T extends string> {
  label: string
  value: T
  disabled?: boolean
}

interface SegmentedControlProps<T extends string> {
  value: T
  onChange: (value: T) => void
  options: ReadonlyArray<SegmentedOption<T>>
  ariaLabel: string
  disabled?: boolean
}

/**
 * 选项较少（2–4 个）时使用的分段控件：一次点击直接切换，无需展开下拉。
 * 支持左右方向键在可用选项之间切换并移动焦点。
 */
export default function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  disabled,
}: SegmentedControlProps<T>) {
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([])

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return

    const enabledIndexes = options.flatMap((option, index) => (option.disabled ? [] : [index]))
    const currentPosition = enabledIndexes.findIndex((index) => options[index].value === value)
    if (currentPosition === -1) return

    event.preventDefault()
    const step = event.key === 'ArrowRight' ? 1 : -1
    const nextIndex = enabledIndexes[(currentPosition + step + enabledIndexes.length) % enabledIndexes.length]
    onChange(options[nextIndex].value)
    buttonRefs.current[nextIndex]?.focus()
  }

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      onKeyDown={handleKeyDown}
      className="flex w-full gap-0.5 rounded-xl bg-black/[0.04] p-0.5 dark:bg-white/[0.05]"
    >
      {options.map((option, index) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            ref={(element) => {
              buttonRefs.current[index] = element
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            disabled={disabled || option.disabled}
            onClick={() => onChange(option.value)}
            className={`min-w-0 flex-1 truncate rounded-[9px] px-2 py-1.5 text-center text-[11px] font-medium transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-40 ${
              selected
                ? 'bg-white text-gray-900 shadow-sm shadow-gray-900/[0.06] dark:bg-white/[0.14] dark:text-gray-50'
                : 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
