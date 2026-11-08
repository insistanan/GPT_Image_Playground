let mutationQueue: Promise<void> = Promise.resolve()
let dataVersion = 0

export class DataResetError extends Error {
  constructor() {
    super('本地数据已重置，原操作已取消')
    this.name = 'DataResetError'
  }
}

export function getDataVersion(): number {
  return dataVersion
}

export function assertDataVersion(version: number): void {
  if (version !== dataVersion) throw new DataResetError()
}

/** 串行化本地数据提交；网络请求必须在队列外进行，不要嵌套调用。 */
export function withDataMutation<T>(operation: () => Promise<T>, version = dataVersion): Promise<T> {
  const result = mutationQueue.then(() => {
    assertDataVersion(version)
    return operation()
  })
  // 调用方仍收到原始错误；队列在失败后继续处理其他操作。
  mutationQueue = result.then(() => undefined, () => undefined)
  return result
}

export function resetLocalData(operation: () => Promise<void>): Promise<void> {
  dataVersion += 1
  return withDataMutation(operation)
}
