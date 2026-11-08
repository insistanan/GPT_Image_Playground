export const MIN_SCALE = 1
export const MAX_SCALE = 10

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}
