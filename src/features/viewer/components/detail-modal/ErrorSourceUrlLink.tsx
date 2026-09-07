interface ErrorSourceUrlLinkProps {
  url: string
  variant?: 'overlay' | 'panel'
  onCopy?: (value: string) => void
}

export default function ErrorSourceUrlLink({ url, variant = 'panel', onCopy }: ErrorSourceUrlLinkProps) {
  const openInNewTab = () => {
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url)
      onCopy?.(url)
    } catch {
      /* 复制失败时保持静默，主操作是打开链接 */
    }
  }

  if (variant === 'overlay') {
    return (
      <div className="mt-2 flex items-center justify-end gap-1.5">
        <button
          type="button"
          onClick={openInNewTab}
          className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-1 text-[11px] text-white/85 transition hover:bg-white/16"
        >
          <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
            <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
            <path d="M15 3h6v6M10 14L21 3" />
          </svg>
          打开图片
        </button>
        <button
          type="button"
          onClick={copyLink}
          className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-1 text-[11px] text-white/85 transition hover:bg-white/16"
        >
          <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
            <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
            <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
          </svg>
          复制链接
        </button>
      </div>
    )
  }

  return (
    <div className="mt-3 flex flex-col gap-2">
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(event) => event.stopPropagation()}
        className="block max-w-full truncate rounded-lg border border-red-200/70 bg-white/70 px-3 py-2 font-mono text-xs text-blue-600 transition hover:bg-blue-50 hover:text-blue-700 dark:border-red-400/20 dark:bg-white/[0.04] dark:text-sky-400 dark:hover:bg-sky-500/10"
        title={url}
      >
        {url}
      </a>
      <button
        type="button"
        onClick={copyLink}
        className="inline-flex w-fit items-center gap-1.5 rounded-full border border-red-200/80 bg-white/80 px-3 py-1.5 text-xs text-red-500 transition hover:bg-red-50 dark:border-red-400/20 dark:bg-white/[0.04] dark:text-red-400/90 dark:hover:bg-red-500/10"
      >
        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
          <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
          <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
        </svg>
        复制图片链接
      </button>
    </div>
  )
}
