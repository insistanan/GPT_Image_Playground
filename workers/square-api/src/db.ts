import { getConfig } from './config'
import { createId, hmacSha256 } from './crypto'
import { forbidden, quotaExceeded, rateLimited, unauthorized } from './errors'
import { getBearerToken } from './request'
import type { Env, Publisher, ShareKind } from './types'

export function getQuotaDay(date = new Date()): string {
  const formatter = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  return formatter.format(date)
}

export async function hashToken(env: Env, token: string): Promise<string> {
  if (!env.TOKEN_HASH_SECRET) {
    throw forbidden('服务端缺少 TOKEN_HASH_SECRET，无法处理发布者身份')
  }
  return hmacSha256(env.TOKEN_HASH_SECRET, token)
}

export async function getPublisherByRequest(request: Request, env: Env): Promise<Publisher> {
  const token = getBearerToken(request)
  if (!token) {
    throw unauthorized()
  }

  const tokenHash = await hashToken(env, token)
  const publisher = await env.DB.prepare(
    'SELECT id, status FROM publishers WHERE token_hash = ?',
  )
    .bind(tokenHash)
    .first<Publisher>()

  if (!publisher) {
    throw unauthorized('发布者身份无效')
  }

  if (publisher.status !== 'active') {
    throw forbidden('发布者身份已被禁用')
  }

  await env.DB.prepare('UPDATE publishers SET last_seen_at = ? WHERE id = ?')
    .bind(Date.now(), publisher.id)
    .run()

  return publisher
}

export async function enforceRateLimit(
  env: Env,
  key: string,
  limit: number,
  windowMs: number,
): Promise<void> {
  const now = Date.now()
  const windowStart = Math.floor(now / windowMs) * windowMs
  const result = await env.DB.prepare(
    `INSERT INTO rate_limits (key, window_start, request_count, updated_at)
     VALUES (?, ?, 1, ?)
     ON CONFLICT(key) DO UPDATE SET
       window_start = excluded.window_start,
       request_count = CASE
         WHEN rate_limits.window_start = excluded.window_start THEN rate_limits.request_count + 1
         ELSE 1
       END,
       updated_at = excluded.updated_at
     WHERE rate_limits.window_start != excluded.window_start
       OR rate_limits.request_count < ?`,
  )
    .bind(key, windowStart, now, limit)
    .run()

  if ((result.meta.changes ?? 0) < 1) {
    throw rateLimited()
  }
}

export async function assertQuotaAvailable(env: Env, publisherId: string, kind: ShareKind): Promise<void> {
  const config = getConfig(env)
  const quotaDay = getQuotaDay()
  const quota = await env.DB.prepare(
    `SELECT media_share_count, prompt_share_count
     FROM publisher_quota_days
     WHERE publisher_id = ? AND quota_day = ?`,
  )
    .bind(publisherId, quotaDay)
    .first<{ media_share_count: number; prompt_share_count: number }>()

  const mediaCount = quota?.media_share_count ?? 0
  const promptCount = quota?.prompt_share_count ?? 0
  if ((kind === 'image' || kind === 'task') && mediaCount >= config.dailyMediaShareLimit) {
    throw quotaExceeded(`今日图任务分享次数已用完，每天最多 ${config.dailyMediaShareLimit} 条`)
  }

  if (kind === 'prompt' && promptCount >= config.dailyPromptShareLimit) {
    throw quotaExceeded(`今日提示词分享次数已用完，每天最多 ${config.dailyPromptShareLimit} 条`)
  }
}

export async function consumeQuota(env: Env, publisherId: string, kind: ShareKind, quotaDay = getQuotaDay()): Promise<void> {
  const config = getConfig(env)
  await env.DB.prepare(
    `INSERT OR IGNORE INTO publisher_quota_days
       (publisher_id, quota_day, media_share_count, prompt_share_count)
     VALUES (?, ?, 0, 0)`,
  )
    .bind(publisherId, quotaDay)
    .run()

  const isMedia = kind === 'image' || kind === 'task'
  const limit = isMedia ? config.dailyMediaShareLimit : config.dailyPromptShareLimit
  const column = isMedia ? 'media_share_count' : 'prompt_share_count'
  const result = await env.DB.prepare(
    `UPDATE publisher_quota_days
     SET ${column} = ${column} + 1
     WHERE publisher_id = ?
       AND quota_day = ?
       AND ${column} < ?`,
  )
    .bind(publisherId, quotaDay, limit)
    .run()

  if ((result.meta.changes ?? 0) < 1) {
    throw quotaExceeded(
      isMedia
        ? `今日图任务分享次数已用完，每天最多 ${limit} 条`
        : `今日提示词分享次数已用完，每天最多 ${limit} 条`,
    )
  }
}

export async function releaseQuota(env: Env, publisherId: string, kind: ShareKind, quotaDay = getQuotaDay()): Promise<void> {
  const column = kind === 'prompt' ? 'prompt_share_count' : 'media_share_count'
  await env.DB.prepare(
    `UPDATE publisher_quota_days
     SET ${column} = CASE WHEN ${column} > 0 THEN ${column} - 1 ELSE 0 END
     WHERE publisher_id = ? AND quota_day = ?`,
  )
    .bind(publisherId, quotaDay)
    .run()
}

export async function findExistingShareByRequest(
  env: Env,
  publisherId: string,
  clientRequestId: string,
): Promise<{ id: string } | null> {
  return env.DB.prepare(
    'SELECT id FROM shares WHERE publisher_id = ? AND client_request_id = ?',
  )
    .bind(publisherId, clientRequestId)
    .first<{ id: string }>()
}

export function createShareId(): string {
  return createId('shr')
}

export function createAssetId(): string {
  return createId('ast')
}

export function createReportId(): string {
  return createId('rep')
}
