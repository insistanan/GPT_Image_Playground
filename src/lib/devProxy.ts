export interface DevProxyConfig {
  enabled: boolean
  prefix: string
  target: string
  changeOrigin: boolean
  secure: boolean
}

export const DEV_PROXY_REQUEST_ID_HEADER = 'x-dev-proxy-request-id'
export const DEV_PROXY_TARGET_HEADER = 'x-dev-proxy-target'

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, '')
}

function normalizePathname(pathname: string): string {
  const trimmed = trimTrailingSlashes(pathname)
  return trimmed === '/' ? '' : trimmed
}

function joinUrlPath(base: string, path: string): string {
  const trimmedBase = trimTrailingSlashes(base)
  const trimmedPath = path.replace(/^\/+/, '')
  return trimmedBase ? `${trimmedBase}/${trimmedPath}` : `/${trimmedPath}`
}

export function normalizeBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim()
  if (!trimmed) return ''

  const input = /^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(trimmed)
    ? trimmed
    : `https://${trimmed}`

  try {
    const url = new URL(input)
    return `${url.protocol}//${url.host}${normalizePathname(url.pathname)}`
  } catch {
    return trimTrailingSlashes(trimmed)
  }
}

export function normalizeApiBaseUrl(baseUrl: string): string {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl)
  if (!normalizedBaseUrl) return ''

  if (/^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(normalizedBaseUrl)) {
    const url = new URL(normalizedBaseUrl)
    const pathname = normalizePathname(url.pathname)
    const apiPath = /(?:^|\/)v1$/i.test(pathname) ? pathname || '/v1' : `${pathname}/v1`
    return `${url.protocol}//${url.host}${apiPath}`
  }

  const pathname = normalizedBaseUrl.startsWith('/') ? normalizedBaseUrl : `/${normalizedBaseUrl}`
  return /(?:^|\/)v1$/i.test(pathname) ? pathname : `${pathname}/v1`
}

export function normalizeProxyTargetBaseUrl(baseUrl: string): string {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl)
  if (!normalizedBaseUrl) return ''

  if (/^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(normalizedBaseUrl)) {
    const url = new URL(normalizedBaseUrl)
    const pathname = normalizePathname(url.pathname).replace(/(?:^|\/)v1$/i, '')
    return `${url.protocol}//${url.host}${normalizePathname(pathname)}`
  }

  const pathname = (normalizedBaseUrl.startsWith('/') ? normalizedBaseUrl : `/${normalizedBaseUrl}`).replace(
    /(?:^|\/)v1$/i,
    '',
  )
  return normalizePathname(pathname)
}

export function normalizeDevProxyConfig(input: unknown): DevProxyConfig | null {
  if (!input || typeof input !== 'object') return null

  const record = input as Record<string, unknown>
  const target = normalizeBaseUrl(typeof record.target === 'string' ? record.target : '')
  if (!target) return null

  const rawPrefix = typeof record.prefix === 'string' ? record.prefix : '/api-proxy'
  const trimmedPrefix = rawPrefix.trim().replace(/^\/+/, '').replace(/\/+$/, '')
  const prefix = trimmedPrefix ? `/${trimmedPrefix}` : '/api-proxy'

  return {
    enabled: Boolean(record.enabled),
    prefix,
    target,
    changeOrigin: record.changeOrigin !== false,
    secure: Boolean(record.secure),
  }
}

export function buildApiUrl(
  baseUrl: string,
  path: string,
  proxyConfig?: DevProxyConfig | null,
  options?: { forceProxy?: boolean },
): string {
  const normalizedApiBaseUrl = normalizeApiBaseUrl(baseUrl)
  const proxyTargetApiBaseUrl = normalizeApiBaseUrl(proxyConfig?.target ?? '')
  const apiPath = joinUrlPath('/v1', path)
  const forceProxy = options?.forceProxy === true
  const useProxy =
    Boolean(proxyConfig?.enabled) &&
    (forceProxy || (Boolean(proxyConfig?.target) && normalizedApiBaseUrl === proxyTargetApiBaseUrl))

  if (useProxy) {
    return joinUrlPath(proxyConfig!.prefix, apiPath)
  }

  return normalizedApiBaseUrl ? joinUrlPath(normalizedApiBaseUrl, path) : apiPath
}

export function resolveDevProxyConfig(input: unknown, isDev: boolean): DevProxyConfig | null {
  if (!isDev) return null
  return normalizeDevProxyConfig(input)
}

export function readClientDevProxyConfig(): DevProxyConfig | null {
  return resolveDevProxyConfig(
    typeof __DEV_PROXY_CONFIG__ === 'undefined' ? null : __DEV_PROXY_CONFIG__,
    import.meta.env.DEV,
  )
}
