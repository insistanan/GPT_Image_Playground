import { useStore } from '@/store'

export default function Header() {
  const appView = useStore((s) => s.appView)
  const setAppView = useStore((s) => s.setAppView)
  const setShowSettings = useStore((s) => s.setShowSettings)
  const setShowPromptLibrary = useStore((s) => s.setShowPromptLibrary)

  return (
    <header className="sticky top-0 z-40 bg-white/80 dark:bg-gray-950/80 backdrop-blur border-b border-gray-200 dark:border-white/[0.08]">
      <div className="mx-auto flex h-12 max-w-7xl items-center justify-between gap-3 px-4">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <span
            aria-hidden
            className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-indigo-500 text-white shadow-[0_8px_16px_-8px_rgba(37,99,235,0.9)]"
          >
            <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 3 13.9 7.6 18.5 9.5 13.9 11.4 12 16 10.1 11.4 5.5 9.5 10.1 7.6Z" />
            </svg>
          </span>
          <h1 className="min-w-0 truncate text-[15px] font-semibold tracking-tight text-gray-800 dark:text-gray-100 sm:text-base">
            GPT Image Playground
          </h1>
        </div>
        <div className="flex flex-shrink-0 items-center gap-1.5">
          <div className="hidden rounded-full border border-gray-200/80 bg-white/90 p-0.5 shadow-[0_14px_30px_-28px_rgba(15,23,42,0.58)] dark:border-white/[0.08] dark:bg-gray-900/90 sm:inline-flex">
            <button
              type="button"
              onClick={() => setAppView('local')}
              className={`h-7 rounded-full px-3 text-xs font-medium transition ${
                appView === 'local'
                  ? 'bg-blue-500 text-white shadow-[0_10px_20px_-14px_rgba(37,99,235,0.9)]'
                  : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/[0.06]'
              }`}
            >
              本地
            </button>
            <button
              type="button"
              onClick={() => setAppView('square')}
              className={`h-7 rounded-full px-3 text-xs font-medium transition ${
                appView === 'square'
                  ? 'bg-blue-500 text-white shadow-[0_10px_20px_-14px_rgba(37,99,235,0.9)]'
                  : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/[0.06]'
              }`}
            >
              广场
            </button>
          </div>
          <button
            type="button"
            onClick={() => setAppView(appView === 'square' ? 'local' : 'square')}
            className={`inline-flex h-8 w-8 items-center justify-center rounded-full border border-gray-200/80 bg-white/90 shadow-sm transition-colors sm:hidden dark:border-white/[0.08] dark:bg-gray-900/90 ${
              appView === 'square'
                ? 'text-blue-500 dark:text-blue-300'
                : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/[0.06]'
            }`}
            title={appView === 'square' ? '返回本地画廊' : '打开广场'}
            aria-label={appView === 'square' ? '返回本地画廊' : '打开广场'}
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4.5 6.75h15M4.5 12h15M4.5 17.25h15" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 4.5c1.15 2.1 1.72 4.6 1.72 7.5S9.15 17.4 8 19.5M16 4.5c-1.15 2.1-1.72 4.6-1.72 7.5s.57 5.4 1.72 7.5" />
            </svg>
          </button>
          <button
            onClick={() => setShowPromptLibrary(true)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-gray-200/80 bg-white/90 text-gray-600 shadow-sm transition-colors hover:bg-gray-100 dark:border-white/[0.08] dark:bg-gray-900/90 dark:text-gray-300 dark:hover:bg-white/[0.06]"
            title="提示词库"
            aria-label="打开提示词库"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.8}
                d="M6.75 5.75h7.5a3 3 0 0 1 3 3v8.5a1 1 0 0 1-1.6.8l-2.55-1.9a2 2 0 0 0-2.4 0l-2.55 1.9a1 1 0 0 1-1.6-.8v-8.5a3 3 0 0 1 3-3Z"
              />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8.75 10h4.5M8.75 12.75h3.25" />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.8}
                d="m15.75 5.25.42 1.12 1.11.42-1.11.42-.42 1.11-.42-1.11-1.11-.42 1.11-.42.42-1.12Z"
              />
            </svg>
          </button>
          <button
            onClick={() => setShowSettings(true)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-gray-200/80 bg-white/90 text-gray-600 shadow-sm transition-colors hover:bg-gray-100 dark:border-white/[0.08] dark:bg-gray-900/90 dark:text-gray-300 dark:hover:bg-white/[0.06]"
            title="设置"
            aria-label="打开设置"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
          </button>
        </div>
      </div>
    </header>
  )
}
