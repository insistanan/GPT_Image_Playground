/// <reference types="vitest/config" />
import { readFileSync } from 'fs'
import { appendFile, mkdir } from 'fs/promises'
import type { IncomingMessage, ServerResponse } from 'http'
import { resolve } from 'path'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import {
  DEV_PROXY_REQUEST_ID_HEADER,
  normalizeDevProxyConfig,
  normalizeProxyTargetBaseUrl,
} from './src/lib/devProxy'

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'))
const DEV_PROXY_TARGET_HEADER = 'x-dev-proxy-target'
const RESPONSE_HEADERS_TO_SKIP = new Set([
  'connection',
  'content-encoding',
  'content-length',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
])
const REQUEST_HEADERS_TO_SKIP = new Set([
  'accept-encoding',
  'connection',
  'content-length',
  'host',
  DEV_PROXY_TARGET_HEADER,
])
const LOGS_DIR = resolve(process.cwd(), 'logs')
const SUCCESS_LOG_FILE = resolve(LOGS_DIR, 'proxy-success.jsonl')
const ERROR_LOG_FILE = resolve(LOGS_DIR, 'proxy-error.jsonl')
const LOG_STRING_PREVIEW_LIMIT = 1200
const LOG_TEXT_PREVIEW_LIMIT = 6000
const LOG_ARRAY_ITEM_LIMIT = 10
const LOG_OBJECT_KEY_LIMIT = 30

function createLogRequestId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function isSensitiveFieldName(name: string): boolean {
  return /authorization|api[-_]?key|cookie|token|secret|password/i.test(name)
}

function summarizeString(value: string): string {
  if (/^Bearer\s+/i.test(value)) {
    return '[REDACTED_BEARER_TOKEN]'
  }

  if (value.startsWith('data:')) {
    const dataUrlMatch = /^data:([^;,]+)[^,]*,/.exec(value)
    return `[data-url mime=${dataUrlMatch?.[1] || 'unknown'} length=${value.length}]`
  }

  if (/^[A-Za-z0-9+/=]{600,}$/.test(value)) {
    return `[base64 length=${value.length}]`
  }

  if (value.length > LOG_STRING_PREVIEW_LIMIT) {
    return `${value.slice(0, LOG_STRING_PREVIEW_LIMIT)}...[truncated ${value.length - LOG_STRING_PREVIEW_LIMIT} chars]`
  }

  return value
}

function sanitizeLogValue(value: unknown, depth = 0): unknown {
  if (value == null || typeof value === 'boolean' || typeof value === 'number') {
    return value
  }

  if (typeof value === 'string') {
    return summarizeString(value)
  }

  if (depth >= 5) {
    return '[max-depth-reached]'
  }

  if (Array.isArray(value)) {
    const items = value
      .slice(0, LOG_ARRAY_ITEM_LIMIT)
      .map((item) => sanitizeLogValue(item, depth + 1))

    if (value.length > LOG_ARRAY_ITEM_LIMIT) {
      items.push(`[+${value.length - LOG_ARRAY_ITEM_LIMIT} more items]`)
    }

    return items
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
    const sanitizedEntries = entries
      .slice(0, LOG_OBJECT_KEY_LIMIT)
      .map(([key, nestedValue]) => [
        key,
        isSensitiveFieldName(key) ? '[REDACTED]' : sanitizeLogValue(nestedValue, depth + 1),
      ] as const)

    const nextValue = Object.fromEntries(sanitizedEntries)
    if (entries.length > LOG_OBJECT_KEY_LIMIT) {
      nextValue.__truncatedKeys = entries.length - LOG_OBJECT_KEY_LIMIT
    }
    return nextValue
  }

  return String(value)
}

function tryParseJson(text: string): unknown | undefined {
  try {
    return JSON.parse(text) as unknown
  } catch {
    return undefined
  }
}

function summarizeHeaders(headers: Record<string, string | string[] | undefined>): Record<string, unknown> {
  const summarized: Record<string, unknown> = {}

  for (const [name, value] of Object.entries(headers)) {
    if (value == null) continue

    if (isSensitiveFieldName(name)) {
      summarized[name] = '[REDACTED]'
      continue
    }

    summarized[name] = Array.isArray(value)
      ? value.map((item) => summarizeString(item))
      : summarizeString(value)
  }

  return summarized
}

function summarizeResponseHeaders(headers: Headers): Record<string, unknown> {
  const summarized: Record<string, unknown> = {}

  headers.forEach((value, name) => {
    summarized[name] = isSensitiveFieldName(name) ? '[REDACTED]' : summarizeString(value)
  })

  return summarized
}

function summarizeBody(
  body: Buffer | undefined,
  contentType: string | string[] | null | undefined,
): Record<string, unknown> | null {
  if (!body || body.length === 0) return null

  const normalizedContentTypeValue = Array.isArray(contentType) ? contentType[0] || '' : contentType || ''
  const normalizedContentType = normalizedContentTypeValue.toLowerCase()
  const bodySummary: Record<string, unknown> = {
    contentType: normalizedContentTypeValue || 'unknown',
    sizeBytes: body.length,
  }

  const shouldReadAsText =
    !normalizedContentType ||
    normalizedContentType.includes('application/json') ||
    normalizedContentType.startsWith('text/') ||
    normalizedContentType.includes('application/x-www-form-urlencoded')

  if (!shouldReadAsText) {
    bodySummary.preview = '[binary body omitted]'
    return bodySummary
  }

  const text = body.toString('utf8')
  const jsonPayload = tryParseJson(text)
  if (jsonPayload !== undefined) {
    bodySummary.json = sanitizeLogValue(jsonPayload)
    return bodySummary
  }

  bodySummary.preview = summarizeString(
    text.length > LOG_TEXT_PREVIEW_LIMIT
      ? `${text.slice(0, LOG_TEXT_PREVIEW_LIMIT)}...[truncated ${text.length - LOG_TEXT_PREVIEW_LIMIT} chars]`
      : text,
  )
  return bodySummary
}

async function appendJsonLine(filePath: string, payload: unknown): Promise<void> {
  await mkdir(LOGS_DIR, { recursive: true })
  await appendFile(filePath, `${JSON.stringify(payload)}\n`, 'utf8')
}

async function writeProxyLog(kind: 'success' | 'error', payload: unknown): Promise<void> {
  await appendJsonLine(kind === 'success' ? SUCCESS_LOG_FILE : ERROR_LOG_FILE, payload)
}

function writeDevProxyRequestIdHeader(res: ServerResponse, requestId: string): void {
  res.setHeader(DEV_PROXY_REQUEST_ID_HEADER, requestId)
}

function loadDevProxyConfig() {
  try {
    return normalizeDevProxyConfig(
      JSON.parse(readFileSync('./dev-proxy.config.json', 'utf-8')) as unknown,
    )
  } catch (error) {
    const err = error as NodeJS.ErrnoException
    if (err.code === 'ENOENT') return null
    throw error
  }
}

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, '')
}

function matchesProxyPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`)
}

function joinTargetPath(basePath: string, path: string): string {
  const normalizedBasePath = trimTrailingSlashes(basePath || '')
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${normalizedBasePath}${normalizedPath}` || '/'
}

async function readRequestBody(req: IncomingMessage): Promise<Buffer | undefined> {
  const method = (req.method || 'GET').toUpperCase()
  if (method === 'GET' || method === 'HEAD') {
    return undefined
  }

  return await new Promise((resolve, reject) => {
    const chunks: Buffer[] = []

    req.on('data', (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    })
    req.on('end', () => resolve(chunks.length ? Buffer.concat(chunks) : undefined))
    req.on('error', reject)
  })
}

function getProxyTargetHeader(req: IncomingMessage): string {
  const value = req.headers[DEV_PROXY_TARGET_HEADER]
  if (Array.isArray(value)) {
    return value[0] || ''
  }
  return typeof value === 'string' ? value : ''
}

function buildUpstreamHeaders(req: IncomingMessage, targetUrl: URL, changeOrigin: boolean): Headers {
  const headers = new Headers()

  for (const [name, value] of Object.entries(req.headers)) {
    if (value == null) continue
    if (REQUEST_HEADERS_TO_SKIP.has(name.toLowerCase())) continue

    if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(name, item)
      }
    } else {
      headers.set(name, value)
    }
  }

  // 避免把压缩后的响应体原样转回浏览器，导致前端按 JSON 解析时报乱码。
  headers.set('accept-encoding', 'identity')

  if (changeOrigin) {
    if (headers.has('origin')) {
      headers.set('origin', targetUrl.origin)
    }
    if (headers.has('referer')) {
      headers.set('referer', `${targetUrl.origin}/`)
    }
  }

  return headers
}

function writeProxyResponseHeaders(res: ServerResponse, upstream: Response, requestId: string): void {
  res.statusCode = upstream.status
  res.statusMessage = upstream.statusText
  writeDevProxyRequestIdHeader(res, requestId)

  upstream.headers.forEach((value, name) => {
    if (RESPONSE_HEADERS_TO_SKIP.has(name.toLowerCase())) return
    res.setHeader(name, value)
  })
}

function writeProxyResponse(res: ServerResponse, upstream: Response, body: Buffer, requestId: string): void {
  writeProxyResponseHeaders(res, upstream, requestId)

  res.end(body)
}

function isEventStreamResponse(upstream: Response): boolean {
  return upstream.headers.get('content-type')?.toLowerCase().includes('text/event-stream') === true
}

async function readWebStreamToBuffer(stream: any): Promise<Buffer> {
  return Buffer.from(await new Response(stream).arrayBuffer())
}

async function writeProxyStreamResponse(res: ServerResponse, upstream: Response, requestId: string): Promise<Buffer> {
  const body = upstream.body
  if (!body) {
    writeProxyResponseHeaders(res, upstream, requestId)
    res.end()
    return Buffer.alloc(0)
  }

  const [clientStream, logStream] = body.tee()
  writeProxyResponseHeaders(res, upstream, requestId)
  res.flushHeaders()
  let logReadError: unknown = null
  const logBufferPromise = readWebStreamToBuffer(logStream).catch((error) => {
    logReadError = error
    return Buffer.alloc(0)
  })

  try {
    await pipeline(Readable.fromWeb(clientStream as any), res)
  } finally {
    // 必须等待日志分支收尾，避免上游断流时出现未处理的 rejected promise 直接打崩 dev server。
    await logBufferPromise
  }

  if (logReadError) {
    throw logReadError
  }

  return await logBufferPromise
}

async function proxyDevRequest(
  req: IncomingMessage,
  res: ServerResponse,
  next: (error?: unknown) => void,
  config: NonNullable<ReturnType<typeof loadDevProxyConfig>>,
): Promise<void> {
  const startedAt = Date.now()
  const requestId = createLogRequestId()
  const requestUrl = new URL(req.url || '/', 'http://127.0.0.1')
  if (!matchesProxyPrefix(requestUrl.pathname, config.prefix)) {
    next()
    return
  }

  const requestedTarget = getProxyTargetHeader(req)
  const targetBaseUrl = normalizeProxyTargetBaseUrl(requestedTarget || config.target)
  if (!targetBaseUrl) {
    res.statusCode = 502
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    writeDevProxyRequestIdHeader(res, requestId)
    res.end('本地代理未配置有效的目标地址')
    return
  }

  const proxiedPath = requestUrl.pathname.slice(config.prefix.length) || '/'
  const targetUrl = new URL(targetBaseUrl)
  targetUrl.pathname = joinTargetPath(targetUrl.pathname, proxiedPath)
  targetUrl.search = requestUrl.search
  const requestHeaders = summarizeHeaders(req.headers)
  let requestBody: Buffer | undefined

  try {
    requestBody = await readRequestBody(req)
    const upstream = await fetch(targetUrl, {
      method: req.method || 'GET',
      headers: buildUpstreamHeaders(req, targetUrl, config.changeOrigin),
      body: requestBody,
    })
    const shouldStreamResponse = isEventStreamResponse(upstream) && upstream.body !== null
    const responseBody = shouldStreamResponse
      ? await writeProxyStreamResponse(res, upstream, requestId)
      : Buffer.from(await upstream.arrayBuffer())
    const logEntry = {
      requestId,
      loggedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      method: req.method || 'GET',
      requestUrl: `${requestUrl.pathname}${requestUrl.search}`,
      targetUrl: targetUrl.toString(),
      status: upstream.status,
      statusText: upstream.statusText,
      request: {
        headers: requestHeaders,
        body: summarizeBody(requestBody, req.headers['content-type']),
      },
      response: {
        headers: summarizeResponseHeaders(upstream.headers),
        body: summarizeBody(responseBody, upstream.headers.get('content-type')),
      },
    }
    if (!shouldStreamResponse) {
      writeProxyResponse(res, upstream, responseBody, requestId)
    }
    void writeProxyLog(upstream.ok ? 'success' : 'error', logEntry).catch((error) => {
      console.error('[dev-proxy] 写入日志失败:', error)
    })
  } catch (error) {
    const logEntry = {
      requestId,
      loggedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      method: req.method || 'GET',
      requestUrl: `${requestUrl.pathname}${requestUrl.search}`,
      targetUrl: targetUrl.toString(),
      request: {
        headers: requestHeaders,
        body: summarizeBody(requestBody, req.headers['content-type']),
      },
      error: {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? summarizeString(error.stack || '') : undefined,
      },
    }
    void writeProxyLog('error', logEntry).catch((writeError) => {
      console.error('[dev-proxy] 写入错误日志失败:', writeError)
    })
    if (!res.headersSent) {
      res.statusCode = 502
      res.setHeader('Content-Type', 'text/plain; charset=utf-8')
      writeDevProxyRequestIdHeader(res, requestId)
      res.end(`本地代理转发失败：${error instanceof Error ? error.message : String(error)}`)
      return
    }

    res.destroy(error instanceof Error ? error : new Error(String(error)))
  }
}

export default defineConfig(({ command }) => {
  const devProxyConfig = command === 'serve' ? loadDevProxyConfig() : null

  return {
    plugins: [
      react(),
      {
        name: 'dynamic-dev-proxy',
        configureServer(server) {
          if (!devProxyConfig?.enabled) return

          server.middlewares.use((req, res, next) => {
            void proxyDevRequest(req, res, next, devProxyConfig).catch(next)
          })
        },
      },
    ],
    base: command === 'build' ? './' : '/',
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
      __DEV_PROXY_CONFIG__: JSON.stringify(devProxyConfig),
    },
    server: {
      host: true,
    },
  }
})
