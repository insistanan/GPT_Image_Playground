import { describe, expect, it } from 'vitest'
import { DataResetError, getDataVersion, resetLocalData, withDataMutation } from '../dataMutation'

describe('本地写入协调', () => {
  it('串行提交，单次失败不会阻塞后续操作', async () => {
    const events: string[] = []
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const first = withDataMutation(async () => {
      events.push('first:start')
      await gate
      events.push('first:end')
      throw new Error('写入失败')
    })
    const firstFailure = expect(first).rejects.toThrow('写入失败')
    const second = withDataMutation(async () => { events.push('second') })
    await Promise.resolve()
    expect(events).toEqual(['first:start'])
    release()
    await firstFailure
    await second
    expect(events).toEqual(['first:start', 'first:end', 'second'])
  })

  it('清空立即使旧排队操作失效，并等待已经开始的提交结束', async () => {
    const events: string[] = []
    const version = getDataVersion()
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const active = withDataMutation(async () => {
      await gate
      events.push('active')
    }, version)
    await Promise.resolve()
    const stale = withDataMutation(async () => { events.push('stale') }, version)
    const staleFailure = expect(stale).rejects.toBeInstanceOf(DataResetError)
    const reset = resetLocalData(async () => { events.push('clear') })
    expect(getDataVersion()).toBe(version + 1)
    release()
    await active
    await staleFailure
    await reset
    await withDataMutation(async () => { events.push('new') })
    expect(events).toEqual(['active', 'clear', 'new'])
  })
})
