import {
  runGalleryEditOutputs,
  runGalleryRetry,
  runGalleryReuse,
  runGalleryToggleFavorite,
} from '@/store'
import type { CategoryConfig, TaskRecord, TaskView } from '@/types'
import MoveCategoryModal from '@/features/gallery/components/MoveCategoryModal'
import TaskContextMenu from '@/features/gallery/components/TaskContextMenu'
import SelectionBoxOverlay from './SelectionBoxOverlay'
import type { SelectionBox, TaskContextMenuState } from './shared'

interface TaskGridOverlaysProps {
  movingTask: TaskRecord | null
  categories: CategoryConfig[]
  moveCategoryTarget: string
  selectionBox: SelectionBox | null
  contextMenuState: TaskContextMenuState | null
  taskView: TaskView
  galleryImageTaskImporting: boolean
  onMoveCategoryTargetChange: (value: string) => void
  onCloseMoveCategory: () => void
  onConfirmMoveCategory: () => void
  onCloseContextMenu: () => void
  onOpenTask: (taskId: string) => void
  onMoveTaskCategory: (task: TaskRecord) => void
  onDeleteTask: (task: TaskRecord) => void
  onPurgeTask: (task: TaskRecord) => void
  onRestoreTask: (task: TaskRecord) => void
  onShareTask: (task: TaskRecord) => void
}

export default function TaskGridOverlays(props: TaskGridOverlaysProps) {
  const {
    movingTask,
    categories,
    moveCategoryTarget,
    selectionBox,
    contextMenuState,
    taskView,
    galleryImageTaskImporting,
    onMoveCategoryTargetChange,
    onCloseMoveCategory,
    onConfirmMoveCategory,
    onCloseContextMenu,
    onOpenTask,
    onMoveTaskCategory,
    onDeleteTask,
    onPurgeTask,
    onRestoreTask,
    onShareTask,
  } = props

  return (
    <>
      <MoveCategoryModal
        task={movingTask}
        categories={categories}
        targetCategory={moveCategoryTarget}
        onTargetCategoryChange={onMoveCategoryTargetChange}
        onClose={onCloseMoveCategory}
        onConfirm={onConfirmMoveCategory}
      />

      <SelectionBoxOverlay selectionBox={selectionBox} />

      {galleryImageTaskImporting && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-3xl border-2 border-dashed border-blue-300/80 bg-blue-50/70 backdrop-blur-sm dark:border-blue-400/40 dark:bg-blue-500/10">
          <div className="rounded-3xl border border-white/60 bg-white/90 px-6 py-5 text-center shadow-lg dark:border-white/[0.08] dark:bg-gray-900/90">
            <p className="text-base font-semibold text-gray-800 dark:text-gray-100">松手即可加入画廊</p>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              支持 PNG、JPG、JPEG、WebP
            </p>
          </div>
        </div>
      )}

      <TaskContextMenu
        task={contextMenuState?.task ?? null}
        x={contextMenuState?.x ?? 0}
        y={contextMenuState?.y ?? 0}
        isInRecycleBin={taskView === 'trash'}
        onClose={onCloseContextMenu}
        onOpen={() => {
          if (contextMenuState?.task) {
            onOpenTask(contextMenuState.task.id)
          }
        }}
        onReuse={() => {
          if (contextMenuState?.task) {
            runGalleryReuse(contextMenuState.task)
          }
        }}
        onEdit={() => {
          if (contextMenuState?.task) {
            runGalleryEditOutputs(contextMenuState.task)
          }
        }}
        onRetry={() => {
          if (contextMenuState?.task) {
            runGalleryRetry(contextMenuState.task)
          }
        }}
        onShare={() => {
          if (contextMenuState?.task) {
            onShareTask(contextMenuState.task)
          }
        }}
        onToggleFavorite={() => {
          if (contextMenuState?.task) {
            runGalleryToggleFavorite(contextMenuState.task)
          }
        }}
        onMoveCategory={() => {
          if (contextMenuState?.task) {
            onMoveTaskCategory(contextMenuState.task)
          }
        }}
        onDelete={() => {
          if (contextMenuState?.task) {
            onDeleteTask(contextMenuState.task)
          }
        }}
        onPurge={() => {
          if (contextMenuState?.task) {
            onPurgeTask(contextMenuState.task)
          }
        }}
        onRestore={() => {
          if (contextMenuState?.task) {
            onRestoreTask(contextMenuState.task)
          }
        }}
      />
    </>
  )
}
