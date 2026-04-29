import { useMemo, useState } from 'react'
import { calculateImageSize, normalizeImageSize, parseRatio, type SizeTier } from '../../../../lib/size'
import SizePickerAutoPanel from './SizePickerAutoPanel'
import SizePickerRatioPanel from './SizePickerRatioPanel'
import SizePickerResolutionPanel from './SizePickerResolutionPanel'
import SizePickerTabs from './SizePickerTabs'
import {
  findPresetForSize,
  parseSize,
  type SizePickerMode,
  type SizePickerRatioValue,
} from './shared'

interface SizePickerModalProps {
  currentSize: string
  onSelect: (size: string) => void
  onClose: () => void
}

export default function SizePickerModal({
  currentSize,
  onSelect,
  onClose,
}: SizePickerModalProps) {
  const currentPreset = findPresetForSize(currentSize)
  const currentParsedSize = parseSize(currentSize)
  const [mode, setMode] = useState<SizePickerMode>(() => {
    if (!currentSize || currentSize === 'auto') return 'auto'
    if (currentPreset) return 'ratio'
    return 'resolution'
  })

  const [tier, setTier] = useState<SizeTier>(currentPreset?.tier ?? '1K')
  const [ratio, setRatio] = useState<SizePickerRatioValue>(currentPreset?.ratio ?? '1:1')
  const [customRatio, setCustomRatio] = useState('16:9')
  const [customW, setCustomW] = useState(currentParsedSize?.width ?? '1024')
  const [customH, setCustomH] = useState(currentParsedSize?.height ?? '1024')

  const activeRatio = ratio === 'custom' ? customRatio : ratio
  const customRatioValid = ratio !== 'custom' || Boolean(parseRatio(customRatio))

  const previewSize = useMemo(() => {
    if (mode === 'auto') return 'auto'

    if (mode === 'ratio') {
      const size = calculateImageSize(tier, activeRatio)
      return size ? normalizeImageSize(size) : ''
    }

    const width = parseInt(customW, 10)
    const height = parseInt(customH, 10)
    if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
      return normalizeImageSize(`${width}x${height}`)
    }

    return ''
  }, [activeRatio, customH, customW, mode, tier])

  const applySize = () => {
    if (!previewSize) return
    onSelect(previewSize)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 animate-overlay-in bg-black/30 backdrop-blur-sm" />
      <div
        className="relative z-10 w-full max-w-md animate-modal-in rounded-3xl border border-white/50 bg-white/95 p-5 shadow-2xl ring-1 ring-black/5 dark:border-white/[0.08] dark:bg-gray-900/95 dark:ring-white/10"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100">设置图像尺寸</h3>
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">当前：{currentSize || 'auto'}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-white/[0.06] dark:hover:text-gray-200"
            aria-label="关闭"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-6">
          <SizePickerTabs mode={mode} onModeChange={setMode} />

          <div className="min-h-[220px]">
            {mode === 'auto' && <SizePickerAutoPanel />}
            {mode === 'ratio' && (
              <SizePickerRatioPanel
                tier={tier}
                setTier={setTier}
                ratio={ratio}
                setRatio={setRatio}
                customRatio={customRatio}
                setCustomRatio={setCustomRatio}
              />
            )}
            {mode === 'resolution' && (
              <SizePickerResolutionPanel
                customW={customW}
                setCustomW={setCustomW}
                customH={customH}
                setCustomH={setCustomH}
              />
            )}
          </div>

          <div className="rounded-2xl bg-gray-50 px-4 py-3 dark:bg-white/[0.03]">
            <div className="text-xs text-gray-400 dark:text-gray-500">将使用</div>
            <div className="mt-1 font-mono text-lg font-semibold text-gray-800 dark:text-gray-100">
              {previewSize || (customRatioValid ? '尺寸无效' : '比例无效')}
            </div>
          </div>
        </div>

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl bg-gray-100 px-4 py-2.5 text-sm text-gray-600 transition hover:bg-gray-200 dark:bg-white/[0.06] dark:text-gray-300 dark:hover:bg-white/[0.1]"
          >
            取消
          </button>
          <button
            type="button"
            onClick={applySize}
            disabled={!previewSize}
            className="flex-1 rounded-xl bg-blue-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            确定
          </button>
        </div>
      </div>
    </div>
  )
}
