import { calculateImageSize, normalizeImageSize, type SizeTier } from '../../../../lib/size'

export const TIERS: SizeTier[] = ['1K', '2K', '4K']

export const RATIOS = [
  { label: '1:1', value: '1:1' },
  { label: '3:2', value: '3:2' },
  { label: '2:3', value: '2:3' },
  { label: '16:9', value: '16:9' },
  { label: '9:16', value: '9:16' },
  { label: '4:3', value: '4:3' },
  { label: '3:4', value: '3:4' },
  { label: '21:9', value: '21:9' },
] as const

export type SizePickerMode = 'auto' | 'ratio' | 'resolution'
export type PresetRatioValue = (typeof RATIOS)[number]['value']
export type SizePickerRatioValue = PresetRatioValue | 'custom'

export function parseSize(size: string) {
  const match = size.match(/^\s*(\d+)\s*[xX×]\s*(\d+)\s*$/)
  if (!match) return null
  return { width: match[1], height: match[2] }
}

export function findPresetForSize(size: string) {
  const normalized = normalizeImageSize(size)

  for (const tier of TIERS) {
    for (const ratio of RATIOS) {
      if (calculateImageSize(tier, ratio.value) === normalized) {
        return { tier, ratio: ratio.value }
      }
    }
  }

  return null
}

export function getOptionButtonClass(active: boolean) {
  return `rounded-xl border px-3 py-2 text-sm transition ${
    active
      ? 'border-blue-400 bg-blue-50 text-blue-600 dark:border-blue-500/50 dark:bg-blue-500/10 dark:text-blue-300'
      : 'border-gray-200/70 bg-white/60 text-gray-600 hover:bg-gray-50 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-300 dark:hover:bg-white/[0.06]'
  }`
}
