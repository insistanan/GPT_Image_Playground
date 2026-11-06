import { normalizeImageSize } from '@/lib/size'
import type { TaskParams } from '@/types'

export const DEFAULT_PARAMS: TaskParams = {
  size: 'auto',
  quality: 'auto',
  output_format: 'png',
  output_compression: null,
  moderation: 'auto',
  n: 1,
  background: 'auto',
  input_fidelity: null,
  frame_count: null,
  frame_duration_ms: null,
}

export function resolveTaskParamSizeOrDefault(size: string): string {
  return normalizeImageSize(size) || DEFAULT_PARAMS.size
}
