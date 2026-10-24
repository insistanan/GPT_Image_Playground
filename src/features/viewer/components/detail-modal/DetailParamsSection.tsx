import type { TaskRecord } from '../../../../types'
import { resolveTaskKind } from '../../../../store'

interface DetailParamsSectionProps {
  task: TaskRecord
  categoryName: string
  isFavorite: boolean
  statusLabel: string
  progressCountLabel: string | null
  currentImageSize: string
  providerName: string
  displayQuality: string
  displayOutputFormat: string
  appliedSize: string | null
  appliedQuality: string | null
  appliedOutputFormat: string | null
  appliedBackground: string | null
  appliedAction: string | null
  transportLabel: string | null
  transportRequested: string | null
}

function renderValueCard(label: string, value: string) {
  return (
    <div className="rounded-lg bg-gray-50 px-3 py-2 dark:bg-white/[0.03]">
      <span className="text-gray-400 dark:text-gray-500">{label}</span>
      <br />
      <span className="break-all font-medium text-gray-700 dark:text-gray-300">{value}</span>
    </div>
  )
}

function renderRequestedParamCard(
  label: string,
  requestedValue: string,
  displayValue: string,
  appliedValue: string | null,
) {
  const showRequestedValue = Boolean(appliedValue && appliedValue !== requestedValue)

  return (
    <div className="rounded-lg bg-gray-50 px-3 py-2 dark:bg-white/[0.03]">
      <span className="text-gray-400 dark:text-gray-500">{label}</span>
      <br />
      <span className="break-all font-medium text-gray-700 dark:text-gray-300">{displayValue}</span>
      {showRequestedValue && (
        <>
          <br />
          <span className="break-all text-[11px] text-gray-400 dark:text-gray-500">
            请求: {requestedValue}
          </span>
        </>
      )}
    </div>
  )
}

export default function DetailParamsSection(props: DetailParamsSectionProps) {
  const {
    task,
    categoryName,
    isFavorite,
    statusLabel,
    progressCountLabel,
    currentImageSize,
    providerName,
    displayQuality,
    displayOutputFormat,
    appliedSize,
    appliedQuality,
    appliedOutputFormat,
    appliedBackground,
    appliedAction,
    transportLabel,
    transportRequested,
  } = props
  const taskKind = resolveTaskKind(task)
  const isImageTask = taskKind === 'image'

  return (
    <>
      <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500">
        {isImageTask ? '任务信息' : '参数配置'}
      </h3>
      <div className="mb-4 grid grid-cols-2 gap-2 text-xs">
        {renderValueCard('分类', categoryName)}
        {renderValueCard('收藏', isFavorite ? '已收藏' : '未收藏')}
        {renderValueCard('供应商', providerName)}
        {renderValueCard('状态', statusLabel)}
        {isImageTask ? renderValueCard('任务类型', '单图任务') : null}
        {progressCountLabel ? renderValueCard('当前张数', progressCountLabel) : null}
        {task.status === 'done' && currentImageSize
          ? renderValueCard('输出像素', currentImageSize)
          : renderValueCard('请求尺寸', task.params.size)}
        {appliedSize && appliedSize !== currentImageSize && appliedSize !== task.params.size
          ? renderValueCard('API 返回尺寸', appliedSize)
          : null}
        {!isImageTask && task.status === 'done' && currentImageSize
          ? renderValueCard('请求尺寸', task.params.size)
          : null}
        {!isImageTask
          ? renderRequestedParamCard('质量', task.params.quality, displayQuality, appliedQuality)
          : null}
        {!isImageTask
          ? renderRequestedParamCard('格式', task.params.output_format, displayOutputFormat, appliedOutputFormat)
          : null}
        {!isImageTask && transportLabel ? renderValueCard('传输', transportLabel) : null}
        {!isImageTask && transportRequested ? renderValueCard('传输偏好', transportRequested) : null}
        {!isImageTask
          ? renderRequestedParamCard(
              '背景',
              task.params.background,
              appliedBackground || task.params.background,
              appliedBackground,
            )
          : null}
        {!isImageTask && task.params.input_fidelity
          ? renderValueCard('输入保真', task.params.input_fidelity)
          : null}
        {!isImageTask && appliedAction ? renderValueCard('实际动作', appliedAction) : null}
        {!isImageTask ? renderValueCard('审核', task.params.moderation) : null}
        {!isImageTask ? renderValueCard('数量', String(task.params.n)) : null}
        {!isImageTask && task.params.output_compression != null
          ? renderValueCard('压缩率', String(task.params.output_compression))
          : null}
      </div>
    </>
  )
}
