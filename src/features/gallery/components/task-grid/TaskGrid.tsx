import { useEffect } from 'react'
import {
  openGalleryTaskDetail,
  runGalleryEditOutputs,
  runGalleryRetry,
  runGalleryReuse,
  runGalleryToggleFavorite,
  useStore,
} from '@/store'
import SelectionToolbar from './SelectionToolbar'
import TaskGridBody from './TaskGridBody'
import TaskGridImageMode from './TaskGridImageMode'
import TaskGridOverlays from './TaskGridOverlays'
import { useBoxSelection } from './useBoxSelection'
import { useTaskGridActions } from './useTaskGridActions'
import { useTaskGridDerivedState } from './useTaskGridDerivedState'
import { useGalleryImageTaskImport } from './useGalleryImageTaskImport'
import { useTaskGridUiState } from './useTaskGridUiState'

export default function TaskGrid() {
  const tasks = useStore((state) => state.tasks)
  const categories = useStore((state) => state.categories)
  const providers = useStore((state) => state.providers)
  const activeCategoryFilter = useStore((state) => state.activeCategoryFilter)
  const searchQuery = useStore((state) => state.searchQuery)
  const filterStatus = useStore((state) => state.filterStatus)
  const taskView = useStore((state) => state.taskView)
  const galleryDisplayMode = useStore((state) => state.galleryDisplayMode)
  const selectedTaskIds = useStore((state) => state.selectedTaskIds)
  const setSelectedTaskIds = useStore((state) => state.setSelectedTaskIds)
  const toggleTaskSelection = useStore((state) => state.toggleTaskSelection)
  const clearSelectedTasks = useStore((state) => state.clearSelectedTasks)
  const setShareToSquareTarget = useStore((state) => state.setShareToSquareTarget)

  const uiState = useTaskGridUiState({
    categories,
    activeCategoryFilter,
  })
  const galleryImageTaskImport = useGalleryImageTaskImport()

  const {
    filteredTasks,
    selectedIdSet,
    visibleTaskIds,
    visibleTaskIdSet,
    selectedTasks,
    visibleSelectedCount,
    selectedCount,
    allSelectedFavorited,
    hasVisibleTasks,
    allVisibleSelected,
    categoryOptions,
    activeCategoryLabel,
  } = useTaskGridDerivedState({
    tasks,
    categories,
    providers,
    activeCategoryFilter,
    searchQuery,
    filterStatus,
    taskView,
    selectedTaskIds,
  })
  const isImageMode = taskView === 'gallery' && galleryDisplayMode === 'image'

  const {
    selectionBox,
    handleGridMouseDownCapture,
    shouldSuppressTaskOpen,
  } = useBoxSelection({
    gridRef: uiState.gridRef,
    filteredTaskCount: filteredTasks.length,
    selectedTaskIds,
    clearSelectedTasks,
    setSelectedTaskIds,
    onStartSelection: () => uiState.setContextMenuState(null),
  })

  const {
    handleDelete,
    handleRestore,
    handlePurge,
    handleAbort,
    handleToggleAllVisible,
    handleBatchDelete,
    handleBatchRestore,
    handleBatchPurge,
    handleBatchMoveCategory,
    openMoveCategoryModal,
    handleSingleTaskMoveCategory,
    handleBatchFavorite,
    handleTaskContextMenu,
    handleTaskOpen,
  } = useTaskGridActions({
    selectedTaskIds,
    visibleTaskIds,
    visibleTaskIdSet,
    selectedTasks,
    allSelectedFavorited,
    hasVisibleTasks,
    allVisibleSelected,
    batchCategoryTarget: uiState.batchCategoryTarget,
    movingTask: uiState.movingTask,
    moveCategoryTarget: uiState.moveCategoryTarget,
    setSelectedTaskIds,
    setMovingTask: uiState.setMovingTask,
    setMoveCategoryTarget: uiState.setMoveCategoryTarget,
    setContextMenuState: uiState.setContextMenuState,
    setDetailTaskId: useStore.getState().setDetailTaskId,
    shouldSuppressTaskOpen,
  })

  useEffect(() => {
    if (!uiState.contextMenuState) return
    if (filteredTasks.some((task) => task.id === uiState.contextMenuState?.task.id)) return
    uiState.setContextMenuState(null)
  }, [filteredTasks, uiState.contextMenuState, uiState.setContextMenuState])

  const shouldShowSelectionToolbar = taskView === 'trash' || selectedCount > 0

  return (
    <div
      ref={uiState.wrapperRef}
      tabIndex={0}
      {...galleryImageTaskImport.bind}
      className={`relative space-y-3 rounded-3xl outline-none transition focus-visible:ring-2 focus-visible:ring-blue-300/70 focus-visible:ring-offset-4 focus-visible:ring-offset-transparent ${
        galleryImageTaskImport.isImporting
          ? 'ring-2 ring-blue-300/70 ring-offset-4 ring-offset-transparent'
          : ''
      }`}
    >
      {shouldShowSelectionToolbar && (
        <div className="sticky top-[6.2rem] z-30">
          <SelectionToolbar
            taskView={taskView}
            selectedCount={selectedCount}
            visibleSelectedCount={visibleSelectedCount}
            allSelectedFavorited={allSelectedFavorited}
            batchCategoryTarget={uiState.batchCategoryTarget}
            categoryOptions={categoryOptions}
            hasVisibleTasks={hasVisibleTasks}
            allVisibleSelected={allVisibleSelected}
            onBatchCategoryTargetChange={uiState.setBatchCategoryTarget}
            onBatchFavorite={() => {
              void handleBatchFavorite()
            }}
            onBatchMoveCategory={() => {
              void handleBatchMoveCategory()
            }}
            onToggleAllVisible={handleToggleAllVisible}
            onClearSelected={clearSelectedTasks}
            onBatchRestore={handleBatchRestore}
            onBatchPurge={handleBatchPurge}
            onBatchDelete={handleBatchDelete}
          />
        </div>
      )}

      {isImageMode ? (
        <TaskGridImageMode
          filteredTaskCount={filteredTasks.length}
          tasks={filteredTasks}
          selectedCount={selectedCount}
          selectedIdSet={selectedIdSet}
          activeCategoryFilter={activeCategoryFilter}
          activeCategoryLabel={activeCategoryLabel}
          searchQuery={searchQuery}
          taskView={taskView}
          wrapperRef={uiState.wrapperRef}
          gridRef={uiState.gridRef}
          onGridMouseDownCapture={handleGridMouseDownCapture}
          onTaskOpen={handleTaskOpen}
          onToggleTaskSelection={toggleTaskSelection}
          onTaskAbort={handleAbort}
          onTaskToggleFavorite={(task) => {
            runGalleryToggleFavorite(task)
          }}
          onTaskContextMenu={handleTaskContextMenu}
        />
      ) : (
        <TaskGridBody
          filteredTaskCount={filteredTasks.length}
          tasks={filteredTasks}
          selectedCount={selectedCount}
          categories={categories}
          providers={providers}
          selectedIdSet={selectedIdSet}
          activeCategoryFilter={activeCategoryFilter}
          activeCategoryLabel={activeCategoryLabel}
          searchQuery={searchQuery}
          taskView={taskView}
          wrapperRef={uiState.wrapperRef}
          gridRef={uiState.gridRef}
          onGridMouseDownCapture={handleGridMouseDownCapture}
          onTaskOpen={handleTaskOpen}
          onToggleTaskSelection={toggleTaskSelection}
          onTaskReuse={(task) => {
            runGalleryReuse(task)
          }}
          onTaskEditOutputs={(task) => {
            runGalleryEditOutputs(task)
          }}
          onTaskRetry={(task) => {
            runGalleryRetry(task)
          }}
          onTaskAbort={handleAbort}
          onTaskShare={(task) => {
            setShareToSquareTarget({ kind: 'task', taskId: task.id })
          }}
          onTaskToggleFavorite={(task) => {
            runGalleryToggleFavorite(task)
          }}
          onTaskMoveCategory={openMoveCategoryModal}
          onTaskDelete={handleDelete}
          onTaskPurge={handlePurge}
          onTaskRestore={handleRestore}
          onTaskContextMenu={handleTaskContextMenu}
        />
      )}

      <TaskGridOverlays
        movingTask={uiState.movingTask}
        categories={categories}
        moveCategoryTarget={uiState.moveCategoryTarget}
        selectionBox={selectionBox}
        contextMenuState={uiState.contextMenuState}
        taskView={taskView}
        galleryImageTaskImporting={galleryImageTaskImport.isImporting}
        onMoveCategoryTargetChange={uiState.setMoveCategoryTarget}
        onCloseMoveCategory={() => uiState.setMovingTask(null)}
        onConfirmMoveCategory={() => {
          void handleSingleTaskMoveCategory()
        }}
        onCloseContextMenu={() => uiState.setContextMenuState(null)}
        onOpenTask={openGalleryTaskDetail}
        onMoveTaskCategory={openMoveCategoryModal}
        onDeleteTask={handleDelete}
        onPurgeTask={handlePurge}
        onRestoreTask={handleRestore}
        onShareTask={(task) => {
          setShareToSquareTarget({ kind: 'task', taskId: task.id })
        }}
      />
    </div>
  )
}
