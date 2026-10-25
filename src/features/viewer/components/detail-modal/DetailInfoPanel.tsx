import type { TaskRecord } from '@/types'
import { resolveTaskKind } from '@/store'
import DetailInfoActions from './DetailInfoActions'
import DetailInfoHeader from './DetailInfoHeader'
import DetailInputImagesSection from './DetailInputImagesSection'
import DetailParamsSection from './DetailParamsSection'
import DetailPromptSection from './DetailPromptSection'
import DetailTaskMeta from './DetailTaskMeta'

interface DetailInfoPanelProps {
  task: TaskRecord
  imageSrcs: Record<string, string>
  inRecycleBin: boolean
  cleanupDueAt: number | null
  isFavorite: boolean
  statusLabel: string
  statusChipClass: string
  progressCountLabel: string | null
  transportLabel: string | null
  transportRequested: string | null
  transportChipClass: string
  currentImageSize: string
  providerName: string
  categoryName: string
  displayQuality: string
  displayOutputFormat: string
  appliedSize: string | null
  appliedQuality: string | null
  appliedOutputFormat: string | null
  appliedBackground: string | null
  appliedAction: string | null
  revisedPrompt: string
  canEditOutputs: boolean
  onClose: () => void
  onToggleFavorite: () => void
  onCopyPrompt: () => void
  onCopyInputImage: () => void
  onOpenInputImage: (imageId: string) => void
  onReuse: () => void
  onEdit: () => void
  onRetry: () => void
  onShare: () => void
  onDelete: () => void
  onRestore: () => void
  onPurge: () => void
}

export default function DetailInfoPanel({
  task,
  imageSrcs,
  inRecycleBin,
  cleanupDueAt,
  isFavorite,
  statusLabel,
  statusChipClass,
  progressCountLabel,
  transportLabel,
  transportRequested,
  transportChipClass,
  currentImageSize,
  providerName,
  categoryName,
  displayQuality,
  displayOutputFormat,
  appliedSize,
  appliedQuality,
  appliedOutputFormat,
  appliedBackground,
  appliedAction,
  revisedPrompt,
  canEditOutputs,
  onClose,
  onToggleFavorite,
  onCopyPrompt,
  onCopyInputImage,
  onOpenInputImage,
  onReuse,
  onEdit,
  onRetry,
  onShare,
  onDelete,
  onRestore,
  onPurge,
}: DetailInfoPanelProps) {
  const taskKind = resolveTaskKind(task)

  return (
    <div className="flex min-w-0 w-full flex-col overflow-y-auto p-5 md:flex-1">
      <div className="flex-1">
        <DetailInfoHeader
          statusLabel={statusLabel}
          statusChipClass={statusChipClass}
          progressCountLabel={progressCountLabel}
          transportLabel={transportLabel}
          transportChipClass={transportChipClass}
          inRecycleBin={inRecycleBin}
          isFavorite={isFavorite}
          hasPrompt={Boolean(task.prompt.trim())}
          onClose={onClose}
          onToggleFavorite={onToggleFavorite}
          onCopyPrompt={onCopyPrompt}
        />

        <DetailPromptSection taskKind={taskKind} prompt={task.prompt} revisedPrompt={revisedPrompt} />

        <DetailInputImagesSection
          imageIds={task.inputImageIds ?? []}
          imageSrcs={imageSrcs}
          onCopyInputImage={onCopyInputImage}
          onOpenInputImage={onOpenInputImage}
        />

        <DetailParamsSection
          task={task}
          categoryName={categoryName}
          isFavorite={isFavorite}
          statusLabel={statusLabel}
          progressCountLabel={progressCountLabel}
          currentImageSize={currentImageSize}
          providerName={providerName}
          displayQuality={displayQuality}
          displayOutputFormat={displayOutputFormat}
          appliedSize={appliedSize}
          appliedQuality={appliedQuality}
          appliedOutputFormat={appliedOutputFormat}
          appliedBackground={appliedBackground}
          appliedAction={appliedAction}
          transportLabel={transportLabel}
          transportRequested={transportRequested}
        />

        <DetailTaskMeta
          createdAt={task.createdAt}
          elapsed={task.elapsed}
          inRecycleBin={inRecycleBin}
          deletedAt={task.deletedAt}
          cleanupDueAt={cleanupDueAt}
        />
      </div>

      <DetailInfoActions
        task={task}
        inRecycleBin={inRecycleBin}
        canEditOutputs={canEditOutputs}
        onReuse={onReuse}
        onEdit={onEdit}
        onRetry={onRetry}
        onShare={onShare}
        onDelete={onDelete}
        onRestore={onRestore}
        onPurge={onPurge}
      />
    </div>
  )
}
