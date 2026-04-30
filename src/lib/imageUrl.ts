export function isRemoteImageUrl(value: string): boolean {
  try {
    const parsed = new URL(value.trim())
    return /^https?:$/i.test(parsed.protocol)
  } catch {
    return false
  }
}
