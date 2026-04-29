import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { canEditTaskOutputs, type TaskRecord } from '../../../types'

interface Props {
  task: TaskRecord | null
  x: number
  y: number
  isInRecycleBin: boolean
  onClose: () => void
  onOpen: () => void
  onReuse: () => void
  onEdit: () => void
  onRetry: () => void
  onToggleFavorite: () => void
  onMoveCategory: () => void
  onDelete: () => void
  onPurge: () => void
  onRestore: () => void
}

function MenuItem({
  label,
  tone = 'default',
  disabled = false,
  onClick,
  children,
}: {
  label: string
  tone?: 'default' | 'danger' | 'favorite'
  disabled?: boolean
  onClick: () => void
  children: ReactNode
}) {
  const toneClass =
    tone === 'danger'
      ? 'text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30'
      : tone === 'favorite'
        ? 'text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-950/30'
        : 'text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50'

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex w-full items-center gap-2 px-4 py-2 text-left text-sm transition-colors ${
        disabled ? 'cursor-not-allowed opacity-40' : toneClass
      }`}
    >
      {children}
      <span>{label}</span>
    </button>
  )
}

export default function TaskContextMenu({
  task,
  x,
  y,
  isInRecycleBin,
  onClose,
  onOpen,
  onReuse,
  onEdit,
  onRetry,
  onToggleFavorite,
  onMoveCategory,
  onDelete,
  onPurge,
  onRestore,
}: Props) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!task) return

    const close = (event: Event) => {
      if (menuRef.current && event.target instanceof Node && menuRef.current.contains(event.target)) {
        return
      }
      onClose()
    }

    window.addEventListener('mousedown', close, { capture: true })
    window.addEventListener('touchstart', close, { capture: true })
    window.addEventListener('wheel', close, { capture: true })
    window.addEventListener('scroll', close, { capture: true })
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('mousedown', close, { capture: true })
      window.removeEventListener('touchstart', close, { capture: true })
      window.removeEventListener('wheel', close, { capture: true })
      window.removeEventListener('scroll', close, { capture: true })
      window.removeEventListener('resize', close)
    }
  }, [onClose, task])

  const position = useMemo(() => {
    const menuWidth = 188
    const menuHeight = isInRecycleBin ? 148 : 248
    let left = x
    let top = y

    if (left + menuWidth > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - menuWidth - 8)
    }
    if (top + menuHeight > window.innerHeight - 8) {
      top = Math.max(8, window.innerHeight - menuHeight - 8)
    }

    return { left, top }
  }, [isInRecycleBin, x, y])

  if (!task) return null

  const canEditOutputs = canEditTaskOutputs(task)

  return (
    <div
      data-task-menu-root
      ref={menuRef}
      className="fixed z-[9998] w-[188px] overflow-hidden rounded-xl border border-gray-100 bg-white py-1 shadow-2xl animate-fade-in dark:border-gray-700 dark:bg-gray-800"
      style={position}
      onContextMenu={(event) => event.preventDefault()}
    >
      <MenuItem
        label="打开详情"
        onClick={() => {
          onClose()
          onOpen()
        }}
      >
        <svg className="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12H9m12 0A9 9 0 113 12a9 9 0 0118 0z" />
        </svg>
      </MenuItem>
      {isInRecycleBin ? (
        <>
          <MenuItem
            label="恢复记录"
            onClick={() => {
              onClose()
              onRestore()
            }}
          >
            <svg className="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 12a8 8 0 018-8h5m0 0v5m0-5l-6 6m-7 2a8 8 0 008 8h5" />
            </svg>
          </MenuItem>
          <MenuItem
            label="彻底删除"
            tone="danger"
            onClick={() => {
              onClose()
              onPurge()
            }}
          >
            <svg className="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </MenuItem>
        </>
      ) : (
        <>
          <MenuItem
            label={task.isFavorite ? '取消收藏' : '加入收藏'}
            tone="favorite"
            onClick={() => {
              onClose()
              onToggleFavorite()
            }}
          >
            <svg className="h-4 w-4 flex-shrink-0" fill={task.isFavorite ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="m11.049 2.927 2.037 4.128 4.556.663-3.297 3.213.778 4.538L11.05 13.33 6.978 15.47l.778-4.538-3.297-3.213 4.556-.663 2.034-4.128Z" />
            </svg>
          </MenuItem>
          <MenuItem
            label="复用配置"
            onClick={() => {
              onClose()
              onReuse()
            }}
          >
            <svg className="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
            </svg>
          </MenuItem>
          <MenuItem
            label={task.status === 'error' ? '重试' : '编辑输出'}
            disabled={task.status !== 'error' && !canEditOutputs}
            onClick={() => {
              onClose()
              if (task.status === 'error') {
                onRetry()
                return
              }
              onEdit()
            }}
          >
            <svg className="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {task.status === 'error' ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m14.216 2A7.5 7.5 0 005.582 9m0 0H10m10 11v-5h-.581m0 0H14a7.5 7.5 0 01-13.418-2" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              )}
            </svg>
          </MenuItem>
          <MenuItem
            label="移动分类"
            onClick={() => {
              onClose()
              onMoveCategory()
            }}
          >
            <svg className="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5H6a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V9a2 2 0 00-2-2h-5l-2-2zM12 11v6m0 0l-3-3m3 3l3-3" />
            </svg>
          </MenuItem>
          <MenuItem
            label="移入回收站"
            tone="danger"
            onClick={() => {
              onClose()
              onDelete()
            }}
          >
            <svg className="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </MenuItem>
        </>
      )}
    </div>
  )
}
