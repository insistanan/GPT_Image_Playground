import { afterEach, describe, expect, it, vi } from 'vitest'
import { dbTransaction, writeDbBatch } from '../schema'

function fakeDatabase() {
  const request = { result: 'saved', error: null, onsuccess: null as (() => void) | null }
  const store = { put: vi.fn(() => request) }
  const transaction = {
    objectStore: vi.fn(() => store),
    oncomplete: null as (() => void) | null,
    onabort: null as (() => void) | null,
    onerror: null as (() => void) | null,
    error: null as Error | null,
    abort: vi.fn(),
  }
  const db = { transaction: vi.fn(() => transaction), close: vi.fn() }
  vi.stubGlobal('indexedDB', {
    open: () => {
      const openRequest = { result: db, onsuccess: null as (() => void) | null }
      queueMicrotask(() => openRequest.onsuccess?.())
      return openRequest
    },
  })
  return { request, transaction, db, store }
}

afterEach(() => vi.unstubAllGlobals())

describe('IndexedDB 提交语义', () => {
  it('request 成功后仍等待 transaction 提交', async () => {
    const { request, transaction, db } = fakeDatabase()
    let settled = false
    const pending = dbTransaction('tasks', 'readwrite', (store) => store.put({ id: 'task-1' }))
    void pending.then(() => { settled = true })
    await Promise.resolve()
    await Promise.resolve()
    request.onsuccess?.()
    await Promise.resolve()
    expect(settled).toBe(false)
    transaction.oncomplete?.()
    await expect(pending).resolves.toBe('saved')
    expect(db.close).toHaveBeenCalled()
  })

  it('request 成功但 transaction 中止时返回失败', async () => {
    const { transaction } = fakeDatabase()
    const pending = dbTransaction('tasks', 'readwrite', (store) => store.put({ id: 'task-1' }))
    const failure = expect(pending).rejects.toThrow('事务中止')
    await Promise.resolve()
    await Promise.resolve()
    transaction.error = new Error('事务中止')
    transaction.onabort?.()
    await failure
  })

  it('任务与图片的批量写入共用一个事务，提交前不返回', async () => {
    const { transaction, db, store } = fakeDatabase()
    const pending = writeDbBatch(['tasks', 'images'], (tx) => {
      tx.objectStore('images').put({ id: 'image-1' })
      tx.objectStore('tasks').put({ id: 'task-1', outputImages: ['image-1'] })
    })
    await Promise.resolve()
    await Promise.resolve()
    expect(db.transaction).toHaveBeenCalledWith(['tasks', 'images'], 'readwrite')
    expect(store.put).toHaveBeenCalledTimes(2)
    transaction.oncomplete?.()
    await expect(pending).resolves.toBeUndefined()
  })
})
