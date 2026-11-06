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

  // GIF 动图参数：仅指定了值才发送，留空表示跟随上游默认。
  if (params.output_format === 'gif') {
    if (params.frame_count != null) {
      set('frame_count', params.frame_count)
    }
    if (params.frame_duration_ms != null) {
      set('frame_duration_ms', params.frame_duration_ms)
    }
  }

  // GIF 输出不支持 partial_images 预览，流式时也不能带这个参数。
  if (options.stream && params.output_format !== 'gif') {
    set('partial_images', DEFAULT_STREAM_PARTIAL_IMAGES)
  }
}
