import { DEFAULT_STREAM_PARTIAL_IMAGES } from '@/lib/capabilities'
import type { TaskParams } from '@/types'

export function appendSharedImageParams(
  target: Record<string, unknown> | FormData,
  params: TaskParams,
  options: {
    isEdit?: boolean
    stream?: boolean
    includeN?: boolean
  } = {},
) {
  const set = (key: string, value: string | number | boolean) => {
    if (target instanceof FormData) {
      target.append(key, String(value))
      return
    }
    target[key] = value
  }

  if (params.background) {
    set('background', params.background)
  }

  if (options.includeN !== false && params.n > 1) {
    set('n', params.n)
  }

  if (options.isEdit && (params.input_fidelity === 'high' || params.input_fidelity === 'low')) {
    set('input_fidelity', params.input_fidelity)
  }

  if (options.stream) {
    set('partial_images', DEFAULT_STREAM_PARTIAL_IMAGES)
  }
}
