import type { ReactNode } from 'react'
import type { TaskBackground, TaskInputFidelity, TaskParams } from '../../../../types'
import { MAX_OPENAI_OUTPUT_IMAGES } from '../../../../lib/capabilities'
import Select from '../../../../shared/components/Select'
import ParamPopoverChip, {
  CHIP_ACTIVE_CLASS,
  CHIP_BASE_CLASS,
  CHIP_IDLE_CLASS,
} from '../../../../shared/components/ParamPopoverChip'
import {
  BACKGROUND_OPTIONS,
  INPUT_FIDELITY_OPTIONS,
  MODERATION_OPTIONS,
  OUTPUT_FORMAT_OPTIONS,
  type ProviderOption,
} from './paramsSectionShared'

interface ParamsSectionProps {
  activeProviderId: string
  providerOptions: ProviderOption[]
  normalizedSize: string
  params: TaskParams
  qualityOptions: Array<{ label: string; value: string }>
  hasInputImages: boolean
  outputCompressionInput: string
  nInput: string
  selectClass: string
  onActiveProviderChange: (providerId: string) => void
  onOpenSizePicker: () => void
  onSetParams: (params: Partial<TaskParams>) => void
  onOutputCompressionInputChange: (value: string) => void
  onCommitOutputCompression: () => void
  onNInputChange: (value: string) => void
  onCommitN: () => void
}

const CHIP_ROW_CLASS = 'flex flex-wrap gap-1.5'
const PANEL_LABEL_CLASS = 'mb-1.5 block text-[11px] font-medium text-gray-500 dark:text-gray-400'
const CHIP_BUTTON_CLASS = `${CHIP_BASE_CLASS} ${CHIP_IDLE_CLASS} inline-flex items-center justify-between gap-1`

function getBackgroundLabel(value: TaskParams['background']) {
  return BACKGROUND_OPTIONS.find((option) => option.value === value)?.label ?? value
}

function getInputFidelityLabel(value: TaskParams['input_fidelity']) {
  return INPUT_FIDELITY_OPTIONS.find((option) => option.value === (value ?? ''))?.label ?? '默认'
}

function CompactField({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <label className="block">
      <span className={PANEL_LABEL_CLASS}>{label}</span>
      {children}
    </label>
  )
}

function CountChip({
  value,
  nInput,
  onNInputChange,
  onCommitN,
  onSetParams,
}: {
  value: number
  nInput: string
  onNInputChange: (value: string) => void
  onCommitN: () => void
  onSetParams: (params: Partial<TaskParams>) => void
}) {
  const canDecrease = value > 1
  const canIncrease = value < MAX_OPENAI_OUTPUT_IMAGES

  return (
    <div className={`inline-flex h-8 items-center overflow-hidden rounded-full ${value > 1 ? CHIP_ACTIVE_CLASS : CHIP_IDLE_CLASS}`}>
      <button
        type="button"
        disabled={!canDecrease}
        onClick={() => onSetParams({ n: value - 1 })}
        className="flex h-8 w-7 items-center justify-center text-[13px] disabled:opacity-30"
        aria-label="减少数量"
      >
        −
      </button>
      <input
        value={nInput}
        onChange={(event) => onNInputChange(event.target.value)}
        onBlur={onCommitN}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.currentTarget.blur()
          }
        }}
        type="number"
        min={1}
        max={MAX_OPENAI_OUTPUT_IMAGES}
        inputMode="numeric"
        className="h-8 w-7 border-0 bg-transparent p-0 text-center text-xs outline-none [appearance:textfield]"
        aria-label="生成数量"
      />
      <button
        type="button"
        disabled={!canIncrease}
        onClick={() => onSetParams({ n: value + 1 })}
        className="flex h-8 w-7 items-center justify-center text-[13px] disabled:opacity-30"
        aria-label="增加数量"
      >
        +
      </button>
    </div>
  )
}

export default function ParamsSection({
  activeProviderId,
  providerOptions,
  normalizedSize,
  params,
  qualityOptions,
  hasInputImages,
  outputCompressionInput,
  nInput,
  selectClass,
  onActiveProviderChange,
  onOpenSizePicker,
  onSetParams,
  onOutputCompressionInputChange,
  onCommitOutputCompression,
  onNInputChange,
  onCommitN,
}: ParamsSectionProps) {
  const providerLabel = providerOptions.find((option) => option.value === activeProviderId)?.label ?? '供应商'
  const jpegSelected = params.output_format === 'jpeg'
  const backgroundOptions = BACKGROUND_OPTIONS.map((option) =>
    option.value === 'transparent' && jpegSelected ? { ...option, disabled: true } : option,
  )
  const compactSelectClass = `${selectClass} py-2 text-xs`
  const moreActive =
    params.output_format !== 'png' ||
    params.background !== 'auto' ||
    params.moderation !== 'auto' ||
    Boolean(params.input_fidelity)
  const moreSummary = [
    params.output_format.toUpperCase(),
    params.background !== 'auto' ? getBackgroundLabel(params.background) : null,
    params.moderation !== 'auto' ? params.moderation : null,
    params.input_fidelity ? getInputFidelityLabel(params.input_fidelity) : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="flex flex-col gap-2">
      <div className={CHIP_ROW_CLASS}>
        <ParamPopoverChip label="供应商" summary={providerLabel} active={providerOptions.length > 1}>
          <CompactField label="供应商">
            <Select
              value={activeProviderId}
              onChange={(value) => onActiveProviderChange(String(value))}
              options={providerOptions}
              className={compactSelectClass}
            />
          </CompactField>
        </ParamPopoverChip>

        <button
          type="button"
          onClick={onOpenSizePicker}
          className={CHIP_BUTTON_CLASS}
          title="选择尺寸"
        >
          <span>尺寸</span>
          <span className="min-w-0 truncate font-mono text-[11px] text-gray-500 dark:text-gray-400">{normalizedSize}</span>
        </button>

        <ParamPopoverChip label="质量" summary={params.quality} active={params.quality !== 'auto'}>
          <CompactField label="质量">
            <Select
              value={params.quality}
              onChange={(value) => onSetParams({ quality: value as TaskParams['quality'] })}
              options={qualityOptions}
              className={compactSelectClass}
            />
          </CompactField>
        </ParamPopoverChip>

        <CountChip
          value={params.n}
          nInput={nInput}
          onNInputChange={onNInputChange}
          onCommitN={onCommitN}
          onSetParams={onSetParams}
        />

        <ParamPopoverChip label="更多" summary={moreSummary} active={moreActive}>
          <div className="space-y-3">
            <CompactField label="格式">
              <Select
                value={params.output_format}
                onChange={(value) => onSetParams({ output_format: value as TaskParams['output_format'] })}
                options={OUTPUT_FORMAT_OPTIONS as unknown as Array<{ label: string; value: string }>}
                className={compactSelectClass}
              />
            </CompactField>

            <CompactField label="压缩率">
              <input
                value={outputCompressionInput}
                onChange={(event) => onOutputCompressionInputChange(event.target.value)}
                onBlur={onCommitOutputCompression}
                disabled={params.output_format === 'png'}
                type="number"
                min={0}
                max={100}
                placeholder="0-100"
                className={`w-full rounded-xl border border-gray-200/60 px-3 py-2 text-xs shadow-sm outline-none dark:border-white/[0.08] ${
                  params.output_format === 'png'
                    ? 'cursor-not-allowed bg-gray-100/50 opacity-50 dark:bg-white/[0.05]'
                    : 'bg-white/70 dark:bg-white/[0.03]'
                }`}
              />
            </CompactField>

            <CompactField label="背景">
              <Select
                value={params.background}
                onChange={(value) => onSetParams({ background: value as TaskBackground })}
                options={backgroundOptions as unknown as Array<{ label: string; value: string }>}
                className={compactSelectClass}
              />
            </CompactField>

            <CompactField label="审核">
              <Select
                value={params.moderation}
                onChange={(value) => onSetParams({ moderation: value as TaskParams['moderation'] })}
                options={MODERATION_OPTIONS as unknown as Array<{ label: string; value: string }>}
                className={compactSelectClass}
              />
            </CompactField>

            <CompactField label="输入保真">
              <Select
                value={params.input_fidelity ?? ''}
                onChange={(value) =>
                  onSetParams({
                    input_fidelity: value ? (value as TaskInputFidelity) : null,
                  })
                }
                options={INPUT_FIDELITY_OPTIONS as unknown as Array<{ label: string; value: string }>}
                className={`${compactSelectClass} ${hasInputImages ? '' : 'opacity-60'}`}
              />
            </CompactField>
          </div>
        </ParamPopoverChip>
      </div>
    </div>
  )
}
