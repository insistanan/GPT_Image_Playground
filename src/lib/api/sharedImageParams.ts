import { DEFAULT_STREAM_PARTIAL_IMAGES, clampPartialImages } from '@/lib/capabilities'
import type { AppSettings, TaskParams } from '@/types'

/** 安全标识：仅当设置里填写了非空值时随请求发送。 */
export function appendSafetyIdentifier(
  target: Record<string, unknown> | FormData,
  settings: Pick<AppSettings, 'safetyIdentifier'>,
) {
  const value = settings.safetyIdentifier?.trim()
  if (!value) {
    return
  }

  if (target instanceof FormData) {
    target.append('safety_identifier', value)
    return
  }

  target.safety_identifier = value
}

export function appendSharedImageParams(
  target: Record<string, unknown> | FormData,
  params: TaskParams,
  options: {
    isEdit?: boolean
    stream?: boolean
    includeN?: boolean
    /** 流式预览帧数，默认跟随设置默认值；会被夹到 0-3 */
    partialImages?: number
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

  // 复杂度：留空表示跟随上游默认，不发送该字段。
  if (params.complexity) {
    set('complexity', params.complexity)
  }

  // GIF / SVG 输出不支持 partial_images 预览，流式时也不能带这个参数。
  if (options.stream && params.output_format !== 'gif' && params.output_format !== 'svg') {
    set('partial_images', clampPartialImages(options.partialImages ?? DEFAULT_STREAM_PARTIAL_IMAGES))
  }
}
