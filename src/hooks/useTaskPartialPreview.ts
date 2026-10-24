import { useEffect, useState } from 'react'
import {
  getTaskPartialPreviewUrl,
  subscribeTaskPartialPreviews,
} from '../store/taskPartialPreviews'

export function useTaskPartialPreview(taskId: string | null | undefined): string {
  const [url, setUrl] = useState(() => (taskId ? getTaskPartialPreviewUrl(taskId) ?? '' : ''))

  useEffect(() => {
    if (!taskId) {
      setUrl('')
      return
    }

    setUrl(getTaskPartialPreviewUrl(taskId) ?? '')
    return subscribeTaskPartialPreviews((changedTaskId, nextUrl) => {
      if (changedTaskId === taskId) {
        setUrl(nextUrl ?? '')
      }
    })
  }, [taskId])

  return url
}
