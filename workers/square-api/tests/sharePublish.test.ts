import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RequestContext, ShareManifest, UploadedAsset } from '../src/types'
import { publishShare } from '../src/services/sharePublish'

const deps = vi.hoisted(() => ({
  assertQuotaAvailable: vi.fn(), consumeQuota: vi.fn(), releaseQuota: vi.fn(), findExistingShareByRequest: vi.fn(),
  assertSquareCapacityAvailable: vi.fn(), reserveStorageBytes: vi.fn(), releaseStorageBytes: vi.fn(),
}))
vi.mock('../src/db', () => ({
  ...deps, createAssetId: () => 'asset-1', createShareId: () => 'share-1', getQuotaDay: () => '2026-11-08',
}))
vi.mock('../src/storage', () => ({ ...deps, getUploadedAssetsStorageBytes: () => 20 }))

function setup() {
  const put = vi.fn()
  const remove = vi.fn()
  const batch = vi.fn()
  const statement = { bind: vi.fn() }
  statement.bind.mockReturnValue(statement)
  const ctx = {
    env: { IMAGES: { put, delete: remove }, DB: { batch, prepare: vi.fn(() => statement) } },
    requestId: 'request-1', request: new Request('https://example.com'), corsHeaders: {},
  } as unknown as RequestContext
  const manifest: ShareManifest = { kind: 'image', clientRequestId: 'client-1', title: '测试', prompt: '测试' }
  const asset: UploadedAsset = {
    manifest: { clientAssetId: 'local-1', role: 'output', mimeType: 'image/png', byteSize: 10 },
    original: new Blob(['image'], { type: 'image/png' }) as File,
    thumbnail: new Blob(['thumb'], { type: 'image/webp' }) as File,
  }
  return { ctx, put, remove, batch, input: { publisherId: 'publisher-1', manifest, assets: [asset] } }
}

beforeEach(() => {
  vi.resetAllMocks()
  for (const mock of Object.values(deps)) mock.mockResolvedValue(undefined)
  deps.findExistingShareByRequest.mockResolvedValue(null)
})

describe('广场发布补偿', () => {
  it('缩略图上传失败时删除已上传原图和可能写入的缩略图', async () => {
    const { ctx, put, remove, batch, input } = setup()
    put.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('缩略图上传失败'))
    await expect(publishShare(ctx, input)).rejects.toThrow('缩略图上传失败')
    expect(remove.mock.calls.map(([key]) => key).sort()).toEqual([
      'shares/share-1/assets/asset-1/original', 'shares/share-1/assets/asset-1/thumb',
    ])
    expect(batch).not.toHaveBeenCalled()
    expect(deps.releaseStorageBytes).toHaveBeenCalledWith(ctx.env, 20)
  })

  it('对象补偿持续失败时保留存储预留额度并记录错误', async () => {
    const { ctx, put, remove, input } = setup()
    put.mockRejectedValueOnce(new Error('上传失败'))
    remove.mockRejectedValue(new Error('清理失败'))
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      await expect(publishShare(ctx, input)).rejects.toThrow('上传失败')
      expect(deps.releaseStorageBytes).not.toHaveBeenCalled()
      expect(remove).toHaveBeenCalledTimes(4)
      expect(errorLog).toHaveBeenCalled()
    } finally {
      errorLog.mockRestore()
    }
  })

  it('D1 响应丢失但已提交时保留分享资产', async () => {
    const { ctx, remove, batch, input } = setup()
    batch.mockRejectedValueOnce(new Error('响应丢失'))
    deps.findExistingShareByRequest.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'share-1' })
    await expect(publishShare(ctx, input)).resolves.toBe('share-1')
    expect(remove).not.toHaveBeenCalled()
    expect(deps.releaseQuota).not.toHaveBeenCalled()
  })
})
