import { normalizeImageSize } from '../lib/size'
import type { TaskParams } from '../types'

export const DEFAULT_PARAMS: TaskParams = {
  size: 'auto',
  quality: 'auto',
  output_format: 'png',
  output_compression: null,
  moderation: 'auto',
  n: 1,
}

export function resolveTaskParamSizeOrDefault(size: string): string {
  return normalizeImageSize(size) || DEFAULT_PARAMS.size
}
