import { useEffect } from 'react'
import { initStore, startRecycleBinJanitor } from './store'
import { Header } from './app/components'
import { ImageContextMenu, TaskGrid } from './features/gallery'
import { InputBar, PromptLibraryDrawer, SearchBar } from './features/input'
import { SettingsModal } from './features/settings'
import { DetailModal, ImageEditModal, Lightbox } from './features/viewer'
import { ConfirmDialog, Toast } from './shared/components'

export default function App() {
  useEffect(() => {
    initStore()
    const stopRecycleBinJanitor = startRecycleBinJanitor()

    return () => {
      stopRecycleBinJanitor()
    }
  }, [])

  return (
    <div className="flex h-screen w-full overflow-hidden bg-gray-50 dark:bg-gray-950">
      <InputBar />

      {/* 中间：画廊区 */}
      <main className="relative flex min-w-0 flex-1 flex-col overflow-y-auto pb-28 md:pb-0">
        <Header />
        <div className="max-w-7xl mx-auto w-full px-4 pb-12">
          <SearchBar />
          <TaskGrid />
        </div>
      </main>

      {/* 右侧：预留面板/抽屉（暂时隐藏，因为设置已经改为抽屉） */}
      {/* <aside className="w-0 md:w-16 lg:w-64 flex-shrink-0 border-l border-gray-200 bg-white dark:border-white/[0.08] dark:bg-gray-900 transition-all duration-300 hidden md:flex flex-col z-20">
        <div className="p-4 text-center text-gray-400 text-sm mt-10">
          <span className="hidden lg:inline">工具面板 (预留)</span>
          <span className="lg:hidden">...</span>
        </div>
      </aside> */}

      <ImageEditModal />
      <DetailModal />
      <Lightbox />
      <PromptLibraryDrawer />
      <SettingsModal />
      <ConfirmDialog />
      <Toast />
      <ImageContextMenu />
    </div>
  )
}
