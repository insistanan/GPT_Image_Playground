import { getConfig } from '../config'
import { assertQuotaAvailable, consumeQuota, createAssetId, createShareId, findExistingShareByRequest, getQuotaDay, releaseQuota } from '../db'
import { assertSquareCapacityAvailable, getUploadedAssetsStorageBytes, releaseStorageBytes, reserveStorageBytes } from '../storage'
import type { RequestContext, ShareManifest, StoredAssetRow, UploadedAsset } from '../types'
function getCoverAssetId(rows: StoredAssetRow[]): string | null {
  return rows.find((asset) => asset.role === 'output')?.id ?? rows[0]?.id ?? null
}

function buildR2Key(shareId: string, assetId: string, variant: 'original' | 'thumb'): string {
  return `shares/${shareId}/assets/${assetId}/${variant}`
}

async function uploadAssets(
  ctx: RequestContext,
  shareId: string,
  assets: UploadedAsset[],
  rows: StoredAssetRow[],
): Promise<void> {
  for (const asset of assets) {
    const assetId = createAssetId()
    const r2Key = buildR2Key(shareId, assetId, 'original')
    const thumbR2Key = buildR2Key(shareId, assetId, 'thumb')
    // 在上传前记录所有可能写入的 key，超时也可能发生在服务端已写入之后。
    rows.push({
      id: assetId,
      clientAssetId: asset.manifest.clientAssetId,
      role: asset.manifest.role,
      r2Key,
      thumbR2Key,
      mimeType: asset.original.type || asset.manifest.mimeType,
      byteSize: asset.original.size,
      thumbByteSize: asset.thumbnail.size,
      width: asset.manifest.width ?? null,
      height: asset.manifest.height ?? null,
    })
    await ctx.env.IMAGES.put(r2Key, asset.original, {
      httpMetadata: {
        contentType: asset.original.type || asset.manifest.mimeType,
      },
      customMetadata: {
        shareId,
        assetId,
        role: asset.manifest.role,
      },
    })
    await ctx.env.IMAGES.put(thumbR2Key, asset.thumbnail, {
      httpMetadata: {
        contentType: asset.thumbnail.type || 'image/webp',
      },
      customMetadata: {
        shareId,
        assetId,
        role: asset.manifest.role,
        variant: 'thumb',
      },
    })
  }
}

async function deleteUploadedAssetsBestEffort(ctx: RequestContext, rows: StoredAssetRow[]): Promise<void> {
  const keys = rows.flatMap((asset) => [asset.r2Key, asset.thumbR2Key])
  const results = await Promise.allSettled(keys.map(async (key) => {
    try {
      await ctx.env.IMAGES.delete(key)
    } catch {
      await ctx.env.IMAGES.delete(key)
    }
  }))
  const failures = results.flatMap((result, index) => result.status === 'rejected'
    ? [{ key: keys[index], error: String(result.reason) }] : [])
  if (failures.length) {
    console.error('广场上传补偿失败，保留存储预留额度，需重试清理', { requestId: ctx.requestId, failures })
    throw new Error(`有 ${failures.length} 个广场资产未能清理`)
  }
}

function buildShareStatements(
  ctx: RequestContext,
  input: {
    shareId: string
    publisherId: string
    manifest: ShareManifest
    manifestJson: string
    coverAssetId: string | null
    assetRows: StoredAssetRow[]
    now: number
  },
): D1PreparedStatement[] {
  const config = getConfig(ctx.env)
  const tagsJson = JSON.stringify(input.manifest.tags ?? [])
  const statements = [
    ctx.env.DB.prepare(
      `INSERT INTO shares (
         id,
         publisher_id,
         kind,
         title,
         prompt,
         manifest_json,
         cover_asset_id,
         tags_json,
         status,
         client_request_id,
         created_at,
         updated_at
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      input.shareId,
      input.publisherId,
      input.manifest.kind,
      input.manifest.title,
      input.manifest.prompt,
      input.manifestJson,
      input.coverAssetId,
      tagsJson,
      config.defaultShareStatus,
      input.manifest.clientRequestId,
      input.now,
      input.now,
    ),
  ]

  for (const asset of input.assetRows) {
    statements.push(
      ctx.env.DB.prepare(
        `INSERT INTO share_assets (
           id,
           share_id,
           client_asset_id,
           role,
           r2_key,
           thumb_r2_key,
           mime_type,
           byte_size,
           thumb_byte_size,
           width,
           height,
           created_at
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        asset.id,
        input.shareId,
        asset.clientAssetId,
        asset.role,
        asset.r2Key,
        asset.thumbR2Key,
        asset.mimeType,
        asset.byteSize,
        asset.thumbByteSize,
        asset.width,
        asset.height,
        input.now,
      ),
    )
  }

  return statements
}

export async function publishShare(
  ctx: RequestContext,
  input: {
    publisherId: string
    manifest: ShareManifest
    assets: UploadedAsset[]
  },
): Promise<string> {
  const existingShare = await findExistingShareByRequest(
    ctx.env,
    input.publisherId,
    input.manifest.clientRequestId,
  )
  if (existingShare) {
    return existingShare.id
  }

  await assertQuotaAvailable(ctx.env, input.publisherId, input.manifest.kind)
  await assertSquareCapacityAvailable(ctx.env)

  const storageBytes = getUploadedAssetsStorageBytes(input.assets)
  let storageReserved = false
  await reserveStorageBytes(ctx.env, storageBytes)
  storageReserved = storageBytes > 0

  const shareId = createShareId()
  const uploadedRows: StoredAssetRow[] = []
  let quotaConsumed = false
  let quotaDay: string | null = null
  let shareWriteStarted = false
  try {
    await uploadAssets(ctx, shareId, input.assets, uploadedRows)
    quotaDay = getQuotaDay()
    await consumeQuota(ctx.env, input.publisherId, input.manifest.kind, quotaDay)
    quotaConsumed = true
    const now = Date.now()
    shareWriteStarted = true
    await ctx.env.DB.batch(
      buildShareStatements(ctx, {
        shareId,
        publisherId: input.publisherId,
        manifest: input.manifest,
        manifestJson: JSON.stringify(input.manifest),
        coverAssetId: getCoverAssetId(uploadedRows),
        assetRows: uploadedRows,
        now,
      }),
    )
    return shareId
  } catch (error) {
    if (shareWriteStarted) {
      // D1 响应中断时事务可能已经提交，先核实，避免补偿删除有效分享的资产。
      let committedShare: { id: string } | null
      try {
        committedShare = await findExistingShareByRequest(ctx.env, input.publisherId, input.manifest.clientRequestId)
      } catch (lookupError) {
        console.error('无法确认广场发布事务结果，保留资产和预留额度待核对', {
          requestId: ctx.requestId, shareId, error, lookupError,
        })
        throw error
      }
      if (committedShare?.id === shareId) return shareId
    }
    const cleanup = await Promise.allSettled([
      deleteUploadedAssetsBestEffort(ctx, uploadedRows),
      quotaConsumed && quotaDay ? releaseQuota(ctx.env, input.publisherId, input.manifest.kind, quotaDay) : Promise.resolve(),
    ])
    if (storageReserved && cleanup[0].status === 'fulfilled') {
      await releaseStorageBytes(ctx.env, storageBytes).catch((releaseError) => {
        console.error('广场存储额度释放失败', { requestId: ctx.requestId, shareId, storageBytes, releaseError })
      })
    }
    for (const result of cleanup) {
      if (result.status === 'rejected') console.error('广场发布补偿未完成', { requestId: ctx.requestId, shareId, error: result.reason })
    }
    throw error
  }
}
