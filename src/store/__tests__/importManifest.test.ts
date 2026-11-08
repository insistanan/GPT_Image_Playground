import { describe, expect, it } from 'vitest'
import { DEFAULT_PARAMS } from '../taskParams'
import { parseExportManifest } from '../data-transfer/manifest'
import { assertImportedImageIdsCompatible, prepareImportedImageRecord } from '../data-transfer/archive'

function backup(version = 9) {
  return {
    version,
    exportedAt: '2026-01-01T00:00:00.000Z',
    tasks: [{
      id: 'task-1', prompt: '测试', params: { ...DEFAULT_PARAMS },
      inputImageIds: [], outputImages: ['image-1'], status: 'running',
      createdAt: 1, finishedAt: null, elapsed: null, error: null,
    }],
    imageFiles: { 'image-1': { path: 'images/1.png' } },
  }
}

describe('备份导入边界', () => {
  it('兼容 v6 缺省参数，恢复中断任务并保留已有结果', () => {
    const input = backup(6)
    input.tasks[0].params = { size: '1024x1024', n: 1 } as typeof DEFAULT_PARAMS
    const data = parseExportManifest(input)
    expect(data.tasks[0]).toMatchObject({
      status: 'partial_error', isAborted: true, outputImages: ['image-1'],
      params: { output_format: DEFAULT_PARAMS.output_format },
    })
  })

  it('拒绝未知版本、重复 ID、错误参数和图片元数据', () => {
    expect(() => parseExportManifest(backup(100))).toThrow('版本')
    const duplicate = backup()
    duplicate.tasks.push({ ...duplicate.tasks[0] })
    expect(() => parseExportManifest(duplicate)).toThrow('重复')
    expect(() => parseExportManifest({
      ...backup(), tasks: [{ ...backup().tasks[0], params: { n: null } }],
    })).toThrow('params.n')
    expect(() => parseExportManifest({
      ...backup(), imageFiles: { bad: { path: 'images/a.png', width: '大' } },
    })).toThrow('width')
  })

  it('拒绝损坏的输入引用和越界编辑选区', () => {
    const data = backup()
    expect(() => parseExportManifest({
      ...data, tasks: [{ ...data.tasks[0], inputImageIds: 'image-1' }],
    })).toThrow('inputImageIds')
    expect(() => parseExportManifest({
      ...data, tasks: [{ ...data.tasks[0], editSelection: { x: 0.8, y: 0, width: 0.5, height: 1 } }],
    })).toThrow('editSelection')
  })

  it('重新计算导入图片哈希，不信任备份声明的 contentHash', async () => {
    const record = await prepareImportedImageRecord('image-1', {
      path: 'images/1.png', contentHash: '伪造哈希',
    }, { 'images/1.png': new Uint8Array([1, 2, 3]) })
    expect(record.contentHash).not.toBe('伪造哈希')
    expect(record.byteSize).toBe(3)
  })

  it('相同图片 ID 对应不同内容时停止导入', async () => {
    await expect(assertImportedImageIdsCompatible([
      { id: 'image-1', kind: 'local_blob', blob: new Blob(['new']) },
    ], [
      { id: 'image-1', kind: 'local_blob', blob: new Blob(['old']) },
    ])).rejects.toThrow('内容冲突')
  })
})
