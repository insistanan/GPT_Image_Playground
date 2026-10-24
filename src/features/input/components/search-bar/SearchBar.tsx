import CategoryEditorActions from './CategoryEditorActions'
import CategoryTrack from './CategoryTrack'
import SearchFilters from './SearchFilters'
import ViewToggleBar from './ViewToggleBar'
import { useSearchBarState } from './useSearchBarState'

export default function SearchBar() {
  const state = useSearchBarState()
  const panelTitle =
    state.taskView === 'trash'
      ? '回收站筛选'
      : state.isFavoriteFilterActive
        ? '收藏视图筛选'
        : '画廊筛选与分类'

  return (
    <>
      <div ref={state.rootRef} className="relative sticky top-12 z-40 pt-1.5 pb-0">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-full border border-gray-200/80 bg-white/[0.84] px-2 py-1.5 shadow-[0_16px_32px_-30px_rgba(15,23,42,0.5)] backdrop-blur-sm dark:border-white/[0.08] dark:bg-gray-900/[0.7]">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            {state.taskView === 'gallery' && (
              <button
                type="button"
                onClick={state.handleToggleFavoriteFilter}
                className={`relative inline-flex h-8 w-8 items-center justify-center rounded-full border transition-all duration-200 ${
                  state.isFavoriteFilterActive
                    ? 'border-amber-300/90 bg-amber-50 text-amber-500 shadow-[0_14px_28px_-22px_rgba(245,158,11,0.9)] dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-300'
                    : 'border-gray-200/80 bg-white/88 text-amber-300 hover:-translate-y-px hover:bg-amber-50 dark:border-white/[0.08] dark:bg-gray-900/[0.76] dark:text-amber-400/70 dark:hover:bg-amber-500/10'
                }`}
                title={state.isFavoriteFilterActive ? '退出收藏视图' : '查看收藏'}
                aria-pressed={state.isFavoriteFilterActive}
              >
                <svg
                  className="h-4 w-4"
                  fill={state.isFavoriteFilterActive ? 'currentColor' : 'none'}
                  stroke="currentColor"
                  strokeWidth={state.isFavoriteFilterActive ? 0 : 2}
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="m11.049 2.927 2.037 4.128 4.556.663-3.297 3.213.778 4.538L11.05 13.33 6.978 15.47l.778-4.538-3.297-3.213 4.556-.663 2.034-4.128Z"
                  />
                </svg>
                {state.favoriteCount > 0 && !state.isFavoriteFilterActive && (
                  <span className="absolute -right-1 -top-1 rounded-full bg-amber-400 px-1 py-0.5 text-[9px] font-semibold leading-none text-white">
                    {state.favoriteCount > 99 ? '99+' : state.favoriteCount}
                  </span>
                )}
              </button>
            )}

            <ViewToggleBar
              taskView={state.taskView}
              galleryDisplayMode={state.galleryDisplayMode}
              activeGalleryCount={state.activeGalleryCount}
              recycleBinCount={state.recycleBinCount}
              onSetTaskView={state.setTaskView}
              onSetGalleryDisplayMode={state.setGalleryDisplayMode}
            />
          </div>

          <div className="flex flex-wrap items-center justify-end gap-1.5">
            {state.taskView === 'gallery' && state.failedActiveCount > 0 && (
              <button
                type="button"
                onClick={state.handleClearFailedTasks}
                className="inline-flex h-8 items-center justify-center gap-1 rounded-full border border-red-200/80 bg-red-50 px-2.5 text-[11px] font-medium text-red-500 transition-all duration-200 hover:-translate-y-px hover:bg-red-100/80 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/20"
                title="清理失效项目"
              >
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 7H5m5 4v6m4-6v6M9 7V4h6v3m-7 0h8m-9 0-.867 12.142A2 2 0 008.128 21h7.744a2 2 0 001.995-1.858L18.733 7"
                  />
                </svg>
                <span>{state.failedActiveCount}</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => state.setIsFilterPanelOpen((open) => !open)}
              className={`inline-flex h-8 items-center justify-center gap-1 rounded-full border px-2.5 text-[11px] font-medium transition-all duration-200 ${
                state.isFilterPanelOpen
                  ? 'border-blue-300/80 bg-blue-50 text-blue-600 shadow-[0_16px_32px_-24px_rgba(37,99,235,0.75)] dark:border-blue-400/30 dark:bg-blue-500/12 dark:text-blue-300'
                  : 'border-gray-200/80 bg-white/88 text-gray-600 hover:-translate-y-px hover:bg-gray-100/88 dark:border-white/[0.08] dark:bg-gray-900/[0.76] dark:text-gray-300 dark:hover:bg-white/[0.06]'
              }`}
              aria-expanded={state.isFilterPanelOpen}
              title="打开筛选与分类"
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 5h18M6 12h12m-9 7h6"
                />
              </svg>
              <span className="hidden sm:inline">筛选</span>
              {state.activePanelFilterCount > 0 && (
                <span className="rounded-full bg-white/[0.8] px-1.5 py-0.5 text-[10px] leading-none text-blue-600 dark:bg-white/[0.08] dark:text-blue-200">
                  {state.activePanelFilterCount}
                </span>
              )}
              <svg
                className={`h-3 w-3 transition-transform duration-200 ${state.isFilterPanelOpen ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m19 9-7 7-7-7" />
              </svg>
            </button>
          </div>
        </div>

        {state.isFilterPanelOpen && (
          <div className="absolute inset-x-0 top-full z-50 mt-2 rounded-[1.35rem] border border-gray-200/80 bg-white/[0.92] px-3 py-3 shadow-[0_28px_48px_-34px_rgba(15,23,42,0.72)] backdrop-blur-md dark:border-white/[0.08] dark:bg-gray-900/[0.82]">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100/90 pb-2.5 dark:border-white/[0.06]">
              <div>
                <p className="text-[12px] font-semibold text-gray-700 dark:text-gray-100">{panelTitle}</p>
                <p className="mt-0.5 text-[11px] text-gray-400 dark:text-gray-500">
                  {state.taskView === 'gallery'
                    ? state.isFavoriteFilterActive
                      ? `当前查看全部 ${state.favoriteCount} 条收藏项`
                      : `当前默认归类：${state.generationTargetLabel}`
                    : '搜索和筛选回收站里的记录'}
                </p>
              </div>
              {state.taskView === 'gallery' && state.isFavoriteFilterActive && (
                <button
                  type="button"
                  onClick={state.handleToggleFavoriteFilter}
                  className="inline-flex items-center gap-1.5 rounded-full border border-amber-200/80 bg-amber-50 px-2.5 py-1.5 text-[11px] font-medium text-amber-600 transition hover:bg-amber-100/80 dark:border-amber-400/20 dark:bg-amber-500/10 dark:text-amber-300"
                >
                  <svg
                    className="h-3.5 w-3.5"
                    fill="currentColor"
                    stroke="none"
                    viewBox="0 0 24 24"
                  >
                    <path d="m11.049 2.927 2.037 4.128 4.556.663-3.297 3.213.778 4.538L11.05 13.33 6.978 15.47l.778-4.538-3.297-3.213 4.556-.663 2.034-4.128Z" />
                  </svg>
                  退出收藏视图
                </button>
              )}
            </div>

            <div className="space-y-2.5 pt-2.5">
              <SearchFilters
                filterStatus={state.filterStatus}
                searchQuery={state.searchQuery}
                taskView={state.taskView}
                onFilterStatusChange={state.setFilterStatus}
                onSearchQueryChange={state.setSearchQuery}
              />

              {state.taskView === 'gallery' && (
                <>
                  <CategoryTrack
                    isMobile={state.isMobile}
                    activeCategoryFilter={state.activeCategoryFilter}
                    categoryChipItems={state.categoryChipItems}
                    categoryViewportRef={state.categoryViewportRef}
                    categorySegmentRef={state.categorySegmentRef}
                    categoryLoopEnabled={state.categoryLoopEnabled}
                    onScroll={state.handleCategoryTrackScroll}
                    onSelectCategory={state.setActiveCategoryFilter}
                  />

                  <CategoryEditorActions
                    generationTargetLabel={state.generationTargetLabel}
                    editorMode={state.editorMode}
                    categoryInput={state.categoryInput}
                    activeCategory={state.activeCategory}
                    onStartCreate={state.handleStartCreate}
                    onOpenUploadImagePicker={state.handleOpenUploadImagePicker}
                    onStartRename={state.handleStartRename}
                    onDeleteCategory={state.handleDeleteCategory}
                    onCategoryInputChange={state.setCategoryInput}
                    onSubmitCategory={() => {
                      void state.handleSubmitCategory()
                    }}
                    onCancel={state.resetEditor}
                  />
                </>
              )}
            </div>
          </div>
        )}

        <input
          ref={state.uploadImageInputRef}
          type="file"
          accept="image/png,image/jpeg,image/jpg,image/webp"
          className="hidden"
          onChange={state.handleUploadSingleImageTasks}
        />
      </div>

      <button
        type="button"
        onClick={state.handleScrollToTop}
        className={`fixed bottom-5 right-5 z-50 inline-flex h-11 w-11 items-center justify-center rounded-full border border-gray-200/80 bg-white/92 text-gray-600 shadow-[0_24px_44px_-24px_rgba(15,23,42,0.42)] backdrop-blur-md transition-all duration-200 hover:-translate-y-1 hover:bg-white md:bottom-6 md:right-6 dark:border-white/[0.08] dark:bg-gray-900/[0.84] dark:text-gray-200 dark:hover:bg-gray-900 ${
          state.showScrollTopButton
            ? 'pointer-events-auto translate-y-0 opacity-100'
            : 'pointer-events-none translate-y-3 opacity-0'
        }`}
        title="回到顶部"
      >
        <svg className="h-4.5 w-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="m6 15 6-6 6 6" />
        </svg>
      </button>
    </>
  )
}
