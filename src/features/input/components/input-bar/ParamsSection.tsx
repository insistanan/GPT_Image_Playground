import type { ReactNode } from 'react'
import type { TaskBackground, TaskInputFidelity, TaskParams } from '@/types'
import { MAX_OPENAI_OUTPUT_IMAGES } from '@/lib/capabilities'
import Select from '@/shared/components/Select'
import SegmentedControl from '@/shared/components/SegmentedControl'
import ParamPopoverChip, {
  CHIP_ACTIVE_CLASS,
  CHIP_BASE_CLASS,
  CHIP_IDLE_CLASS,
} from '@/shared/components/ParamPopoverChip'
import {
  BACKGROUND_OPTIONS,
  INPUT_FIDELITY_OPTIONS,
  MODERATION_OPTIONS,
  OUTPUT_FORMAT_OPTIONS,
  type ProviderOption,
} from './paramsSectionShared'
import { SECTION_TITLE_CLASS } from './shared'

interface ParamsSectionProps {
  activeProviderId: string
  providerOptions: ProviderOption[]
  normalizedSize: string
  params: TaskParams
  qualityOptions: Array<{ label: string; value: string }>
  hasInputImages: boolean
  outputCompressionInput: string
  nInput: string
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

function FieldGroup({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <div className="block">
      <span className={PANEL_LABEL_CLASS}>{label}</span>
      {children}
    </div>
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
  onActiveProviderChange,
  onOpenSizePicker,
  onSetParams,
  onOutputCompressionInputChange,
  onCommitOutputCompression,
  onNInputChange,
  onCommitN,
}: ParamsSectionProps) {
  const backgroundOptions = BACKGROUND_OPTIONS.map((option) =>
    option.value === 'transparent' && params.output_format === 'jpeg' ? { ...option, disabled: true } : option,
  )
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
    <div className="flex flex-col gap-2.5">
      <span className={SECTION_TITLE_CLASS}>生成参数</span>
      <div className={CHIP_ROW_CLASS}>
        <Select
          variant="chip"
          label="供应商"
          active={providerOptions.length > 1}
          value={activeProviderId}
          onChange={(value) => onActiveProviderChange(String(value))}
          options={providerOptions}
        />

        <button
          type="button"
          onClick={onOpenSizePicker}
          className={CHIP_BUTTON_CLASS}
          title="选择尺寸"
        >
          <span>尺寸</span>
          <span className="min-w-0 truncate font-mono text-[11px] text-gray-500 dark:text-gray-400">{normalizedSize}</span>
        </button>

        <Select
          variant="chip"
          label="质量"
          active={params.quality !== 'auto'}
          value={params.quality}
          onChange={(value) => onSetParams({ quality: value as TaskParams['quality'] })}
          options={qualityOptions}
        />

        <CountChip
          value={params.n}
          nInput={nInput}
          onNInputChange={onNInputChange}
          onCommitN={onCommitN}
          onSetParams={onSetParams}
        />

        <ParamPopoverChip label="更多" summary={moreSummary} active={moreActive}>
          <div className="space-y-3">
            <FieldGroup label="格式">
              <SegmentedControl
                ariaLabel="输出格式"
                value={params.output_format}
                onChange={(value) => onSetParams({ output_format: value })}
                options={OUTPUT_FORMAT_OPTIONS}
              />
            </FieldGroup>

            <FieldGroup label="压缩率">
              <input
                value={outputCompressionInput}
                onChange={(event) => onOutputCompressionInputChange(event.target.value)}
                onBlur={onCommitOutputCompression}
                disabled={params.output_format === 'png'}
                type="number"
                min={0}
                max={100}
                placeholder="0-100"
                aria-label="压缩率"
                className={`w-full rounded-xl border border-gray-200/60 px-3 py-2 text-xs shadow-sm outline-none dark:border-white/[0.08] ${
                  params.output_format === 'png'
                    ? 'cursor-not-allowed bg-gray-100/50 opacity-50 dark:bg-white/[0.05]'
                    : 'bg-white/70 dark:bg-white/[0.03]'
                }`}
              />
            </FieldGroup>

            <FieldGroup label="背景">
              <SegmentedControl
                ariaLabel="背景"
                value={params.background}
                onChange={(value: TaskBackground) => onSetParams({ background: value })}
                options={backgroundOptions}
              />
            </FieldGroup>

            <FieldGroup label="审核">
              <SegmentedControl
                ariaLabel="审核强度"
                value={params.moderation}
                onChange={(value) => onSetParams({ moderation: value })}
                options={MODERATION_OPTIONS}
              />
            </FieldGroup>

            <FieldGroup label="输入保真">
              <div className={hasInputImages ? '' : 'opacity-60'}>
                <SegmentedControl
                  ariaLabel="输入保真"
                  value={params.input_fidelity ?? ''}
                  onChange={(value) =>
                    onSetParams({
                      input_fidelity: value ? (value as TaskInputFidelity) : null,
                    })
                  }
                  options={INPUT_FIDELITY_OPTIONS}
                />
              </div>
            </FieldGroup>
          </div>
        </ParamPopoverChip>
      </div>
    </div>
  )
}
