import { getConfig } from './config'
import { quotaExceeded } from './errors'
import type { Env, ShareKind, ShareStatus, UploadedAsset } from './types'

const STORAGE_COUNTER_KEY = 'r2'
const DAY_MS = 24 * 60 * 60 * 1000

type ShareCountRow = {
  status: ShareStatus
  kind: ShareKind
  count: number
}

type AssetStorageRow = {
  original_bytes: number | null
  thumb_bytes: number | null
  asset_count: number
}

type StorageCounterRow = {
  used_bytes: number
  updated_at: number
}

type ShareAssetObject = {
  id: string
  r2_key: string
  thumb_r2_key: string | null
  byte_size: number
  thumb_byte_size: number
}

type CleanupCandidate = {
  id: string
  byte_size: number
}

export interface SquareUsage {
  storage: {
    estimatedBytes: number
    counterBytes: number
    originalBytes: number
    thumbnailBytes: number
    assetCount: number
    maxBytes: number
    cleanupTargetBytes: number
    percentOfMax: number
  }
  shares: {
    total: number
    published: number
    hidden: number
    deleted: number
    rejected: number
    pendingReview: number
    byKind: Record<ShareKind, number>
  }
  limits: {
    maxPublishedShares: number
    maxStoredShares: number
    cleanupBatchLimit: number
    cleanupPublishedMediaRetentionDays: number
    cleanupPrunePublished: boolean
  }
}

export interface CleanupResult {
  reason: string
  dryRun: boolean
  before: SquareUsage
  after: SquareUsage
  purgedShareIds: string[]
  purgedAssetCount: number
  freedBytes: number
  errors: Array<{
    shareId: string
    message: string
  }>
}

function clampLimit(value: number | undefined, fallback: number): number {
  if (!value || !Number.isFinite(value) || value <= 0) return fallback
  return Math.max(1, Math.min(Math.floor(value), fallback))
}

function getAssetBytes(asset: ShareAssetObject): number {
  return asset.byte_size + (asset.thumb_byte_size ?? 0)
}

function getCandidateBytes(candidate: CleanupCandidate): number {
  return candidate.byte_size ?? 0
}

export function getUploadedAssetsStorageBytes(assets: UploadedAsset[]): number {
  return assets.reduce(
    (sum, asset) => sum + asset.original.size + asset.thumbnail.size,
    0,
  )
}

async function readAssetStorage(env: Env): Promise<{
  originalBytes: number
  thumbnailBytes: number
  totalBytes: number
  assetCount: number
}> {
  const row = await env.DB.prepare(
    `SELECT
       COALESCE(SUM(byte_size), 0) AS original_bytes,
       COALESCE(SUM(COALESCE(thumb_byte_size, 0)), 0) AS thumb_bytes,
       COUNT(*) AS asset_count
     FROM share_assets`,
  ).first<AssetStorageRow>()

  const originalBytes = row?.original_bytes ?? 0
  const thumbnailBytes = row?.thumb_bytes ?? 0
  return {
    originalBytes,
    thumbnailBytes,
    totalBytes: originalBytes + thumbnailBytes,
    assetCount: row?.asset_count ?? 0,
  }
}

async function readStorageCounter(env: Env): Promise<StorageCounterRow | null> {
  return env.DB.prepare(
    'SELECT used_bytes, updated_at FROM storage_counters WHERE key = ?',
  )
    .bind(STORAGE_COUNTER_KEY)
    .first<StorageCounterRow>()
}

async function ensureStorageCounter(env: Env): Promise<StorageCounterRow> {
  const now = Date.now()
  const storage = await readAssetStorage(env)
  await env.DB.prepare(
    `INSERT OR IGNORE INTO storage_counters (key, used_bytes, updated_at)
     VALUES (?, ?, ?)`,
  )
    .bind(STORAGE_COUNTER_KEY, storage.totalBytes, now)
    .run()

  return (await readStorageCounter(env)) ?? {
    used_bytes: storage.totalBytes,
    updated_at: now,
  }
}

async function readShareCounts(env: Env): Promise<SquareUsage['shares']> {
  const rows = await env.DB.prepare(
    `SELECT status, kind, COUNT(*) AS count
     FROM shares
     GROUP BY status, kind`,
  ).all<ShareCountRow>()

  const shares: SquareUsage['shares'] = {
    total: 0,
    published: 0,
    hidden: 0,
    deleted: 0,
    rejected: 0,
    pendingReview: 0,
    byKind: {
      image: 0,
      task: 0,
      prompt: 0,
    },
  }

  for (const row of rows.results) {
    const count = row.count ?? 0
    shares.total += count
    shares.byKind[row.kind] = (shares.byKind[row.kind] ?? 0) + count
    if (row.status === 'published') shares.published += count
    if (row.status === 'hidden') shares.hidden += count
    if (row.status === 'deleted') shares.deleted += count
    if (row.status === 'rejected') shares.rejected += count
    if (row.status === 'pending_review') shares.pendingReview += count
  }

  return shares
}

export async function getSquareUsage(env: Env): Promise<SquareUsage> {
  const config = getConfig(env)
  const [storage, counter, shares] = await Promise.all([
    readAssetStorage(env),
    ensureStorageCounter(env),
    readShareCounts(env),
  ])
  const counterBytes = counter.used_bytes ?? storage.totalBytes
  const percentOfMax = config.maxR2StorageBytes > 0
    ? Math.round((storage.totalBytes / config.maxR2StorageBytes) * 10000) / 100
    : 0

  return {
    storage: {
      estimatedBytes: storage.totalBytes,
      counterBytes,
      originalBytes: storage.originalBytes,
      thumbnailBytes: storage.thumbnailBytes,
      assetCount: storage.assetCount,
      maxBytes: config.maxR2StorageBytes,
      cleanupTargetBytes: config.cleanupTargetR2StorageBytes,
      percentOfMax,
    },
    shares,
    limits: {
      maxPublishedShares: config.maxPublishedShares,
      maxStoredShares: config.maxStoredShares,
      cleanupBatchLimit: config.cleanupBatchLimit,
      cleanupPublishedMediaRetentionDays: config.cleanupPublishedMediaRetentionDays,
      cleanupPrunePublished: config.cleanupPrunePublished,
    },
  }
}

export async function assertSquareCapacityAvailable(env: Env): Promise<void> {
  const config = getConfig(env)
  const shares = await readShareCounts(env)
  if (shares.total >= config.maxStoredShares) {
    throw quotaExceeded(`广场总分享数已达到上限 ${config.maxStoredShares} 条，请先清理后再发布`)
  }
  if (config.defaultShareStatus === 'published' && shares.published >= config.maxPublishedShares) {
    throw quotaExceeded(`广场公开分享数已达到上限 ${config.maxPublishedShares} 条，请先清理后再发布`)
  }
}

export async function reserveStorageBytes(env: Env, bytes: number): Promise<void> {
  if (bytes <= 0) return

  const config = getConfig(env)
  await ensureStorageCounter(env)
  const result = await env.DB.prepare(
    `UPDATE storage_counters
     SET used_bytes = used_bytes + ?, updated_at = ?
     WHERE key = ?
       AND used_bytes + ? <= ?`,
  )
    .bind(bytes, Date.now(), STORAGE_COUNTER_KEY, bytes, config.maxR2StorageBytes)
    .run()

  if ((result.meta.changes ?? 0) < 1) {
    const usage = await getSquareUsage(env)
    throw quotaExceeded(
      `广场 R2 存储已接近上限，当前约 ${usage.storage.estimatedBytes} 字节，上限 ${config.maxR2StorageBytes} 字节`,
    )
  }
}

export async function releaseStorageBytes(env: Env, bytes: number): Promise<void> {
  if (bytes <= 0) return
  await env.DB.prepare(
    `UPDATE storage_counters
     SET used_bytes = CASE WHEN used_bytes > ? THEN used_bytes - ? ELSE 0 END,
         updated_at = ?
     WHERE key = ?`,
  )
    .bind(bytes, bytes, Date.now(), STORAGE_COUNTER_KEY)
    .run()
}

async function readShareAssets(env: Env, shareId: string): Promise<ShareAssetObject[]> {
  const rows = await env.DB.prepare(
    `SELECT id, r2_key, thumb_r2_key, byte_size, COALESCE(thumb_byte_size, 0) AS thumb_byte_size
     FROM share_assets
     WHERE share_id = ?`,
  )
    .bind(shareId)
    .all<ShareAssetObject>()
  return rows.results
}

async function deleteR2Objects(env: Env, assets: ShareAssetObject[]): Promise<void> {
  for (const asset of assets) {
    await env.IMAGES.delete(asset.r2_key)
    if (asset.thumb_r2_key) {
      await env.IMAGES.delete(asset.thumb_r2_key)
    }
  }
}

export async function purgeShareAssets(env: Env, shareId: string): Promise<{
  assetCount: number
  freedBytes: number
}> {
  const assets = await readShareAssets(env, shareId)
  if (assets.length === 0) {
    return {
      assetCount: 0,
      freedBytes: 0,
    }
  }

  const freedBytes = assets.reduce((sum, asset) => sum + getAssetBytes(asset), 0)
  await deleteR2Objects(env, assets)
  await env.DB.prepare('DELETE FROM share_assets WHERE share_id = ?')
    .bind(shareId)
    .run()
  await releaseStorageBytes(env, freedBytes)

  return {
    assetCount: assets.length,
    freedBytes,
  }
}

async function purgeShare(env: Env, shareId: string): Promise<{
  assetCount: number
  freedBytes: number
}> {
  const assets = await readShareAssets(env, shareId)
  const freedBytes = assets.reduce((sum, asset) => sum + getAssetBytes(asset), 0)
  await deleteR2Objects(env, assets)
  await env.DB.batch([
    env.DB.prepare('DELETE FROM reports WHERE share_id = ?').bind(shareId),
    env.DB.prepare('DELETE FROM share_assets WHERE share_id = ?').bind(shareId),
    env.DB.prepare('DELETE FROM shares WHERE id = ?').bind(shareId),
  ])
  await releaseStorageBytes(env, freedBytes)

  return {
    assetCount: assets.length,
    freedBytes,
  }
}

async function listExpiredNonPublishedShares(
  env: Env,
  limit: number,
  now: number,
): Promise<CleanupCandidate[]> {
  const config = getConfig(env)
  const deletedCutoff = now - config.cleanupDeletedRetentionDays * DAY_MS
  const hiddenCutoff = now - config.cleanupHiddenRetentionDays * DAY_MS
  const rows = await env.DB.prepare(
    `SELECT
       s.id,
       COALESCE(SUM(a.byte_size + COALESCE(a.thumb_byte_size, 0)), 0) AS byte_size
     FROM shares s
     LEFT JOIN share_assets a ON a.share_id = s.id
     WHERE (
       s.status IN ('deleted', 'rejected')
       AND s.updated_at <= ?
     ) OR (
       s.status IN ('hidden', 'pending_review')
       AND s.updated_at <= ?
     )
     GROUP BY s.id
     ORDER BY s.updated_at ASC, s.id ASC
     LIMIT ?`,
  )
    .bind(deletedCutoff, hiddenCutoff, limit)
    .all<CleanupCandidate>()

  return rows.results
}

async function listOldestPublishedShares(
  env: Env,
  limit: number,
): Promise<CleanupCandidate[]> {
  const rows = await env.DB.prepare(
    `SELECT
       s.id,
       COALESCE(SUM(a.byte_size + COALESCE(a.thumb_byte_size, 0)), 0) AS byte_size
     FROM shares s
     LEFT JOIN share_assets a ON a.share_id = s.id
     WHERE s.status = 'published'
     GROUP BY s.id
     ORDER BY s.created_at ASC, s.id ASC
     LIMIT ?`,
  )
    .bind(limit)
    .all<CleanupCandidate>()

  return rows.results
}

async function listExpiredPublishedMediaShares(
  env: Env,
  limit: number,
  now: number,
): Promise<CleanupCandidate[]> {
  const config = getConfig(env)
  if (config.cleanupPublishedMediaRetentionDays <= 0) {
    return []
  }

  const publishedCutoff = now - config.cleanupPublishedMediaRetentionDays * DAY_MS
  const rows = await env.DB.prepare(
    `SELECT
       s.id,
       COALESCE(SUM(a.byte_size + COALESCE(a.thumb_byte_size, 0)), 0) AS byte_size
     FROM shares s
     LEFT JOIN share_assets a ON a.share_id = s.id
     WHERE s.status = 'published'
       AND s.kind IN ('image', 'task')
       AND s.created_at <= ?
     GROUP BY s.id
     ORDER BY s.created_at ASC, s.id ASC
     LIMIT ?`,
  )
    .bind(publishedCutoff, limit)
    .all<CleanupCandidate>()

  return rows.results
}

function appendUniqueCandidates(
  target: CleanupCandidate[],
  source: CleanupCandidate[],
  maxLength: number,
): void {
  const existing = new Set(target.map((candidate) => candidate.id))
  for (const candidate of source) {
    if (target.length >= maxLength) return
    if (existing.has(candidate.id)) continue
    existing.add(candidate.id)
    target.push(candidate)
  }
}

async function purgeCandidates(
  env: Env,
  candidates: CleanupCandidate[],
  dryRun: boolean,
  result: CleanupResult,
): Promise<void> {
  for (const candidate of candidates) {
    if (dryRun) {
      result.purgedShareIds.push(candidate.id)
      result.freedBytes += getCandidateBytes(candidate)
      continue
    }

    try {
      const purged = await purgeShare(env, candidate.id)
      result.purgedShareIds.push(candidate.id)
      result.purgedAssetCount += purged.assetCount
      result.freedBytes += purged.freedBytes
    } catch (error) {
      result.errors.push({
        shareId: candidate.id,
        message: error instanceof Error ? error.message : '清理失败',
      })
    }
  }
}

export async function cleanupSquareStorage(
  env: Env,
  options: {
    reason?: string
    dryRun?: boolean
    limit?: number
    prunePublished?: boolean
  } = {},
): Promise<CleanupResult> {
  const config = getConfig(env)
  const limit = clampLimit(options.limit, config.cleanupBatchLimit)
  const prunePublished = options.prunePublished ?? config.cleanupPrunePublished
  const before = await getSquareUsage(env)
  const result: CleanupResult = {
    reason: options.reason ?? 'manual',
    dryRun: options.dryRun === true,
    before,
    after: before,
    purgedShareIds: [],
    purgedAssetCount: 0,
    freedBytes: 0,
    errors: [],
  }

  const candidates: CleanupCandidate[] = []
  appendUniqueCandidates(
    candidates,
    await listExpiredNonPublishedShares(env, limit, Date.now()),
    limit,
  )

  if (candidates.length < limit) {
    appendUniqueCandidates(
      candidates,
      await listExpiredPublishedMediaShares(env, limit - candidates.length, Date.now()),
      limit,
    )
  }

  if (prunePublished && candidates.length < limit) {
    const publishedOverflow = Math.max(0, before.shares.published - config.maxPublishedShares)
    if (publishedOverflow > 0) {
      appendUniqueCandidates(
        candidates,
        await listOldestPublishedShares(env, Math.min(publishedOverflow, limit - candidates.length)),
        limit,
      )
    }
  }

  if (prunePublished && candidates.length < limit) {
    const projectedBytes = before.storage.estimatedBytes - candidates.reduce(
      (sum, candidate) => sum + getCandidateBytes(candidate),
      0,
    )
    if (projectedBytes > config.maxR2StorageBytes) {
      const neededBytes = projectedBytes - config.cleanupTargetR2StorageBytes
      let selectedBytes = 0
      const storageCandidates = await listOldestPublishedShares(env, limit - candidates.length)
      const selected: CleanupCandidate[] = []
      for (const candidate of storageCandidates) {
        if (selectedBytes >= neededBytes) break
        selected.push(candidate)
        selectedBytes += getCandidateBytes(candidate)
      }
      appendUniqueCandidates(candidates, selected, limit)
    }
  }

  await purgeCandidates(env, candidates, result.dryRun, result)
  result.after = result.dryRun ? before : await getSquareUsage(env)
  return result
}
