import type { Dispatch, SetStateAction } from 'react'
import { parseRatio, type SizeTier } from '../../../../lib/size'
import { RATIOS, TIERS, getOptionButtonClass, type SizePickerRatioValue } from './shared'

interface SizePickerRatioPanelProps {
  tier: SizeTier
  setTier: Dispatch<SetStateAction<SizeTier>>
  ratio: SizePickerRatioValue
  setRatio: Dispatch<SetStateAction<SizePickerRatioValue>>
  customRatio: string
  setCustomRatio: Dispatch<SetStateAction<string>>
}

export default function SizePickerRatioPanel({
  tier,
  setTier,
  ratio,
  setRatio,
  customRatio,
  setCustomRatio,
}: SizePickerRatioPanelProps) {
  const customRatioValid = ratio !== 'custom' || Boolean(parseRatio(customRatio))

  return (
    <div className="animate-fade-in space-y-5">
      <section>
        <div className="mb-2 text-xs font-medium text-gray-400 dark:text-gray-500">基准分辨率</div>
        <div className="grid grid-cols-3 gap-2">
          {TIERS.map((item) => (
            <button
              key={item}
              type="button"
              className={getOptionButtonClass(tier === item)}
              onClick={() => setTier(item)}
            >
              {item}
            </button>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-2 text-xs font-medium text-gray-400 dark:text-gray-500">图像比例</div>
        <div className="grid grid-cols-4 gap-2">
          {RATIOS.map((item) => (
            <button
              key={item.value}
              type="button"
              className={getOptionButtonClass(ratio === item.value)}
              onClick={() => setRatio(item.value)}
            >
              {item.label}
            </button>
          ))}
          <button
            type="button"
            className={`${getOptionButtonClass(ratio === 'custom')} col-span-4`}
            onClick={() => setRatio('custom')}
          >
            自定义比例
          </button>
        </div>
      </section>

      {ratio === 'custom' && (
        <label className="block animate-fade-in">
          <span className="mb-2 block text-xs font-medium text-gray-400 dark:text-gray-500">输入自定义比例</span>
          <input
            value={customRatio}
            onChange={(event) => setCustomRatio(event.target.value)}
            placeholder="例如 5:4 / 2.39:1"
            className={`w-full rounded-xl border px-3 py-2 text-sm outline-none transition ${
              customRatioValid
                ? 'border-gray-200/70 bg-white/60 text-gray-700 focus:border-blue-300 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-200 dark:focus:border-blue-500/50'
                : 'border-red-300 bg-white/60 text-gray-700 focus:border-red-400 dark:border-red-500/40 dark:bg-white/[0.03] dark:text-gray-200'
            }`}
          />
        </label>
      )}
    </div>
  )
}
