import { publishShare } from '../services/sharePublish'
import { getConfig } from '../config'
import {
  enforceRateLimit,
  getPublisherByRequest,
} from '../db'
import { forbidden, notFound, validationFailed } from '../errors'
import { getClientIp } from '../request'
import { jsonOk } from '../response'
import {
  purgeShareAssets,
} from '../storage'
import { validateTurnstileIfNeeded } from '../turnstile'
import type {
  RequestContext,
} from '../types'
import { readCreateShareRequest } from '../validation'

function safeJsonArray(value: string | null): string[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value) as unknown
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

export async function handleCreateShare(ctx: RequestContext): Promise<Response> {
  const config = getConfig(ctx.env)
  const publisher = await getPublisherByRequest(ctx.request, ctx.env)
  const ip = getClientIp(ctx.request)
  await enforceRateLimit(
    ctx.env,
    `share:publisher:${publisher.id}`,
    config.publisherShareRateLimitPerMinute,
    60 * 1000,
  )
  await enforceRateLimit(
    ctx.env,
    `share:ip:${ip}`,
    config.ipShareRateLimitPerMinute,
    60 * 1000,
  )

  const { manifest, assets } = await readCreateShareRequest(ctx.env, ctx.request)
  await validateTurnstileIfNeeded(ctx, manifest.turnstileToken)
  const shareId = await publishShare(ctx, {
    publisherId: publisher.id,
    manifest,
    assets,
  })

  return jsonOk({ id: shareId }, { status: 201 }, ctx.corsHeaders)
}

export async function handleGetShare(ctx: RequestContext, shareId: string): Promise<Response> {
  const share = await ctx.env.DB.prepare(
    `SELECT
       id,
       kind,
       title,
       prompt,
       manifest_json,
       cover_asset_id,
       tags_json,
       status,
       created_at,
       view_count
     FROM shares
     WHERE id = ?`,
  )
    .bind(shareId)
    .first<{
      id: string
      kind: 'image' | 'task' | 'prompt'
      title: string
      prompt: string
      manifest_json: string
      cover_asset_id: string | null
      tags_json: string
      status: string
      created_at: number
      view_count: number
    }>()

  if (!share || share.status !== 'published') {
    throw notFound('分享不存在')
  }

  const assets = await ctx.env.DB.prepare(
    `SELECT id, client_asset_id, role, width, height
     FROM share_assets
     WHERE share_id = ?
     ORDER BY created_at ASC`,
  )
    .bind(shareId)
    .all<{
      id: string
      client_asset_id: string
      role: 'output' | 'origin_input'
      width: number | null
      height: number | null
    }>()

  await ctx.env.DB.prepare('UPDATE shares SET view_count = view_count + 1 WHERE id = ?')
    .bind(shareId)
    .run()
    .catch(() => undefined)

  const normalizedAssets = assets.results.map((asset) => ({
    assetId: asset.id,
    clientAssetId: asset.client_asset_id,
    role: asset.role,
    thumbUrl: `/api/v1/assets/${asset.id}?variant=thumb`,
    originalUrl: `/api/v1/assets/${asset.id}?variant=original`,
    width: asset.width,
    height: asset.height,
  }))

  return jsonOk(
    {
      id: share.id,
      kind: share.kind,
      title: share.title,
      prompt: share.prompt,
      tags: safeJsonArray(share.tags_json),
      status: share.status,
      createdAt: share.created_at,
      viewCount: share.view_count + 1,
      coverAsset:
        normalizedAssets.find((asset) => asset.assetId === share.cover_asset_id) ?? null,
      assets: normalizedAssets,
      manifest: JSON.parse(share.manifest_json) as unknown,
    },
    {},
    ctx.corsHeaders,
  )
}

export async function handleDeleteShare(ctx: RequestContext, shareId: string): Promise<Response> {
  const publisher = await getPublisherByRequest(ctx.request, ctx.env)
  const share = await ctx.env.DB.prepare(
    'SELECT publisher_id, status FROM shares WHERE id = ?',
  )
    .bind(shareId)
    .first<{ publisher_id: string; status: string }>()

  if (!share) {
    throw notFound('分享不存在')
  }
  if (share.publisher_id !== publisher.id) {
    throw forbidden('不能删除其他发布者的分享')
  }
  if (share.status === 'deleted') {
    await purgeShareAssets(ctx.env, shareId).catch((error) => {
      console.error(`failed to purge assets for deleted share ${shareId}`, error)
    })
    return jsonOk({}, {}, ctx.corsHeaders)
  }

  await ctx.env.DB.prepare(
    `UPDATE shares
     SET status = 'deleted', updated_at = ?
     WHERE id = ?`,
  )
    .bind(Date.now(), shareId)
    .run()

  await purgeShareAssets(ctx.env, shareId).catch((error) => {
    console.error(`failed to purge assets for deleted share ${shareId}`, error)
  })

  return jsonOk({}, {}, ctx.corsHeaders)
}

export function assertShareId(value: string | undefined): string {
  if (!value) {
    throw validationFailed('缺少分享 ID')
  }
  return value
}
